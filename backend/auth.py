"""
SWA Authentication dependency for FastAPI.

Azure Static Web Apps validates the Microsoft Entra ID token at the edge and
injects the identity as headers into every /api/* request before it reaches
this backend. The backend never sees the raw token — only the pre-validated
headers. This is the correct trust model for a SWA-linked backend.

Headers injected by SWA on every authenticated API call:
    X-MS-CLIENT-PRINCIPAL        base64(JSON claims object)
    X-MS-CLIENT-PRINCIPAL-ID     Azure AD object ID (stable unique identifier)
    X-MS-CLIENT-PRINCIPAL-NAME   User's UPN / email (e.g. dylan@srk.co.za)
    X-MS-CLIENT-PRINCIPAL-IDP    Identity provider — always "aad" here

Security note:
    These headers are injected BY the SWA platform, not by the browser.
    The SWA platform strips any client-supplied headers with the same names
    before forwarding, so they cannot be spoofed from the browser.
    Do NOT re-validate the token here — trust the platform.
"""

import base64
import json
from typing import Optional
from fastapi import Header, HTTPException, status
from pydantic import BaseModel


class SWAUser(BaseModel):
    """Decoded identity from the SWA auth headers."""
    id:       str
    name:     str
    email:    Optional[str] = None
    provider: str = "aad"
    roles:    list[str] = []


def _decode_principal(encoded: str) -> dict:
    """Base64-decode and JSON-parse the X-MS-CLIENT-PRINCIPAL header."""
    # Pad to valid base64 length before decoding
    padded  = encoded + "==" * (-len(encoded) % 4)
    decoded = base64.b64decode(padded).decode("utf-8")
    return json.loads(decoded)


def _claim(claims: list[dict], *types: str) -> Optional[str]:
    """Return the first matching claim value from a list of {typ, val} dicts."""
    for t in types:
        match = next((c for c in claims if c.get("typ") == t), None)
        if match:
            return match.get("val")
    return None


# ── FastAPI dependencies ──────────────────────────────────────────────────────

async def get_current_user(
    x_ms_client_principal_id:  Optional[str] = Header(None),
    x_ms_client_principal_name: Optional[str] = Header(None),
    x_ms_client_principal_idp: Optional[str] = Header(None),
    x_ms_client_principal:     Optional[str] = Header(None),
) -> Optional[SWAUser]:
    """
    Dependency: returns the authenticated SWAUser or None.
    Use require_user() for routes that must be authenticated.
    Use this directly when auth is optional.
    """
    if not x_ms_client_principal_id:
        return None

    # Parse the full claims blob if available for richer user info
    claims: list[dict] = []
    roles:  list[str]  = []

    if x_ms_client_principal:
        try:
            data   = _decode_principal(x_ms_client_principal)
            claims = data.get("claims", [])
            roles  = data.get("userRoles", [])
        except Exception:
            pass  # Fall back to the simpler header values

    name = (
        _claim(claims,
               "name",
               "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name") or
        x_ms_client_principal_name or
        "Unknown"
    )

    email = _claim(
        claims,
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    )

    return SWAUser(
        id=x_ms_client_principal_id,
        name=name,
        email=email,
        provider=x_ms_client_principal_idp or "aad",
        roles=roles,
    )


async def require_user(user: Optional[SWAUser] = Depends(get_current_user)) -> SWAUser:
    """
    Dependency: raises HTTP 401 if request is not authenticated.

    Usage:
        @app.get("/api/protected")
        async def my_route(user: SWAUser = Depends(require_user)):
            ...
    """
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
