/* ============================================================
   EPSOS MORE — Exam runtime
   Navigation, autosave, flagging, timer, submit flow
   ============================================================ */
(function () {
  if (!window.QUESTIONS) return;

  const STORE_KEY = "epsos_exam_state";
  const USER_KEY = "epsos_user";
  const SUBMITTED_KEY = "epsos_submitted";

  const TOTAL_SECONDS = 170 * 60; // 2 hours 50 minutes
  let state = loadState();
  let saveTimer = null;
  let tickTimer = null;

  /* -------- state ---------- */
  function defaultState() {
    return {
      current: 0,
      startedAt: Date.now(),
      timeLeft: TOTAL_SECONDS,
      viewed: {},     // { qIdx: true }
      flagged: {},    // { qIdx: true }
      answers: {},    // { qIdx: { roleId: {...}, sub_<id>: "text" } }
      submitted: false
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      // Recompute timeLeft from elapsed wall-clock
      const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
      s.timeLeft = Math.max(0, TOTAL_SECONDS - elapsed);
      return s;
    } catch (e) { return defaultState(); }
  }
  function saveState() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  /* -------- user gate ---------- */
  const user = (function () {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  })();
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  document.querySelectorAll("[data-user-name]").forEach(el => {
    el.textContent = user.fullName || user.username;
  });

  /* -------- DOM refs ---------- */
  const qGridEl = document.getElementById("q-grid");
  const qMainEl = document.getElementById("q-main");
  const progressEl = document.getElementById("exam-progress-bar");
  const progressLabelEl = document.getElementById("progress-label");
  const timerEl = document.getElementById("timer");
  const saveStatusEl = document.getElementById("save-status");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  const submitBtn = document.getElementById("btn-submit");
  const flagBtn = document.getElementById("btn-flag");
  const submitModal = document.getElementById("submit-modal");
  const timeoutModal = document.getElementById("timeout-modal");

  /* -------- render question grid ---------- */
  function renderGrid() {
    qGridEl.innerHTML = "";
    window.QUESTIONS.forEach((q, idx) => {
      const cube = document.createElement("button");
      cube.className = "q-cube";
      if (state.viewed[idx]) cube.classList.add("viewed");
      if (isAnswered(idx)) cube.classList.add("answered");
      if (state.flagged[idx]) cube.classList.add("flagged");
      if (idx === state.current) cube.classList.add("current");
      cube.textContent = idx + 1;
      cube.title = (q.title?.[epsos.getLang()] || "");
      cube.addEventListener("click", () => goTo(idx));
      qGridEl.appendChild(cube);
    });
  }

  function isAnswered(idx) {
    const a = state.answers[idx];
    if (!a) return false;
    return Object.values(a).some(v => {
      if (typeof v === "string") return v.trim().length > 0;
      if (typeof v === "object" && v) return Object.values(v).some(x => (x || "").trim().length > 0);
      return false;
    });
  }

  function updateProgress() {
    const total = window.QUESTIONS.length;
    const answered = Object.keys(state.answers).filter(k => isAnswered(+k)).length;
    const pct = Math.round((answered / total) * 100);
    progressEl.style.width = pct + "%";
    if (progressLabelEl) {
      progressLabelEl.textContent =
        `${epsos.t("exam_q")} ${state.current + 1} ${epsos.t("exam_of")} ${total} · ${answered}/${total}`;
    }
  }

  /* -------- render current question ---------- */
  function renderCurrent() {
    const q = window.QUESTIONS[state.current];
    const lang = epsos.getLang();
    state.viewed[state.current] = true;

    const meta = q.section === "roles" ? epsos.t("sec_roles") : epsos.t("sec_cases");
    const title = q.title[lang] || q.title.he;
    const intro = q.intro ? (q.intro[lang] || q.intro.he) : null;
    const instructions = q.instructions ? (q.instructions[lang] || q.instructions.he) : null;

    let html = `
      <div class="q-meta">
        <span class="pill">${meta}</span>
        <span>${epsos.t("exam_q")} ${state.current + 1} / ${window.QUESTIONS.length}</span>
      </div>
      <h2 class="q-title">${escapeHtml(title)}</h2>
      ${instructions ? `<div class="q-instructions">${escapeHtml(instructions)}</div>` : ""}
      ${intro ? `<div class="q-instructions">${escapeHtml(intro)}</div>` : ""}
    `;

    /* Role identification block */
    if (q.identification) {
      html += renderRoleIdentification(q, lang);
    }

    /* Sub-questions */
    (q.subs || []).forEach((sub, i) => {
      const subId = sub.id || `s${i}`;
      const stored = (state.answers[state.current] || {})["sub_" + subId] || "";
      const lineHint = `${epsos.t("line_hint")}${sub.lines || 4} ${epsos.t("line_hint_after")} · ${sub.words || 60} ${epsos.t("word_count_label")}`;
      const text = sub[lang] || sub.he || sub.title?.[lang] || "";
      html += `
        <div class="sub-q">
          <div class="sub-q-label">
            <span class="num">${String.fromCharCode(0x61 + i)}</span>
            <span>${escapeHtml(text)}</span>
          </div>
          <div class="sub-q-hint">${lineHint}${sub.optional ? " · " + (lang === "he" ? "אופציונלי" : lang === "ar" ? "اختياري" : "Optional") : ""}</div>
          <textarea
            data-sub="${subId}"
            data-target-words="${sub.words || 60}"
            rows="${Math.max(3, Math.min(5, sub.lines || 4))}"
            placeholder="${lang === 'he' ? 'התחל לכתוב כאן...' : lang === 'ar' ? 'ابدأ الكتابة هنا...' : 'Start writing here...'}"
          >${escapeHtml(stored)}</textarea>
          <div class="word-count" data-counter="${subId}">
            <span class="cnt">0 / ${sub.words || 60} ${epsos.t("word_count_label")}</span>
            <span class="hint"></span>
          </div>
        </div>
      `;
    });

    qMainEl.innerHTML = html;

    /* wire textareas */
    qMainEl.querySelectorAll("textarea[data-sub]").forEach(ta => {
      const subId = ta.getAttribute("data-sub");
      const counterEl = qMainEl.querySelector(`[data-counter="${subId}"] .cnt`);
      const target = +ta.getAttribute("data-target-words");
      function refreshCount() {
        const w = countWords(ta.value);
        counterEl.textContent = `${w} / ${target} ${epsos.t("word_count_label")}`;
        counterEl.classList.toggle("over", w > target * 1.15);
        counterEl.classList.toggle("ok", w >= target * 0.7 && w <= target * 1.15);
      }
      refreshCount();
      ta.addEventListener("input", () => {
        if (state.submitted) return;
        const ans = state.answers[state.current] || {};
        ans["sub_" + subId] = ta.value;
        state.answers[state.current] = ans;
        refreshCount();
        scheduleSave();
        renderGrid();
        updateProgress();
      });
    });

    /* wire role identification fields */
    qMainEl.querySelectorAll("input[data-role-field], select[data-role-field]").forEach(inp => {
      const f = inp.getAttribute("data-role-field");
      inp.addEventListener("input", () => {
        if (state.submitted) return;
        const ans = state.answers[state.current] || {};
        ans.roleId = ans.roleId || {};
        ans.roleId[f] = inp.value;
        state.answers[state.current] = ans;
        scheduleSave();
        renderGrid();
        updateProgress();
      });
    });

    /* lock if submitted */
    if (state.submitted) {
      qMainEl.querySelectorAll("textarea, input, select").forEach(el => el.disabled = true);
    }

    /* update flag button */
    if (flagBtn) {
      flagBtn.classList.toggle("on", !!state.flagged[state.current]);
      flagBtn.querySelector(".label").textContent =
        state.flagged[state.current] ? epsos.t("flagged") : epsos.t("flag");
    }

    /* nav button states */
    prevBtn.disabled = state.current === 0;
    nextBtn.style.display = state.current === window.QUESTIONS.length - 1 ? "none" : "";
    submitBtn.style.display = state.current === window.QUESTIONS.length - 1 ? "" : "none";

    renderGrid();
    updateProgress();
  }
  // expose for i18n re-render
  window.renderCurrent = renderCurrent;

  function renderRoleIdentification(q, lang) {
    const stored = (state.answers[state.current] || {}).roleId || {};
    function val(f) { return escapeHtml(stored[f] || ""); }
    return `
      <div class="role-id">
        <h5>${epsos.t("sec_roles")} · ${epsos.t("exam_q")} ${q.index} / 5</h5>
        <div class="role-id-grid">
          <div class="field full">
            <label>${epsos.t("role_org")}</label>
            <input type="text" data-role-field="org" value="${val('org')}">
          </div>
          <div class="field full">
            <label>${epsos.t("role_addr")}</label>
            <input type="text" data-role-field="addr" value="${val('addr')}">
          </div>
          <div class="field">
            <label>${epsos.t("role_mgr")}</label>
            <input type="text" data-role-field="mgr" value="${val('mgr')}">
          </div>
          <div class="field">
            <label>${epsos.t("role_title")}</label>
            <input type="text" data-role-field="title" value="${val('title')}">
          </div>
          <div class="field">
            <label>${epsos.t("role_start")}</label>
            <input type="month" data-role-field="start" value="${val('start')}">
          </div>
          <div class="field">
            <label>${epsos.t("role_end")}</label>
            <input type="month" data-role-field="end" value="${val('end')}">
          </div>
          <div class="field full">
            <label>${epsos.t("role_hours")}</label>
            <input type="number" min="0" max="100" data-role-field="hours" value="${val('hours')}">
          </div>
        </div>
      </div>
    `;
  }

  /* -------- helpers ---------- */
  function countWords(s) {
    return (s || "").trim().split(/\s+/).filter(Boolean).length;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }
  function scheduleSave() {
    if (saveStatusEl) {
      saveStatusEl.textContent = epsos.t("autosaving");
      saveStatusEl.classList.remove("saved");
      saveStatusEl.classList.add("saving");
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveState();
      if (saveStatusEl) {
        saveStatusEl.textContent = epsos.t("autosaved");
        saveStatusEl.classList.remove("saving");
        saveStatusEl.classList.add("saved");
      }
    }, 600);
  }

  function goTo(idx) {
    if (idx < 0 || idx >= window.QUESTIONS.length) return;
    state.current = idx;
    saveState();
    renderCurrent();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* -------- timer ---------- */
  function fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(n => String(n).padStart(2, "0")).join(":");
  }
  function tick() {
    if (state.submitted) return;
    state.timeLeft = Math.max(0, state.timeLeft - 1);
    timerEl.querySelector(".value").textContent = fmtTime(state.timeLeft);
    timerEl.classList.toggle("warning", state.timeLeft <= 15 * 60 && state.timeLeft > 5 * 60);
    timerEl.classList.toggle("danger", state.timeLeft <= 5 * 60);
    if (state.timeLeft === 0) {
      autoSubmit();
    }
    if (state.timeLeft % 10 === 0) saveState();
  }
  function startTimer() {
    timerEl.querySelector(".value").textContent = fmtTime(state.timeLeft);
    tickTimer = setInterval(tick, 1000);
  }

  /* -------- submit flow ---------- */
  function openSubmitModal() {
    submitModal.classList.add("open");
  }
  function closeSubmitModal() {
    submitModal.classList.remove("open");
  }
  function doSubmit() {
    state.submitted = true;
    saveState();
    localStorage.setItem(SUBMITTED_KEY, "1");
    window.location.href = "results.html";
  }
  function autoSubmit() {
    state.submitted = true;
    saveState();
    localStorage.setItem(SUBMITTED_KEY, "1");
    if (timeoutModal) timeoutModal.classList.add("open");
    setTimeout(() => { window.location.href = "results.html"; }, 2500);
  }

  /* -------- bind UI ---------- */
  prevBtn.addEventListener("click", () => goTo(state.current - 1));
  nextBtn.addEventListener("click", () => goTo(state.current + 1));
  submitBtn.addEventListener("click", openSubmitModal);
  document.getElementById("submit-cancel").addEventListener("click", closeSubmitModal);
  document.getElementById("submit-confirm").addEventListener("click", doSubmit);
  flagBtn.addEventListener("click", () => {
    state.flagged[state.current] = !state.flagged[state.current];
    saveState();
    renderCurrent();
  });

  /* keyboard nav */
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.key === "ArrowLeft") goTo(state.current + (epsos.getLang() === "en" ? -1 : 1));
    if (e.key === "ArrowRight") goTo(state.current + (epsos.getLang() === "en" ? 1 : -1));
  });

  /* prevent accidental leave */
  window.addEventListener("beforeunload", (e) => {
    if (!state.submitted) {
      saveState();
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* init */
  if (state.submitted) {
    // already submitted — go to results
    window.location.href = "results.html";
    return;
  }
  // If returning user (started already) but new session, keep startedAt; timeLeft is recomputed
  epsos.applyLang();
  renderCurrent();
  startTimer();

  // tiny utility to reset for dev: window.epsosResetExam()
  window.epsosResetExam = function () {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(SUBMITTED_KEY);
    state = defaultState();
    saveState();
    location.reload();
  };
})();
