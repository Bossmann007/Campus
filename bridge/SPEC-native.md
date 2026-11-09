# Caderno+ 4.1: native bridge between the extension and the MCP

Status: draft, 2026-11-09. Decisions by Enzo in this session; the end-to-end check below is the definition of done.

## Goal

The AI asks the extension directly instead of reading `caderno-agente.json`: fresh data, actions the student allows,
and a connection status in the Sua IA page. The file stays as the fallback.

## Decisions

- **Actions:** the AI may do everything the student can do in Caderno+, each one behind a "Permitir?" prompt in the
  extension. Grave actions are off by default and turned on one by one in Sua IA: `send_message` (Canvas inbox) and
  `submit_assignment` (text or URL entry first; no file upload in 4.1). Even when on, every grave action shows its
  full content (recipient or assignment, text) before it runs. A submission cannot be undone by the student.
- **Background reading:** when the AI asks and the reading is older than 10 minutes, the service worker reads Canvas
  itself, at most once every 10 minutes, 3 requests at a time. Not logged in: answer with the last reading and say so.
- **Fact checked by running code:** an extension service worker's `fetch` to `pucpr.instructure.com` carries every
  session cookie (HttpOnly, SameSite Strict/Lax/None) with no Canvas tab open: Chrome for Testing 156 and Brave 157,
  mock Canvas (`/tmp/swck/drive.js`, 2026-11-09). Not checked on the real Canvas.

## Architecture

```
AI app ──stdio──> caderno-mcp (server.js) ──local socket──> caderno-mcp host <──native messaging── extension SW
```

- Chrome starts the host (`connectNative`) and keeps it while the port lives
  (https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging). The MCP is started by the AI app,
  so the two meet on a local socket: `~/Library/Application Support/caderno-plus/bridge.sock` (dir 0700), the
  matching per-user path on Linux, a named pipe with a current-user ACL on Windows.
- Any program of the same user can reach the socket (same exposure as the file today). Write actions still need the
  click in the extension, so a local program cannot act silently through the bridge.
- `caderno-mcp setup --ext <id>` writes the host manifest with `allowed_origins` = that exact id (no wildcards
  allowed) for Chrome; the Sua IA page shows the command with `chrome.runtime.id` filled in.
- Messages: JSON, host → extension at most 1 MB (Chrome's limit); replies keep the MCP's 48 KB cap.

## Tools added to the MCP (bridge only)

Read: the nine current tools answered live. Write (each confirmed in the extension): `add_check`, `tick_check`,
`add_task`, `mark_done`, `set_meta`. Grave (off by default): `send_message`, `submit_assignment`.

## Confirmation

A small extension window (`chrome.windows.create`, type popup) with the request, the app that asked (client name
from the MCP `initialize`), and Permitir / Negar; nothing runs on timeout (60 s). Log of the last 20 actions in Sua IA.

## Files

`mcp/host.js` (native host + socket server), `mcp/bridge.js` (MCP side client), `mcp/server.js` (bridge first, file
next, token last), `mcp/cli.js` (`setup --ext`), `extension/background.js` (port, handlers, background reading),
`extension/confirm.html|js`, `extension/ai.html|js` (status, grave toggles, log), `manifest.json` (`nativeMessaging`
permission), tests, README, privacy text.

## Out of scope (4.1)

File upload in submissions, Edge/Brave host paths (not in Chrome's docs: verify first), sending to anyone outside
the student's courses, any action without the click.

## End-to-end check

`./scripts/verify` exit 0 with a new test group that runs the real `host.js` and `server.js` processes against a
stand-in service worker: a read tool answers through the socket; `add_check` waits for the confirmation, runs on
Permitir and does nothing on Negar or timeout; `send_message` is refused while its toggle is off; the host refuses
an origin not in `allowed_origins`. Then one manual canary in an isolated Brave with the mock Canvas.

## Open before implementing

- Does an open `connectNative` port keep the MV3 service worker alive? Not verified: canary first.
- Brave and Edge native host manifest paths: not verified.
