// "Sua IA": install the Caderno+ MCP, turn the ponte on (the MCP asks this extension, which reads Canvas with the
// browser's login: no token, no server), and questions to copy.
const $ = id => document.getElementById(id);
const cmd = "caderno-mcp ponte " + chrome.runtime.id;
$("cmd").textContent = cmd;
$("copyCmd").addEventListener("click", async () => { try { await navigator.clipboard.writeText(cmd); $("copyCmd").textContent = "Copiado"; } catch (e) { $("copyCmd").textContent = "Selecione e copie"; } });
const state = r => {
  const st = $("ponteSt");
  $("ponteOff").hidden = !(r && r.on);
  if (r && r.on) { st.textContent = "Ponte ligada. Teste com: caderno-mcp ponte status"; st.className = "acts ponte-st on"; $("ponteOn").textContent = "Ligada"; return; }
  $("ponteOn").textContent = "Ligar a ponte";
  st.className = "acts ponte-st" + (r && r.error ? " off" : "");
  st.textContent = !r ? "" : /not found|não encontrado/i.test(r.error) ? "O navegador não achou a ponte: rode o comando acima no terminal e clique em Ligar de novo."
    : /forbidden|proibido/i.test(r.error) ? "A ponte foi instalada para outro id: rode o comando acima de novo (ele tem o id desta extensão)."
    : r.error ? "A ponte desligou (" + r.error + "). Clique em Ligar de novo." : "";
};
const ask = (on, off) => new Promise(res => chrome.runtime.sendMessage({ type: "ponte", on, off: !!off }, r => res(chrome.runtime.lastError ? null : r)));
$("ponteOn").addEventListener("click", async () => {
  let ok = false; try { ok = await chrome.permissions.request({ permissions: ["nativeMessaging"] }); } catch (e) { ok = false; }
  if (!ok) { state({ on: false, error: "permissão negada" }); return; }
  state(await ask(true));
});
$("ponteOff").addEventListener("click", async () => {
  const r = await ask(false, true); try { await chrome.permissions.remove({ permissions: ["nativeMessaging"] }); } catch (e) { /* kept */ }
  state(Object.assign({}, r, { on: false, error: "" })); $("ponteSt").textContent = "Ponte desligada.";
});
chrome.permissions.contains({ permissions: ["nativeMessaging"] }).then(has => { if (has) ask(false).then(state); });
for (const b of document.querySelectorAll("[data-q]")) b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.q); $("copied").textContent = "Copiado: cole na sua IA."; } catch (e) { $("copied").textContent = b.dataset.q; }
});
