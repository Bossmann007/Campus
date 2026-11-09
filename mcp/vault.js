// The student's Canvas token in their own system's vault. It is typed into the vault tool's own prompt (login), so it never
// passes on a command line, in shell history, in an env var or a config file; the server reads it once into memory.
//   macOS    Keychain, service caderno-plus-canvas, account pucpr.instructure.com (security)
//   Windows  DPAPI (CurrentUser) file %APPDATA%\caderno-plus\canvas.dpapi (PowerShell): readable only by this Windows user
//   Linux    Secret Service (GNOME Keyring, KWallet) via secret-tool
// Also read (never written): CANVAS_TOKEN_FILE, a file a vault hands over (OpenBot's Vault), and CADERNO_MCPB_TOKEN, set
// by Claude Desktop from the .mcpb bundle's sensitive field (Claude Desktop keeps it in the system store).
"use strict";
const { execFile, spawn } = require("child_process"), fs = require("fs"), path = require("path");

const SERVICE = "caderno-plus-canvas", ACCOUNT = "pucpr.instructure.com";
// absolute paths: a program of the same name in the current folder (a cloned repo) is never run instead
const PS = (process.env.SystemRoot || "C:\\Windows") + "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", SEC = "/usr/bin/security";
// Linux: secret-tool by absolute path. The usual place first; else the first one in an absolute PATH folder that is not
// the current one (with a warning on stderr, never stdout: stdout is the MCP channel); none: null, and the store refuses.
const SECRET_TOOL = "/usr/bin/secret-tool";
function findSecretTool({ exists = p => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch (e) { return false; } }, env = process.env, cwd = process.cwd(), warn = m => process.stderr.write(m + "\n") } = {}) {
  if (exists(SECRET_TOOL)) return SECRET_TOOL;
  const here = path.resolve(cwd);
  for (const dir of String(env.PATH || "").split(path.delimiter)) {
    if (!path.isAbsolute(dir) || path.resolve(dir) === here) continue;   // relative entries and "." could be a cloned repo
    const p = path.join(dir, "secret-tool");
    if (exists(p)) { warn("caderno-mcp: secret-tool fora de " + SECRET_TOOL + "; usando " + p); return p; }
  }
  return null;
}
// Each store: the program and arguments for read (prints the token), write (prompts the student itself) and delete.
function commands(platform, find = findSecretTool) {
  if (platform === "darwin") return {
    read: [SEC, ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]],
    write: [SEC, ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-l", "Caderno+ · token do Canvas", "-w"]],   // -w last: security asks for the value
    remove: [SEC, ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT]] };
  if (platform === "win32") return {
    read: [PS, ["-NoProfile", "-NonInteractive", "-Command", "$s = (Get-Content -Raw (Join-Path $env:APPDATA 'caderno-plus\\canvas.dpapi')).Trim() | ConvertTo-SecureString; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"]],
    write: [PS, ["-NoProfile", "-Command", "$s = Read-Host -AsSecureString 'Cole o token do Canvas'; $d = Join-Path $env:APPDATA 'caderno-plus'; New-Item -Force -ItemType Directory $d | Out-Null; $s | ConvertFrom-SecureString | Set-Content -Path (Join-Path $d 'canvas.dpapi')"]],
    remove: [PS, ["-NoProfile", "-NonInteractive", "-Command", "Remove-Item -ErrorAction Stop (Join-Path $env:APPDATA 'caderno-plus\\canvas.dpapi')"]] };
  const st = find();
  if (!st) return null;   // no secret-tool: install libsecret-tools (Debian/Ubuntu) or libsecret (Fedora, Arch)
  return {
    read: [st, ["lookup", "service", SERVICE, "host", ACCOUNT]],
    write: [st, ["store", "--label=Caderno+ · token do Canvas", "service", SERVICE, "host", ACCOUNT]],   // asks "Password:" itself
    remove: [st, ["clear", "service", SERVICE, "host", ACCOUNT]] };
}
const runOut = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 60000, windowsHide: true }, (err, out) => res(err ? null : String(out))));
const runTty = (cmd, args) => new Promise(res => { const p = spawn(cmd, args, { stdio: "inherit" }); p.on("error", () => res(false)); p.on("exit", c => res(c === 0)); });
const tidy = s => typeof s === "string" ? s.replace(/[\r\n]+$/, "").trim() : "";
const looks = s => /^[\x21-\x7e]{20,200}$/.test(s);   // Canvas tokens: printable ASCII, no spaces

const NO_STORE = "Secret Service sem secret-tool: instale libsecret-tools (Debian/Ubuntu) ou libsecret (Fedora, Arch)";
async function readToken({ env = process.env, platform = process.platform, run = runOut, readFile = fs.readFileSync, find } = {}) {
  if (env.CANVAS_TOKEN_FILE) { try { const t = tidy(readFile(env.CANVAS_TOKEN_FILE, "utf8")); if (looks(t)) return { token: t, from: "arquivo do cofre" }; } catch (e) {} return { token: null, from: "arquivo do cofre" }; }
  if (env.CADERNO_MCPB_TOKEN) { const t = tidy(env.CADERNO_MCPB_TOKEN); delete env.CADERNO_MCPB_TOKEN; return { token: looks(t) ? t : null, from: "Claude Desktop" }; }   // out of the env at once: no child inherits it
  const cmds = commands(platform, find);
  if (!cmds) return { token: null, from: NO_STORE };
  const [cmd, args] = cmds.read, t = tidy(await run(cmd, args));
  return { token: looks(t) ? t : null, from: platform === "darwin" ? "Keychain" : platform === "win32" ? "DPAPI" : "Secret Service" };
}
const writeToken = async ({ platform = process.platform, run = runTty, find } = {}) => { const c = commands(platform, find); return c ? run(...c.write) : false; };
const removeToken = async ({ platform = process.platform, run = runOut, find } = {}) => { const c = commands(platform, find); return c ? run(...c.remove).then(o => o !== null) : false; };

module.exports = { SERVICE, ACCOUNT, SECRET_TOOL, findSecretTool, commands, readToken, writeToken, removeToken, looks };
