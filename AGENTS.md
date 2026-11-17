# AGENTS.md: how to work on Caderno+

Rules for anyone changing this repo (people and coding agents). `CONTRIBUTING.md` is the short version for outside
contributors. When a rule here can be checked by a script, it is: `./scripts/verify` is the judge.

## 1. Map

| Path | What | Edit by hand? |
|---|---|---|
| `app.html` `<script id="core">` | All grade math (fromCanvas, courseState, semester, custom, formula, centro) | yes: the only place the math lives |
| `extension/` | The MV3 extension (content.js panel, background.js worker, collect.js Canvas reader, popup, pages) | yes, except `core.js` |
| `extension/core.js`, `mcp/lib/*` | Copies of the core and the reader | **no**: `scripts/sync-ext-core`, `scripts/sync-mcp-lib` |
| `rules/<term>/<turma>.json` | Plano de Ensino packs (transcribed), embedded into the core by `scripts/sync-rules` | yes, with `wSrc`/`dateSrc` for every item |
| `index.html` bookmarklet block, README turma list | Generated | **no**: `scripts/sync-bookmarklet`, `scripts/sync-rules` |
| `mcp/` | Local MCP server, CLI, ponte host | yes |
| `tests/` | Everything `scripts/verify` runs | yes |
| `store/`, `privacidade.html` | Store listing and privacy text | yes, whenever a permission or a data flow changes |
| `bridge/SPEC-*.md`, `SPEC.md` | Design records | update when the shape changes |
| `video/`, `media/` | Demo video sources and renders | rarely |

## 2. Every change

1. Branch from `main`; one round = one PR (or one more commit on the open PR of that round).
2. Change the source, never a generated copy. After touching `app.html`, `rules/` or `extension/`, run
   `./scripts/sync-ext-core && ./scripts/sync-mcp-lib && ./scripts/sync-bookmarklet` (`scripts/bump` does this too).
3. New behavior or a fixed bug gets a test in `tests/` that fails without the change.
4. `./scripts/verify` exits 0. Show its output in the PR.
5. UI change: load `extension/` in a browser on the real Canvas and look at it as the CC turma **and** as another turma
   (`prefs.turma = "outro"`). Screenshot in the PR.
6. Commit everything the sync touched (`git status` must be clean after commit). `scripts/release` and
   `scripts/deploy-site` refuse a dirty tree.
7. Commit messages in English, no AI co-author trailer or "Generated with" footer.

## 3. Versions

- Never edit version strings by hand: `scripts/bump <ext x.y.z> [mcp x.y.z]`. `scripts/check-versions` (in verify)
  fails on drift.
- Every round bumps: feature = minor, fix = patch. The MCP bumps only when `mcp/` or the core it uses changes.
- Write the Novidades in `extension/notes.js` (Portuguese, what the student sees, at most 6 items: only what changed since
  the last store version; `check-versions` counts them). The PR title starts with
  the version.

## 4. Release and deploy (only when the owner asks)

- `scripts/release "notas" ["notas do MCP"]`: verify, package, GitHub releases (`ext-v…` latest, `mcp-v…` prerelease),
  newest zip in `~/Downloads`.
- `scripts/deploy-site`: Vercel production, cleanup, checks the live version.
- The owner does: Chrome Web Store upload, AMO (Firefox) submission, `cd mcp && npm publish` (2FA). Never merge a PR
  unless the owner says so.

## 5. Where every number comes from

One priority, for every course, in every view (dashboard, course page, popup, MCP):

1. the student's own rule (`myRules[user][courseId]`, `own`/`formula`/`parts`);
2. the professor's formula in the Centro de Notas (`centroOf`);
3. the professor's weights in Canvas (weighted assignment groups, `canvasWeightsRule`);
4. the transcribed Plano de Ensino pack (`rules/`), only once a grade was read;
5. the sum of Canvas points, scaled to 10 when it passes 10, marked "confira".

- Dates: the Canvas due date beats the Plano date. A Plano date nobody confirmed shows "data a confirmar".
- Every number on screen names its source (`SRC` labels in `content.js`, `source` in the MCP).
- The priority lives in three places that must change together, each with a test: `analyse` + `gradesOverview` +
  `coursePanel` (extension/content.js) and `quanto_falta` (mcp/canvas.js).
- Rounding: what is needed rounds **up**, what is earned rounds **down**. Never show a "garantido" or "recuperação"
  from a guess (the plain sum): show "confira".

## 6. Code

- Plain JS, no build, no dependencies in the extension.
- Before naming a function, grep the file: `content.js` is one scope (a second `overview` broke the panel once).
- Declare before use inside `analyse` and other long functions (a `const` used above its line throws).
- Never put a `//` comment in the middle of a line that continues with code; put it at the end of the statement
  (twice this commented out real code).
- New code: one statement per line where practical; keep the existing long lines as they are unless you touch them.
- DOM: `textContent` and `el()`, never `innerHTML`. Links: only `https://pucpr.instructure.com/…` (or the Centro de
  Notas page the student opened).
- Network: only the PUCPR Canvas and the Centro de Notas (optional permission). No analytics, no server of ours.
- Storage is per Canvas user: every key that holds student data is keyed by `user`.
- Performance budget on a course page: panel under 60 ms, under 2 MB extra JS heap (6.11 measured 43 ms, +0.8 MB).

## 7. Data and secrets

- Never read, print or commit a Canvas token, cookie or `.env`. Test scripts that need the real Canvas read the token
  file themselves and print only results.
- Tests use invented grades and names. No real grades, classmates or screenshots with grades in issues or commits.
- New permission: reason in `privacidade.html` and `store/STORE.md` in the same PR (a test checks).
