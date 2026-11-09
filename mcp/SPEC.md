# SPEC: Caderno+ MCP, Canvas for your AI with the token in a local vault

Goal (2026-11-09, Enzo): connect the student's AI (Claude Code, Claude Desktop, the OpenBot PUCPR bot) to Canvas, by MCP
if needed, with the Canvas token kept on the student's machine in the OS vault (Keychain style), never in a file. This
replaces phase B of `bridge/SPEC.md` (the native-messaging bridge); the JSON file of phase A stays optional.

## Update (2026-11-09, later): no token by default

The default source is now the extension's file (`bridge/SPEC.md`, "Arquivo para a sua IA"): `mcp/file.js` reads
`Downloads/PUCPR/caderno-agente.json` or `CADERNO_FILE` only (never a scan of Downloads: an unzipped download could
plant one), opens it as a regular file only (no symlink, FIFO or device; size checked on the open file), refuses a
future `read_at`, and treats every value as untrusted (the format check is not proof of origin): enums and patterns
for status, id, label and kind, every free string cleaned and inside `untrusted_canvas_text`. It serves `quanto_falta` (with hand grades), `upcoming`, `grades`, `courses` and
`announcements` from it; `modules` needs the token. With the file the MCP never calls Canvas and holds no credential,
which, in file mode, keeps the MCP from reaching Canvas at all (only the extension reads Canvas, as it already does);
the same package still ships the token mode, which does reach Canvas. The token mode below stays as the optional way for fresh data and modules. The file wins when both exist.

## Prior art (2026-11-09)

| Candidate | What | Verdict |
|---|---|---|
| Instructure's own Canvas MCP | a Community thread "Canvas MCP" (community.instructure.com/en/discussion/666665) reported as "acting as the signed-in user… institutions choose what is enabled"; the page did not load for us | **preferred if real and PUCPR enables it** (the only path §3(i) clearly allows). Ask PUCPR's TI before the store. Não verifiquei |
| xmike04/canvas-student-mcp (MIT, TS, npm v1.3.0) | read-only (every tool a GET), token in macOS Keychain (`security … -s canvas-student-mcp -a token`), env first, `CANVAS_NO_KEYCHAIN=1` | closest to the ask, but its GitHub repo returns 404: a credential-holding package whose source we cannot follow. **Borrow the design, do not depend on it** |
| Ait0u5hi/canvas-scholar-mcp (MIT, TS, 0 stars) | "mostly read-only" (4 write tools), Claude Desktop `.mcpb` bundle with the token as a `sensitive` field (Claude Desktop keeps it in the OS store) | **borrow the `.mcpb` packaging** for phase 2 |
| vishalsachdev/canvas-mcp (MIT, rejected before) | solid, token in an env var, has writes | env token is not a vault; no "quanto falta" |

Decision: our own small server in this repo (`mcp/`), read-only, Node ≥ 18 (same language as `core.js`, which it reuses
for "quanto falta"), **zero dependencies** (MCP over stdio is newline-delimited JSON-RPC; a credential-holding tool with
no third-party code to audit or to be hijacked).

**For every student, each one local** (Enzo, 2026-11-09: not waiting for PUCPR's TI): each student installs it on their
own computer, with their own token in their own OS vault. No server of ours and no shared token. What leaves the machine:
the student's own GETs to `pucpr.instructure.com`, and every tool reply, which goes to the AI app and its provider's cloud
(chat history, app logs). The README says this before the install steps.

## Vault (per user, per OS)

`mcp/vault.js` picks the store of the system (by absolute path, so a same-named program in the current folder is never
run); the token never goes on a command line (`ps`), in shell history, in a config file or through our stdout. One env
var exception: Claude Desktop passes the `.mcpb` field as `CADERNO_MCPB_TOKEN`, deleted from the process env on read.
The stores protect against files and other OS accounts, not against programs of the same user (macOS trusts
`/usr/bin/security`, the creator of the item, so any same-user process can read it with no prompt; an unlocked Secret
Service and DPAPI behave the same): said in the README. `node mcp/cli.js login` asks for it (`npx caderno-mcp login` only after the npm name is published by us) with hidden input and hands it to the
store through **stdin** of the store's own tool.

| OS | Store | Write / read / delete |
|---|---|---|
| macOS | Keychain, service `caderno-plus-canvas`, account `pucpr.instructure.com` | `security add-generic-password -U -s … -a … -w` (prompts itself) / `find-generic-password … -w` / `delete-generic-password` |
| Windows | DPAPI (CurrentUser) file `%APPDATA%\caderno-plus\canvas.dpapi`: readable only by this Windows user | PowerShell `ConvertTo-SecureString` / `ConvertFrom-SecureString` with the value on stdin / `Remove-Item` |
| Linux | Secret Service (GNOME Keyring, KWallet) via `secret-tool`, attributes `service caderno-plus-canvas host pucpr.instructure.com` | `secret-tool store` (stdin) / `lookup` / `clear`; without `secret-tool`: refuse, with the install hint |
| Claude Desktop (any OS) | `.mcpb` bundle, `canvas_token` field `"sensitive": true`: Claude Desktop keeps it in the OS store and passes it to the server at start | the student pastes it in the install dialog. Não verifiquei which store Claude Desktop uses per OS |
| OpenBot | its Vault (see below), `CANVAS_TOKEN_FILE=<path>` | read only |

The server reads the token once at start, keeps it in memory, never prints, logs or returns it (every error text passes
a scrubber). `logout` deletes it; `status` says only whether one exists.

- The token: a Canvas personal access token the student creates in Conta → Configurações → "Novo token de acesso", with
  an **expiry at the end of the term**, purpose "Caderno+ MCP". It carries the student's full permissions (Canvas
  tokens have no scopes for students): read-only is enforced by our code, not by the token. Revoking it in Canvas ends
  access at once.
- OpenBot (checked in its app code, 2026-11-09): its Vault is one file `openbot-vault-v1.json` (0600) encrypted with
  Electron `safeStorage` (on macOS a key held in the Keychain), decrypted only in memory. An API key saved there with a
  variable name (or asked by an agent with `request_api_key`, where the user types it in OpenBot's UI) reaches agents as
  a file `agent-api-keys/.vault/<NAME>` (folder 0700, file only for the user, written only when an agent asks, removed
  when the key is deleted); the agent reads the file in its own command, so the value never goes through a tool call or
  the chat, and OpenBot redacts the value from outputs. So for Enzo's bots: save the token in OpenBot's Vault as
  `CANVAS_API_TOKEN` and start the server with `CANVAS_TOKEN_FILE=<that path>`; `vault.js` reads either the Keychain
  (students) or that file (OpenBot), never an env var holding the value.
- Enzo's existing token in the OpenBot `canvas.env` (plain file): move it into the Keychain and point the PUCPR bot at
  the server, then delete the file and rotate the token. Done by Enzo; the value is never read or printed by an agent.

## Tools (read-only, GET only)

Host pinned to `https://pucpr.instructure.com`; every request built from an allowlist of paths with digit-only ids;
`Authorization: Bearer` from memory; pagination capped; replies trimmed to what the tool returns.

| Tool | Canvas | Returns |
|---|---|---|
| `courses` | `/api/v1/courses?enrollment_state=active` | id, name, term |
| `upcoming` | `/api/v1/planner/items` (−7 to +15 days) | date, time, course, title, done, late |
| `grades` | `/api/v1/courses/:id/assignments?include[]=submission` (the extension's `collect.js`) | per item: score, points, due, missing, submitted |
| `quanto_falta` | the same readings + `core.js` (`fromCanvas`, `requiredFor`) | per subject: earned, needed, label, as the panel (Canvas grades only; grades typed by hand in the extension are not seen, said in the reply) |
| `announcements` | `/api/v1/announcements` (10 newest) | date, course, title, unread; no author, no body |
| `modules` | `/api/v1/courses/:id/modules?include[]=items` | names, item titles, Canvas links |

Out: inbox and people (third-party data, a manipulation path), files content, quizzes, any write. Every Canvas-written
string goes inside `untrusted_canvas_text`, control characters stripped, each ≤ 500 chars, reply ≤ 48 KB, so the AI
treats teacher/student text as data, not instructions.

## Policy risk (Enzo's decision: ship to every student)

- [API Policy](https://www.instructure.com/policies/api-policy) §3(i) forbids accessing the APIs "using model context
  protocol servers or other technologies not approved by Instructure". An MCP server is what it names: the risk is
  **direct**. Enzo chose (2026-11-09) not to wait for PUCPR's TI. What could happen: Instructure or PUCPR asks to stop,
  blocks tokens for students, or the store removes Caderno+ if the MCP is promoted through it.
- Mitigations: the MCP is a separate download (GitHub release + `npx`), not inside the store extension, so the
  extension's store listing does not depend on it; the extension only links to a setup page; read-only; one student's
  own data with their own token; a README that says it is unofficial and how to revoke the token.

## Check (end to end)

1. `./scripts/verify` exits 0 with `tests/mcp-test.js`:
   - allowlist: each tool builds only its GET paths; non-digit id, other host, `..`, query injection → throws before
     `fetch`; no method other than GET anywhere in `mcp/` (grep test).
   - token: never in any tool reply, error, or log line (a fake token string is searched in all outputs); missing item
     → "rode `node mcp/cli.js login`".
   - `quanto_falta` gives the same labels as the panel for the golden fixture (`tests/` cc-manha readings).
   - `untrusted_canvas_text` on every Canvas string; caps hold.
2. Canary on Enzo's Mac: `login` (token typed into `security`'s prompt), `claude mcp add caderno -- node
   ~/Projects/notas-pucpr/mcp/server.js`, ask "quanto falta em ABD?" and "o que vence esta semana?"; the numbers match
   the panel; `logout` makes the tools say "sem token".
3. Undo: `logout`, revoke the token in Canvas, `claude mcp remove caderno`.

## Ship

Own branch and PR (not PR #48). Project Partner (scope) → Dev (implementation + `scripts/verify`) → approvals from Code
Review Partner and Application Security Reviewer (it holds a credential) before merge. Store or site: Enzo, after PUCPR's
answer.

## Files

New: `mcp/server.js` (stdio JSON-RPC + tools), `mcp/cli.js` (login, logout, status, setup hints), `mcp/vault.js` (the
three OS stores + token file), `mcp/canvas.js` (allowlisted GETs), `mcp/package.json` (bin `caderno-mcp`, no
dependencies), `mcp/manifest.json` (`.mcpb`), `tests/mcp-test.js`, `mcp/README.md` (setup in Portuguese). Later: a
"Conectar sua IA" link in the popup to the setup page; before it ships, `privacidade.html` gets a section "Caderno+ MCP
(opcional, separado)": the AI provider receives the replies, the token's full power, how to revoke.
Changed: `scripts/verify` (runs the new test), `bridge/SPEC.md` (phase B points here), `README.md`.
