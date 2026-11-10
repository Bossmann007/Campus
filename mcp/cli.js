#!/usr/bin/env node
// caderno-mcp            the MCP server (what the AI app starts)
// caderno-mcp login      save your Canvas token in your system's vault (typed into the vault's own prompt)
// caderno-mcp status     is a token saved, and does Canvas accept it (never shows it)
// caderno-mcp logout     delete it from the vault
// caderno-mcp setup [app] how to add it to each AI app (claude-code, codex, gemini, cursor, vscode, zed, ...)
// caderno-mcp ponte <id>  connect to the Caderno+ extension (no token): registers the native host for each browser found
// caderno-mcp ponte remove
"use strict";
const path = require("path"), vault = require("./vault");
const say = s => process.stdout.write(s + "\n");
const SERVER = path.join(__dirname, "server.js");

async function check() {
  const { token, from } = await vault.readToken();
  if (!token) { say("Sem token salvo (" + from + "). Rode: caderno-mcp login"); return false; }
  try { const r = await require("./canvas").makeCanvas(token).whoami(); say(r.ok ? "Token salvo (" + from + ") e aceito pelo Canvas da PUCPR." : "Token salvo, mas o Canvas não respondeu como esperado."); return r.ok; }
  catch (e) { say("Token salvo (" + from + "), mas o Canvas recusou: " + String(e && e.message || e).split(token).join("[token]")); return false; }
}
// How each AI app starts this server (printed, never written into the app's files). node by absolute path: apps opened
// from the Dock often have no PATH to a node installed by nvm or Homebrew.
// The PATH entry for this same node when there is one (/opt/homebrew/bin/node, not the Cellar folder an upgrade removes).
function stableNode(exec = process.execPath, env = process.env, fsx = require("fs")) {
  const real = p => { try { return fsx.realpathSync(p); } catch (e) { return null; } }, me = real(exec);
  for (const dir of String(env.PATH || "").split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    const p = path.join(dir, process.platform === "win32" ? "node.exe" : "node");
    if (p !== exec && me && real(p) === me) return p;
  }
  return exec;
}
const NODE = stableNode(), J = x => JSON.stringify(x, null, 2);
const ENTRY = { command: NODE, args: [SERVER] };
// Quoted for the student's shell: POSIX single quotes (an apostrophe as '\''); Windows double quotes by the rules Windows
// programs use to split a command line (CommandLineToArgvW): an inner " as \", the backslashes right before a quote,
// or at the very end, doubled. Other backslashes (C:\Users\...) stay as they are.
const winQuote = x => "\"" + String(x).replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/, "$1$1") + "\"";
const q = (x, win = process.platform === "win32") => win ? winQuote(x) : "'" + String(x).replace(/'/g, "'\\''") + "'";
const RUN = () => q(NODE) + " " + q(SERVER);
const APPS = {
  "claude-code": ["Claude Code", () => "claude mcp add caderno --scope user -- " + RUN()],
  "claude-desktop": ["Claude Desktop", () => "Mais fácil: abra o arquivo caderno-mcp-<versão>.mcpb. Ou em claude_desktop_config.json (Configurações → Desenvolvedor → Editar config), dentro de \"mcpServers\":\n" + J({ caderno: ENTRY })],
  codex: ["Codex (CLI, IDE e o ChatGPT desktop, que leem ~/.codex/config.toml)", () => "codex mcp add caderno -- " + RUN()],
  gemini: ["Gemini CLI", () => "gemini mcp add --scope user caderno " + RUN()],
  cursor: ["Cursor", () => "~/.cursor/mcp.json, dentro de \"mcpServers\":\n" + J({ caderno: Object.assign({ type: "stdio" }, ENTRY) })],
  vscode: ["VS Code (Copilot)", () => "code --add-mcp " + q(JSON.stringify(Object.assign({ name: "caderno", type: "stdio" }, ENTRY)))],
  continue: ["Continue (modo agente)", () => ".continue/mcpServers/caderno.yaml:\nname: Caderno+\nversion: 0.0.1\nschema: v1\nmcpServers:\n  - name: caderno\n    type: stdio\n    command: " + JSON.stringify(NODE) + "\n    args: [" + JSON.stringify(SERVER) + "]"],
  windsurf: ["Windsurf, JetBrains AI, LM Studio, Cline, Roo, Perplexity (Mac) e outros com \"mcpServers\"", () => J({ mcpServers: { caderno: ENTRY } })],
  zed: ["Zed", () => "settings.json (zed: open settings file), dentro de \"context_servers\":\n" + J({ caderno: Object.assign({ source: "custom" }, ENTRY) })],
  goose: ["Goose", () => "~/.config/goose/config.yaml:\nextensions:\n  caderno:\n    name: caderno\n    description: Canvas PUCPR (Caderno+)\n    type: stdio\n    cmd: " + JSON.stringify(NODE) + "\n    args: [" + JSON.stringify(SERVER) + "]\n    enabled: true\n    timeout: 300"],
  openbot: ["OpenBot", () => "Salve o token no Vault como CANVAS_API_TOKEN e rode: CANVAS_TOKEN_FILE=<o caminho que o OpenBot dá> " + RUN()],
};
const WEB = "Só pela web (ChatGPT web, Claude web, Le Chat, Grok, Gemini): esses apps só falam com servidores na internet, e este fica no seu computador de propósito (o token não sai dele). No ChatGPT, use o desktop (via Codex) ou o Secure MCP Tunnel oficial da OpenAI, que roda este servidor na sua máquina.";
function setup(app) {
  if (app && APPS[app]) return APPS[app][0] + ":\n" + APPS[app][1]();
  if (app) return "App desconhecido. Use um destes: " + Object.keys(APPS).join(", ");
  return Object.values(APPS).map(([name, f]) => "## " + name + "\n" + f()).join("\n\n") + "\n\n" + WEB + "\n\nDepois pergunte: \"quanto falta em cada matéria?\" ou \"o que vence esta semana?\"";
}
async function cli(cmd) {
  if (cmd === "login") {
    say("1. No Canvas: Conta → Configurações → \"+ Novo token de acesso\". Finalidade: Caderno+ MCP. Expira: fim do semestre.");
    say("2. Copie o token e cole quando o cofre do sistema pedir (o texto não aparece enquanto você cola).\n");
    const ok = await vault.writeToken();
    if (!ok) { say(process.platform === "linux" ? "Não deu para salvar. Instale o secret-tool (pacote libsecret-tools) e tente de novo." : "Não deu para salvar no cofre."); process.exitCode = 1; return; }
    say(""); process.exitCode = (await check()) ? 0 : 1; return;
  }
  if (cmd === "logout") { say((await vault.removeToken()) ? "Token apagado do cofre. Revogue-o também no Canvas (Conta → Configurações)." : "Nenhum token para apagar."); return; }
  if (cmd === "status") { process.exitCode = (await check()) ? 0 : 1; return; }
  if (cmd === "setup") { say(setup(process.argv[3])); return; }
  if (cmd === "ponte") {
    const ponte = require("./ponte"), arg = process.argv[3], run = (c, a) => require("child_process").spawnSync(c, a, { stdio: "ignore" }).status === 0;
    if (arg === "remove") { const g = ponte.remove({ run }); say(g.length ? "Ponte removida:\n" + g.join("\n") : "Nada para remover."); return; }
    if (arg === "status" || !arg) {
      const c = ponte.client(), up = await c.up(); c.close();
      say(up ? "Ponte ligada: a extensão Caderno+ está respondendo (sem token)." : ponte.installed({ run }) ? "Ponte instalada, mas a extensão não respondeu: abra o navegador e ligue a ponte na página Sua IA do Caderno+." : "Ponte não instalada. Rode: caderno-mcp ponte <id> (o id aparece na página Sua IA do Caderno+).");
      process.exitCode = up ? 0 : 1; return;
    }
    let wrote; try { wrote = ponte.install(arg, { node: NODE, run }); } catch (e) { say(e.message); process.exitCode = 2; return; }
    if (!wrote.length) { say(process.platform === "win32" ? "Não deu para gravar o registro do Windows para nenhum navegador." : "Nenhum navegador compatível encontrado (Chrome, Brave, Edge, Chromium)."); process.exitCode = 1; return; }
    say("Ponte instalada para:\n" + wrote.join("\n") + "\n\nAgora, na página Sua IA do Caderno+, clique em \"Ligar a ponte\". Depois rode: caderno-mcp ponte status");
    return;
  }
  if (cmd && cmd !== "serve") { say("Comandos: ponte, login, status, logout, setup (sem comando: o servidor MCP)"); process.exitCode = 2; return; }
  require("./server.js").main();
}
if (require.main === module) cli(process.argv[2]);
module.exports = { cli, setup, APPS, stableNode, q };
