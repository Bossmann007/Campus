#!/usr/bin/env node
// caderno-mcp            the MCP server (what the AI app starts)
// caderno-mcp login      save your Canvas token in your system's vault (typed into the vault's own prompt)
// caderno-mcp status     is a token saved, and does Canvas accept it (never shows it)
// caderno-mcp logout     delete it from the vault
// caderno-mcp setup      how to add it to Claude Code or Claude Desktop
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
  if (cmd === "setup") {
    say("Claude Code:\n  claude mcp add caderno --scope user -- node \"" + SERVER + "\"\n");
    say("Claude Desktop (claude_desktop_config.json → mcpServers):\n  \"caderno\": { \"command\": \"node\", \"args\": [\"" + SERVER.replace(/\\/g, "\\\\") + "\"] }\n");
    say("OpenBot: salve o token no Vault como CANVAS_API_TOKEN e inicie o servidor com CANVAS_TOKEN_FILE=<caminho que o OpenBot dá>.");
    say("Depois pergunte: \"quanto falta em cada matéria?\" ou \"o que vence esta semana?\"");
    return;
  }
  if (cmd && cmd !== "serve") { say("Comandos: login, status, logout, setup (sem comando: o servidor MCP)"); process.exitCode = 2; return; }
  require("./server.js").main();
}
if (require.main === module) cli(process.argv[2]);
module.exports = { cli };
