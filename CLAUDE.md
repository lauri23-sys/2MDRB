# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page **quality-intelligence dashboard for DRB Group** ("DRB Group — Quality Intelligence · powered by 2M") that visualizes 2M home-inspection review data — deduction trends, inspector consistency, and vendor accountability — and lets an admin upload 2M inspection **PDFs** that are parsed in-browser and folded into every board live.

**The entire application is one file: `index.html` (~1.2 MB).** There is no build step, no framework, no bundler. It is plain HTML + inline CSS + inline vanilla JS, opened directly in a browser. `Main` is an empty placeholder; `package.json` has no scripts.

## Running & working on it

There is no dev server or npm script. Serve the folder as static files and open `index.html`. Python is **not** available (the `python` on PATH is a Windows Store stub); use Node. A minimal static server pattern (adjust the root path):

```powershell
# from a scratch .js file: http.createServer serving this directory on :8000
node serve.js   # then open http://localhost:8000
```

To view on a phone on the same Wi-Fi, bind the server to `0.0.0.0` and browse to `http://<computer-LAN-ip>:8000` (`localhost` only works on the host machine).

### Validate changes (do this after editing `index.html`)

`index.html` holds three inline `<script>` blocks; a syntax error in any silently breaks the app. Validate by extracting the inline scripts and running each through `new Function(code)`:

```powershell
# scratch script: read index.html, regex out <script> blocks with no src=, new Function() each
node syntaxcheck.js
```

### Reading the file (important)

`index.html` is too large to `Read` whole, and script block #2 contains **very long single lines** (embedded base64 photos + a big JSON data array) that blow the Read token limit even with `offset`/`limit`. Prefer **Grep** to locate symbols, and Read narrow ranges (`limit` ≤ ~30 lines) around known line numbers. Never try to Read the base64/data region.

## Architecture (all inside `index.html`)

Three inline scripts, in order:
1. **pdf.js worker config** — sets `pdfjsLib.GlobalWorkerOptions.workerSrc`.
2. **Static data** — `ITEM_PHOTOS` (base64 JPEGs) and `REAL_REPORTS` (the seed dataset, one JSON object per report per line). This is the huge, unreadable block.
3. **All app logic** — data layer, aggregation, rendering, and the PDF upload subsystem.

External libs are loaded from **cdnjs CDN** (`Chart.js`, `pdf.js`), not from `node_modules`. The `package.json` deps (`@supabase/supabase-js`, `pdfjs-dist`) are **not used at runtime** — `index.html` has no imports and no Supabase code. `pdfjs-dist` in `node_modules` exists only for offline parser testing (see below).

### Data model

Each report: `{ id, lot, community, inspector, fieldManager, date, score, possiblePoints, totalPts, items[] }`, where each item is `{ room, trade, code, desc, detail, pts, damage }`. `date` is `YYYY-MM-DD`; `damage` items are excluded from deduction rankings.

### Data layer & persistence

- `REPORTS` is the live in-memory array. `loadData()` reads from host-injected `window.storage` → falls back to `localStorage` → falls back to the `REAL_REPORTS` seed. `persistReports()` writes to both stores (stripping transient `_`-prefixed fields).
- **`window.storage` is provided by the original hosting environment and is `undefined` when served locally** — so local runs always land on the seed + localStorage path. Don't assume it exists.
- Uploaded PDF **blobs** are stored in **IndexedDB** (`savePdfBlob`/`openStoredPdf`), keyed by report id — never in localStorage (too large).
- `TODAY` is a **fixed constant** (`new Date(2026,6,15)`), not the real date. All "last 7/30/60 days" filtering is relative to it.

### Category lists (must stay rebuildable)

`NEIGHBORHOODS_LIVE`, `NEIGHBORHOODS_BASE`, and `INSPECTORS_LIVE` are `let` (not `const`) and are recomputed from `REPORTS` by `rebuildLists()` after load and after every upload, so new communities/inspectors flow into dropdowns, heatmap axes, and counts. `populateFilters()` is idempotent (clears + repopulates, preserving selection).

### Normalization helpers — the source data is messy; these are load-bearing

- **`baseNeighborhood(name)`** — strips product-type suffixes so `"Sidney Creek SF 30s"`, `"Sidney Creek TH"`, etc. collapse into one neighborhood category. Filtering matches on the base name.
- **`prettyTrade(raw)`** — canonical, professional trade/vendor labels. The seed data spells the same trade two ways (`Concrete_Flatwork` vs `Concrete Flatwork`), which would otherwise appear as duplicate vendors; aggregation is keyed on `prettyTrade()` output so duplicates merge. A `TRADE_OVERRIDES` map handles special cases (`Exterior_Appointments`→`Exterior`, `Brick_Stone_Stucco`→`Brick, Stone & Stucco`, `HVAC` stays uppercase, etc.).
- **`aggregateDeductions()`** groups by **item `code`** (not code+desc), summing counts/points across differing wordings; `representativeDesc()` picks a label from the group's longest common prefix (the standard 2M item name), falling back to the most frequent text.
- **`photoFor(item)`** — items have no real photo; a deterministic hash of `code|desc` picks a stable image from `ITEM_PHOTOS` so each distinct finding shows its own consistent picture (not all `ITEM_PHOTOS[0]`).
- **`fmtDate(s)`** — builds the Date from calendar parts to avoid the UTC-midnight parse that shifts `YYYY-MM-DD` back a day in timezones west of UTC.

### Views & rendering

Nav data-view values: `dashboard`, `deductions`, `insights`, `vendor`, `upload`. `showView(name)` toggles `.view.active` and calls the matching `render*()`. `refreshActiveView()` re-renders whatever is visible after data changes. Charts use Chart.js; the vendor chart sets `autoSkip:false` + dynamic height so **every** bar label shows.

### PDF upload subsystem (passcode-gated)

Flow: passcode gate → drop/select PDFs → pdf.js text extraction → heuristic parse → **editable review** → commit into `REPORTS` + refresh boards.

- Passcode is `UPLOAD_PASSCODE = 'drb'` (demo).
- `extractPdfText()` reconstructs lines from pdf.js text items by y-coordinate.
- **Extraction quirk that breaks naive parsing:** labels come out with spurious internal spaces — "Reviewer" → `"Rev iew er"`, "Division" → `"Div ision"`, the `TH` suffix → `"T H"`. `spacedLabel()` builds regexes that tolerate spaces between a label's characters; `headerField()` uses them. **The inspector name comes from the report's "Reviewer" field**, not an "Inspector" label. `cleanCommunity()` strips region codes like `(NC)(RAL)` and de-spaces suffixes.
- `parseItems()` reads the "Items" table (Room/Trade/Code/desc/points), reconstructing rows that wrap across lines; damage = code ends in `D`.
- Parsed reports sit in `parsedQueue` and are fully **editable** in the review UI before `commitParsed()` writes them.

### Testing the PDF parser offline

Real sample 2M PDFs live on the user's Desktop (`C:\Users\nlaurito\Desktop\*.pdf` and `\More Reports\`). To debug the parser against them without a browser, run Node scripts that import the ESM build directly: `node_modules/pdfjs-dist/legacy/build/pdf.mjs` (dynamic `import()` of a `pathToFileURL`). Mirror the parser functions in a scratch `.mjs`, extract + parse the PDFs, and print the resulting report objects. **Keep the offline parser logic in sync with the copy in `index.html`.**

### Responsive layout

Desktop/laptop is the primary target and **must not change** — it's what PMs/analysts use. Mobile adaptations live entirely in `@media (max-width: 980px)` (tablet) and `@media (max-width: 640px)` (phone: sidebar becomes a sticky top bar, tables scroll horizontally instead of squishing, filters go full-width). Keep new mobile rules inside those media queries.
