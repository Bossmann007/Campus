# Quanto falta pra passar · PUCPR 2026/2

Calculadora de notas para a turma: mostra quanto você precisa tirar em cada avaliação que falta, com os pesos dos Planos de Ensino. As notas podem vir do Canvas pela extensão do Chrome, sem senha, sem token e sem servidor: tudo fica no seu navegador.

- Site: https://falta-quanto.vercel.app
- Quer ajudar? Veja [CONTRIBUTING.md](CONTRIBUTING.md). Falha de segurança: [SECURITY.md](SECURITY.md).
- Não é um sistema oficial da PUCPR. Confira pesos e datas no Canvas.

## Para quem desenvolve

Calculadora "Quanto falta pra passar" for PUCPR 2026/2: one static page (`index.html`), no backend, grades stay in each visitor's `localStorage`.

- `index.html`: the public page. The `<script id="core">` block holds the course weights and pure math; `<script id="ui">` renders it.
- `tests/notas-test.js`: tests for the core block.
- `scripts/verify`: exit 0 = core tests pass and the UI script parses.
- `scripts/snapshot`: copy `index.html` into `old/` before any redesign.
- `extension/`: Chrome MV3 extension (popup + `collect.js`) that reads the student's own Canvas grades and opens the page with them. Load unpacked from `chrome://extensions` for testing.
- `tools/canvas-export.py`: optional path for students who prefer their own Canvas API token; runs locally, read-only, prints the same JSON as the extension for the paste box. Stdlib only.
- `scripts/package-extension`: builds the release zip; `EXT_LATEST` in `index.html` must match `extension/manifest.json` (tested).
- `referencias/`: design reference links (`README.md`, `links.html`); not deployed.

Deploy: Vercel project `faltaquanto`, domain https://falta-quanto.vercel.app, serves only `index.html` and `privacidade.html` with the headers in `vercel.json` (`.vercelignore` whitelist). Production deploys need Enzo's approval each time.
