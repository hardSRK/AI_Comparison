import base64
import json
from functools import wraps
from flask import Flask, send_from_directory, request, jsonify, abort

app = Flask(__name__, static_folder=".", static_url_path="")

# ── Security headers ──────────────────────────────────────────────────────────
# Applied to every response. These complement the headers set in
# staticwebapp.config.json (which only applies on Azure Static Web Apps).
@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"]  = "nosniff"
    response.headers["X-Frame-Options"]         = "DENY"
    response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]      = "camera=(), microphone=(), geolocation=()"
    # Only set HSTS on HTTPS — Azure App Service always terminates TLS before Flask
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# ── Azure Easy Auth helpers ───────────────────────────────────────────────────
# Azure App Service Easy Auth validates the Microsoft token at the platform
# level (before Flask sees the request) and injects identity headers:
#
#   X-MS-CLIENT-PRINCIPAL-NAME  — user's UPN / email
#   X-MS-CLIENT-PRINCIPAL-ID    — object ID in Azure AD
#   X-MS-CLIENT-PRINCIPAL-IDP  — identity provider (always "aad" here)
#   X-MS-CLIENT-PRINCIPAL       — base64-encoded JSON of all claims
#
# Flask trusts these headers without re-validating the token.
# Never expose these headers to the browser or accept them from clients.

def _decode_principal():
    """Decode X-MS-CLIENT-PRINCIPAL (base64 JSON) into a claims dict."""
    encoded = request.headers.get("X-MS-CLIENT-PRINCIPAL")
    if not encoded:
        return None
    try:
        # Pad to valid base64 length
        decoded = base64.b64decode(encoded + "==").decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return None

def _get_claim(principal, *types):
    """Return the value of the first matching claim type."""
    if not principal:
        return None
    for t in types:
        for claim in principal.get("claims", []):
            if claim.get("typ") == t:
                return claim.get("val")
    return None

def require_auth(f):
    """
    Route decorator — returns 401 if Easy Auth has not authenticated the request.
    On Azure App Service with Easy Auth enabled, unauthenticated requests are
    redirected to login by the platform before reaching this code, so this
    decorator acts as a defence-in-depth safeguard.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if not request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME"):
            abort(401)
        return f(*args, **kwargs)
    return decorated

# ── API routes ────────────────────────────────────────────────────────────────

@app.route("/api/me")
@require_auth
def api_me():
    """
    Return the authenticated user's identity derived from Easy Auth headers.
    The frontend calls this to populate the user chip and for authenticated
    API requests to the FastAPI backend.
    """
    principal = _decode_principal()

    name = (
        _get_claim(principal,
            "name",
            "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
        )
        or request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME", "Unknown")
    )

    email = _get_claim(principal,
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    )

    return jsonify({
        "id":       request.headers.get("X-MS-CLIENT-PRINCIPAL-ID"),
        "name":     name,
        "email":    email,
        "provider": request.headers.get("X-MS-CLIENT-PRINCIPAL-IDP", "aad"),
    })

# ── Static file routes ────────────────────────────────────────────────────────
# NOTE: On Azure App Service with Easy Auth set to "Require authentication",
# the platform redirects unauthenticated requests to /.auth/login/aad before
# Flask serves any static file — no additional auth guard needed here.

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)

if __name__ == "__main__":
    app.run()
