# Campus+ · PUCPR 2026/2

O Canvas da PUCPR melhorado. Feito por um aluno, para alunos. (Antes chamado Quanto falta.)

Campus+ é uma extensão do Chrome, Brave e Edge que roda dentro do Canvas da PUCPR (pucpr.instructure.com):

- **Esta semana:** no painel do Canvas, as entregas e provas de todas as matérias por dia, com o que foi entregue, o que atrasou e quanto você precisa em cada prova.
- **Avisos:** os avisos de todas as matérias num lugar só, com os não lidos marcados.
- **Lembretes:** notificação 1 dia e 1 hora antes de cada entrega que falta, e na véspera e no dia de cada prova.
- **Tema escuro** (ou igual ao sistema).
- **Quanto falta:** em cada card e em cada matéria, quanto você precisa tirar nas próximas avaliações, com os pesos dos Planos de Ensino.
- **Arquivos:** baixa os arquivos da matéria organizados em `Downloads/PUCPR/<matéria>/<tipo>/`.
- **Ícone:** os dias até a próxima prova.

Cada parte pode ser desligada no botão da extensão. Sem senha, sem token e sem servidor: tudo fica no seu navegador ([privacidade](https://falta-quanto.vercel.app/privacidade.html)).

**Instalar:** baixe o zip em https://falta-quanto.vercel.app, descompacte, abra `chrome://extensions`, ligue o modo do desenvolvedor e use "Carregar sem compactação" na pasta.

**A seguir:** a calculadora completa (meta, calendário, notas à mão) passa para dentro do Canvas, num item "Campus+" do menu lateral; o site vira só o lugar para baixar a extensão ou o favorito.

- Quer ajudar? Veja [CONTRIBUTING.md](CONTRIBUTING.md). Falha de segurança: [SECURITY.md](SECURITY.md).
- Projeto de aluno, sem vínculo oficial com a PUCPR ou com a Instructure (Canvas). Confira pesos e datas no Canvas.

## Para quem desenvolve

Campus+ for PUCPR 2026/2: a Chrome MV3 extension that runs on the PUCPR Canvas, plus two static pages (`index.html` landing, `app.html` calculator at `/app`). No backend; data stays in `chrome.storage.local` and the visitor's `localStorage`.

- `index.html`: the landing page (pitch, demo video, install, FAQ); it forwards old `#canvas=` links to `/app`.
- `app.html`: the calculator. The `<script id="core">` block holds the course weights and pure math; `<script id="ui">` renders it.
- `tests/notas-test.js`: core block. `tests/extension-test.js`: manifest, permissions, collector, hand-off, bookmarklet. `tests/inside-canvas-test.js`: the extension on a mocked Canvas (fake DOM, mocked `chrome` and `fetch`).
- `scripts/verify`: exit 0 = all three test files pass, every extension file and the UI script parse.
- `scripts/snapshot`: copy `app.html` into `old/` before any redesign.
- `extension/`: the Campus+ extension. Load unpacked from `chrome://extensions` for testing. Files:
  - `prefs.js` (settings defaults) and `theme.js` (dark theme) run at `document_start`; `collect.js`, `core.js`, `files.js`, `content.js` at `document_idle`. Both groups share one content-script scope, so no top-level name may repeat.
  - `content.js`: dashboard panel (week from `/api/v1/planner/items` plus our exams; announcements), card pills, course panel, files download, reminders list. Panels are shadow-DOM, built with `textContent` only.
  - `background.js`: downloads (Canvas URLs only, into `Downloads/PUCPR`), reminder alarms and notifications, the icon badge.
  - `popup.*`: settings per module and the grades import.
  - History: since 0.7 it runs on `pucpr.instructure.com` pages (`content.js`): a status pill on each dashboard card, a panel on course pages with the next assessments and what each needs, a files download into `Downloads/PUCPR/<course>/<kind>/` (`files.js`, rules from the PUCPR bot's `canvas_files.py`), and the days to the next exam on the icon (`background.js`).
  - 1.0 renames it **Campus+**, a Canvas improvement where the grade calculator is one module: the week (Canvas planner deadlines plus our exams) and all announcements on the dashboard, reminders (`notifications`, alarms 1 day and 1 hour before), a dark theme (`theme.js`, document_start), and a settings popup to turn each part off (`prefs.js`, `chrome.storage.local` "prefs").
  - `extension/core.js` is generated from `app.html`'s core block by `scripts/sync-ext-core`; `tests/inside-canvas-test.js` fails when it is stale.
- `tools/canvas-export.py`: optional path for students who prefer their own Canvas API token; runs locally, read-only, prints the same JSON as the extension for the paste box. Stdlib only. Token from `CANVAS_TOKEN`, a `.env` (copy `tools/.env.example`; `.env` is git-ignored) or a hidden prompt.
- `scripts/package-extension`: builds the release zip; `EXT_LATEST` in `app.html` must match `extension/manifest.json` (tested).
- `video/scene.html` + `scripts/render-video`: render `media/demo.mp4` frame by frame with headless virtual time (needs ffmpeg); the second half is the real `app.html` importing made-up grades.
- Bookmarklet: `app.html` embeds a verbatim copy of `extension/collect.js` (tested) for students who cannot install the extension.
- `referencias/`: design reference links (`README.md`, `links.html`); not deployed.

Deploy: Vercel project `faltaquanto`, domain https://falta-quanto.vercel.app, serves only `index.html`, `app.html`, `privacidade.html` and `media/` (`cleanUrls`) with the headers in `vercel.json` (`.vercelignore` whitelist). Production deploys need Enzo's approval each time.
