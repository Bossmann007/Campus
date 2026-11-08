// Popup: the Caderno+ settings (chrome.storage.local "prefs") and the way into the full calculator (the extension's app.html,
// which reads the last Canvas reading that content.js saved).
const $ = id => document.getElementById(id);
$("ver").textContent = "v" + chrome.runtime.getManifest().version;

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

chrome.storage.local.get("cache").then(({ cache }) => {
  if (!cache || !cache.data || !cache.at) return;
  const d = new Date(cache.at), n = cache.data.courses ? cache.data.courses.length : 0;
  $("status").textContent = n + " matérias lidas do Canvas às " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ".";
});
// Atualizar agora: the last reading counts as old (and no tab holds the read lock), so the next Canvas page reads everything.
$("refresh").addEventListener("click", async () => {
  const { cache } = await chrome.storage.local.get("cache");
  if (cache) await chrome.storage.local.set({ cache: Object.assign({}, cache, { at: 0 }) });
  await chrome.storage.local.remove("refreshing");
  $("status").textContent = "Atualiza ao abrir ou recarregar uma página do Canvas.";
});
$("open").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("app.html") }));
$("canvas").addEventListener("click", () => chrome.tabs.create({ url: "https://pucpr.instructure.com/" }));

// Foco: 25 minutes of study or 5 of break; the service worker shows a notification when the alarm fires.
const showFocus = async () => {
  const { focus } = await chrome.storage.local.get("focus"), left = focus && focus.end - Date.now();
  $("fstop").hidden = !(left > 0);
  if (!(left > 0)) { $("focus").textContent = "Estude 25 minutos, descanse 5. Avisa quando acabar."; return; }
  const m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
  $("focus").textContent = (focus.kind === "pausa" ? "Pausa: " : "Foco: ") + m + ":" + String(sec).padStart(2, "0") + " restantes";
};
const startFocus = async (kind, min) => {
  for (const k of ["foco", "pausa"]) await chrome.alarms.clear("focus|" + k);
  const end = Date.now() + min * 60000;
  await chrome.alarms.create("focus|" + kind, { when: end });
  await chrome.storage.local.set({ focus: { kind, end } }); showFocus();
};
$("f25").addEventListener("click", () => startFocus("foco", 25));
$("f5").addEventListener("click", () => startFocus("pausa", 5));
$("fstop").addEventListener("click", async () => { for (const k of ["foco", "pausa"]) await chrome.alarms.clear("focus|" + k); await chrome.storage.local.remove("focus"); showFocus(); });
showFocus(); setInterval(showFocus, 1000);
