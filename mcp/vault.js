// The student's Canvas token in their own system's vault. It is typed into the vault tool's own prompt (login), so it never
// passes on a command line, in shell history, in an env var or a config file; the server reads it once into memory.
//   macOS    Keychain, service caderno-plus-canvas, account pucpr.instructure.com (security)
//   Windows  DPAPI (CurrentUser) file %APPDATA%\caderno-plus\canvas.dpapi (PowerShell): readable only by this Windows user
//   Linux    Secret Service (GNOME Keyring, KWallet) via secret-tool
// Also read (never written): CANVAS_TOKEN_FILE, a file a vault hands over (OpenBot's Vault), and CADERNO_MCPB_TOKEN, set
// by Claude Desktop from the .mcpb bundle's sensitive field (Claude Desktop keeps it in the system store).
"use strict";
const { execFile, spawn } = require("child_process"), fs = require("fs");

const SERVICE = "caderno-plus-canvas", ACCOUNT = "pucpr.instructure.com";
// Each store: the program and arguments for read (prints the token), write (prompts the student itself) and delete.
function commands(platform) {
  if (platform === "darwin") return {
    read: ["security", ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"]],
    write: ["security", ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-l", "Caderno+ · token do Canvas", "-w"]],   // -w last: security asks for the value
    remove: ["security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT]] };
  if (platform === "win32") return {
    read: ["powershell", ["-NoProfile", "-NonInteractive", "-Command", "$s = Get-Content -Raw (Join-Path $env:APPDATA 'caderno-plus\\canvas.dpapi') | ConvertTo-SecureString; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"]],
    write: ["powershell", ["-NoProfile", "-Command", "$s = Read-Host -AsSecureString 'Cole o token do Canvas'; $d = Join-Path $env:APPDATA 'caderno-plus'; New-Item -Force -ItemType Directory $d | Out-Null; $s | ConvertFrom-SecureString | Set-Content -Path (Join-Path $d 'canvas.dpapi')"]],
    remove: ["powershell", ["-NoProfile", "-NonInteractive", "-Command", "Remove-Item -ErrorAction Stop (Join-Path $env:APPDATA 'caderno-plus\\canvas.dpapi')"]] };
  return {
    read: ["secret-tool", ["lookup", "service", SERVICE, "host", ACCOUNT]],
    write: ["secret-tool", ["store", "--label=Caderno+ · token do Canvas", "service", SERVICE, "host", ACCOUNT]],   // asks "Password:" itself
    remove: ["secret-tool", ["clear", "service", SERVICE, "host", ACCOUNT]] };
}
const runOut = (cmd, args) => new Promise(res => execFile(cmd, args, { timeout: 60000, windowsHide: true }, (err, out) => res(err ? null : String(out))));
const runTty = (cmd, args) => new Promise(res => { const p = spawn(cmd, args, { stdio: "inherit" }); p.on("error", () => res(false)); p.on("exit", c => res(c === 0)); });
const tidy = s => typeof s === "string" ? s.replace(/[\r\n]+$/, "").trim() : "";
const looks = s => /^[\x21-\x7e]{20,200}$/.test(s);   // Canvas tokens: printable ASCII, no spaces

async function readToken({ env = process.env, platform = process.platform, run = runOut, readFile = fs.readFileSync } = {}) {
  if (env.CANVAS_TOKEN_FILE) { try { const t = tidy(readFile(env.CANVAS_TOKEN_FILE, "utf8")); if (looks(t)) return { token: t, from: "arquivo do cofre" }; } catch (e) {} return { token: null, from: "arquivo do cofre" }; }
  if (env.CADERNO_MCPB_TOKEN) { const t = tidy(env.CADERNO_MCPB_TOKEN); return { token: looks(t) ? t : null, from: "Claude Desktop" }; }
  const [cmd, args] = commands(platform).read, t = tidy(await run(cmd, args));
  return { token: looks(t) ? t : null, from: platform === "darwin" ? "Keychain" : platform === "win32" ? "DPAPI" : "Secret Service" };
}
const writeToken = ({ platform = process.platform, run = runTty } = {}) => { const [cmd, args] = commands(platform).write; return run(cmd, args); };
const removeToken = ({ platform = process.platform, run = runOut } = {}) => { const [cmd, args] = commands(platform).remove; return run(cmd, args).then(o => o !== null); };

module.exports = { SERVICE, ACCOUNT, commands, readToken, writeToken, removeToken, looks };
