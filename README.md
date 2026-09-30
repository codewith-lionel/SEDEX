# HR Audit Form Generator

A **local Electron desktop application** for HR documentation and
Sedex/SMETA audit preparation. Upload your existing Excel templates, map
spreadsheet cells to data fields, enter employee data (manually, from pasted
text with optional Gemini AI extraction, or from Excel/CSV files), review
everything on screen, and generate correctly filled `.xlsx` files **while
preserving the original template formatting**.

> **What this tool does — and does not do.** It extracts, organizes,
> validates formats, populates templates, tracks sources and highlights
> missing or conflicting information. It does **not** make any
> Sedex/SMETA compliance decision. A human reviews every generated document
> before it is used in an audit. Generation only happens after an explicit
> **Generate** click on the review screen.

---

## Features

| Module | What you can do |
| --- | --- |
| **Dashboard** | Counts (templates, generated forms, employees, active templates), recent templates & files, quick actions |
| **Template Manager** | Upload `.xlsx` templates (the file is *copied* into the app's template folder — your original is never touched), name, describe, categorize (HR, Payroll, Attendance, Overtime, Employee, Training, Audit, Other), search, filter, duplicate, enable/disable, delete. **No limit on the number of templates; nothing is hard-coded.** |
| **Field Mapper** | Unlimited fields per template: key, label, target cell, target worksheet, type (text, number, date, currency, boolean, dropdown, multiline), required flag, default value, validation rule, AI description, dropdown options. Interactive sheet preview with click-to-map, plus **auto-map** that detects `Label:` cells and suggests fields with inferred types. |
| **Form Generator** | Dynamic form rendered from the mapping, per-field validation, **explicit human review screen** (values, warnings, AI source + confidence), then a single click generates the Excel file. |
| **Data sources** | Manual entry · pasted unstructured text with **Gemini AI extraction** (structured, Zod-validated JSON only; missing information is returned as `null` → shown as “⚠ Information not found”; the AI never invents data) · Excel/CSV files with column mapping · the local employee list. |
| **Bulk generation** | From a data file (one employee per row) or from selected employees, with a live progress bar. **No artificial limit on the number of generated forms.** Failures are reported row-by-row and never abort the rest. |
| **Employee Manager** | Full CRUD plus Excel/CSV import with column mapping (upsert by employee code). |
| **Generated Files** | Every output with template, employee, source and timestamp — open in default app, show in folder, **regenerate** from the stored data snapshot, delete. |
| **Settings** | Gemini API key + model + test-connection button, AI on/off, default output folder, template folder, light/dark/system theme, database location, tool disclaimer. |

### Excel preservation guarantee

The generator **never recreates the spreadsheet**. It copies the original
template file, opens the copy with ExcelJS, modifies **only** the mapped
cells and saves it as the new output. Fonts, sizes, colors, borders, fills,
alignment, merged cells, row heights, column widths, formulas (including
unmapped ones), number formats, images/logos, multiple worksheets, page
layout and print settings survive untouched. Empty fields leave the template
cell exactly as it was. This is covered by an automated verification suite
(see [Verification](#verification)).

---

## Tech stack

Electron · React 19 · TypeScript (strict) · Vite 8 · Node.js · ExcelJS ·
SQLite (better-sqlite3) · Zod (validation of all external data: IPC payloads,
AI responses, file parsing) · Gemini REST API (optional) · Tailwind CSS 4 ·
electron-builder (Windows packaging)

## Security architecture

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- The renderer has **zero** Node.js access. Everything privileged runs in the
  main process and is reachable only through a typed `contextBridge` API.
- Every IPC payload is validated with Zod in the main process before any
  business logic runs; all results come back as `{ ok, data | error }`
  envelopes so the UI always shows a useful message instead of crashing.
- The Gemini API key is stored in the local SQLite database, is sent to the
  renderer **masked** by default (only the Settings page can fetch the raw
  value from the local machine), and is transmitted only to Google's API.
  It is never embedded in the frontend bundle.
- Only **Zod-validated structured AI data** can reach the Excel layer —
  arbitrary AI text never touches a cell.
- Navigation is locked to the app itself; external links open in the default
  browser. A strict CSP is injected in packaged builds.

## Getting started

Prerequisites: **Node.js ≥ 20** (Node 22 recommended) and npm.

```bash
npm install          # installs deps and rebuilds native modules (better-sqlite3)
npm run dev          # Vite dev server + Electron with hot reload
```

```bash
npm run typecheck    # tsc -b (all three projects: app/renderer, node, vite config)
npm run build        # production bundles → dist/ (renderer) + dist-electron/ (main, preload)
npm start            # run the built app
npm run verify       # automated Excel-preservation + database verification suites
npm run dist:win     # build the Windows installer (release/*.exe)
```

Useful extras:

```bash
npm run sample:templates   # regenerate the bundled sample Excel templates in /templates
npm run sample:icon        # regenerate buildResources/icon.png
```

First-run tip: on the **Templates** page click **Load Sample Templates** (or
**Add Template** with your own `.xlsx`). Open a template and click
**Auto-map from labels** to get a suggested mapping in one click, adjust it,
then hit **Generate**.

## AI data extraction (optional)

1. Put a Gemini API key in **Settings → AI** and press **Test Gemini Connection**.
2. Enable AI extraction.
3. On the Generator page choose **Paste Text**, paste anything (notes, chat
   logs, scanned-OCR text) and press **Extract with Gemini**.

Behaviour guarantees:

- The model is constrained with a `responseSchema` — it can only return the
  exact JSON shape defined by your template fields.
- **If the information is not present, the model must return `null`.** The UI
  shows “⚠ Information not found” and the field stays empty for manual entry.
  Nothing is invented.
- Each extracted value carries provenance: `value`, `source`, `page`,
  `status` (found / not_found / conflict / unclear), `confidence`, `note` —
  all of it is shown on the review screen and stored with the generated file
  for traceability.
- If the response fails validation, the app reports **Invalid AI response**
  with the concrete issues and you can retry.
- Dates/numbers are re-validated against the field type before generation
  (invalid date → `Invalid date "…"` error, never a corrupted cell).

## Project structure

```
├── database/migrations/0001_init.sql   # SQLite schema (inlined into the main bundle)
├── scripts/
│   ├── create-sample-templates.mjs     # builds the rich sample .xlsx templates
│   ├── create-icon.mjs                 # builds buildResources/icon.png
│   ├── verify-excel-preservation.mjs   # formatting-preservation test suite
│   └── verify-db.mjs                   # migrations + repository test suite
├── src/
│   ├── shared/                         # types, constants (IPC map), Zod schemas, validation
│   ├── main/
│   │   ├── main.ts                     # app lifecycle, secure window config
│   │   ├── ipc/                        # whitelisted IPC handlers (Zod-validated)
│   │   └── services/
│   │       ├── ai/geminiService.ts     # Gemini REST client (key stays in main)
│   │       ├── database/               # better-sqlite3 + repositories
│   │       ├── excel/excelService.ts   # copy → open → write mapped cells → save
│   │       ├── files/fileService.ts    # folders, dialogs, bundled samples
│   │       └── generator/              # single + bulk generation, progress events
│   ├── preload/preload.ts              # contextBridge API (window.api)
│   └── renderer/src/                   # React UI (pages, reusable components)
├── templates/                          # bundled sample templates
├── electron-builder.yml                # Windows packaging config
└── .github/workflows/build-windows.yml # CI: Windows installer on push/PR
```

## Data & storage

- **Database:** SQLite at `<userData>/hr-audit-forms.db` (location shown in
  Settings; overridable with the `SEDX_DB_PATH` environment variable).
- **Templates:** copies live in `~/Documents/HR Audit Forms/Templates`.
- **Outputs:** generated forms land in `~/Documents/HR Audit Forms/Generated`
  (both folders configurable).
- Generated files store a full **data snapshot** (value + provenance per
  field), which is what **Regenerate** uses.

## Verification

`npm run verify` runs two suites against the *real* service code:

1. **Excel preservation** — builds a formatting-heavy template (merged cells,
   fills, fonts, borders, widths, heights, formulas, number formats, embedded
   image, two worksheets), generates a filled copy, and asserts every
   property survived plus all error paths produce clean messages
   (`Template not found`, `Invalid date …`, `not one of the allowed options`,
   `Sheet "…" not found`).
2. **Database** — migrations, template/field CRUD, employee upsert,
   generated-file snapshots, settings defaults.

## Windows packaging

```bash
npm run dist:win        # locally (on Windows)
```

The GitHub Actions workflow (`.github/workflows/build-windows.yml`) also
runs automatically on **every pull request and push to main** (plus `v*`
tags and manual dispatch): it installs with `npm ci`, typechecks, runs
`npm run verify` (Excel-preservation + DB suites), builds the app, packages
the installer on `windows-latest` and uploads `release/*.exe` as an artifact.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `better-sqlite3` native error after Node upgrade | `npm rebuild better-sqlite3` |
| `Template not found` | The stored template file was moved/deleted from disk — re-add the template |
| `Invalid Excel file` | The file is not a readable `.xlsx`/`.xlsm` (`.xls` and corrupted files are rejected with a message) |
| `Gemini API error (401)` | Wrong/expired API key — test the connection in Settings |
| `AI extraction is disabled` | Enable AI in Settings and provide a key |
| `Required field missing: …` during bulk generation | Fix the row in the data file or the employee record and retry — other rows were not affected |

## License

MIT
