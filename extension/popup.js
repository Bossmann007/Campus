// Popup: the Campus+ settings (chrome.storage.local "prefs") and the way into the full calculator (the extension's app.html,
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
$("open").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("app.html") }));
$("canvas").addEventListener("click", () => chrome.tabs.create({ url: "https://pucpr.instructure.com/" }));
