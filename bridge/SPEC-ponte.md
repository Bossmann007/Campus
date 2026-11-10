# Ponte: the MCP reads Canvas through the extension, without a token

Status: building, 2026-11-10. Decided by Enzo: no token for other students (Canvas docs: an app used by many people must
not ask each one to paste a manual token), no server, the extension's login session is the access.

## Shape

```
AI app ──stdio──> caderno-mcp server ──local socket──> caderno-mcp host ──native messaging──> extension service worker ──> Canvas
                  (started by the AI app)              (started by the browser)                (the student's login)
```

- The host is `mcp/host.js`, started by the browser through a native messaging host manifest
  (`br.caderno_plus.mcp`) whose `allowed_origins` is the student's own extension id. It relays framed JSON between the
  browser (stdin/stdout, 32-bit length + UTF-8 JSON) and a local socket: `~/.caderno-mcp/ponte.sock` in a 0700 folder
  (macOS, Linux) or the pipe `\\.\pipe\caderno-mcp-<user>` (Windows). It exits when the browser closes the port.
- The extension connects only when the student turned the ponte on (optional permission `nativeMessaging`, asked from
  the Sua IA page) and again on browser start. While connected, the service worker stays alive (Chrome 105+).
- Requests: `{ id, op: "get", url }` (GET, the same path allowlist as the MCP, checked again in the extension, sent with
  the browser's cookies) and `{ id, op: "centro", course }` (the existing Centro de Notas reader). Replies
  `{ id, ok, status, link, body }` or `{ id, error }`. Bodies over 5 MB are refused.
- The server prefers the ponte when the socket answers, else the token from the vault (personal use), else a message
  telling the student to open the browser or turn the ponte on.

## Install

`caderno-mcp ponte <extension id>` writes the host manifest for every browser found (Chrome, Brave, Edge, Chromium:
folders on macOS and Linux, HKCU registry keys on Windows) and a small launcher next to it that runs `host.js` with the
same Node. `caderno-mcp ponte remove` undoes it. The Sua IA page shows the command with the id filled in. The `.mcpb`
asks for the extension id instead of a token and installs the host on start.

## Limits

- The browser must be open with the extension. Several browsers or profiles: the last one connected answers (a host
  removes the socket on exit only if it is still its own). Windows: the pipe name carries a random secret from the
  user's folder, so another account cannot take the name first.
- Any program running as the same user can use the socket, as it could the vault: same threat model.
- API policy 3(i) (unapproved MCP servers) still applies; only Instructure can lift it.

## End-to-end check

`scripts/verify` with: host framing and relay tests, the extension's bridge handler (allowlist, GET only, size cap),
the server choosing ponte / token / error. Then the real thing: Brave with the built extension, the host installed for
Brave, the MCP's tools answered from the real Canvas with no token anywhere.
