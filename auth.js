// ── SRK Auth Module — Azure Static Web Apps Built-in Auth ────────────────────
//
// How SWA built-in auth works (no custom OAuth code required):
//
//   [staticwebapp.config.json]
//     └─ Declares all routes require "authenticated" role
//     └─ 401 responses redirect to /.auth/login/aad (Microsoft Entra ID)
//
//   [Azure edge — before any JS runs]
//     └─ Unauthenticated GET /* → platform redirects to /.auth/login/aad
//     └─ Microsoft login completes → platform sets __Host-swa-auth session cookie
//     └─ Platform injects X-MS-CLIENT-PRINCIPAL-* headers into every /api/* call
//
//   [Browser — this file]
//     └─ Auth.init() calls /.auth/me to read the session
//     └─ If null (not logged in) → show login overlay, Auth.login() redirects to /.auth/login/aad
//     └─ If user present → hide overlay, render user chip in sidebar
//     └─ Auth.authFetch() sends credentials so session cookie goes to the FastAPI backend
//     └─ Auth.logout() calls /.auth/logout to clear the SWA session cookie
//
// SWA /.auth/me response shape:
//   { clientPrincipal: { userId, userDetails, identityProvider, userRoles, claims } }
//   claims: [{ typ: "name", val: "Dylan Harrison" }, { typ: "preferred_username", val: "d.h@srk.co.za" }]

const Auth = (() => {
  let _user = null;

  // ── Fetch current session from /.auth/me ────────────────────────────────────
  // Handles both response shapes so this module works on both:
  //   Azure Static Web Apps  → { clientPrincipal: { userId, claims, ... } }
  //   Azure App Service Easy Auth → [{ user_id, user_claims, ... }]
  async function _fetchUser() {
    try {
      const res = await fetch('/.auth/me', {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return null;
      const data = await res.json();

      // Azure Static Web Apps format
      if (data.clientPrincipal) return data.clientPrincipal;

      // Azure App Service Easy Auth format — normalise to SWA-like shape
      if (Array.isArray(data) && data.length > 0) {
        const p = data[0];
        return {
          userId:           p.user_id,
          userDetails:      p.user_id,          // UPN / email
          identityProvider: 'aad',
          userRoles:        ['authenticated'],
          claims:           p.user_claims || []  // same { typ, val } shape
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  // ── Extract a named claim value ─────────────────────────────────────────────
  // SWA claims use { typ: "...", val: "..." } shape.
  function _claim(user, ...types) {
    const claims = user?.claims || [];
    for (const type of types) {
      const match = claims.find(c => c.typ === type);
      if (match?.val) return match.val;
    }
    return null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  // Best available display name from the token claims
  function getDisplayName(user = _user) {
    if (!user) return 'User';
    return (
      _claim(user, 'name', 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname') ||
      user.userDetails?.split('@')[0] ||
      'User'
    );
  }

  // Email / UPN from the token — userDetails is usually the UPN on AAD tokens
  function getEmail(user = _user) {
    return (
      _claim(user, 'preferred_username',
             'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress') ||
      user?.userDetails ||
      null
    );
  }

  // Redirect to /.auth/login/aad — SWA handles the full OAuth flow.
  // post_login_redirect_uri sends the user back to the page they were on.
  function login() {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${next}`;
  }

  // Clear the SWA session cookie and return to the root.
  function logout() {
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/';
  }

  // Authenticated fetch wrapper.
  // credentials:'same-origin' sends the __Host-swa-auth session cookie so the
  // SWA platform injects X-MS-CLIENT-PRINCIPAL-* headers into the /api/* call.
  function authFetch(url, opts = {}) {
    return fetch(url, {
      ...opts,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...opts.headers
      }
    });
  }

  async function init() {
    _user = await _fetchUser();
    return _user;
  }

  return {
    init,
    login,
    logout,
    authFetch,
    getDisplayName,
    getEmail,
    get user()            { return _user; },
    get isAuthenticated() { return !!_user; }
  };
})();

// ── Auth overlay ──────────────────────────────────────────────────────────────
// Shown when /.auth/me returns no session.
// The overlay is a belt-and-suspenders guard; the platform already redirects
// unauthenticated requests via staticwebapp.config.json, but JS-navigated
// pages benefit from this immediate visual feedback.

function _showAuthOverlay() {
  document.getElementById('auth-overlay')?.classList.remove('auth-hidden');
  document.getElementById('sidebar')?.classList.add('auth-hidden');
  document.getElementById('main')?.classList.add('auth-hidden');
  const btn = document.getElementById('menu-toggle');
  if (btn) btn.style.display = 'none';
}

function _hideAuthOverlay() {
  document.getElementById('auth-overlay')?.classList.add('auth-hidden');
  document.getElementById('sidebar')?.classList.remove('auth-hidden');
  document.getElementById('main')?.classList.remove('auth-hidden');
  const btn = document.getElementById('menu-toggle');
  if (btn) btn.style.display = '';
}

// ── Sidebar user chip ─────────────────────────────────────────────────────────
function _renderUserChip(user) {
  const el = document.getElementById('sidebar-user');
  if (!el) return;
  const name    = Auth.getDisplayName(user);
  const email   = Auth.getEmail(user);
  const initial = name.charAt(0).toUpperCase();

  el.innerHTML = `
    <div class="user-chip">
      <div class="user-avatar" aria-hidden="true">${initial}</div>
      <div class="user-info">
        <div class="user-name">${name}</div>
        ${email ? `<div class="user-email">${email}</div>` : ''}
      </div>
    </div>
    <button class="logout-btn" onclick="Auth.logout()" type="button">Sign out</button>
  `;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.init();

  if (!user) {
    // No active session — show branded login overlay.
    // Clicking the button calls Auth.login() which redirects to /.auth/login/aad.
    _showAuthOverlay();
  } else {
    _hideAuthOverlay();
    _renderUserChip(user);
  }
});
