// Service worker: saves the files the Canvas page asks for, and keeps the days-to-next-exam number on the icon.
const CANVAS = "https://pucpr.instructure.com";
const localISO = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const daysTo = iso => Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(localISO(new Date()) + "T00:00:00Z")) / 864e5);

// Only Canvas file links, only into Downloads/PUCPR/..., never outside it.
function okDownload(it) {
  if (!it || typeof it.url !== "string" || typeof it.filename !== "string") return false;
  let u; try { u = new URL(it.url); } catch (e) { return false; }
  return u.origin === CANVAS && /^PUCPR\/[^/]/.test(it.filename) && !it.filename.split("/").some(p => p === "" || p === "." || p === "..");
}

async function showNext() {
  const { next } = await chrome.storage.local.get("next");
  const d = next && typeof next.date === "string" ? daysTo(next.date) : -1;
  if (d < 0) { await chrome.action.setBadgeText({ text: "" }); await chrome.action.setTitle({ title: "Quanto falta" }); return; }
  await chrome.action.setBadgeText({ text: d === 0 ? "hoje" : d + "d" });
  await chrome.action.setBadgeBackgroundColor({ color: d <= 3 ? "#d13415" : d <= 7 ? "#ab6400" : "#646464" });
  await chrome.action.setTitle({ title: "Próxima prova: " + next.label + (d === 0 ? " (hoje)" : d === 1 ? " (amanhã)" : " (em " + d + " dias)") });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.origin !== CANVAS || !msg) return;
  if (msg.type === "next") {
    const next = msg.date && /^\d{4}-\d\d-\d\d$/.test(msg.date) ? { date: msg.date, label: String(msg.label || "").slice(0, 80) } : null;
    chrome.storage.local.set({ next }).then(showNext).then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === "download" && Array.isArray(msg.items)) {
    (async () => {
      const done = [];
      for (const it of msg.items.slice(0, 300)) {
        if (!okDownload(it)) continue;
        try {
          const did = await chrome.downloads.download({ url: it.url, filename: it.filename, conflictAction: "uniquify", saveAs: false });
          const { pending = {} } = await chrome.storage.session.get("pending");
          pending[did] = it.id; await chrome.storage.session.set({ pending });
          done.push(it.id);
        } catch (e) { /* one bad file does not stop the rest */ }
      }
      reply({ done });
    })();
    return true;
  }
});
// A file counts as downloaded only when Chrome finishes it; cancelled or failed ones stay "new".
chrome.downloads.onChanged.addListener(async ch => {
  const state = ch.state && ch.state.current;
  if (state !== "complete" && state !== "interrupted") return;
  const { pending = {} } = await chrome.storage.session.get("pending"), fileId = pending[ch.id];
  if (fileId === undefined) return;
  delete pending[ch.id]; await chrome.storage.session.set({ pending });
  if (state !== "complete") return;
  const { dl } = await chrome.storage.local.get("dl"), have = Array.isArray(dl) ? dl : [];
  if (!have.includes(fileId)) await chrome.storage.local.set({ dl: [...have, fileId] });
});
chrome.runtime.onStartup.addListener(showNext);
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("tick", { periodInMinutes: 60 }); showNext(); });
chrome.alarms.onAlarm.addListener(showNext);   // the icon number counts down even when Canvas is not opened
