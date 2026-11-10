// Popup: the Caderno+ settings (chrome.storage.local "prefs"), the Foco timer and the student's data (backup, import).
// Opened in a tab (popup.html#tab) for the import: a file dialog closes the popup on some systems.
const $ = id => document.getElementById(id);
$("ver").textContent = "v" + chrome.runtime.getManifest().version;
// Novidades (notes.js): once after an update, until "Entendi" (shared with the panel on the dashboard).
if (typeof CP_NOTES === "object" && CP_NOTES && Array.isArray(CP_NOTES.items)) chrome.storage.local.get("notesSeen").then(({ notesSeen }) => {
  if (notesSeen === CP_NOTES.version) return;
  $("h-notes").textContent = "Novidades da v" + CP_NOTES.version;
  for (const t of CP_NOTES.items) { const li = document.createElement("li"); li.textContent = t; document.querySelector(".notes-l").appendChild(li); }
  $("notes").hidden = false;
  $("notesOk").addEventListener("click", async () => { await chrome.storage.local.set({ notesSeen: CP_NOTES.version }); $("notes").hidden = true; });
});

// Each change writes only its own key over the latest prefs (the Canvas panel changes mode, meta and the native dashboard
// too), and the popup follows changes made elsewhere: neither side undoes the other.
const setPref = async (k, v) => { const { prefs } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, prefs, { [k]: v }) }); };
const tints = [...document.querySelectorAll("[data-tint]")];
const looks = [...document.querySelectorAll("[data-look]")], modes = [...document.querySelectorAll("[data-mode]")];
function showPrefs(prefs) {
  const p = cpPrefs(prefs);
  if (document.activeElement !== $("dlFolder")) $("dlFolder").value = cpFolder(p.dlFolder);
  $("theme").value = p.theme;
  for (const sel of document.querySelectorAll("[data-sel]")) sel.value = p[sel.dataset.sel];
  looks.forEach(b => { b.setAttribute("aria-checked", String(b.dataset.look === p.look)); b.tabIndex = b.dataset.look === p.look ? 0 : -1; });
  modes.forEach(b => { b.setAttribute("aria-checked", String(b.dataset.mode === p.mode)); b.tabIndex = b.dataset.mode === p.mode ? 0 : -1; });
  for (const box of document.querySelectorAll("[data-pref]")) box.checked = p[box.dataset.pref];
  const own = /^#[0-9a-f]{6}$/i.test(p.bgColor) ? p.bgColor.toUpperCase() : "", preset = tints.some(b => b.dataset.tint === own);
  tints.forEach(b => b.setAttribute("aria-checked", String(b.dataset.tint === own)));
  $("bgPickWrap").classList.toggle("on", !!own && !preset); if (own) $("bgPick").value = own.toLowerCase();
}
$("theme").addEventListener("change", () => setPref("theme", $("theme").value));
$("dlFolder").addEventListener("change", () => { const v = cpFolder($("dlFolder").value); $("dlFolder").value = v; setPref("dlFolder", v); });
for (const sel of document.querySelectorAll("[data-sel]")) sel.addEventListener("change", () => setPref(sel.dataset.sel, sel.value));
for (const b of looks) b.addEventListener("click", () => setPref("look", b.dataset.look));
for (const b of modes) b.addEventListener("click", () => setPref("mode", b.dataset.mode));
for (const b of tints) b.addEventListener("click", () => setPref("bgColor", b.dataset.tint));   // "" = the look's own paper
$("bgPick").addEventListener("change", () => setPref("bgColor", $("bgPick").value.toUpperCase()));
// radio groups: one Tab stop (the checked one), arrows move and choose
const roving = (group, key) => group.forEach((b, i) => b.addEventListener("keydown", e => {
  const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0; if (!d) return;
  e.preventDefault(); const nb = group[(i + d + group.length) % group.length]; setPref(key, nb.dataset[key]); nb.focus();
}));
roving(looks, "look"); roving(modes, "mode");
for (const box of document.querySelectorAll("[data-pref]")) box.addEventListener("change", () => setPref(box.dataset.pref, box.checked));
chrome.storage.local.get("prefs").then(({ prefs }) => showPrefs(prefs));
if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) showPrefs(ch.prefs.newValue); });

chrome.storage.local.get("cache").then(({ cache }) => {
  if (!cache || !cache.data || !cache.at) return;
  const d = new Date(cache.at), n = cache.data.courses ? cache.data.courses.length : 0;
  $("status").textContent = n + " matérias · lidas às " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  $("bar").classList.toggle("read", true);
});
// Atualizar agora: the last reading counts as old (and no tab holds the read lock), so the next Canvas page reads everything.
$("refresh").addEventListener("click", async () => {
  // reloading the grades also reads the Centro de Notas: its host is asked once, here (a click is needed to ask)
  if (chrome.permissions) chrome.permissions.request({ origins: ["https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io/*"] }).catch(() => {});
  const { cache } = await chrome.storage.local.get("cache");
  if (cache) await chrome.storage.local.set({ cache: Object.assign({}, cache, { at: 0 }) });
  const { centro } = await chrome.storage.local.get("centro"); if (centro) await chrome.storage.local.set({ centro: Object.assign({}, centro, { at: 0 }) });   // the Centro de Notas too
  await chrome.storage.local.remove("refreshing");
  $("status").textContent = "Atualiza na próxima página do Canvas.";
});
// Backup: everything Caderno+ keeps for the student, in one file (nothing leaves the computer unless the student moves it).
const KEEP = ["hand", "marks", "tasks", "notes", "checks", "hidden", "prefs", "fold"];
// Only the student using Canvas now: grades, ticks, tasks, notes and checklists are kept per Canvas user, and the file
// carries that one slice (other students of this Chrome stay out of it). The look, the mode and the folds are the browser's.
const backupOf = (got, user) => Object.assign({}, got, Object.fromEntries(["hand", "marks", "tasks", "notes", "checks"].map(k => [k, user != null && got[k] && typeof got[k] === "object" && got[k][user] !== undefined ? { [user]: got[k][user] } : {}])));
$("export").addEventListener("click", async () => {
  const all = await chrome.storage.local.get(KEEP.concat("cache")), got = backupOf(Object.fromEntries(KEEP.map(k => [k, all[k]])), all.cache && all.cache.user != null ? all.cache.user : null);
  const body = JSON.stringify(Object.assign({ app: "caderno-plus", v: 1, exported: new Date().toISOString().slice(0, 10) }, got), null, 1);
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "application/json" })); a.download = "caderno-plus-backup.json"; a.click();
  $("status").textContent = "Backup salvo nos Downloads.";
});
$("import").addEventListener("click", () => { if (location.hash === "#tab") $("importFile").click(); else chrome.tabs.create({ url: chrome.runtime.getURL("popup.html#tab") }); });
if (location.hash === "#tab") document.body.classList.add("tab");
$("importFile").addEventListener("change", async () => {
  const f = $("importFile").files && $("importFile").files[0]; if (!f) return;
  let d; try { d = JSON.parse(await f.text()); } catch (e) { d = null; }
  if (d && d.app === "quanto-falta" && d.grades && typeof d.grades === "object") {   // the site calculator's backup: its grades become this student's own
    const { cache, hand = {} } = await chrome.storage.local.get(["cache", "hand"]), user = cache && cache.user;
    if (!user) { $("status").textContent = "Abra o Canvas uma vez antes de importar esse backup."; return; }
    const mine = Object.assign({}, hand[user]);
    for (const [k, v] of Object.entries(d.grades)) if (/^[a-z0-9]+:[a-z0-9]+$/.test(k) && typeof v === "string" && v.length <= 12 && mine[k] == null) mine[k] = v;
    await chrome.storage.local.set({ hand: Object.assign({}, hand, { [user]: mine }) }); $("status").textContent = "Notas do site importadas. Recarregue o Canvas."; return;
  }
  if (!d || d.app !== "caderno-plus") { $("status").textContent = "Esse arquivo não é um backup do Caderno+."; return; }
  // merged per Canvas user (other students on this computer keep theirs); only well-formed values
  const str = (v, n) => typeof v === "string" && v.length <= n, iso = v => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v), obj = v => v && typeof v === "object" && !Array.isArray(v);
  const keepIf = (m, ok) => obj(m) ? Object.fromEntries(Object.entries(m).filter(([k, v]) => str(k, 60) && ok(v))) : {};
  const per = { hand: u => keepIf(u, v => str(v, 12)), marks: u => keepIf(u, iso), notes: u => keepIf(u, v => str(v, 5000)),
    checks: u => obj(u) ? Object.fromEntries(Object.entries(u).filter(([k, l]) => /^(\d{1,15}|painel)$/.test(k) && Array.isArray(l)).map(([k, l]) => [k, l.filter(x => x && str(x.id, 40) && str(x.t, 200) && (x.date === undefined || iso(x.date))).slice(0, 50).map(x => Object.assign({ id: x.id, t: x.t, done: x.done === true }, x.date ? { date: x.date } : {}))])) : {},
    tasks: u => Array.isArray(u) ? u.filter(t => t && str(t.id, 40) && str(t.title, 140) && (t.date === null || iso(t.date))).slice(0, 100).map(t => Object.assign({ id: t.id, title: t.title, date: t.date },
      Array.isArray(t.subs) ? { subs: t.subs.filter(s => s && str(s.t, 100)).slice(0, 10).map(s => ({ t: s.t, d: s.d === true })) } : {})) : [] };
  const cur = await chrome.storage.local.get(KEEP), out = {};
  for (const k of Object.keys(per)) if (obj(d[k])) out[k] = Object.assign({}, cur[k], Object.fromEntries(Object.entries(d[k]).filter(([u]) => /^\d{1,20}$/.test(u)).map(([u, v]) => [u, per[k](v)])));
  if (Array.isArray(d.hidden)) out.hidden = d.hidden.map(String).filter(x => /^\d{1,20}$/.test(x)).slice(0, 200);
  if (obj(d.prefs)) out.prefs = cpPrefs(Object.assign({}, cur.prefs, d.prefs));
  if (obj(d.fold)) out.fold = keepIf(d.fold, v => typeof v === "boolean");
  await chrome.storage.local.set(out); $("status").textContent = "Backup aplicado (" + Object.keys(out).length + " partes). Recarregue o Canvas.";
});
// Once: the grades and the meta typed in the old Caderno+ page (this extension's localStorage, per Canvas user) become
// "hand" grades, which the Canvas panels now use. Grades already typed in Canvas win.
(async () => {
  const { migrated } = await chrome.storage.local.get("migrated"); if (migrated) return;
  let ls; try { ls = window.localStorage; } catch (e) { return; }
  if (!ls) return;
  const { hand = {}, prefs } = await chrome.storage.local.get(["hand", "prefs"]), next = Object.assign({}, hand); let meta = null;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i), m = /^notas-pucpr-[\d-]+:u(\d{1,20})$/.exec(k || ""); if (!m) continue;
    let saved; try { saved = JSON.parse(ls.getItem(k)); } catch (e) { continue; }
    if (!saved || !saved.grades || typeof saved.grades !== "object") continue;
    const mine = Object.assign({}, next[m[1]]);
    for (const [g, v] of Object.entries(saved.grades)) if (typeof v === "string" && v.trim() && /^[a-z0-9]+:[a-z0-9]+$/.test(g) && mine[g] == null) mine[g] = v.trim();
    next[m[1]] = mine; if (typeof saved.meta === "string") meta = saved.meta;
  }
  const set = { hand: next, migrated: 1 };
  if (meta && !(prefs && prefs.meta)) set.prefs = Object.assign({}, prefs, { meta });
  await chrome.storage.local.set(set);
})();

$("aiPage").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("ai.html") }));

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

// A seguir: the next three deadlines and exams the worker keeps for the reminders (chrome.storage.local "upcoming").
chrome.storage.local.get("upcoming").then(({ upcoming }) => {
  if (!Array.isArray(upcoming)) return;
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const t = iso(new Date()), tm = iso(new Date(Date.now() + 864e5)), list = upcoming.filter(x => x && x.date >= t).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  if (!list.length) return;
  for (const x of list) { const li = document.createElement("li"), d = document.createElement("span"), n = document.createElement("span");
    d.className = "d"; d.textContent = x.date === t ? "hoje" : x.date === tm ? "amanhã" : x.date.slice(8, 10) + "/" + x.date.slice(5, 7); n.textContent = x.title;
    li.append(d, n); $("nextList").appendChild(li); }
  $("nextBox").hidden = false;
});
// The last error (kept by the Canvas pages, no data): shown for a day, with its details to paste in a bug report.
chrome.storage.local.get("lastError").then(({ lastError: e }) => {
  if (!e || typeof e !== "object" || !(Date.now() - e.at < 864e5)) return;
  $("errText").textContent = "Último erro: " + String(e.where || "") + " — " + String(e.msg || "");
  $("errLine").hidden = false;
  $("errCopy").addEventListener("click", () => navigator.clipboard.writeText(JSON.stringify(e)).then(() => { $("errCopy").textContent = "Copiado ✓"; }, () => {}));
});

// Tabs: Visual, Painel, Avisos, Mais; the last one opened comes back (this extension's localStorage). Novidades stay above them.
const tabs = [...document.querySelectorAll("[role=tab]")];
const openTab = (k, focus) => {
  for (const t of tabs) { const on = t.dataset.tab === k; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; $("p-" + t.dataset.tab).hidden = !on; if (on && focus) t.focus(); }
  try { localStorage.setItem("cpTab", k); } catch (e) {}
};
tabs.forEach((t, i) => {
  t.addEventListener("click", () => openTab(t.dataset.tab));
  t.addEventListener("keydown", e => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); openTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true); } });
});
if (tabs.length) { let k = null; try { k = localStorage.getItem("cpTab"); } catch (e) {} openTab(tabs.some(t => t.dataset.tab === k) ? k : "look"); }

// Matérias no painel: every course of the last reading; unticked ones leave the dashboard (chrome.storage.local "hidden").
(async () => {
  const { cache, hidden } = await chrome.storage.local.get(["cache", "hidden"]), box = $("courses"), off = new Set(Array.isArray(hidden) ? hidden.map(String) : []);
  const ids = cache && Array.isArray(cache.ids) ? cache.ids : [];
  if (!ids.length) { $("coursesHint").textContent = "Abra o Canvas uma vez para escolher as matérias do painel."; return; }
  for (const x of ids) {
    const row = document.createElement("label"), name = document.createElement("span"), box2 = document.createElement("input");
    row.className = "row"; name.textContent = String(x.name).split(" (")[0].split(" - ")[0]; name.title = x.name;
    box2.type = "checkbox"; box2.setAttribute("role", "switch"); box2.checked = !off.has(String(x.id));
    box2.addEventListener("change", async () => {
      const { hidden: h } = await chrome.storage.local.get("hidden"), set = new Set(Array.isArray(h) ? h.map(String) : []);
      if (box2.checked) set.delete(String(x.id)); else set.add(String(x.id));
      await chrome.storage.local.set({ hidden: [...set] });
    });
    row.append(name, box2); box.appendChild(row);
  }
})();
$("setup").addEventListener("click", e => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL("onboarding.html") }); });
