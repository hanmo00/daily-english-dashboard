# Daily English Dashboard

A GitHub Pages-compatible static dashboard for tracking completed English coaching sessions.

## Structure

- `index.html` — stable dashboard markup
- `css/style.css` — visual styling
- `js/dashboard.js` — rendering and JSON/CSV import-export behavior
- `data/sessions.json` — the only source for completed learning records
- `data/*.json` — curriculum and reusable lesson content pools

To add a completed session, edit `data/sessions.json`; `index.html` does not need to change. Keep the existing schema and set `completed` to `true`. The dashboard intentionally stores no credentials or private integration tokens.

Because browsers block JSON requests from `file://` pages, preview through GitHub Pages or a local static web server rather than opening `index.html` directly.
