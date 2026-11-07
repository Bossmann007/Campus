// Extension inside Canvas: core.js is app.html's core, file routing, the service worker's download guard, and content.js
// run against a mocked Canvas (dashboard pill, course panel, files download through the service worker).
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dir = path.join(root, "extension");
const read = f => fs.readFileSync(path.join(dir, f), "utf8");
let n = 0; const ok = s => { n++; };

// core.js is a copy of app.html's core block
const core = fs.readFileSync(path.join(root, "app.html"), "utf8").match(/<script id="core">([\s\S]*?)<\/script>/)[1].replace(/^\n+|\n+$/g, "");
assert.strictEqual(read("core.js").split("\n").slice(1).join("\n").replace(/\n+$/, ""), core, "extension/core.js is stale: run scripts/sync-ext-core"); ok();
const ui = fs.readFileSync(path.join(root, "app.html"), "utf8").match(/<script id="ui">([\s\S]*?)<\/script>/)[1].replace(/^\n+|\n+$/g, "");
assert.strictEqual(read("app-ui.js").split("\n").slice(1).join("\n").replace(/\n+$/, ""), ui, "extension/app-ui.js is stale: run scripts/sync-ext-core");
assert(read("app.html").includes('<script src="core.js"></script>\n<script src="app-boot.js"></script>'), "extension/app.html loads the core, then the boot");
const C = new Function(read("core.js") + "\nreturn NotasCore;")();
assert.strictEqual(C.EXT_LATEST, JSON.parse(read("manifest.json")).version, "EXT_LATEST matches the manifest"); ok();

// file routing (canvas_files.py rules)
const F = new Function(read("files.js") + "\nreturn QFFiles;")();
for (const [name, k] of [["Plano de Ensino.pdf", ""], ["Gabarito AS03.pdf", "Gabaritos"], ["TDE 2 - enunciado.pdf", "TDE02"], ["tde.pdf", "TDE"],
  ["PBL05 maratona.pdf", "PBLS/pbl05"], ["Simulado RA2.pdf", "Formativas"], ["Lista de exercícios 3.pdf", "Exercicios"], ["Capítulo 4.pdf", "Textos"],
  ["gravação.mp4", "Videos"], ["Aula 07 - JOIN.pdf", "Slides"], ["intro.pptx", "Slides"], ["Entrega final.docx", "Atividades"], ["diagrama.png", "Imagens"],
  ["banco.sql", "Codigo"], ["coisa.pdf", "Outros"], ["2026_2_Turma_B_ProgramacaoImperativa_PlanoEnsino.pdf", ""], ["2026.BCC.Arquitetura de Banco de Dados A.pdf", ""],
  ["2026_2_Turma_B_Cronograma.pdf", ""], ["F29 - IoT UDP.pdf", "Formativas/F29"], ["provaA.pdf", "Formativas"], ["Apostila de Matemática Básica-vf.pdf", "Textos"]]) assert.strictEqual(F.kind(name), k, name);
ok();
assert.strictEqual(F.safeName("../../etc/x.pdf"), "x.pdf"); assert.strictEqual(F.safeName("instalar.exe"), null); assert.strictEqual(F.safeName(".bashrc"), "bashrc");
assert.strictEqual(F.safeName('a:b?"c".pdf'), "a_b__c_.pdf"); assert.strictEqual(F.safeName("..."), null);
assert.strictEqual(F.safeName("CON.pdf"), "CON_.pdf"); assert.strictEqual(F.safeName("aux"), "aux_"); assert.strictEqual(F.safeName("x".repeat(300) + ".pdf").length, 154); ok();
assert.strictEqual(F.target("Arquitetura de Banco de Dados (Turma 2º B) - 2026 / 2º Sem", { display_name: "Aula 3.pdf", size: 10 }, C.COURSES, C.CANVAS),
  "PUCPR/Arquitetura de Banco de Dados/Slides/Aula 3.pdf");
assert.strictEqual(F.target("Inglês Instrumental - 2026 / 2º Sem", { display_name: "texto 1.pdf", size: 10 }, C.COURSES, C.CANVAS), "PUCPR/Inglês Instrumental/Textos/texto 1.pdf");
assert.strictEqual(F.target("X", { display_name: "a.pdf", size: F.MAX_BYTES + 1 }, C.COURSES, C.CANVAS), null, "over 200 MB skipped"); ok();

// service worker: only Canvas URLs into Downloads/PUCPR; a file counts as downloaded only when Chrome completes it
const listeners = {}, swSaved = [], local = {}, session = {};
const area = o => ({ get: async k => Object.fromEntries([].concat(k).map(x => [x, o[x]])), set: async v => { Object.assign(o, v); }, remove: async k => { delete o[k]; } });
let nextId = 100;
const alarms = {}, notes = [], tabs = [];
const chromeSW = { runtime: { id: "me", onMessage: { addListener: f => { listeners.msg = f; } }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
  storage: { local: area(local), session: area(session), onChanged: { addListener: f => { listeners.storage = f; } } },
  alarms: { create: async (name, o) => { alarms[name] = o; }, getAll: async () => Object.keys(alarms).map(name => ({ name })), clear: async name => { delete alarms[name]; },
    onAlarm: { addListener: f => { listeners.alarm = f; } } },
  notifications: { create: (id, o) => notes.push(Object.assign({ id }, o)), clear() {}, onClicked: { addListener: f => { listeners.click = f; } } },
  tabs: { create: o => tabs.push(o.url) },
  action: { setBadgeText: async o => { local.badge = o.text; }, setTitle: async () => {}, setBadgeBackgroundColor: async () => {} },
  downloads: { onChanged: { addListener: f => { listeners.changed = f; } }, download: async o => { if (/boom/.test(o.filename)) throw new Error("Invalid filename"); swSaved.push(o); return nextId++; } } };
const imported = [];   // importScripts("prefs.js") shares the worker's global scope: the test puts prefs.js in front instead
const sw = new Function("chrome", "importScripts", read("prefs.js") + "\n" + read("background.js") + "\nreturn { okDownload };")(chromeSW, f => imported.push(f));
assert.deepStrictEqual(imported, ["prefs.js"]);
assert(sw.okDownload({ url: "https://pucpr.instructure.com/files/1/download?verifier=x", filename: "PUCPR/BD/Slides/a.pdf" }));
for (const bad of [{ url: "https://evil.example/a", filename: "PUCPR/a.pdf" }, { url: "https://pucpr.instructure.com/x", filename: "Documents/a.pdf" },
  { url: "https://pucpr.instructure.com/x", filename: "PUCPR/../a.pdf" }, { url: "javascript:alert(1)", filename: "PUCPR/a" }, { url: "https://pucpr.instructure.com/x", filename: "PUCPR//a" }])
  assert(!sw.okDownload(bad), JSON.stringify(bad));
ok();
const ask = (msg, sender) => new Promise(res => { const keep = listeners.msg(msg, sender, res); if (keep !== true) res("no reply"); });
const CANVAS_TAB = { id: "me", origin: "https://pucpr.instructure.com" };
const items = [{ id: 1, url: "https://pucpr.instructure.com/files/1/download", filename: "PUCPR/BD/a.pdf" }, { id: 2, url: "https://pucpr.instructure.com/files/2/download", filename: "PUCPR/BD/boom.pdf" },
  { id: 3, url: "https://evil.example/x", filename: "PUCPR/BD/c.pdf" }, { id: 4, url: "https://pucpr.instructure.com/files/4/download", filename: "PUCPR/BD/d.pdf" }];
// content.js on a mocked Canvas
function fakeEl(tag) {
  const e = { tag, kids: [], style: {}, dataset: {}, className: "", textContent: "", listeners: {}, parent: null,
    append(...c) { c.forEach(x => { x.parent = this; }); this.kids.push(...c); }, appendChild(c) { this.append(c); return c; },
    prepend(c) { c.parent = this; this.kids.unshift(c); }, insertBefore(c, ref) { c.parent = this; const i = this.kids.indexOf(ref); this.kids.splice(i < 0 ? this.kids.length : i, 0, c); },
    remove() { if (this.parent) this.parent.kids.splice(this.parent.kids.indexOf(this), 1); },
    addEventListener(t, f) { this.listeners[t] = f; }, setAttribute(k, v) { this[k] = v; }, attachShadow() { this.shadow = fakeEl("#shadow"); return this.shadow; } };
  return e;
}
const all = e => [e, ...(e.shadow ? all(e.shadow) : []), ...e.kids.flatMap(all)];
const text = e => all(e).map(x => x.textContent).join(" | ");
const page = body => ({ ok: true, text: async () => "while(1);" + JSON.stringify(body), headers: { get: () => null } });
const BD = "Arquitetura de Banco de Dados (Turma 2º B) - 2026 / 2º Sem";
let plannerFails = false;
const isoIn = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const PLANNER = [
  { plannable_type: "assignment", plannable_id: 1, plannable: { title: "Lista 3" }, plannable_date: isoIn(1) + "T13:00:00Z", context_name: BD, course_id: 42, html_url: "/courses/42/assignments/1", submissions: {} },
  { plannable_type: "assignment", plannable_id: 2, plannable: { title: "Relatório" }, plannable_date: isoIn(-2) + "T13:00:00Z", context_name: BD, course_id: 42, html_url: "/courses/42/assignments/2", submissions: { missing: true } },
  { plannable_type: "assignment", plannable_id: 3, plannable: { title: "Quiz feito" }, plannable_date: isoIn(2) + "T13:00:00Z", context_name: "Inglês - 2026 / 2º Sem", course_id: 77, html_url: "/courses/77/assignments/3", submissions: { submitted: true } },
  { plannable_type: "calendar_event", plannable_id: 5, plannable: { title: "Aula" }, plannable_date: isoIn(1) + "T11:00:00Z", context_name: BD, course_id: 42, html_url: "https://evil.example/e", submissions: false },
  { plannable_type: "announcement", plannable_id: 4, plannable: { title: "Aviso" }, plannable_date: isoIn(0) + "T13:00:00Z", context_name: BD, course_id: 42, submissions: false }];
async function runContent(pathname, files, preStore, opts = {}) {
  const header = fakeEl("div"), card = fakeEl("div"), anchor = fakeEl("div"), sent = [], store = Object.assign({}, preStore);
  anchor.prepend = function (c) { c.parent = this; this.kids.unshift(c); byId[c.id] = c; };
  const menu = fakeEl("ul"), body = fakeEl("body"), winListeners = {}, alerts = [];
  const byId = { content: anchor, menu };
  card.querySelector = sel => sel.startsWith("a[") ? { getAttribute: () => "/courses/42" } : header;
  body.appendChild = function (c) { this.append(c); byId[c.id] = c; return c; };
  menu.insertBefore = function (c, ref) { c.parent = this; this.kids.push(c); byId[c.id] = c; };
  const doc = { createElement: fakeEl, body, getElementById: id => byId[id] || null, querySelector: () => null,
    querySelectorAll: sel => sel.startsWith(".ic-DashboardCard") && !card.dataset.qf ? [card] : [] };
  const chrome = { runtime: { getManifest: () => ({ version: C.EXT_LATEST }), getURL: f => "chrome-extension://me/" + f, sendMessage: async m => { sent.push(m); return m.type === "download" ? { done: m.items.map(i => i.id) } : { ok: true }; } },
    storage: { local: { get: async k => ({ [k]: store[k] }), set: async o => Object.assign(store, o) } } };
  const fetch = async url => {
    if (url === "/api/v1/users/self") return page({ id: 5 });
    if (url.startsWith("/api/v1/courses?")) return page([{ id: 42, name: BD }]);
    if (url.startsWith("/api/v1/courses/42/assignments")) return page([{ name: "Entrega PjBL - Parte 1 03/09", points_possible: 1, submission: { score: 1 } },
      { name: "Avaliação somativa RA1 10/09", points_possible: 1.25, submission: { score: 1.25 } }, { name: "Avaliação somativa RA2 22/10", points_possible: 3, submission: { score: 3 } },
      { name: "Entrega PjBL - Parte 2 15/10", points_possible: 2, submission: { score: 2 } }]);
    if (url.startsWith("/api/v1/announcements")) return page([{ context_code: "course_42", title: "Prova adiada", posted_at: new Date().toISOString(), read_state: "unread", html_url: "https://pucpr.instructure.com/courses/42/discussion_topics/1" },
      { context_code: "course_42", title: "Bem-vindos", posted_at: "2026-08-01T12:00:00Z", read_state: "read", html_url: "https://evil.example/x" }]);
    if (url.startsWith("/api/v1/planner/items?")) return plannerFails ? { ok: false, status: 500, text: async () => "", headers: { get: () => null } } : page(PLANNER);
    if (url.startsWith("/api/v1/courses/42/files?")) return files ? page(files) : { ok: false, status: 401, text: async () => "", headers: { get: () => null } };
    if (url.startsWith("/api/v1/courses/42/modules?")) return page([{ items: [{ type: "File", content_id: 9 }, { type: "Page" }] }]);
    if (url === "/api/v1/courses/42/files/9") return page({ id: 9, display_name: "Aula 9.pdf", url: "https://pucpr.instructure.com/files/9/download?verifier=v", size: 5 });
    throw new Error("unexpected " + url);
  };
  const env = { window: { addEventListener: (t, f) => { winListeners[t] = f; } },
    location: { pathname, search: "", hash: opts.hash || "", href: "https://pucpr.instructure.com" + pathname, origin: "https://pucpr.instructure.com", hostname: "pucpr.instructure.com" } };
  env.window.top = env.window;
  const history = { replaceState: (a, b, url) => { env.location.hash = ""; } };
  const src = opts.src || read("prefs.js") + "\n" + read("collect.js") + "\n" + read("core.js") + "\n" + read("files.js") + "\n" + read("content.js");
  new Function("window", "location", "document", "chrome", "fetch", "MutationObserver", "TextEncoder", "btoa", "history", "alert", "addEventListener", src)(env.window, env.location, doc, opts.src ? undefined : chrome, fetch,
    class { observe() {} }, TextEncoder, btoa, history, m => alerts.push(m), env.window.addEventListener);
  await new Promise(r => setTimeout(r, 30));
  return { header, anchor, sent, store, menu, body, env, winListeners, alerts };
}
(async () => {
  assert.strictEqual(await ask({ type: "download", items }, { id: "me", origin: "https://evil.example" }), "no reply", "messages from other origins are ignored");
  assert.strictEqual(await ask({ type: "download", items }, { id: "other", origin: "https://pucpr.instructure.com" }), "no reply", "messages from other extensions are ignored");
  assert.deepStrictEqual(await ask({ type: "download", items }, CANVAS_TAB), { done: [1, 4] }, "bad URL skipped, a throwing download does not stop the rest");
  assert.deepStrictEqual(swSaved.map(o => o.filename), ["PUCPR/BD/a.pdf", "PUCPR/BD/d.pdf"]);
  assert(local.dl === undefined, "nothing counts as downloaded before Chrome completes it");
  await listeners.changed({ id: 100, state: { current: "complete" } }); await listeners.changed({ id: 101, state: { current: "interrupted" } });
  assert.deepStrictEqual(local.dl, [1], "completed file remembered; interrupted one stays new"); assert.deepStrictEqual(session.pending, {});
  const tomorrow = new Date(Date.now() + 864e5), iso = tomorrow.getFullYear() + "-" + String(tomorrow.getMonth() + 1).padStart(2, "0") + "-" + String(tomorrow.getDate()).padStart(2, "0");
  assert.deepStrictEqual(await ask({ type: "next", date: iso, label: "Prova" }, CANVAS_TAB), { ok: true }); assert.strictEqual(local.badge, "1d", "icon shows days to the exam"); ok();

  const dash = await runContent("/", null);
  assert.match(text(dash.header), /precisa|garantido|faltam notas|recuperação/, "dashboard card gets a status pill");
  assert(dash.sent.some(m => m.type === "next"), "icon number sent"); assert(dash.store.cache && dash.store.cache.ids.length === 1, "export cached"); ok();

  const course = await runContent("/courses/42", [{ id: 1, display_name: "Aula 1.pdf", url: "/files/1/download?verifier=a", size: 5 },
    { id: 2, display_name: "virus.exe", url: "/files/2/download", size: 5 }, { id: 3, display_name: "Gabarito.pdf", url: "/files/3/download", locked_for_user: true, size: 5 }]);
  const host = course.anchor.kids[0];
  assert(host && host.id === "qf-panel" && host.shadow, "course panel in a shadow root");
  assert.match(text(host), /Campus\+/); assert.match(text(host), /quanto falta/); assert.match(text(host), /RA2 · TDE|RA3/, "next assessments of this course listed");
  const btn = all(host).find(e => e.textContent === "Baixar arquivos da matéria");
  await btn.listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert.match(text(host), /1 arquivo, 1 novo/, "blocked and locked files left out");
  const newBtn = all(host).find(e => /^Baixar 1 novo$/.test(e.textContent));
  await newBtn.listeners.click(); await new Promise(r => setTimeout(r, 20));
  const dl = course.sent.find(m => m.type === "download");
  assert.deepStrictEqual(dl.items, [{ id: 1, url: "https://pucpr.instructure.com/files/1/download?verifier=a", filename: "PUCPR/Arquitetura de Banco de Dados/Slides/Aula 1.pdf" }]);
  assert.strictEqual(course.store.cache.user, 5, "cache tagged with the Canvas user"); ok();

  const hidden = await runContent("/courses/42/modules", null);   // Files tab hidden: module files
  const b2 = all(hidden.anchor).find(e => e.textContent === "Baixar arquivos da matéria");
  await b2.listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert.match(text(hidden.anchor), /1 arquivo, 1 novo/, "falls back to files linked in modules"); ok();

  const stale = { v: C.EXT_LATEST, user: 99, at: Date.now(), data: { v: 1, courses: [] }, ids: [] };
  const other = await runContent("/", null, { cache: stale });
  assert.strictEqual(other.store.cache.user, 5, "another user's cached grades are not reused"); assert.match(text(other.header), /precisa|garantido|faltam|recuperação/); ok();

  // reminders: 1 day and 1 hour before a timed deadline, 19:00 the day before and 07:00 on the day for a date-only exam
  const due = new Date(Date.now() + 3 * 864e5).toISOString();
  assert.deepStrictEqual(await ask({ type: "remind", items: [{ key: "assignment:1", title: "Entrega: Lista", course: "BD", due, url: "https://pucpr.instructure.com/courses/42/assignments/1" },
    { key: "qf:x", title: "Prova: P1", course: "BD", due: null, date: isoIn(3), url: "https://evil.example/x" }, { key: "old", title: "Velha", due: "2020-01-01T10:00:00Z" }, null] }, CANVAS_TAB), { ok: true });
  const names = Object.keys(alarms).filter(k => k.startsWith("r|")).sort();
  assert.strictEqual(names.length, 4, "two reminders each, none for a past deadline");
  assert(names.includes("r|assignment:1|" + (Date.parse(due) - 36e5)) && names.includes("r|assignment:1|" + (Date.parse(due) - 864e5)), "1 hour and 1 day before");
  const [y, mo, d] = isoIn(3).split("-").map(Number);
  assert(names.includes("r|qf:x|" + new Date(y, mo - 1, d - 1, 19).getTime()) && names.includes("r|qf:x|" + new Date(y, mo - 1, d, 7).getTime()), "date-only exam: 19:00 before, 07:00 on the day");
  assert.strictEqual(local.reminders[names.find(k => k.startsWith("r|qf:x"))].url, "https://pucpr.instructure.com/", "a non-Canvas link is never opened");
  const hour = "r|assignment:1|" + (Date.parse(due) - 36e5);
  const day = "r|assignment:1|" + (Date.parse(due) - 864e5);
  await listeners.alarm({ name: day, scheduledTime: Date.now() - 3 * 36e5 }); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(notes.length, 0, "a reminder delivered hours late (computer asleep) is dropped");
  await listeners.alarm({ name: hour, scheduledTime: Date.now() }); await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual([notes[0].title, notes[0].message], ["Entrega: Lista", "BD · em 1 hora"], "notification text");
  await ask({ type: "remind", items: [] }, CANVAS_TAB);   // the list is rebuilt before the click
  await listeners.click(hour); await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(tabs, ["https://pucpr.instructure.com/courses/42/assignments/1"], "clicking opens the assignment, even after a rebuild");
  local.shown[hour] = "https://evil.example/"; await listeners.click(hour); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(tabs.length, 1, "never opens a non-Canvas link");
  await ask({ type: "remind", items: [{ key: "assignment:1", title: "Entrega: Lista", course: "BD", due, url: "https://pucpr.instructure.com/courses/42/assignments/1" }] }, CANVAS_TAB);
  local.prefs = { remind: false }; await listeners.alarm({ name: hour, scheduledTime: Date.now() }); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(notes.length, 1, "reminders off: no notification");
  listeners.storage({ prefs: { newValue: { remind: false } } }, "local"); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(Object.keys(alarms).filter(k => k.startsWith("r|")).length, 0, "turning reminders off drops the pending ones"); ok();

  // dashboard: the week (planner + our exams) and the announcements
  const dash2 = await runContent("/", null), wk = dash2.anchor.kids.find(k => k.id === "cp-dash");
  assert(wk && wk.className === "cp-host", "dashboard panel, kept as is by the dark theme");
  const wt = text(wk);
  assert.match(wt, /Esta semana/); assert.match(wt, /Lista 3/); assert.match(wt, /Amanhã/, "the week grouped by day");
  assert.match(wt, /Relatório \| [^|]*\| atrasada/, "missing deadline of the last days shown as late"); assert.match(wt, /1 atrasada/);
  assert.match(wt, /Quiz feito \| Inglês \| entregue/, "handed-in work marked, other courses by their short name");
  assert(!/\| Aviso \|/.test(wt), "planner announcements stay out of the week");
  assert.match(wt, /Avisos \| 1 não lido/); assert.match(wt, /Prova adiada/);
  const evil = all(wk).find(e => e.textContent === "Bem-vindos");
  assert(evil && evil.tag === "span" && !evil.href, "an announcement link off Canvas is not a link");
  const aula = all(wk).find(e => e.textContent === "Aula");
  assert(aula && aula.tag === "span" && !aula.href, "a planner link off Canvas is not a link");
  assert.match(wt, /1 pela frente|1 atrasada/);
  assert.strictEqual(all(wk).find(e => e.textContent === "Lista 3").href, "https://pucpr.instructure.com/courses/42/assignments/1");
  const rem = dash2.sent.find(m => m.type === "remind");
  assert.deepStrictEqual(rem.items.map(i => i.key).filter(k => !k.startsWith("qf:")), ["assignment:1"], "reminders: only what is still to hand in, from today on");
  assert(rem.items.filter(i => i.key.startsWith("qf:")).every(i => i.due === null && i.date >= isoIn(0) && i.date <= isoIn(14) && /^Prova: /.test(i.title)), "our exams: by date, next 14 days");
  assert.strictEqual(rem.items[0].title, "Entrega: Lista 3"); ok();

  // every module off: nothing on the page, and the reminders cleared
  const off = await runContent("/", null, { prefs: { week: false, news: false, grades: false, remind: false } });
  assert.strictEqual(off.anchor.kids.length, 0, "no dashboard panel"); assert.strictEqual(text(off.header), "", "no card pill");
  assert.deepStrictEqual(off.sent.find(m => m.type === "remind").items, [], "reminders off: the list sent is empty");
  const nofiles = await runContent("/courses/42", [], { prefs: { files: false } });
  assert(!all(nofiles.anchor).some(e => e.textContent === "Baixar arquivos da matéria"), "files off: no download button");
  assert.match(text(nofiles.anchor), /quanto falta/, "grades still shown");
  plannerFails = true;
  const noPlan = await runContent("/", null); plannerFails = false;
  assert.doesNotMatch(text(noPlan.anchor), /Esta semana/, "planner down: no week");
  assert(!noPlan.sent.some(m => m.type === "remind"), "planner down: the reminders already set are kept"); assert.match(text(noPlan.anchor), /Prova adiada/, "announcements still shown"); ok();

  // theme.js: class on <html> from the setting, live when the popup changes it
  const theme = (pref, systemDark) => {
    const cls = new Set(), listen = {}, doc = { createElement: () => ({}), head: { appendChild() {} }, documentElement: { classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c) } } };
    const chrome = { storage: { local: { get: async () => ({ prefs: { theme: pref } }) }, onChanged: { addListener: f => { listen.change = f; } } } };
    new Function("document", "chrome", "matchMedia", read("prefs.js") + "\n" + read("theme.js"))(doc, chrome, () => ({ matches: systemDark, addEventListener() {} }));
    return { cls, listen };
  };
  const th = theme("dark", false); await new Promise(r => setTimeout(r, 5));
  assert(th.cls.has("cp-dark"), "dark theme"); th.listen.change({ prefs: { newValue: { theme: "off" } } }, "local"); assert(!th.cls.has("cp-dark"), "turned off live");
  const auto = theme("auto", true), light = theme(undefined, true); await new Promise(r => setTimeout(r, 5));
  assert(auto.cls.has("cp-dark") && !light.cls.has("cp-dark"), "auto follows the system; default is the Canvas light theme"); ok();

  // the Campus+ page: a left-menu item, and the calculator over Canvas on #campus
  const camp = await runContent("/", null);
  const item = camp.menu.kids.find(k => k.id === "cp-nav");
  assert(item && all(item).some(e => e.href === "#campus") && /Campus\+/.test(text(item)), "Campus+ item in the Canvas left menu");
  assert(all(camp.anchor).some(e => e.href === "#campus"), "the dashboard panel opens the Campus+ page");
  assert(!camp.body.kids.some(k => k.id === "cp-app"), "closed until asked");
  camp.env.location.hash = "#campus"; camp.winListeners.hashchange();
  const page1 = camp.body.kids.find(k => k.id === "cp-app"), frame = page1 && all(page1).find(e => e.tag === "iframe");
  assert(frame && frame.src === "chrome-extension://me/app.html", "#campus shows the extension's calculator page");
  await all(page1).find(e => e.textContent === "Fechar").listeners.click();
  assert(!camp.body.kids.some(k => k.id === "cp-app") && camp.env.location.hash === "", "Fechar closes it and clears the address");
  const direct = await runContent("/courses/42", [], {}, { hash: "#campus" });
  assert(direct.body.kids.some(k => k.id === "cp-app"), "a link straight to #campus opens it");
  assert(all(direct.anchor).some(e => e.textContent === "Abrir no Campus+"), "course panel opens the Campus+ page"); ok();

  // the bookmarklet on the site: the extension's page scripts, bundled with an in-memory chrome stand-in
  const lit = fs.readFileSync(path.join(root, "index.html"), "utf8").match(/\/\*CP-BM\*\/("(?:[^"\\]|\\.)*")\/\*CP-BM\*\//);
  assert(lit, "bookmarklet source on index.html"); const bm = JSON.parse(lit[1]);
  let at = 0; for (const f of ["prefs.js", "collect.js", "core.js", "files.js", "content.js"]) { const i = bm.indexOf(read(f), at); assert(i > at, f + " bundled as is, in order: run scripts/sync-bookmarklet"); at = i; }
  new Function(bm);   // valid code
  const bmDash = await runContent("/", null, {}, { src: bm });
  assert.match(text(bmDash.anchor), /Esta semana/); assert.match(text(bmDash.anchor), /Prova adiada/);
  assert(!all(bmDash.anchor).some(e => e.href === "#campus") && !bmDash.menu.kids.length, "no Campus+ page without the extension");
  const bmCourse = await runContent("/courses/42", [], {}, { src: bm });
  assert.match(text(bmCourse.anchor), /quanto falta/);
  assert(!all(bmCourse.anchor).some(e => /^Baixar|^Abrir no/.test(e.textContent)), "no downloads and no calculator page in the bookmarklet");
  const bmOther = await runContent("/profile", null, {}, { src: bm });
  assert.strictEqual(bmOther.alerts.length, 1, "elsewhere it asks for the dashboard or a course"); ok();

  const none = await runContent("/courses/42/quizzes", null);
  assert.strictEqual(none.anchor.kids.length, 0, "no panel on other course pages"); ok();
  console.log("inside canvas ok: core copy, " + n + " groups (routing, safe names, download guard and completion, badge, dashboard pill, course panel, files download, per-user cache, modules fallback, reminders, week and announcements, modules off, theme, Campus+ page, bookmarklet)");
})().catch(e => { console.error(e); process.exit(1); });
