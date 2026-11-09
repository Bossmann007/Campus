// "Sua IA": the switch for the file the Caderno+ MCP reads (prefs.agentFile), whether it was written, where, and questions
// to copy. The state comes from chrome.storage.local: agentAt ("<reading time>|<folder>|<own items>"), agentPath, agentErr.
const $ = id => document.getElementById(id);
const hm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
async function show() {
  const { prefs, agentAt, agentPath, agentErr } = await chrome.storage.local.get(["prefs", "agentAt", "agentPath", "agentErr"]), on = !!cpPrefs(prefs).agentFile;
  const at = Number(String(agentAt || "").split("|")[0]);
  $("agentFile").checked = on; $("state").classList.toggle("on", on); $("state").classList.toggle("bad", !!agentErr);
  $("stTitle").textContent = !on ? "Desligado" : at ? "Ligado · leitura das " + hm(at) : "Ligado · esperando o Canvas";
  $("stSub").textContent = !on ? "Ligue para gravar o arquivo na próxima página do Canvas."
    : typeof agentPath === "string" && agentPath ? "Gravado em " + agentPath : "Abra ou recarregue uma página do Canvas para gravar o arquivo.";
  $("agentErr").hidden = !agentErr; $("agentErr").textContent = typeof agentErr === "string" ? agentErr : "";
}
$("agentFile").addEventListener("change", async () => {
  const { prefs } = await chrome.storage.local.get("prefs");
  if ($("agentFile").checked) await chrome.storage.local.remove("agentErr");
  await chrome.storage.local.set({ prefs: Object.assign({}, prefs, { agentFile: $("agentFile").checked }) });
});
for (const b of document.querySelectorAll("[data-q]")) b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.q); $("copied").textContent = "Copiado: cole na sua IA."; } catch (e) { $("copied").textContent = b.dataset.q; }
});
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && (ch.prefs || ch.agentAt || ch.agentPath || ch.agentErr)) show(); });
show();
