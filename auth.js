// ── SRK Auth Module ───────────────────────────────────────────────────────────
//
// Auth flow — Azure App Service Easy Auth / SWA built-in auth:
//
//   1. Page loads → Auth.init() calls /.auth/me
//   2. /.auth/me returns null (no cookie) → show login overlay
//   3. User clicks "Sign in with Microsoft" → redirect to /.auth/login/aad
//   4. Microsoft login completes → Azure platform sets session cookie, redirects back
//   5. /.auth/me now returns user claims → hide overlay, render user in sidebar
//   6. All API calls use credentials:'same-origin' so the session cookie is sent
//   7. Logout → /.auth/logout clears the cookie, redirects to /
//
// The platform (Azure) validates the token before Flask ever sees the request.
// Flask trusts the injected X-MS-CLIENT-PRINCIPAL-* headers — no token validation
// needed in application code.

const Auth = (() => {
  let _user = null;

  // Fetch the current authenticated user from the Easy Auth / SWA endpoint.
  // Returns null when the user is not logged in.
  async function _fetchUser() {
    try {
      const res = await fetch('/.auth/me', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();

      // Azure Static Web Apps returns: { clientPrincipal: { userId, userRoles, claims, ... } }
      // Azure App Service Easy Auth returns: [{ user_id, user_claims, id_token, ... }]
      if (data.clientPrincipal) return data.clientPrincipal;
      if (Array.isArray(data) && data.length > 0) return data[0];
      return null;
    } catch {
      return null;
    }
  }

  // Extract a claim value from the user's claims array.
  // Handles both SWA (typ/val) and App Service (type/value) claim shapes.
  function _getClaim(user, ...types) {
    const claims = user?.claims || user?.user_claims || [];
    for (const type of types) {
      const match = claims.find(c => c.typ === type || c.type === type);
      if (match) return match.val ?? match.value;
    }
    return null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  function getDisplayName(user = _user) {
    if (!user) return 'User';
    return (
      _getClaim(user,
        'name',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'
      ) ||
      user.userDetails?.split('@')[0] ||
      user.userId ||
      'User'
    );
  }

  function getEmail(user = _user) {
    if (!user) return null;
    return (
      _getClaim(user,
        'preferred_username',
        'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
        'emails'
      ) ||
      user.userDetails ||
      null
    );
  }

  // Redirect to Microsoft login. After auth, the platform redirects back to
  // the page the user was on (post_login_redirect_uri).
  function login() {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${next}`;
  }

  // Clear the session and return to the homepage.
  function logout() {
    window.location.href = '/.auth/logout?post_logout_redirect_uri=/';
  }

  // Authenticated fetch wrapper — sends the session cookie so the backend
  // receives the X-MS-CLIENT-PRINCIPAL-* headers on every request.
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
// Full-screen overlay shown when the user is not authenticated.
// The main content is hidden underneath until login succeeds.

function _showAuthOverlay() {
  document.getElementById('auth-overlay')?.classList.remove('auth-hidden');
  document.getElementById('sidebar')?.classList.add('auth-hidden');
  document.getElementById('main')?.classList.add('auth-hidden');
  const toggle = document.getElementById('menu-toggle');
  if (toggle) toggle.style.display = 'none';
}

function _hideAuthOverlay() {
  document.getElementById('auth-overlay')?.classList.add('auth-hidden');
  document.getElementById('sidebar')?.classList.remove('auth-hidden');
  document.getElementById('main')?.classList.remove('auth-hidden');
  const toggle = document.getElementById('menu-toggle');
  if (toggle) toggle.style.display = '';
}

// ── Sidebar user chip ─────────────────────────────────────────────────────────
// Replaces the static sidebar footer with the logged-in user's name and a
// sign-out button.

function _renderUserChip(user) {
  const el = document.getElementById('sidebar-user');
  if (!el) return;
  const name  = Auth.getDisplayName(user);
  const email = Auth.getEmail(user);
  const initial = name.charAt(0).toUpperCase();

  el.innerHTML = `
    <div class="user-chip">
      <div class="user-avatar" aria-hidden="true">${initial}</div>
      <div class="user-info">
        <div class="user-name">${name}</div>
        ${email ? `<div class="user-email">${email}</div>` : ''}
      </div>
    </div>
    <button class="logout-btn" onclick="Auth.logout()" aria-label="Sign out">
      Sign out
    </button>
  `;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await Auth.init();

  if (!user) {
    _showAuthOverlay();
  } else {
    _hideAuthOverlay();
    _renderUserChip(user);
  }
});
