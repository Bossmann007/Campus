# notas-pucpr

Calculadora "Quanto falta pra passar" for PUCPR 2026/2: one static page (`index.html`), no backend, grades stay in each visitor's `localStorage`.

- `index.html`: the public page. The `<script id="core">` block holds the course weights and pure math; `<script id="ui">` renders it.
- `tests/notas-test.js`: tests for the core block.
- `scripts/verify`: exit 0 = core tests pass and the UI script parses.
- `scripts/snapshot`: copy `index.html` into `old/` before any redesign.
- `extension/`: Chrome MV3 extension (popup + `collect.js`) that reads the student's own Canvas grades and opens the page with them. Load unpacked from `chrome://extensions` for testing.
- `old/`: Enzo's earlier personal versions (contain his grades; never deployed).
- `referencias/`: design reference links (`README.md`, `links.html`); not deployed.

Deploy: Vercel project `quanto-falta-pucpr` (https://quanto-falta-pucpr.vercel.app) serves only `index.html` with the headers in `vercel.json` (`.vercelignore` whitelist). Production deploys need Enzo's approval each time.
