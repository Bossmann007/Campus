// Popup: the Campus+ settings (chrome.storage.local "prefs"), and the grades import: inject collectCanvasGrades into
// the active Canvas tab, then hand the result to the calculator page.
const SITE = "https://falta-quanto.vercel.app/app";   // preview/production URL; the page reads #canvas=<data> locally (hash never reaches a server)
const $ = id => document.getElementById(id);
const say = (text, cls) => { $("status").textContent = text; $("status").className = cls || ""; };
function b64url(s) {   // chunked: a spread of a long export would overflow the argument limit
  const bytes = new TextEncoder().encode(s); let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
let exported = "";
$("ver").textContent = "v" + chrome.runtime.getManifest().version + " ·";

chrome.storage.local.get("prefs").then(({ prefs }) => {
  let p = cpPrefs(prefs);
  const save = () => chrome.storage.local.set({ prefs: p });
  $("theme").value = p.theme;
  $("theme").addEventListener("change", () => { p = Object.assign({}, p, { theme: $("theme").value }); save(); });
  for (const box of document.querySelectorAll("[data-pref]")) {
    box.checked = p[box.dataset.pref];
    box.addEventListener("change", () => { p = Object.assign({}, p, { [box.dataset.pref]: box.checked }); save(); });
  }
});

$("go").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (e) {}
  if (host !== "pucpr.instructure.com") {
    say("Esta aba não é o Canvas da PUCPR. Abrindo o Canvas: entre e clique de novo.", "bad");
    chrome.tabs.create({ url: "https://pucpr.instructure.com/" });
    return;
  }
  $("go").disabled = true; say("Lendo suas notas…");
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectCanvasGrades });
    if (!res || !res.result) throw new Error("não veio resposta da aba do Canvas");
    if (res.result.error) throw new Error(res.result.error);
    exported = JSON.stringify(Object.assign({ ext: chrome.runtime.getManifest().version }, res.result));   // lets the page say when this copy is outdated
    const graded = res.result.courses.reduce((n, c) => n + c.assignments.filter(a => a.score !== null).length, 0);
    say(res.result.courses.length + " matérias lidas, " + graded + " avaliações com nota.", "ok");
    $("open").hidden = false; $("copy").hidden = false;
  } catch (e) {
    say("Não consegui ler as notas: " + (e && e.message || e) + ". Confira se você está logado no Canvas.", "bad");
  } finally { $("go").disabled = false; }
});
$("open").addEventListener("click", () => chrome.tabs.create({ url: SITE + "#canvas=" + b64url(exported) }));
$("copy").addEventListener("click", () => navigator.clipboard.writeText(exported).then(() => { $("copy").textContent = "Copiado"; }));
