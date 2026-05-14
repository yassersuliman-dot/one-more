/* ============================================================
   ONE MORE — auth-client.js
   Tiny helper shared by exam.html, results.html, and admin.html.
   - epsosAuth.requireUser({ role? })  → resolves to user; redirects to login on 401
   - epsosAuth.logout()                → clears cookie + localStorage, returns to login
   - epsosAuth.api(path, opts)         → fetch wrapper that includes credentials
   ============================================================ */
window.epsosAuth = (function () {
  async function api(path, opts) {
    opts = opts || {};
    opts.credentials = "same-origin";
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
    const r = await fetch(path, opts);
    return r;
  }

  async function requireUser(opts) {
    opts = opts || {};
    try {
      const r = await api("/api/me");
      if (!r.ok) throw new Error("not_auth");
      const u = await r.json();
      if (opts.role && u.role !== opts.role) {
        // wrong role — bounce them to the right place
        window.location.href = u.role === "admin" ? "admin.html" : "exam.html";
        return null;
      }
      // Student trying to enter a paid page without access → pricing.
      if (opts.requirePaid && u.role !== "admin" && !u.access_granted) {
        window.location.href = "pricing.html";
        return null;
      }
      return u;
    } catch (e) {
      try { localStorage.removeItem("epsos_user"); } catch (_) {}
      window.location.href = "login.html";
      return null;
    }
  }

  async function logout() {
    try { await api("/api/logout", { method: "POST" }); } catch (e) {}
    try {
      localStorage.removeItem("epsos_user");
      localStorage.removeItem("epsos_exam_state");
      localStorage.removeItem("epsos_submitted");
    } catch (e) {}
    window.location.href = "login.html";
  }

  return { api, requireUser, logout };
})();
