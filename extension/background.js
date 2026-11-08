// Caderno+ service worker: saves the files the Canvas page asks for, keeps the days-to-next-exam number on the icon,
// and shows the reminders (1 day and 1 hour before each deadline) the Canvas page hands over.
importScripts("prefs.js");
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
  if (d < 0) { await chrome.action.setBadgeText({ text: "" }); await chrome.action.setTitle({ title: "Caderno+" }); return; }
  await chrome.action.setBadgeText({ text: d === 0 ? "hoje" : d + "d" });
  await chrome.action.setBadgeBackgroundColor({ color: d <= 3 ? "#d13415" : d <= 7 ? "#ab6400" : "#646464" });
  await chrome.action.setTitle({ title: "Caderno+ · próxima prova: " + next.label + (d === 0 ? " (hoje)" : d === 1 ? " (amanhã)" : " (em " + d + " dias)") });
}

// Reminders: alarms named "r|<key>|<when>" plus their text in storage, rebuilt from the list the Canvas page sends.
// Timed deadlines: 1 day and 1 hour before. Exams with only a date: 19:00 the day before and 07:00 on the day.
const at = (iso, days, h) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d + days, h).getTime(); };
let queue = Promise.resolve();   // two Canvas tabs at once: one rebuild after the other
const remind = (items, alarms = true) => (queue = queue.then(() => rebuild(items, alarms), () => rebuild(items, alarms)));
async function rebuild(items, alarms) {
  for (const a of await chrome.alarms.getAll()) if (a.name.startsWith("r|")) await chrome.alarms.clear(a.name);
  const reminders = {}, now = Date.now(), upcoming = [];
  for (const it of items.slice(0, 60)) {
    if (it && typeof it.title === "string" && typeof it.date === "string" && /^\d{4}-\d\d-\d\d$/.test(it.date)) upcoming.push({ title: it.title.slice(0, 120), date: it.date });
    if (!alarms) continue;
    if (!it || typeof it.key !== "string" || typeof it.title !== "string") continue;
    const url = typeof it.url === "string" && it.url.startsWith(CANVAS + "/") ? it.url : CANVAS + "/";
    const times = typeof it.due === "string" && !isNaN(Date.parse(it.due)) && /T/.test(it.due)
      ? [[Date.parse(it.due) - 864e5, "amanhã"], [Date.parse(it.due) - 36e5, "em 1 hora"]]
      : typeof it.date === "string" && /^\d{4}-\d\d-\d\d$/.test(it.date) ? [[at(it.date, -1, 19), "amanhã"], [at(it.date, 0, 7), "hoje"]] : [];
    for (const [when, tag] of times) if (when > now) {
      const name = "r|" + it.key.slice(0, 80) + "|" + when;
      reminders[name] = { title: it.title.slice(0, 120), body: String(it.course || "").slice(0, 80) + " · " + tag, url };
      await chrome.alarms.create(name, { when });
    }
  }
  await chrome.storage.local.set({ reminders, upcoming });
}
// Monday 08:00: what the week holds, from the last list a Canvas page sent ("3 entregas e 1 prova · Prova: RA2 (qui)").
function nextMonday8(now = new Date()) {
  const d = new Date(now); d.setHours(8, 0, 0, 0);
  let add = (8 - d.getDay()) % 7; if (add === 0 && now.getTime() >= d.getTime()) add = 7;
  d.setDate(d.getDate() + add); return d.getTime();
}
const scheduleWeek = () => chrome.alarms.create("week", { when: nextMonday8(), periodInMinutes: 7 * 24 * 60 });
async function summary(alarm) {
  const { upcoming = [], prefs, shown = {} } = await chrome.storage.local.get(["upcoming", "prefs", "shown"]);
  if (!cpPrefs(prefs).summary || Date.now() - alarm.scheduledTime > 12 * 36e5) return;
  const t = localISO(new Date()), end = localISO(new Date(Date.now() + 6 * 864e5)), wk = upcoming.filter(x => x.date >= t && x.date <= end);
  const exams = wk.filter(x => /^Prova: /.test(x.title)), tasks = wk.length - exams.length, WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const parts = [tasks ? tasks + (tasks === 1 ? " entrega" : " entregas") : "", exams.length ? exams.length + (exams.length === 1 ? " prova" : " provas") : ""].filter(Boolean);
  const id = "w|" + Date.now(), keep = Object.entries(shown).slice(-30); keep.push([id, CANVAS + "/"]);
  await chrome.storage.local.set({ shown: Object.fromEntries(keep) });
  chrome.notifications.create(id, { type: "basic", iconUrl: "icons/icon128.png", title: "Sua semana: " + (parts.join(" e ") || "nada marcado"),
    message: (exams.slice(0, 3).map(x => x.title.replace(/^Prova: /, "") + " (" + WD[new Date(x.date + "T12:00:00").getDay()] + ")").join(" · ") || (wk.length ? "Sem provas nesta semana." : "Semana livre no Canvas.")).slice(0, 160), priority: 1 });
}
// A reminder fires once; one that Chrome delivers late (the computer was asleep) is dropped. Shown ones keep their link in
// "shown" so a click from the notification center still opens it after the list is rebuilt.
async function notify(alarm) {
  const { reminders = {}, shown = {} } = await chrome.storage.local.get(["reminders", "shown"]), r = reminders[alarm.name];
  if (!r || Date.now() - alarm.scheduledTime > 30 * 60 * 1000 || !cpPrefs((await chrome.storage.local.get("prefs")).prefs).remind) return;
  const keep = Object.entries(shown).slice(-30); keep.push([alarm.name, r.url]);
  await chrome.storage.local.set({ shown: Object.fromEntries(keep) });
  chrome.notifications.create(alarm.name, { type: "basic", iconUrl: "icons/icon128.png", title: r.title, message: r.body, priority: 1 });
}

// New grades the Canvas page found: one notification each (up to 3), or one summing them up; a click opens the assignment.
async function grades(items) {
  if (!cpPrefs((await chrome.storage.local.get("prefs")).prefs).newgrades) return;
  const ok = items.filter(g => g && typeof g.name === "string" && typeof g.score === "number").slice(0, 10), num = n => typeof n === "number" ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "?";
  if (!ok.length) return;
  const { shown = {} } = await chrome.storage.local.get("shown"), keep = Object.entries(shown).slice(-30), id = "g|" + Date.now();
  const show = (nid, title, message, url) => { keep.push([nid, typeof url === "string" && url.startsWith(CANVAS + "/") ? url : CANVAS + "/grades"]); chrome.notifications.create(nid, { type: "basic", iconUrl: "icons/icon128.png", title, message, priority: 1 }); };
  if (ok.length <= 3) ok.forEach((g, i) => show(id + "|" + i, "Nota nova: " + String(g.course || "").slice(0, 60), g.name.slice(0, 90) + ": " + num(g.score) + " de " + num(g.points), g.url));
  else show(id, ok.length + " notas novas", ok.map(g => String(g.course || "").slice(0, 30) + " " + num(g.score)).join(" · ").slice(0, 160), CANVAS + "/grades");
  await chrome.storage.local.set({ shown: Object.fromEntries(keep) });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.origin !== CANVAS || !msg) return;
  if (msg.type === "next") {
    const next = msg.date && /^\d{4}-\d\d-\d\d$/.test(msg.date) ? { date: msg.date, label: String(msg.label || "").slice(0, 80) } : null;
    chrome.storage.local.set({ next }).then(showNext).then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === "remind" && Array.isArray(msg.items)) {
    remind(msg.items, msg.alarms !== false).then(() => reply({ ok: true }));
    return true;
  }
  if (msg.type === "grades" && Array.isArray(msg.items)) {
    grades(msg.items).then(() => reply({ ok: true }));
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
chrome.runtime.onStartup.addListener(() => { showNext(); scheduleWeek(); });
chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("tick", { periodInMinutes: 60 }); scheduleWeek(); showNext(); });
// Foco (started in the popup): the end of a study block or a break.
async function focusDone(alarm) {
  await chrome.storage.local.remove("focus");
  const study = alarm.name === "focus|foco";
  chrome.notifications.create("f|" + Date.now(), { type: "basic", iconUrl: "icons/icon128.png", title: study ? "25 minutos de foco: hora da pausa" : "Pausa acabou",
    message: study ? "Levante, beba água. Abra o Caderno+ para mais uma rodada depois de 5 minutos." : "Bora voltar: mais 25 minutos de foco?", priority: 2 });
}
chrome.alarms.onAlarm.addListener(a => a.name.startsWith("r|") ? notify(a) : a.name === "week" ? summary(a) : a.name.startsWith("focus|") ? focusDone(a) : showNext());   // "tick": the icon counts down even when Canvas is not opened
chrome.notifications.onClicked.addListener(async id => {
  const { shown = {} } = await chrome.storage.local.get("shown");
  if (typeof shown[id] === "string" && shown[id].startsWith(CANVAS + "/")) chrome.tabs.create({ url: shown[id] });
  chrome.notifications.clear(id);
});
chrome.storage.onChanged.addListener(async (ch, area) => {   // turned off: drop pending reminders (the week list stays for the summary)
  if (area === "local" && ch.prefs && !cpPrefs(ch.prefs.newValue).remind) remind((await chrome.storage.local.get("upcoming")).upcoming || [], false);
});
