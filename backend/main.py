"""
SRK AI — FastAPI Backend

This backend is designed to sit behind Azure Static Web Apps (SWA).
SWA handles all Microsoft Entra ID authentication at the edge and forwards
pre-validated identity headers to this service on every API request.

Deployment architecture:
    Browser → SWA (auth + static files) → /api/* → this FastAPI service
                                           ↑
                              SWA injects X-MS-CLIENT-PRINCIPAL-* headers here

Local development:
    uvicorn main:app --reload --port 8000
    Note: auth headers won't be present locally. Use the DEV_BYPASS_AUTH env var
    to inject a mock user during development (never enable in production).
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from auth import SWAUser, get_current_user, require_user


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: add any initialisation here (DB connections, etc.)
    yield
    # Shutdown: cleanup here

app = FastAPI(
    title="SRK AI Backend",
    description="FastAPI backend for the SRK AI chatbot, authenticated via Azure Static Web Apps.",
    version="1.0.0",
    # Hide docs in production — only expose in dev
    docs_url="/api/docs" if os.getenv("ENV") == "development" else None,
    redoc_url=None,
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the SWA origin only. The SWA platform itself makes the /api/* calls
# on behalf of the browser, so the origin is the SWA domain.
# Add localhost for local development.
SWA_ORIGIN = os.getenv(
    "SWA_ORIGIN",
    "https://srk-za-ai-comparison-h5eccjapfshpgvcf.southafricanorth-01.azurewebsites.net"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[SWA_ORIGIN, "http://localhost:3000", "http://localhost:4280"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# ── Security headers middleware ───────────────────────────────────────────────

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"]   = "nosniff"
    response.headers["X-Frame-Options"]          = "DENY"
    response.headers["Referrer-Policy"]          = "strict-origin-when-cross-origin"
    return response


# ── Dev auth bypass (local only) ──────────────────────────────────────────────
# When DEV_BYPASS_AUTH=1, inject a fake user so auth-protected routes work
# without real SWA headers during local development.
# NEVER set this in production.

_DEV_BYPASS = os.getenv("DEV_BYPASS_AUTH") == "1"

async def _get_user_with_dev_bypass(
    user: SWAUser | None = Depends(get_current_user)
) -> SWAUser | None:
    if _DEV_BYPASS and user is None:
        return SWAUser(id="dev-user", name="Dev User", email="dev@srk.co.za", provider="dev")
    return user


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Public health-check — no auth required."""
    return {"status": "ok"}


@app.get("/api/me")
async def me(user: SWAUser = Depends(require_user)):
    """
    Return the authenticated user's identity as decoded from SWA headers.
    The browser calls this after /.auth/me to confirm the backend also
    recognises the session. Used to populate authenticated API requests.
    """
    return {
        "id":       user.id,
        "name":     user.name,
        "email":    user.email,
        "provider": user.provider,
        "roles":    user.roles,
    }


@app.get("/api/report/summary")
async def report_summary(user: SWAUser = Depends(require_user)):
    """
    Example protected route — requires authenticated SWA session.
    Replace with actual report data logic.
    """
    return {
        "user":    user.name,
        "message": "Access granted to AI Board Report data.",
    }


# ── Future: chat endpoint placeholder ─────────────────────────────────────────
# This is where the Claude API integration will be added.
# The user identity from require_user() will be used to scope conversations
# and enforce role-based skill access.

@app.post("/api/chat")
async def chat(user: SWAUser = Depends(require_user)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Chat endpoint not yet implemented."
    )
