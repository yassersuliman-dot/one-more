/* ============================================================
   ONE MORE — Cinematic post-exam feedback
   - Loading sequence (4 cycling phrases)
   - Plan-aware reveal (Basic shows upgrade gate, Plus/Premium show full)
   - Animated score ring + bars
   - Staggered card reveal with motivational interstitial
   ============================================================ */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /* ---------- Score computation from saved exam state ---------- */
  function computeScores() {
    let state;
    try { state = JSON.parse(localStorage.getItem("epsos_exam_state")); } catch (e) { state = null; }
    if (!state || !window.QUESTIONS) return { overall: 78, clarity: 82, ethics: 75, comm: 80, words: 0 };

    const answers = state.answers || {};
    const total = window.QUESTIONS.length;
    let answered = 0, words = 0, fields = 0;

    Object.keys(answers).forEach(k => {
      const a = answers[k];
      let any = false;
      Object.entries(a).forEach(([key, val]) => {
        if (typeof val === "string") {
          if (val.trim().length) { any = true; words += val.trim().split(/\s+/).filter(Boolean).length; fields++; }
        } else if (val && typeof val === "object") {
          Object.values(val).forEach(v => { if ((v || "").trim().length) { any = true; fields++; } });
        }
      });
      if (any) answered++;
    });

    const completion = Math.min(1, answered / total);
    const depth = Math.min(1, words / (60 * total));
    const richness = Math.min(1, fields / (total * 5));

    const clarity = Math.round(60 + completion * 28 + depth * 8);
    const ethics  = Math.round(58 + depth * 30 + completion * 8);
    const comm    = Math.round(62 + richness * 26 + depth * 8);
    const overall = Math.round((clarity + ethics + comm) / 3);

    return { overall, clarity, ethics, comm, words };
  }

  /* ---------- Animated number tween ---------- */
  function tweenNumber(el, to, duration) {
    if (!el) return;
    if (prefersReduced) { el.textContent = String(to); return; }
    const from = 0;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function setRing(ringEl, percent) {
    if (!ringEl) return;
    const circumference = 2 * Math.PI * 54; // r = 54
    ringEl.style.strokeDasharray = circumference + " " + circumference;
    const offset = circumference * (1 - Math.max(0, Math.min(1, percent / 100)));
    // Animate via setting transitioned property
    if (prefersReduced) {
      ringEl.style.strokeDashoffset = String(offset);
      return;
    }
    ringEl.style.strokeDashoffset = String(circumference);
    requestAnimationFrame(() => {
      ringEl.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)";
      ringEl.style.strokeDashoffset = String(offset);
    });
  }

  /* ---------- Loading sequence ---------- */
  function runLoadingSequence(onDone) {
    const phrases = ["fb_loading_1", "fb_loading_2", "fb_loading_3", "fb_loading_4"];
    const phraseEl = document.getElementById("fb-loading-phrase");
    const progressEl = document.getElementById("fb-loading-progress");
    let i = 0;
    function show() {
      const text = (window.epsos && epsos.t) ? epsos.t(phrases[i]) : phrases[i];
      if (phraseEl) {
        phraseEl.style.opacity = "0";
        setTimeout(() => {
          phraseEl.textContent = text;
          phraseEl.style.opacity = "1";
        }, 220);
      }
      if (progressEl) {
        const pct = ((i + 1) / phrases.length) * 100;
        progressEl.style.width = pct + "%";
      }
      i += 1;
      if (i < phrases.length) {
        setTimeout(show, prefersReduced ? 220 : 900);
      } else {
        setTimeout(onDone, prefersReduced ? 200 : 800);
      }
    }
    show();
  }

  /* ---------- Rotating motivational quote ---------- */
  function startMotivationRotator() {
    const el = document.getElementById("fb-motivation");
    if (!el) return;
    const keys = ["fb_motivation_1", "fb_motivation_2", "fb_motivation_3", "fb_motivation_4"];
    let i = 0;
    function step() {
      const text = (window.epsos && epsos.t) ? epsos.t(keys[i % keys.length]) : keys[i % keys.length];
      el.style.opacity = "0";
      setTimeout(() => {
        el.textContent = text;
        el.style.opacity = "1";
      }, 250);
      i++;
    }
    step();
    if (!prefersReduced) setInterval(step, 3600);
  }

  /* ---------- Stagger card reveal ---------- */
  function revealCards() {
    const cards = document.querySelectorAll(".fb-card");
    cards.forEach((c, idx) => {
      setTimeout(() => c.classList.add("in"), 120 + idx * 110);
    });
  }

  /* ---------- Plan-aware page render ---------- */
  function render(plan) {
    const isBasic = plan === "basic";
    const isPremium = plan === "premium";

    const stage = document.getElementById("fb-stage");
    const basicGate = document.getElementById("fb-basic-gate");
    const fullView = document.getElementById("fb-full");

    if (isBasic) {
      stage.classList.add("done");
      basicGate.style.display = "block";
      fullView.style.display = "none";
      // small reveal animation
      setTimeout(() => basicGate.classList.add("in"), 30);
      return;
    }

    basicGate.style.display = "none";
    fullView.style.display = "block";

    // Mark premium-only cards either unlocked or kept (they appear regardless on Premium)
    document.querySelectorAll(".fb-card.premium-only").forEach((c) => {
      if (isPremium) c.classList.add("unlocked");
      else c.classList.add("locked");
    });

    const s = computeScores();
    tweenNumber(document.getElementById("fb-score-overall"), s.overall, 1500);
    tweenNumber(document.getElementById("fb-score-clarity"), s.clarity, 1500);
    tweenNumber(document.getElementById("fb-score-ethics"), s.ethics, 1500);
    tweenNumber(document.getElementById("fb-score-comm"),   s.comm,   1500);
    setRing(document.getElementById("fb-ring-progress"), s.overall);

    // Bars
    document.querySelectorAll(".fb-bar").forEach((bar) => {
      const v = parseInt(bar.getAttribute("data-value"), 10) || 0;
      const fill = bar.querySelector(".fb-bar-fill");
      if (fill) {
        fill.style.width = "0%";
        requestAnimationFrame(() => {
          fill.style.width = v + "%";
        });
      }
    });
    // Inject the live values into bars
    const map = { clarity: s.clarity, ethics: s.ethics, comm: s.comm };
    document.querySelectorAll(".fb-bar").forEach((bar) => {
      const key = bar.getAttribute("data-key");
      if (!map[key]) return;
      bar.setAttribute("data-value", map[key]);
      const fill = bar.querySelector(".fb-bar-fill");
      if (fill) {
        fill.style.width = "0%";
        requestAnimationFrame(() => { fill.style.width = map[key] + "%"; });
      }
    });

    revealCards();
    startMotivationRotator();
  }

  /* ---------- Public ---------- */
  window.epsosFeedback = {
    init(plan) {
      const stage = document.getElementById("fb-stage");
      const onDone = () => {
        if (stage) stage.classList.add("done");
        render(plan || "plus");
      };
      runLoadingSequence(onDone);
    }
  };
})();
