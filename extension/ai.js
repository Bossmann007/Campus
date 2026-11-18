// "Sua IA": install the Caderno+ MCP, turn the ponte on (the MCP asks this extension, which reads Canvas with the
// browser's login: no token, no server), and questions to copy.
const $ = id => document.getElementById(id);
const cmd = "caderno-mcp ponte " + chrome.runtime.id;
$("cmd").textContent = cmd;
$("copyCmd").addEventListener("click", async () => { try { await navigator.clipboard.writeText(cmd); $("copyCmd").textContent = "Copiado"; } catch (e) { $("copyCmd").textContent = "Selecione e copie"; } });
const CENTRO = "https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io/*";
// one card per connection, like an account list: a status pill (ok, off, error, checking), when it was last checked, Testar
const card = k => document.querySelector('[data-conn="' + k + '"]');
const mark = (k, tone, label) => {
  const c = card(k), p = c.querySelector("[data-st]"), at = c.querySelector("[data-at]");
  p.textContent = label; p.className = "chip " + tone; c.dataset.tone = tone;
  for (const l of document.querySelectorAll('[data-link="' + k + '"]')) l.dataset.tone = tone;
  const n = document.querySelector('[data-node="' + k + '"]'); if (n) { n.dataset.tone = tone; n.querySelector("[data-node-st]").textContent = label; }
  $("okCount").textContent = ["canvas", "ponte", "centro"].filter(x => card(x).dataset.tone === "ok").length + " de 3 prontas";   // the token is an alternative to the ponte
  if (at) at.textContent = tone === "wait" ? "testando…" : "às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
async function testCanvas() {
  mark("canvas", "wait", "testando");
  let r = null; try { r = await fetch("https://pucpr.instructure.com/api/v1/users/self", { credentials: "include", headers: { Accept: "application/json" } }); } catch (e) { r = null; }
  const ok = r && r.ok; card("canvas").querySelector("[data-login]").hidden = !!ok;
  mark("canvas", ok ? "ok" : "bad", ok ? "conectado" : r && (r.status === 401 || r.status === 403) ? "entre no Canvas" : "sem resposta");
}
const state = r => {
  const st = $("ponteSt");
  $("ponteOff").hidden = !(r && r.on); $("ponteOn").hidden = !!(r && r.on);
  if (r && r.on) { st.textContent = "Teste também no terminal: caderno-mcp ponte status"; st.className = "ponte-st on"; mark("ponte", "ok", "ligada"); return; }
  st.className = "ponte-st" + (r && r.error ? " off" : "");
  st.textContent = !r ? "" : /not found|não encontrado/i.test(r.error) ? "O navegador não achou a ponte: rode o comando do passo 2 no terminal e clique em Ligar de novo."
    : /forbidden|proibido/i.test(r.error) ? "A ponte foi instalada para outro id: rode o comando do passo 2 de novo (ele tem o id desta extensão)."
    : r.error ? "A ponte desligou (" + r.error + "). Clique em Ligar de novo." : "";
  mark("ponte", r && r.error ? "bad" : "off", r && r.error ? "com erro" : "desligada");
};
const ask = (on, off) => new Promise(res => chrome.runtime.sendMessage({ type: "ponte", on, off: !!off }, r => res(chrome.runtime.lastError ? null : r)));
const has = q => chrome.permissions.contains(q).catch(() => false);
async function testPonte() { mark("ponte", "wait", "testando"); if (await has({ permissions: ["nativeMessaging"] })) state(await ask(false)); else state(null); }
$("ponteOn").addEventListener("click", async () => {
  let ok = false; try { ok = await chrome.permissions.request({ permissions: ["nativeMessaging"] }); } catch (e) { ok = false; }
  if (!ok) { state({ on: false, error: "permissão negada" }); return; }
  mark("ponte", "wait", "ligando"); state(await ask(true));
});
$("ponteOff").addEventListener("click", async () => {
  const r = await ask(false, true); try { await chrome.permissions.remove({ permissions: ["nativeMessaging"] }); } catch (e) { /* kept */ }
  state(Object.assign({}, r, { on: false, error: "" })); $("ponteSt").textContent = "Ponte desligada.";
});
async function testCentro() {
  mark("centro", "wait", "testando");
  const ok = await has({ origins: [CENTRO] }); $("centroOn").hidden = ok; $("centroOff").hidden = !ok;
  mark("centro", ok ? "ok" : "off", ok ? "permitido" : "não permitido");
}
$("centroOn").addEventListener("click", async () => { try { await chrome.permissions.request({ origins: [CENTRO] }); } catch (e) { /* denied */ } testCentro(); });
$("centroOff").addEventListener("click", async () => { try { await chrome.permissions.remove({ origins: [CENTRO] }); } catch (e) { /* kept */ } testCentro(); });
$("tokHow").addEventListener("click", () => { const d = $("tok"); d.open = true; d.scrollIntoView({ behavior: "smooth", block: "center" }); });
const tests = { canvas: testCanvas, ponte: testPonte, centro: testCentro };
for (const [k, f] of Object.entries(tests)) card(k).querySelector("[data-test]").addEventListener("click", f);
testCanvas(); testPonte(); testCentro();
$("testAll").addEventListener("click", () => { testCanvas(); testPonte(); testCentro(); });
// the sidebar marks the section in view
const navs = [...document.querySelectorAll("nav a")];
if ("IntersectionObserver" in window) { const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) for (const a of navs) a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); }, { rootMargin: "-30% 0px -60% 0px" }); for (const s of document.querySelectorAll("main section")) io.observe(s); }
for (const b of document.querySelectorAll("[data-q]")) b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.q); $("copied").textContent = "Copiado: cole na sua IA."; for (const c of document.querySelectorAll(".asks .copied")) c.classList.remove("copied"); b.classList.add("copied"); } catch (e) { $("copied").textContent = b.dataset.q; }
});
