# SPEC: Caderno+ reading file for the PUCPR bot

Goal (2026-11-09, Enzo): give his agents Canvas through Caderno+. Revised the same day after his review: **only the
PUCPR bot**, **no inbox**, and **the simplest thing first**: Caderno+ saves what it already computed into a local JSON
file that the bot reads. The live bridge (native messaging) is phase B, only if the file proves too stale.

## Update (2026-11-09, later the same day)

- The file now feeds the **Caderno+ MCP** (`mcp/SPEC.md`, PR #49) as its default source, for every student, so the MCP
  needs **no Canvas token** and never calls Canvas itself (Instructure API Policy §3(i) names MCP servers; here only the
  extension reads Canvas, as it already does). The PUCPR bot reads it the same way.
- Contents add `grades` (Canvas grades per assignment, no links) and `turma`; the cap is 96 KB; the switch is "Arquivo
  para a sua IA" in the popup.
- Canary run: a test extension in an isolated headless Brave wrote the same `CadernoTeste/caderno-agente.json` three
  times with `conflictAction: "overwrite"`: one file, the last content, no `(1)` copies, history empty after `erase`.
  Not verified: how visible Chrome's download bubble is on each write (headless has none): Enzo checks on his Chrome.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Who | the PUCPR bot only | Enzo gets Canvas through the PUCPR summary; Maria does not need it |
| What the file adds | "quanto falta" exactly as the panel shows it (Canvas grades + grades typed by hand + meta + turma) | the PUCPR bot's `canvas_digest.py` already reads Canvas; this is the one thing it cannot compute |
| Inbox | out | colleagues' names and subjects are third-party data, and anyone in a class writes them (manipulation path) |
| Writes to Canvas | none | read-only |
| Transport | a JSON file in the student's Caderno+ folder inside Downloads | no new permission (`downloads` is already granted), no local program, no socket, no store permission review |
| Freshness | as fresh as the last Canvas reading (taken when Enzo opens Canvas; re-read after 10 minutes of use) | accepted trade-off; the file carries `read_at` so the bot can say how old it is |
| Live bridge | phase B, not now (design kept in git history of this file) | 7 new files, a local program, an optional permission and a store review, for freshness the bot does not need yet |

## Shape

- `extension/prefs.js`: `agentFile: false`.
- `extension/popup.html/.js`: switch "Arquivo para o bot (avançado)", off by default, small text "salva notas, prazos e
  avisos num arquivo na sua pasta de downloads".
- `extension/content.js`: after a drawing that used a **new** reading (`cache.at` differs from the last one written,
  kept in `chrome.storage.local` `agentAt`), when `prefs.agentFile` is on, builds the snapshot from the same `a =
  analyse(...)` the panel uses (no second implementation) and sends `{ type: "agentFile", data }` to the worker.
- `extension/background.js`: on `agentFile` (sender is this extension), validates (plain object, ≤ 48 KB serialized),
  writes `<dlFolder>/caderno-agente.json` with `chrome.downloads.download({ url: "data:application/json;...", filename,
  conflictAction: "overwrite", saveAs: false })`, then `chrome.downloads.erase({ id })` when complete so the history
  does not fill. At most one write per reading.
- PUCPR bot (outside this repo, done by Dev in the bot folder): `canvas_digest.py` reads the file if present, adds the
  "quanto falta" lines with the file's age, and ignores a file older than 24 h or with another `version`.

## File contents (`caderno-agente.json`)

```json
{ "version": 1, "read_at": "2026-11-09T01:20:00-03:00", "meta": 7, "turma_confirmed": true,
  "subjects": [ { "id": "abd", "earned": 5.5, "status": "precisa", "needed": 4.5, "label": "precisa 4,5/10",
                  "next": { "date": "2026-11-12", "untrusted_canvas_text": { "name": "RA1 · TDE" } } } ],
  "upcoming": [ { "date": "2026-11-11", "time": "23:59", "done": false, "exam": false,
                  "untrusted_canvas_text": { "title": "Entrega PjBL - Parte 3", "course": "Arquitetura de Banco de Dados" } } ],
  "announcements": [ { "at": "2026-11-08T10:00:00Z", "unread": true,
                       "untrusted_canvas_text": { "title": "RA3: sala alterada", "course": "Arquitetura de Banco de Dados" } } ] }
```

- `upcoming`: today to +15 days (what the reading covers). `announcements`: the 10 newest, no author, no body.
- Every Canvas-written string sits inside `untrusted_canvas_text`, control characters stripped, each ≤ 140 chars.
- No Canvas user id, no names of people, no inbox, no file links. Total ≤ 48 KB.
- `subjects` empty with `turma_confirmed: false` when the turma is not confirmed (same rule as the panel: no grades
  from another turma's weights).

### Version 2 (Caderno+ 4.0, MCP 0.3.0)

Adds `checklists` (per course or the dashboard: done, date, the student's text), `tasks` (own tasks: date, title),
`changes` (what changed since the last visit: kind from a fixed list, time, title, course), `modules` (titles the search
already read, ≤ 300, trimmed first), `teachers` (name and course, ≤ 30) and `unread_messages` (a count). Every string
is still inside `untrusted_canvas_text`. The file is written again when a checklist or task changes (1.5 s after the
last edit), not only per reading. This drops the earlier "no names of people" rule for the teachers' names only (shown
on every course page to the whole class); no student names, no authors, no message bodies. The MCP accepts versions 1
and 2 and adds the file-only tools `my_items`, `whats_new` and `teachers`; with a token they point to the file.

## Safety

- The file sits in the user's Downloads folder; any program of the macOS user can read it (accepted: read-only data
  Enzo already sees; no third-party names; Canvas text marked untrusted).
- Turning the switch off stops the writes; the file stays (its history entry was erased after each write, so
  `chrome.downloads.removeFile` no longer has an id). The popup says "apague `caderno-agente.json` na pasta de
  downloads se não quiser mais o arquivo".
- Store users: the switch is off by default and adds no permission; `privacidade.html` and `store/STORE.md` get one
  sentence ("opcional: um arquivo local com suas notas e prazos, nunca enviado a ninguém").

## The fact that would make it wrong (canary first)

A `data:` URL download with `conflictAction: "overwrite"` might show Chrome's download bubble on every write, or be
blocked for `.json`. Probe on Enzo's Chrome before anything else: one write from the worker, check the file lands in
`~/Downloads/<dlFolder>/caderno-agente.json`, is overwritten on the second write (no `(1)` copies), and how visible the
bubble is. If the bubble is intrusive, writes drop to at most one per hour.

## Out of scope

The live bridge (phase B), Maria and other agents, inbox, writes to Canvas, file downloads by the bot (it keeps
`canvas_files.py`), any change for students who leave the switch off.

## Check (end to end)

1. `./scripts/verify` exits 0, with new tests in `tests/inside-canvas-test.js` (or `tests/agent-file-test.js`):
   - golden: a fixture reading + `hand` + `prefs` (meta 6; turma confirmed / unconfirmed / other course) gives in
     `subjects` the same `label` and numbers the panel draws (built from the same `analyse()` result).
   - switch off → no message to the worker; same `cache.at` twice → one write; new reading → one more write.
   - every Canvas string inside `untrusted_canvas_text`, control chars stripped, ≤ 140 chars; no `author`, no inbox,
     no user id in the JSON; > 48 KB refused by the worker; a non-object refused; filename always
     `<cpFolder(dlFolder)>/caderno-agente.json`.
2. Canary on Enzo's Chrome (unpacked): switch on, open the dashboard, the file appears with `read_at` = the panel's
   "lido do Canvas"; ABD's `label` equals the panel's; reload after 10 minutes → overwritten, no `(1)` copy, history
   clean. Then Dev wires `canvas_digest.py` and the PUCPR bot's summary shows the same "quanto falta".
3. Undo: switch off, delete `caderno-agente.json`, revert the bot's digest change.

## Ship

Own branch and PR (not PR #48). Per the merge rule: Project Partner (scope) → Dev (implementation + `scripts/verify`
output) → approvals from Code Review Partner and Application Security Reviewer before merge. Enzo says when.

## Files

Changed: `extension/prefs.js`, `extension/popup.html`, `extension/popup.js`, `extension/content.js`,
`extension/background.js`, tests, `privacidade.html`, `store/STORE.md`, `README.md`. New: none in the extension
(`bridge/SPEC.md` only). Outside the repo: the PUCPR bot's `canvas_digest.py` (Dev).
