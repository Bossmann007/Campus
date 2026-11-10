// Ponte: the MCP reads Canvas through the Caderno+ extension, with the browser's login, no token (bridge/SPEC-ponte.md).
//   browser --native messaging (stdin/stdout, 32-bit length + JSON)--> host (this file, run by the browser)
//   host <--local socket (one JSON per line)--> client (the MCP server started by the AI app)
// The socket lives in a folder only this user can open. Requests are relayed as they are: the extension checks them.
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), net = require("net");

const HOST_NAME = "br.caderno_plus.mcp";
const DIR = (home = os.homedir()) => path.join(home, ".caderno-mcp");
// Windows: a named pipe whose name carries a random secret kept in the user's own folder (another account on the same
// machine cannot guess it and sit on it first); macOS, Linux: a socket in a 0700 folder.
function socketPath(platform = process.platform, home = os.homedir(), user = safeUser(), create = false) {
  if (platform !== "win32") return path.join(DIR(home), "ponte.sock");
  const f = path.join(DIR(home), "pipe"); let secret = "";
  try { secret = fs.readFileSync(f, "utf8").trim(); } catch (e) { /* none yet */ }
  if (!/^[a-f0-9]{32}$/.test(secret) && create) { secret = require("crypto").randomBytes(16).toString("hex"); fs.mkdirSync(DIR(home), { recursive: true, mode: 0o700 }); fs.writeFileSync(f, secret, { mode: 0o600 }); }
  return "\\\\.\\pipe\\caderno-mcp-" + user + "-" + (secret || "none");
}
function safeUser() { try { return String(os.userInfo().username).replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 60) || "user"; } catch (e) { return "user"; } }

// Native messaging framing: each message is a 32-bit length in native byte order (little-endian on x86 and ARM) + UTF-8 JSON.
function frame(obj) { const b = Buffer.from(JSON.stringify(obj), "utf8"), h = Buffer.alloc(4); h.writeUInt32LE(b.length, 0); return Buffer.concat([h, b]); }
function unframer(onMessage, max = 64 * 1024 * 1024, onBad = () => {}) {
  let buf = Buffer.alloc(0), dead = false;
  return chunk => {
    if (dead) return;
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 4) {
      const n = buf.readUInt32LE(0);
      if (n > max) { dead = true; buf = Buffer.alloc(0); onBad(); return; }   // out of step for good: stop rather than misread
      if (buf.length < 4 + n) return;
      const body = buf.subarray(4, 4 + n); buf = buf.subarray(4 + n);
      let msg; try { msg = JSON.parse(body.toString("utf8")); } catch (e) { continue; }
      onMessage(msg);
    }
  };
}
const lines = (onLine, max = 1 << 20) => { let s = ""; return chunk => { s += chunk; if (s.length > max && s.indexOf("\n") < 0) { s = ""; return; } let i; while ((i = s.indexOf("\n")) >= 0) { const l = s.slice(0, i); s = s.slice(i + 1); if (l.trim()) { try { onLine(JSON.parse(l)); } catch (e) { /* not JSON */ } } } }; };

// The host: started by the browser when the extension connects; lives as long as that port. The last host started owns the
// socket (another browser or profile connecting later takes it over).
function host({ input = process.stdin, output = process.stdout, sock, platform = process.platform, exit = code => process.exit(code) } = {}) {
  sock = sock || socketPath(platform, os.homedir(), safeUser(), true);
  const waiting = new Map(); let seq = 0, mine = null;   // mine: the socket file this host made (another host may replace it)
  if (platform !== "win32") { fs.mkdirSync(path.dirname(sock), { recursive: true, mode: 0o700 }); try { fs.chmodSync(path.dirname(sock), 0o700); } catch (e) { /* not ours */ } try { fs.unlinkSync(sock); } catch (e) { /* none */ } }
  const server = net.createServer(c => {
    c.setEncoding("utf8");
    c.on("data", lines(req => {
      if (!req || typeof req !== "object" || req.id == null) return;
      const hid = ++seq; waiting.set(hid, { c, id: req.id });
      output.write(frame(Object.assign({}, req, { id: hid })));
    }));
    c.on("error", () => {});
    c.on("close", () => { for (const [k, w] of waiting) if (w.c === c) waiting.delete(k); });
  });
  let stopped = false;
  // closing a Unix socket server removes its file, so a host whose socket a newer host has taken over only lets go
  // (inode numbers are reused: ownership is a mark of our own next to the socket)
  const stop = () => { if (stopped) return; stopped = true;
    let ours = platform === "win32"; try { ours = ours || (!!mine && fs.readFileSync(sock + ".owner", "utf8") === mine); } catch (e) { /* no mark */ }
    if (ours) { server.close(); if (platform !== "win32") { try { fs.unlinkSync(sock + ".owner"); } catch (e) { /* gone */ } } } else server.unref();
    exit(0); };
  input.on("data", unframer(msg => {
    const w = msg && waiting.get(msg.id); if (!w) return;
    waiting.delete(msg.id);
    if (!w.c.destroyed) w.c.write(JSON.stringify(Object.assign({}, msg, { id: w.id })) + "\n");
  }, undefined, stop));
  input.on("end", stop); input.on("close", stop);
  server.listen(sock, () => { if (platform !== "win32") { try { fs.chmodSync(sock, 0o600); const m = process.pid + "-" + require("crypto").randomBytes(8).toString("hex"); fs.writeFileSync(sock + ".owner", m, { mode: 0o600 }); mine = m; } catch (e) { /* best effort */ } } });
  server.on("error", e => { process.stderr.write("caderno-mcp ponte: " + e.message + "\n"); exit(1); });
  return server;
}

// The client, in the MCP server: one connection, opened when needed, requests matched by id, 25 s each.
function client({ sock, timeout = 25000, connect = p => net.createConnection(p), pingMs = 2000, memo = 30000 } = {}) {
  let conn = null, opening = null, seq = 0, seen = null; const waiting = new Map();
  const where = () => sock || socketPath();   // Windows: the pipe name is read when needed (the host may have made it since)
  const open = () => opening || (opening = new Promise(resolve => {
    const c = connect(where()); let done = false;
    const fail = () => { if (!done) { done = true; resolve(null); } if (conn !== c && conn) return; conn = null; opening = null; seen = null;
      for (const [, w] of waiting) w.reject(new Error("a ponte fechou (o navegador foi fechado?)")); waiting.clear(); };
    c.setEncoding("utf8");
    c.on("connect", () => { done = true; conn = c; resolve(c); });
    c.on("data", lines(msg => { const w = msg && waiting.get(msg.id); if (w) { waiting.delete(msg.id); clearTimeout(w.t); w.resolve(msg); } }, 12 << 20));   // replies carry Canvas pages (5 MB at most, as JSON text)
    c.on("error", fail); c.on("close", fail);
    setTimeout(() => { if (!done) { done = true; c.destroy(); resolve(null); } }, 1500);
  }).then(c => { opening = null; return c; }));
  const ask = async (req, ms = timeout) => {
    const c = conn || await open(); if (!c) throw new Error("a ponte não está ligada: abra o navegador com o Caderno+");
    const id = ++seq;
    return new Promise((resolve, reject) => { const t = setTimeout(() => { waiting.delete(id); reject(new Error("o navegador não respondeu a tempo")); }, ms); waiting.set(id, { resolve, reject, t }); c.write(JSON.stringify(Object.assign({ id }, req)) + "\n"); });
  };
  return {
    // is the extension answering? 2 s at most, and a "yes" is kept 30 s (no ping in front of every tool call)
    async up() { if (seen && conn && Date.now() - seen < memo) return true; try { const r = await ask({ op: "ping" }, pingMs); seen = r && r.ok ? Date.now() : null; return !!seen; } catch (e) { seen = null; return false; } },
    async get(url) { const r = await ask({ op: "get", url }); if (r.error) throw new Error(String(r.error).slice(0, 200)); return r; },
    async rules() { const r = await ask({ op: "rules" }); if (r.error) throw new Error(String(r.error).slice(0, 200)); return { user: r && r.user != null ? r.user : null, rules: r && r.rules && typeof r.rules === "object" ? r.rules : {} }; },
    async centro(course) { const r = await ask({ op: "centro", course: String(course) }); if (r.error) throw new Error(String(r.error).slice(0, 200)); return r.curso || null; },
    close() { if (conn) conn.destroy(); },
  };
}

// Where each browser looks for native messaging hosts, per user (Chrome documents its own; the others follow its layout).
function hostDirs(platform = process.platform, home = os.homedir()) {
  if (platform === "darwin") { const a = path.join(home, "Library", "Application Support"); return [["Chrome", path.join(a, "Google", "Chrome")], ["Brave", path.join(a, "BraveSoftware", "Brave-Browser")], ["Edge", path.join(a, "Microsoft Edge")], ["Chromium", path.join(a, "Chromium")]]; }
  if (platform === "linux") { const c = path.join(home, ".config"); return [["Chrome", path.join(c, "google-chrome")], ["Brave", path.join(c, "BraveSoftware", "Brave-Browser")], ["Edge", path.join(c, "microsoft-edge")], ["Chromium", path.join(c, "chromium")]]; }
  return [];
}
const WIN_KEYS = [["Chrome", "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\" + HOST_NAME], ["Brave", "HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\" + HOST_NAME], ["Edge", "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\" + HOST_NAME]];
const validId = id => typeof id === "string" && /^[a-p]{32}$/.test(id);   // Chrome extension ids: 32 letters a-p

// Install: the launcher (the same Node, this folder's host.js) and the host manifest for every browser found.
// run(cmd, args) is used only on Windows (reg add); returns where it wrote.
// Safe to run on every start (Claude Desktop's bundle does): files are rewritten only when what they should say changed
// (a new Node after an app update, the bundle moved, another extension id).
// probe(node): can this binary run as plain Node with ELECTRON_RUN_AS_NODE (Claude Desktop's own runtime)?
const probeElectron = node => { try { return require("child_process").spawnSync(node, ["-e", "process.stdout.write('ok')"], { env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: "1" }), timeout: 8000 }).stdout.toString() === "ok"; } catch (e) { return false; } };
function install(extId, { platform = process.platform, home = os.homedir(), node = process.execPath, here = __dirname, fsx = fs, run, probe = probeElectron } = {}) {
  if (!validId(extId)) throw new Error("id da extensão inválido: copie da página Sua IA do Caderno+ (32 letras de a a p)");
  const dir = DIR(home), win = platform === "win32";
  if (win && !run) throw new Error("sem como gravar o registro do Windows");
  fsx.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const launcher = path.join(dir, win ? "ponte.bat" : "ponte.sh"), hostJs = path.join(here, "host.js");
  // Claude Desktop runs its own Node inside the app: ELECTRON_RUN_AS_NODE makes that binary behave as plain node
  const electron = !/^node(js)?(\.exe)?$/i.test((win ? path.win32 : path.posix).basename(node));
  if (electron && !probe(node)) throw new Error("este app não roda a ponte com o Node dele: instale o Node.js e rode caderno-mcp ponte <id> no terminal");
  if (win && /[%"]/.test(node + hostJs)) throw new Error("caminho com % ou aspas: instale o Node.js e o Caderno+ MCP numa pasta comum");
  const want = (f, text, mode) => { let cur = null; try { cur = fsx.readFileSync(f, "utf8"); } catch (e) { /* none */ } if (cur !== text) fsx.writeFileSync(f, text, mode ? { mode } : undefined); return cur !== text; };
  want(launcher, win ? "@echo off\r\n" + (electron ? "set ELECTRON_RUN_AS_NODE=1\r\n" : "") + "\"" + node + "\" \"" + hostJs + "\" %*\r\n"
    : "#!/bin/sh\n" + (electron ? "ELECTRON_RUN_AS_NODE=1 " : "") + "exec '" + node.replace(/'/g, "'\\''") + "' '" + hostJs.replace(/'/g, "'\\''") + "' \"$@\"\n", 0o700);
  const manifest = JSON.stringify({ name: HOST_NAME, description: "Caderno+ MCP: a ponte entre a sua IA e a extensão Caderno+", path: launcher, type: "stdio", allowed_origins: ["chrome-extension://" + extId + "/"] }, null, 2);
  const wrote = [];
  if (win) {
    const mf = path.join(dir, HOST_NAME + ".json"); want(mf, manifest);
    for (const [name, key] of WIN_KEYS) { if (run("reg", ["add", key, "/ve", "/t", "REG_SZ", "/d", mf, "/f"])) wrote.push(name + ": " + key); }
    return wrote;   // empty when no key could be written: the caller says so
  }
  for (const [name, base] of hostDirs(platform, home)) {
    if (!fsx.existsSync(base)) continue;   // that browser is not installed for this user
    const d = path.join(base, "NativeMessagingHosts"); fsx.mkdirSync(d, { recursive: true });
    const f = path.join(d, HOST_NAME + ".json"); want(f, manifest); wrote.push(name + ": " + f);
  }
  return wrote;
}
function remove({ platform = process.platform, home = os.homedir(), fsx = fs, run } = {}) {
  const gone = [], rm = f => { try { fsx.unlinkSync(f); gone.push(f); } catch (e) { /* not there */ } };
  if (platform === "win32") { for (const [, key] of WIN_KEYS) if (run) run("reg", ["delete", key, "/f"]); rm(path.join(DIR(home), HOST_NAME + ".json")); rm(path.join(DIR(home), "ponte.bat")); return gone; }
  for (const [, base] of hostDirs(platform, home)) rm(path.join(base, "NativeMessagingHosts", HOST_NAME + ".json"));
  rm(path.join(DIR(home), "ponte.sh"));
  return gone;
}
function installed({ platform = process.platform, home = os.homedir(), fsx = fs, run } = {}) {
  if (platform === "win32") return fsx.existsSync(path.join(DIR(home), HOST_NAME + ".json")) && (!run || WIN_KEYS.some(([, key]) => run("reg", ["query", key, "/ve"])));
  return hostDirs(platform, home).some(([, base]) => fsx.existsSync(path.join(base, "NativeMessagingHosts", HOST_NAME + ".json")));
}

module.exports = { HOST_NAME, socketPath, frame, unframer, host, client, install, remove, installed, hostDirs, validId };
