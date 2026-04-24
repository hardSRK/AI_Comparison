# SRK AI Chatbot — Board Report Web App

## Files
- `index.html` — Main report (link external CSS/JS)
- `styles.css` — All styles
- `app.js`     — Navigation and tab switching
- `srk_ai_board_report.html` — Standalone single-file version (use this if you just need to open in a browser)

## Hosting Options

### Option 1 — Azure Static Web Apps (recommended for SRK)
1. Upload all files to an Azure Storage Account → enable "Static website"
2. Set index document: `index.html`
3. Your URL: `https://<storage-account>.z6.web.core.windows.net`
4. Add a custom domain via Azure DNS if needed

### Option 2 — Azure App Service (if you want server-side later)
1. Create an Azure App Service (Free or B1 tier for static)
2. Deploy via VS Code Azure extension, GitHub Actions, or ZIP deploy
3. Place files in `wwwroot/`

### Option 3 — GitHub Pages (free, instant)
1. Create a GitHub repo and push all files
2. Go to Settings → Pages → Source: main branch / root
3. Live at: `https://<yourorg>.github.io/<repo>`

### Option 4 — Netlify (free, drag-and-drop)
1. Go to netlify.com → "Add new site" → "Deploy manually"
2. Drag the folder containing these files
3. Live instantly at a netlify.app URL

### Option 5 — Open locally
Just open `srk_ai_board_report.html` directly in any browser — no server needed.

## Notes
- The report is fully self-contained (fonts load from Google Fonts CDN)
- The SRK logo is embedded as base64 — no external image dependencies
- The cost calculator runs entirely in the browser — no backend needed
- All 15 sections navigate via the left sidebar
