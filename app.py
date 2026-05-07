"""
Local development static file server.

In production this app is deployed to Azure Static Web Apps — the SWA platform
serves the static files directly (no Python server needed).

This file is only used to serve the frontend locally during development.
For local development with full auth, use the SWA CLI instead:
    npm install -g @azure/static-web-apps-cli
    swa start . --api-location backend/

Run this file only for quick static preview (auth /.auth/* routes won't work):
    python app.py
"""

from flask import Flask, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)


if __name__ == "__main__":
    print("⚠  Auth headers (/.auth/me) are not available in local mode.")
    print("   Use 'swa start' for full local auth support.")
    app.run(debug=True, port=5000)
