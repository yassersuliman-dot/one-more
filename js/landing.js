/* ============================================================
   ONE MORE — Landing motion & interactions
   Particle field · rotating phrases · scroll reveal · parallax
   ============================================================ */
(function () {
  "use strict";

  const PHRASE_KEYS = ["rot_step", "rot_chance", "rot_dream", "rot_score", "rot_future"];

  const prefersReduced = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /* ---------- Particle field (golden dust + soft navy specks) ---------- */
  function initParticles() {
    const canvas = document.getElementById("lux-particles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w, h, dpr = Math.min(window.devicePixelRatio || 1, 2);

    function size() {
      w = canvas.clientWidth = window.innerWidth;
      h = canvas.clientHeight = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener("resize", size, { passive: true });

    const COUNT = prefersReduced ? 0 : (w < 700 ? 38 : 80);
    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.3,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -Math.random() * 0.25 - 0.05,
        a: Math.random() * 0.5 + 0.25,
        tw: Math.random() * Math.PI * 2,
        gold: Math.random() < 0.55,
      });
    }

    let mouseX = w / 2, mouseY = h / 2;
    window.addEventListener("mousemove", (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
    }, { passive: true });

    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.tw += 0.02;

        // gentle attraction to mouse
        const dx = mouseX - p.x, dy = mouseY - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22500) {
          p.x += dx * 0.0005;
          p.y += dy * 0.0005;
        }

        // wrap
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }

        const alpha = (Math.sin(p.tw) * 0.35 + 0.65) * p.a;
        const color = p.gold
          ? `rgba(243, 212, 139, ${alpha})`
          : `rgba(184, 194, 209, ${alpha * 0.55})`;
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.shadowBlur = p.gold ? 8 : 0;
        ctx.shadowColor = p.gold ? "rgba(243,212,139,0.9)" : "transparent";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      requestAnimationFrame(tick);
    }
    if (!prefersReduced) tick();
  }

  /* ---------- Rotating phrase in hero ---------- */
  function initRotator() {
    const el = document.getElementById("rotator");
    if (!el) return;
    let i = 0;

    function render() {
      const key = PHRASE_KEYS[i % PHRASE_KEYS.length];
      const text = (window.epsos && epsos.t) ? epsos.t(key) : key;
      el.innerHTML = '<span class="rotator-word">' + text + "</span>";
      i++;
    }
    render();
    if (prefersReduced) return;
    setInterval(render, 2400);
  }

  /* ---------- Scroll reveal (IntersectionObserver) ---------- */
  function initReveal() {
    const els = document.querySelectorAll("[data-reveal]");

    // No motion or no IO support — reveal everything immediately
    // and skip the "js-ready" flag so CSS keeps content visible.
    if (!("IntersectionObserver" in window) || prefersReduced) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    // Mark anything already in viewport as "in" right away,
    // THEN flip on js-ready so CSS only hides what's still off-screen.
    const vh = window.innerHeight || document.documentElement.clientHeight;
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh * 0.9) el.classList.add("in");
    });
    document.body.classList.add("js-ready");

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => { if (!el.classList.contains("in")) io.observe(el); });

    // Failsafe — if any reveal element somehow stays hidden after 2.5s, force it visible
    setTimeout(() => {
      document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => el.classList.add("in"));
    }, 2500);
  }

  /* ---------- Parallax (mouse) on hero ---------- */
  function initParallax() {
    if (prefersReduced) return;
    const hero = document.querySelector(".lux-hero");
    const logo = document.querySelector(".lux-hero-bg-logo img");
    const doc  = document.querySelector(".lux-hero-doctor img");
    const inner = document.querySelector(".lux-hero-inner");
    if (!hero) return;
    hero.addEventListener("mousemove", (e) => {
      const rect = hero.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      // Doctor is deepest layer — moves least
      if (doc)   doc.style.transform   = `translate3d(${x * 10}px, ${y * 6}px, 0) scale(1.02)`;
      if (logo)  logo.style.transform  = `translate3d(${x * 18}px, ${y * 12}px, 0) scale(1.02)`;
      if (inner) inner.style.transform = `translate3d(${x * -8}px, ${y * -5}px, 0)`;
    }, { passive: true });
    hero.addEventListener("mouseleave", () => {
      if (doc)   doc.style.transform   = "";
      if (logo)  logo.style.transform  = "";
      if (inner) inner.style.transform = "";
    });

    // Slight scroll parallax — the doctor stays anchored as you scroll past
    window.addEventListener("scroll", () => {
      const y = window.scrollY || 0;
      if (doc) doc.style.translate = `0 ${y * 0.08}px`;
    }, { passive: true });
  }

  /* ---------- Public ---------- */
  window.epsosLanding = {
    init() {
      initParticles();
      initRotator();
      initReveal();
      initParallax();
      // Re-render rotator on language change
      document.querySelectorAll(".lang-switch button").forEach((b) => {
        b.addEventListener("click", () => setTimeout(initRotator, 30));
      });
    },
  };
})();
