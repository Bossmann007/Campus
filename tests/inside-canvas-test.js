// Extension inside Canvas: core.js is app.html's core, file routing, the service worker's download guard, and content.js
// run against a mocked Canvas (dashboard pill, course panel, files download through the service worker).
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dir = process.env.EXT_DIR || path.join(root, "extension");   // EXT_DIR: the packaged (compacted) copy
const read = f => fs.readFileSync(path.join(dir, f), "utf8");
let n = 0; const ok = s => { n++; };
const f1 = x => x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), up1 = x => f1(Math.ceil(x * 10 - 1e-9) / 10);

// core.js is a copy of app.html's core block
const core = fs.readFileSync(path.join(root, "app.html"), "utf8").match(/<script id="core">([\s\S]*?)<\/script>/)[1].replace(/^\n+|\n+$/g, "");
if (!process.env.EXT_DIR) assert.strictEqual(read("core.js").split("\n").slice(1).join("\n").replace(/\n+$/, ""), core, "extension/core.js is stale: run scripts/sync-ext-core"); ok();
assert(!["app.html", "app-ui.js", "app-boot.js"].some(f => fs.existsSync(path.join(dir, f))), "no separate calculator page in the extension: it lives in Canvas");
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
for (const x of ["a.hta", "a.wsf", "a.vbe", "a.cpl", "a.msc", "a.pif", "a.iso", "a.img", "a.vhd", "a.docm", "a.xlsm", "a.pptm", "a.wsh", "a.jar", "a.ps1", "a.lnk", "a.scr", "a.vbs"]) assert.strictEqual(F.safeName(x), null, x + " blocked");
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
const sw = new Function("chrome", "importScripts", read("prefs.js") + "\n" + read("background.js") + "\nreturn { okDownload, nextMonday8, summary, focusDone, centroCourse, centroAll, slimCentro };")(chromeSW, f => imported.push(f));
assert.deepStrictEqual(imported, ["prefs.js"]);
assert(sw.okDownload({ url: "https://pucpr.instructure.com/files/1/download?verifier=x", filename: "PUCPR/BD/Slides/a.pdf" }));
const cpFolder = new Function(read("prefs.js") + "\nreturn cpFolder;")();
assert.strictEqual(cpFolder("Faculdade/2026-2"), "Faculdade/2026-2"); assert.strictEqual(cpFolder("../etc"), "etc"); assert.strictEqual(cpFolder("a/b/c/d"), "PUCPR", "more than 3 levels: the default");
assert.strictEqual(cpFolder('x<>:"|?*y'), "xy"); assert.strictEqual(cpFolder(""), "PUCPR"); assert.strictEqual(cpFolder("nul/Aulas."), "nul_/Aulas", "Windows-reserved names and trailing dots fixed");
assert(sw.okDownload({ url: "https://pucpr.instructure.com/files/1/download", filename: "Faculdade/BD/a.pdf" }, "Faculdade") && !sw.okDownload({ url: "https://pucpr.instructure.com/files/1/download", filename: "PUCPR/BD/a.pdf" }, "Faculdade"), "only inside the student's folder");
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
  const e = { tag, tagName: String(tag).toUpperCase(), kids: [], style: {}, dataset: {}, className: "", textContent: "", listeners: {}, parent: null,
    append(...c) { c.forEach(x => { x.parent = this; }); this.kids.push(...c); }, appendChild(c) { this.append(c); return c; },
    click() { this.clicked = true; },
    replaceChildren(...c) { this.kids.forEach(k => { k.parent = null; }); this.kids = []; this.append(...c); },
    prepend(c) { c.parent = this; this.kids.unshift(c); }, insertBefore(c, ref) { c.parent = this; const i = this.kids.indexOf(ref); this.kids.splice(i < 0 ? this.kids.length : i, 0, c); },
    remove() { if (this.parent) this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; this.removed = true; },
    addEventListener(t, f) { this.listeners[t] = f; }, setAttribute(k, v) { this[k] = v; }, attachShadow() { this.shadow = fakeEl("#shadow"); return this.shadow; } };
  return e;
}
const colOf = e => e.parent && e.parent.className === "evw" ? e.parent.parent : e.parent;   // timeline chips sit in a wrapper with their tick button
const all = e => [e, ...(e.shadow ? all(e.shadow) : []), ...e.kids.flatMap(all)];
const text = e => all(e).map(x => x.textContent).join(" | ");
const page = body => ({ ok: true, text: async () => "while(1);" + JSON.stringify(body), headers: { get: () => null } });
const BD = "Arquitetura de Banco de Dados (Turma 2º B) - 2026 / 2º Sem";
let plannerFails = false, plannerItems = null;
const isoIn = n => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const PLANNER = [
  { plannable_type: "assignment", plannable_id: 1, plannable: { title: "Lista 3" }, plannable_date: isoIn(1) + "T13:00:00Z", context_name: BD, course_id: 71306, html_url: "/courses/71306/assignments/1", submissions: {} },
  { plannable_type: "assignment", plannable_id: 2, plannable: { title: "Relatório" }, plannable_date: isoIn(-2) + "T13:00:00Z", context_name: BD, course_id: 71306, html_url: "/courses/71306/assignments/2", submissions: { missing: true } },
  { plannable_type: "assignment", plannable_id: 3, plannable: { title: "Quiz feito" }, plannable_date: isoIn(2) + "T13:00:00Z", context_name: "Inglês - 2026 / 2º Sem", course_id: 77, html_url: "/courses/77/assignments/3", submissions: { submitted: true } },
  { plannable_type: "calendar_event", plannable_id: 5, plannable: { title: "Aula" }, plannable_date: isoIn(1) + "T11:00:00Z", context_name: BD, course_id: 71306, html_url: "https://evil.example/e", submissions: false },
  { plannable_type: "announcement", plannable_id: 4, plannable: { title: "Aviso" }, plannable_date: isoIn(0) + "T13:00:00Z", context_name: BD, course_id: 71306, submissions: false }];
async function runContent(pathname, files, preStore, opts = {}) {
  const header = fakeEl("div"), card = fakeEl("div"), anchor = fakeEl("div"), sent = [], store = Object.assign({}, preStore);
  if (!opts.askTurma) store.prefs = Object.assign({ turma: "Ciência da Computação, manhã" }, store.prefs);   // the student confirmed the turma (its own tests below)
  anchor.prepend = function (c) { c.parent = this; this.kids.unshift(c); byId[c.id] = c; };
  const menu = fakeEl("ul"), body = fakeEl("body"), winListeners = {}, alerts = [];
  const byId = { content: anchor, menu };
  if (opts.classic) byId.DashboardCard_Container = { id: "DashboardCard_Container" };
  if (opts.tray) byId["nav-tray-portal"] = opts.tray;
  if (opts.mods) byId.context_modules = opts.mods;
  if (opts.nav) { byId["section-tabs"] = opts.nav; opts.nav.appendChild = function (c) { this.append(c); byId[c.id] = c; return c; }; }
  card.querySelector = sel => sel.startsWith("a[") ? { getAttribute: () => "/courses/" + (opts.courseId || 71306) } : header;
  body.appendChild = function (c) { this.append(c); byId[c.id] = c; return c; };
  menu.insertBefore = function (c, ref) { c.parent = this; this.kids.push(c); byId[c.id] = c; };
  const gcard = fakeEl("div"), gname = fakeEl("span"), ggrade = fakeEl("span"); gname.textContent = "Arquitetura de Banco de Dados"; ggrade.textContent = "92%";
  gcard.append(gname, ggrade); gcard.getAttribute = k => k === "data-testid" ? "course-grade-card-" + (opts.courseId || 71306) : null;
  Object.defineProperty(gname, "parentNode", { get() { return this.parent; } }); Object.defineProperty(gname, "nextSibling", { get() { return this.parent.kids[this.parent.kids.indexOf(this) + 1] || null; } });
  gcard.querySelector = sel => sel === "[data-cp-grade]" ? all(gcard).find(e => e["data-cp-grade"]) || null : /-name"\]$/.test(sel) ? gname : null;
  const tabContent = fakeEl("div"), cols = fakeEl("div"); if (opts.widgetCols || opts.classic) { tabContent.append(cols); anchor.append(tabContent); }
  tabContent.insertBefore = function (c, ref) { if (c.parent) c.parent.kids.splice(c.parent.kids.indexOf(c), 1); c.parent = this; const i = this.kids.indexOf(ref); this.kids.splice(i < 0 ? this.kids.length : i, 0, c); };
  Object.defineProperty(cols, "parentNode", { get() { return this.parent; } }); Object.defineProperty(cols, "previousSibling", { get() { return null; } });
  const doc = { createElement: fakeEl, body, scripts: opts.scripts, documentElement: opts.tall ? { scrollHeight: opts.tall } : undefined, getElementById: id => byId[id] && !byId[id].removed ? byId[id] : null,
    querySelector: sel => sel === ".ic-Dashboard-header__layout" ? (opts.header || null) : (opts.widgetCols && sel === '[data-testid="widget-columns"]') || (opts.classic && sel === "#DashboardCard_Container") ? cols : null,
    querySelectorAll: sel => sel === "#my_courses_table tbody tr" ? (opts.rows || []) : sel === '[data-testid^="course-grade-card-"]' ? (opts.gradeCard ? [gcard] : []) : sel === "[data-cp-grade]" ? all(gcard).filter(e => e["data-cp-grade"]) : sel === ".ic-DashboardCard[data-qf]" ? (card.dataset.qf ? [card] : []) : sel.startsWith(".ic-DashboardCard") && !card.dataset.qf ? [card] : [] };
  const chrome = { runtime: { getManifest: () => ({ version: C.EXT_LATEST }), getURL: f => "chrome-extension://me/" + f, sendMessage: async m => { sent.push(m); return m.type === "download" ? { done: m.items.map(i => i.id) } : { ok: true }; } },
    storage: { local: { get: async k => Object.fromEntries([].concat(k).map(x => [x, store[x]])), set: async o => Object.assign(store, o), remove: async k => { [].concat(k).forEach(x => delete store[x]); } } } };
  const cid = opts.courseId || 71306, fetches = [];
  const fetch = async url => {
    fetches.push(url);
    if (opts.slow && url !== "/api/v1/users/self") await new Promise(r => setTimeout(r, opts.slow));
    if (opts.denied) return { ok: false, status: 401, text: async () => "", headers: { get: () => null } };
    if (url === "/api/v1/users/self") return page({ id: opts.selfId || 5 });
    if (url.startsWith("/api/v1/courses?") && opts.failCourses) return { ok: false, status: 500, text: async () => "", headers: { get: () => null } };
    if (url.startsWith("/api/v1/courses?")) return page([{ id: cid, name: opts.courseName || BD }].concat(opts.more || []));
    if (url.startsWith("/api/v1/courses/" + cid + "/assignments")) return page([{ name: "Entrega PjBL - Parte 1 03/09", points_possible: 1, html_url: "/courses/71306/assignments/11", submission: { score: 1 } },
      { name: "Avaliação somativa RA1 10/09", points_possible: 1.25, submission: { score: 1.25 } }, { name: "Avaliação somativa RA2 22/10", points_possible: 3, submission: { score: 3 } },
      { name: "Entrega PjBL - Parte 2 15/10", points_possible: 2, submission: { score: 2 } }]);
    if ((opts.more || []).some(c => url.startsWith("/api/v1/courses/" + c.id + "/assignments"))) return page([]);
    if (url.startsWith("/api/v1/announcements")) return page([{ context_code: "course_" + cid, title: "Prova adiada", posted_at: new Date().toISOString(), read_state: "unread", html_url: "https://pucpr.instructure.com/courses/71306/discussion_topics/1" },
      { context_code: "course_" + cid, title: "Bem-vindos", posted_at: "2026-08-01T12:00:00Z", read_state: "read", html_url: "https://evil.example/x" }]);
    if (url.startsWith("/api/v1/courses/" + cid + "/users?enrollment_type[]=teacher")) return page([{ id: 7, name: "Prof. Ana Lima", avatar_url: "https://pucpr.instructure.com/images/thumbnails/7/ana.png" }]);
    if (url.includes("/api/v1/conversations?")) return opts.inboxFails ? { ok: false, status: 403, text: async () => "", headers: { get: () => null } }
      : Object.assign(page(opts.inbox || []), { headers: { get: h => h === "Link" ? '<https://pucpr.instructure.com/api/v1/conversations?scope=unread&page=2>; rel="next"' : null } });
    if (url.startsWith("/api/v1/planner/items?")) return plannerFails ? { ok: false, status: 500, text: async () => "", headers: { get: () => null } } : page(plannerItems || PLANNER);
    if (url.startsWith("/api/v1/courses/71306/files?")) return files ? page(files) : { ok: false, status: 401, text: async () => "", headers: { get: () => null } };
    if (opts.modules && url.startsWith("/api/v1/courses/71306/modules?")) return page(opts.modules);
    if (url.startsWith("/api/v1/courses/71306/modules?")) return page([{ items: [{ type: "File", content_id: 9 }, { type: "Page" }] }]);
    if (url === "/api/v1/courses/71306/files/9") return page({ id: 9, display_name: "Aula 9.pdf", url: "https://pucpr.instructure.com/files/9/download?verifier=v", size: 5 });
    throw new Error("unexpected " + url);
  };
  const env = { window: { addEventListener: (t, f) => { winListeners[t] = f; } },
    location: { pathname, search: "", hash: opts.hash || "", href: "https://pucpr.instructure.com" + pathname, origin: "https://pucpr.instructure.com", hostname: "pucpr.instructure.com", assign(u) { this.assigned = u; } } };
  env.window.top = env.window;
  if (opts.tall) Object.assign(env.window, { innerHeight: 800, scrollTo(o) { this.scrolled = o; } });
  const history = { replaceState: (a, b, url) => { env.location.hash = ""; } };
  const src = opts.src || read("prefs.js") + "\n" + read("collect.js") + "\n" + read("core.js") + "\n" + read("files.js") + "\n" + read("content.js");
  new Function("window", "location", "document", "chrome", "fetch", "MutationObserver", "TextEncoder", "btoa", "history", "alert", "addEventListener", "Date", src)(env.window, env.location, doc, opts.src ? undefined : chrome, fetch,
    class { observe() {} disconnect() {} }, TextEncoder, btoa, history, m => alerts.push(m), env.window.addEventListener, opts.Date || Date);
  await new Promise(r => setTimeout(r, 30));
  return { header, anchor, sent, store, menu, body, env, winListeners, alerts, fetches, cols, gcard };
}
(async () => {
{ // Centro de Notas: the tab, the launch, PUCPR's tool only, its page data slimmed (no classmates, no student name)
  const T = "https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io", seen = [];
  const curso = { estudantes: [{ nome_estudante: "Colega" }], grupos: [{ id_grupo: 1, nome_grupo: "RA1", grupo_colunas: [{ coluna: { id_coluna: 5, nome_coluna: "Prova", tipo_coluna: "padrao", atividade: { pontos_possiveis: 10 }, notas: [{ nota: "8,00", id_estudante: 9 }] } }] }],
    colunas: [{ id_coluna: 9, nome_coluna: "Nota Final", tipo_coluna: "final", tipo_calculo: "media_ponderada", notas: [], colunas_associadas_pai: [{ id_coluna: 5, pivot: { peso_coluna_filho: 100 } }] }] };
  const res = (body, ok = true) => ({ ok, status: ok ? 200 : 500, text: async () => typeof body === "string" ? body : JSON.stringify(body) });
  const fake = (action = T + "/lti") => async (u, o) => { seen.push((o && o.method || "GET") + " " + u.replace(T, "T").replace("https://pucpr.instructure.com", "C"));
    if (/\/tabs$/.test(u)) return res([{ label: "Centro de Notas", type: "external", html_url: "/courses/7/external_tools/2157" }]);
    if (/sessionless_launch\?id=2157$/.test(u)) return res({ url: "https://pucpr.instructure.com/courses/7/external_tools/2157?launch=1" });
    if (/launch=1/.test(u)) return res('<form action="' + action + '" method="post"><input name="oauth_signature" value="a&amp;b"><input type="hidden" name="custom_canvas_course_id" value="7"></form>');
    if (u === T + "/lti") return res('<div id="app" data-page="{&quot;component&quot;:&quot;UserLoading&quot;,&quot;version&quot;:&quot;v9&quot;}"></div>');
    if (u === T + "/lti/finalize") return res({ status: "success", redirect_url: "/curso/7" });
    if (u === T + "/curso/7") return res(o && o.headers && o.headers["X-Inertia"] === "true" && o.headers["X-Inertia-Version"] === "v9" ? { props: { curso } } : {}, true);
    return res("", false); };
  const got = await sw.centroCourse("7", fake());
  assert.deepStrictEqual(seen, ["GET C/api/v1/courses/7/tabs", "GET C/api/v1/courses/7/external_tools/sessionless_launch?id=2157", "GET C/courses/7/external_tools/2157?launch=1", "POST T/lti", "GET T/lti/finalize", "GET T/curso/7"], "the launch, step by step");
  assert(got && got.colunas[0].tipo_calculo === "media_ponderada" && got.grupos[0].grupo_colunas[0].coluna.notas[0].nota === "8,00" && !/Colega|estudante/.test(JSON.stringify(got)), "kept: the formula and the student's grade; dropped: classmates and ids");
  assert.strictEqual(C.centro(got, 7).now, 8, "the engine reads what the worker keeps");
  seen.length = 0; assert.strictEqual(await sw.centroCourse("7", fake("https://evil.example/lti")), null, "a form pointing anywhere else is never sent");
  assert(!seen.some(x => /evil/.test(x)), "nothing posted to another host");
  const all = await sw.centroAll(5, ["7"], fake()); assert(local.centro && local.centro.user === 5 && local.centro.courses["7"] && all["7"], "stored per Canvas user");
  { // only the validated form's inputs go to the tool (never Canvas's own token elsewhere on the page); a failure keeps the last read
    let posted = null; const page = '<input name="authenticity_token" value="CANVAS-CSRF"><form action="' + T + '/lti" method="post"><input data-value="x" name="a" value="1"></form>';
    const f2 = async (u, o) => /launch=1/.test(u) ? res(page) : u === T + "/lti" ? (posted = String(o.body), res('<div data-page="{}"></div>')) : fake()(u, o);
    await sw.centroCourse("7", f2);
    assert(posted === "a=1", "posted only the form's own fields: " + posted);
    const broken = async u => { throw new Error("offline " + u); };
    await sw.centroAll(5, ["7"], broken); assert(local.centro.courses["7"] && local.centro.courses["7"].colunas.length, "a failed read keeps the course's last Centro de Notas");
  }
  ok();
}
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

  const course = await runContent("/courses/71306", [{ id: 1, display_name: "Aula 1.pdf", url: "/files/1/download?verifier=a", size: 5 },
    { id: 2, display_name: "virus.exe", url: "/files/2/download", size: 5 }, { id: 3, display_name: "Gabarito.pdf", url: "/files/3/download", locked_for_user: true, size: 5 }]);
  const host = course.anchor.kids[0];
  assert(host && host.id === "qf-panel" && host.shadow, "course panel in a shadow root");
  assert.match(text(host), /Arquitetura de Banco de Dados/, "the course hero names the course");
  const abd = C.COURSES.find(c => c.id === "abd"), st42 = C.courseState(abd, C.fromCanvas(course.store.cache.data).grades, isoIn(0), 7);
  assert.match(text(host), new RegExp((st42.earned >= 10 ? "10" : f1(Math.floor(st42.earned * 10) / 10)) + " garantidos de 10"), "ring card: points earned, from the core");
  const irows = all(host).filter(e => e.className === "ir");
  assert.deepStrictEqual(irows.map(r => r.kids[0].textContent), abd.items.map(it => it.name), "one row per assessment, in order");
  assert(Math.abs(irows.reduce((t, r) => t + parseInt(r.kids[1].textContent, 10), 0) - 100) <= abd.items.length, "weights add up to 100%");
  const pj1 = irows[abd.items.findIndex(it => it.id === "pj1")];
  assert(pj1.kids[2].className === "g" && /^1,00/.test(pj1.kids[2].textContent), "a graded item shows its grade");
  irows.filter((r, i) => st42.future.includes(abd.items[i])).forEach(r => assert(/^g e$/.test(r.kids[2].className) && /^(precisa [\d,]+|já garantido|não dá|—)/.test(r.kids[2].textContent), "an open item shows what it needs"));
  const btn = all(host).find(e => e.textContent === "Baixar arquivos da matéria");
  await btn.listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert.match(text(host), /1 arquivo, 1 novo/, "blocked and locked files left out");
  const newBtn = all(host).find(e => /^Baixar 1 novo$/.test(e.textContent));
  await newBtn.listeners.click(); await new Promise(r => setTimeout(r, 20));
  const dl = course.sent.find(m => m.type === "download");
  assert.deepStrictEqual(dl.items, [{ id: 1, url: "https://pucpr.instructure.com/files/1/download?verifier=a", filename: "PUCPR/Arquitetura de Banco de Dados/Slides/Aula 1.pdf" }]);
  assert.strictEqual(course.store.cache.user, 5, "cache tagged with the Canvas user");
  const own = await runContent("/courses/71306", [{ id: 1, display_name: "Aula 1.pdf", url: "/files/1/download?verifier=a", size: 5 }], { prefs: { dlFolder: "Faculdade/2026-2" } });
  const ownHost = own.anchor.kids.find(k => k.id === "qf-panel");
  await all(ownHost).find(e => e.textContent === "Baixar arquivos da matéria").listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert.match(text(ownHost), /vão para Downloads\/Faculdade\/2026-2/);
  await all(ownHost).find(e => /^Baixar 1 novo$/.test(e.textContent)).listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(own.sent.find(m => m.type === "download").items[0].filename, "Faculdade/2026-2/Arquitetura de Banco de Dados/Slides/Aula 1.pdf", "into the student's own folder"); ok();

  const hidden = await runContent("/courses/71306/modules", null);   // Files tab hidden: module files
  const b2 = all(hidden.anchor).find(e => e.textContent === "Baixar arquivos da matéria");
  await b2.listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert.match(text(hidden.anchor), /1 arquivo, 1 novo/, "falls back to files linked in modules"); ok();

  const stale = { v: C.EXT_LATEST, user: 99, at: Date.now(), data: { v: 1, courses: [] }, ids: [] };
  const other = await runContent("/", null, { cache: stale });
  assert.strictEqual(other.store.cache.user, 5, "another user's cached grades are not reused"); assert.match(text(other.header), /precisa|garantido|faltam|recuperação/); ok();

  // reminders: 1 day and 1 hour before a timed deadline, 19:00 the day before and 07:00 on the day for a date-only exam
  const due = new Date(Date.now() + 3 * 864e5).toISOString();
  assert.deepStrictEqual(await ask({ type: "remind", items: [{ key: "assignment:1", title: "Entrega: Lista", course: "BD", due, url: "https://pucpr.instructure.com/courses/71306/assignments/1" },
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
  assert.deepStrictEqual(tabs, ["https://pucpr.instructure.com/courses/71306/assignments/1"], "clicking opens the assignment, even after a rebuild");
  local.shown[hour] = "https://evil.example/"; await listeners.click(hour); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(tabs.length, 1, "never opens a non-Canvas link");
  await ask({ type: "remind", items: [{ key: "assignment:1", title: "Entrega: Lista", course: "BD", due, url: "https://pucpr.instructure.com/courses/71306/assignments/1" }] }, CANVAS_TAB);
  local.prefs = { remind: false }; await listeners.alarm({ name: hour, scheduledTime: Date.now() }); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(notes.length, 1, "reminders off: no notification");
  listeners.storage({ prefs: { newValue: { remind: false } } }, "local"); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(Object.keys(alarms).filter(k => k.startsWith("r|")).length, 0, "turning reminders off drops the pending ones"); ok();

  // dashboard: the next 7 days as a timeline (planner + our exams), overdue work above it, and the announcements
  const dash2 = await runContent("/", null), wk = dash2.anchor.kids.find(k => k.id === "cp-dash");
  assert(wk && wk.className === "cp-host", "dashboard panel, kept as is by the dark theme");
  const wt = text(wk), chips = all(wk).filter(e => /^ev /.test(e.className)), inGrid = re => chips.find(e => colOf(e) && colOf(e).className === "col" && re.test(e["aria-label"]));
  assert.match(wt, /Próximos 7 dias/); assert.match(wt, /1 atrasada/);
  const lista = inGrid(/^Lista 3 /);
  assert(lista && /^ev wa/.test(lista.className) && lista.tag === "a", "a deadline still to hand in: an amber chip");
  const cols = all(wk).find(e => e.className === "lanes").kids;
  assert(cols.length === 7 && cols.every(c => c.className === "col"), "one column per day");
  assert.strictEqual(cols.indexOf(colOf(lista)), 1, "only in its own day (tomorrow is the second column)");
  assert.match(text(lista), /^ \| Lista 3 \| \d\d:\d\d \|/, "chip: title, then the time"); assert.match(text(lista), /Amanhã, \d\d:\d\d · a entregar/, "tooltip: day, time and status");
  assert.strictEqual(lista.href, "https://pucpr.instructure.com/courses/71306/assignments/1");
  const late = all(wk).find(e => e.className === "late" && e.tag === "div");
  assert(late && /Relatório · \d\d\/\d\d/.test(text(late)), "missing deadline of the last days in the overdue row");
  assert(!inGrid(/Relatório/), "overdue work stays out of the grid");
  const quiz = inGrid(/^Quiz feito /);
  assert(quiz && /^ev ok/.test(quiz.className) && /✓ entregue/.test(text(quiz)) && / · Inglês · .* · entregue$/.test(quiz["aria-label"]), "handed-in work marked, other courses by their short name");
  const aula = inGrid(/^Aula /);
  assert(aula && aula.tag === "span" && !aula.href && aula.tabIndex === 0 && /^ev in/.test(aula.className), "a planner link off Canvas is not a link (still focusable, for the tooltip)");
  plannerItems = PLANNER.concat([1, 2, 3, 4, 5].map(i => ({ plannable_type: "assignment", plannable_id: 100 + i, plannable: { title: "Tarefa " + i }, plannable_date: isoIn(3) + "T1" + i + ":00:00Z",
    context_name: BD, course_id: 71306, html_url: "/courses/71306/assignments/" + (100 + i), submissions: {} })));
  const busy = await runContent("/", null); plannerItems = null;
  const busyCol = all(busy.anchor.kids.find(k => k.id === "cp-dash")).find(e => e.className === "lanes").kids[3];
  assert.deepStrictEqual(busyCol.kids.map(e => /more/.test(e.className) ? e.textContent : e.kids[0].kids[0].textContent), ["Tarefa 1", "Tarefa 2", "Tarefa 3", "+2"], "a busy day shows 3 chips and +N");
  assert.match(busyCol.kids[3]["aria-label"], /Tarefa 4.*Tarefa 5/, "+N lists the rest"); assert.strictEqual(busyCol.kids[3].tabIndex, 0);
  const wl = all(wk).find(e => e.className === "wl");
  assert.match(text(wl), /Amanhã/, "narrow fallback: the same days as a list"); assert.match(text(wl), /Quiz feito \| Inglês \|  \| entregue/);
  const wlAula = all(wl).find(e => e.textContent === "Aula");
  assert(wlAula && wlAula.tag === "span" && !wlAula.href, "the list keeps the off-Canvas check too");
  assert(!chips.some(e => /Aviso/.test(e["aria-label"])), "planner announcements stay out of the week");
  assert.match(wt, /Avisos \| 1 não lido/); assert.match(wt, /Prova adiada/);
  const evil = all(wk).find(e => e.textContent === "Bem-vindos");
  assert(evil && evil.tag === "span" && !evil.href, "an announcement link off Canvas is not a link");
  assert.strictEqual(all(wl).find(e => e.textContent === "Lista 3").href, "https://pucpr.instructure.com/courses/71306/assignments/1", "the list links to Canvas too");
  const rem = dash2.sent.find(m => m.type === "remind");
  assert.deepStrictEqual(rem.items.map(i => i.key).filter(k => !k.startsWith("qf:")), ["assignment:1"], "reminders: only what is still to hand in, from today on");
  assert(rem.items.filter(i => i.key.startsWith("qf:")).every(i => i.due === null && i.date >= isoIn(0) && i.date <= isoIn(14) && /^Prova: /.test(i.title)), "our exams: by date, next 14 days");
  assert.strictEqual(rem.items[0].title, "Entrega: Lista 3"); ok();

  // ticking work as done (only here, per Canvas user): greyed in the week, counted in the progress, no reminder; untick undoes it
  const tick = await runContent("/", null, { marks: { 9: { "assignment:1": isoIn(1) } } });
  const tickBox = () => tick.anchor.kids.find(k => k.id === "cp-dash");
  const grid = () => all(tickBox()).filter(e => /^ev /.test(e.className) && colOf(e).className === "col");
  const listaChip = () => grid().find(e => /^Lista 3 /.test(e["aria-label"]));
  assert(/^ev wa/.test(listaChip().className), "another user's ticks are not mine");
  assert.match(text(tickBox()), /1 de 3 feitas/, "progress: Canvas-handed-in work counts as done");
  assert(!all(tickBox()).some(e => e.className === "ck" && /Quiz feito|Prova/.test(e["aria-label"])), "no tick on handed-in work or exams");
  const ck = listaChip().parent.kids.find(e => e.className === "ck");
  assert(ck && ck["aria-pressed"] === "false" && /^Marcar como feito: Lista 3/.test(ck["aria-label"]));
  await ck.listeners.click({ preventDefault() {} }); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(tick.store.marks[5], { "assignment:1": isoIn(1) }, "saved under this user"); assert(tick.store.marks[9], "the other user's ticks are kept");
  assert(/^ev ok dn/.test(listaChip().className) && /✓ feito/.test(text(listaChip())) && / · feito$/.test(listaChip()["aria-label"]), "ticked: greyed, says feito");
  assert.match(text(tickBox()), /2 de 3 feitas/); assert.strictEqual(all(tickBox()).filter(e => /card week/.test(e.className)).length, 1, "the week is redrawn in place");
  assert(!tick.sent.filter(m => m.type === "remind").pop().items.some(i => i.key === "assignment:1"), "no reminder for ticked work");
  assert(/Lista 3.*feito/.test(text(all(tickBox()).find(e => e.className === "wl"))), "the narrow list says feito too");
  await listaChip().parent.kids.find(e => e.className === "ck").listeners.click({ preventDefault() {} }); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(tick.store.marks[5], {}, "untick"); assert(/^ev wa/.test(listaChip().className));
  assert(tick.sent.filter(m => m.type === "remind").pop().items.some(i => i.key === "assignment:1"), "the reminder is back");
  const lateRow = () => all(tickBox()).find(e => e.className === "late"), rel = () => all(lateRow()).find(e => /^ev /.test(e.className));
  await rel().parent.kids.find(e => e.className === "ck").listeners.click({ preventDefault() {} }); await new Promise(r => setTimeout(r, 10));
  assert(tick.store.marks[5]["assignment:2"] && !/atrasada/.test(text(all(tickBox()).find(e => e.tag === "h3"))), "overdue work can be ticked: no longer counted late");
  assert(/^ev ok dn/.test(rel().className) && /^Desmarcar/.test(rel().parent.kids[1]["aria-label"]), "it stays in the overdue row, greyed, so it can be unticked");
  await Promise.all([rel().parent.kids[1].listeners.click({ preventDefault() {} }), listaChip().parent.kids[1].listeners.click({ preventDefault() {} })]); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(tick.store.marks[5], { "assignment:1": isoIn(1) }, "two quick clicks both count");
  const kept = await runContent("/", null, { marks: { 5: { "assignment:1": isoIn(1), "assignment:99": isoIn(-40) } } });
  assert(/^ev ok dn/.test(all(kept.anchor).find(e => /^Lista 3 /.test(e["aria-label"] || "") && /^ev /.test(e.className)).className), "ticks survive a reload");
  assert(!kept.sent.find(m => m.type === "remind").items.some(i => i.key === "assignment:1"), "reminders skip ticked work from the first run"); ok();

  // Ctrl+K: the term's courses, assignments and module items; Enter opens the chosen one in Canvas
  const MODS = [{ name: "Unidade 2", items: [{ type: "File", title: "Aula 7 - JOIN.pdf", html_url: "https://pucpr.instructure.com/courses/71306/modules/items/5" },
    { type: "SubHeader", title: "Leituras", html_url: "https://pucpr.instructure.com/courses/71306/modules/items/6" }, { type: "ExternalUrl", title: "Aula externa", html_url: "https://evil.example/aula" }] }];
  const sr = await runContent("/", null, {}, { modules: MODS }), key = k => sr.winListeners.keydown(Object.assign({ key: k, preventDefault() {}, stopPropagation() {} }, k === "k" ? { ctrlKey: true } : {}));
  key("k"); await new Promise(r => setTimeout(r, 20));
  const pal = sr.body.kids.find(k => k.id === "cp-search"), q = all(pal).find(e => e.className === "pal-q"), hits = () => all(pal).filter(e => /^pal-i/.test(e.className));
  assert(pal && pal.shadow && q, "Ctrl+K opens the search");
  assert.deepStrictEqual(hits().map(h => h.kids[0].textContent), ["matéria", "campus"], "empty: the courses and the Caderno+ subjects");
  assert(sr.store.search && sr.store.search.user === 5 && sr.store.search.items.length === 2, "modules kept for this user, sub-headers dropped");
  q.value = "aula"; q.listeners.input();
  assert.deepStrictEqual(hits().map(h => text(h.kids[1])), [" | Aula 7 - JOIN.pdf | Arquitetura de Banco de Dados · Unidade 2"], "off-Canvas module links never show");
  q.value = "entrega pjbl"; q.listeners.input();
  assert.match(text(hits()[0]), /tarefa \|.*Entrega PjBL - Parte 1/, "assignments from the last reading");
  q.value = "BANCO aula"; q.listeners.input(); q.listeners.keydown({ key: "Enter", preventDefault() {} });
  assert.strictEqual(sr.env.location.assigned, "https://pucpr.instructure.com/courses/71306/modules/items/5", "Enter opens it, any case, words in any field");
  assert(!sr.body.kids.some(k => k.id === "cp-search"), "and closes the search");
  const n0 = sr.fetches.length; key("k"); await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(sr.fetches.length, n0, "modules not read again within 6 hours");
  key("k"); assert(!sr.body.kids.some(k => k.id === "cp-search"), "the shortcut again closes it");
  key("k"); const q2 = all(sr.body.kids.find(k => k.id === "cp-search")).find(e => e.className === "pal-q");
  q2.listeners.keydown({ key: "Escape", preventDefault() {} }); assert(!sr.body.kids.some(k => k.id === "cp-search"), "Esc closes it");
  const noFind = await runContent("/", null, { prefs: { search: false } });
  if (noFind.winListeners.keydown) noFind.winListeners.keydown({ key: "k", ctrlKey: true, preventDefault() {}, stopPropagation() {} });
  assert(!noFind.body.kids.some(k => k.id === "cp-search") && !all(noFind.anchor).some(e => e.className === "find"), "switched off in the popup: Ctrl+K does nothing, no button");
  const bye = await runContent("/logout", null, { search: { user: 5, at: Date.now(), items: [] }, cache: {} });
  assert(!bye.store.search && !bye.store.cache, "logging out forgets the search index too"); ok();

  // our exams in the timeline (with what each needs) and the exam-week band; a week with nothing shows a friendly line
  const fakeDate = iso => { const T = Date.parse(iso); return class extends Date { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } }; };
  plannerItems = [];
  const MORE = [{ id: 72009, name: "Programação Imperativa (Turma 2º B) - 2026 / 2º Sem" }, { id: 72011, name: "Conectividade em Sistemas Ciberfísicos (Turma 2º B) - 2026 / 2º Sem" }];
  const exams = await runContent("/", null, {}, { Date: fakeDate("2026-11-08T12:00:00-03:00"), more: MORE });
  const eb = exams.anchor.kids.find(k => k.id === "cp-dash"), ex = all(eb).filter(e => /^ev ex/.test(e.className) && colOf(e).className === "col");
  assert(ex.length >= 2, "our exams of the week are coral chips in the grid");
  assert(ex.every(e => /^(precisa [\d,]+( de [\d,]+)?|já garantido|nem com 10)$/.test(all(e).find(k => k.className === "s").textContent)), "exam chips say what each needs");
  const band = all(eb).find(e => e.className === "band");
  assert(band && band.kids[0].textContent === "semana de provas" && band.style.left === (1 / 7 * 100) + "%", "exam days close together become one band");
  assert(!all(eb).some(e => e.className === "late" && e.tag === "div"), "no overdue row when nothing is late");
  const empty = await runContent("/", null, {}, { Date: fakeDate("2030-03-10T12:00:00-03:00") }); plannerItems = null;
  const emb = empty.anchor.kids.find(k => k.id === "cp-dash");
  assert.match(text(emb), /Nada nos próximos 7 dias/, "empty week: a friendly line"); assert(!all(emb).some(e => /^tl/.test(e.className)), "and no empty grid"); ok();

  // dashboard grades: the next assessment that counts, the KPI row and the tiles, all from the shared core
  const gd = await runContent("/", null, { prefs: { native: false } }), gb = gd.anchor.kids.find(k => k.id === "cp-dash"), gr = C.fromCanvas(gd.store.cache.data).grades;
  const cvOf = id => { const h = gd.store.cache.ids.filter(x => C.CANVAS[id] && x.id === C.CANVAS[id].cid); return h.length === 1 ? String(h[0].id) : null; };
  const mine = C.COURSES.filter(c => cvOf(c.id));   // subjects paired to the student's Canvas courses by course id
  assert.deepStrictEqual(mine.map(c => c.id), ["abd"], "fixture: enrolled only in Banco de Dados");
  const sem = C.semester(mine, gr, isoIn(0), 7), nx = C.stillCounts(mine, gr, isoIn(0), 7)[0];
  const kp = all(gb).filter(e => e.className === "card kpi"), cnt = k => sem.counts[k] || 0;
  assert.deepStrictEqual(kp.map(k => k.kids[1].textContent), [f1(Math.floor(sem.mean * 10) / 10),
    sem.tight ? up1(sem.states[sem.tight.id].fraction * 10) : cnt("depende-atrasadas") ? "?" : cnt("nao-da") ? "—" : "0", sem.done + " de " + sem.items.length], "KPI numbers are the core's");
  assert.strictEqual(all(gb).filter(e => e.parent && e.parent.className === "trk").length, sem.items.length, "one tracker block per item");
  const nextCard = all(gb).find(e => /upnext/.test(e.className));
  if (nx) assert(nextCard && nextCard.href === "/courses/" + cvOf(nx.course.id) && text(nextCard).includes(nx.item.name), "next card: the soonest assessment that still counts, opens its Canvas course");
  else assert(!nextCard, "nothing left that counts: no next card");
  const tiles = all(gb).filter(e => e.className === "card tile");
  assert.deepStrictEqual(tiles.map(t => t.href), mine.map(c => "/courses/" + cvOf(c.id)), "a tile per enrolled subject, each opening its Canvas course");
  assert(tiles.every((t, i) => text(t).includes(C.SHORT[mine[i].id])), "tiles named like the calculator");
  assert(all(gb).some(e => e.className === "muted src" && e.textContent === "Pesos do Plano de Ensino 2026/2 · Ciência da Computação, manhã · não oficial, confira no Canvas"), "dashboard grades: source line");
  const noGrades = await runContent("/", null, { prefs: { grades: false } }), ng = noGrades.anchor.kids.find(k => k.id === "cp-dash");
  assert(ng && !all(ng).some(e => /kpi|tile|upnext/.test(e.className)) && /Próximos 7 dias/.test(text(ng)), "grades off: only the week and the announcements");
  const onlyGrades = await runContent("/", null, { prefs: { week: false, news: false } }), og = onlyGrades.anchor.kids.find(k => k.id === "cp-dash");
  assert(og && all(og).some(e => /kpi/.test(e.className)) && !all(og).some(e => e.tag !== "style" && /Próximos 7 dias|Avisos/.test(e.textContent)), "week and news off: the grade parts alone");
  const empty0 = { v: C.EXT_LATEST, user: 5, at: Date.now(), data: { v: 1, courses: [], announcements: [] }, ids: [], planner: null };
  const noData = await runContent("/", null, { cache: empty0 }), nd = noData.anchor.kids.find(k => k.id === "cp-dash");
  assert(nd && !all(nd).some(e => /kpi|tile|upnext/.test(e.className)), "no grade read from Canvas: no grade parts"); ok();

  // another turma (same course name, another Canvas id): no grade parts, one line saying why; the generic parts keep working
  const ot = await runContent("/", null, {}, { courseId: 42 }), ob = ot.anchor.kids.find(k => k.id === "cp-dash");
  assert(ob && !all(ob).some(e => /kpi|tile|upnext/.test(e.className)), "other turma: no grade parts");
  assert(all(ob).some(e => e.className === "muted why" && e.textContent === "O Quanto falta ainda não tem as regras da sua turma."), "other turma: the muted line");
  assert.match(text(ob), /Próximos 7 dias/); assert.match(text(ob), /Prova adiada/, "week and announcements still shown");
  assert(!all(ob).some(e => e.tag === "button" && /rascunho/i.test(e.textContent)) && !/rascunho/i.test(text(ob)), "other turma: just the note, no draft button");
  assert(!/precisa|garantido|faltam|recuperação/.test(text(ot.header)), "no pill on the dashboard cards");
  assert(!ot.sent.find(m => m.type === "remind").items.some(i => i.key.startsWith("qf:")), "no Plano exams in the reminders");
  assert(ot.sent.find(m => m.type === "remind").items.some(i => i.key === "assignment:1"), "real Canvas tasks still reminded");
  assert.strictEqual(ot.sent.find(m => m.type === "next").date, null, "no exam on the icon");
  const otc = await runContent("/courses/42", [], {}, { courseId: 42 });
  assert(!/garantidos de 10/.test(text(otc.anchor)) && all(otc.anchor).some(e => e.textContent === "Baixar arquivos da matéria"), "other turma course page: files only");
  // subjects the student is not enrolled in: no exam of theirs in the week, the reminders or the icon
  const wk1 = await runContent("/", null, {}, { Date: fakeDate("2026-11-08T12:00:00-03:00") }), wkb = wk1.anchor.kids.find(k => k.id === "cp-dash");
  assert(!all(wkb).some(e => /^ev ex/.test(e.className)), "enrolled only in BD (no BD exam this week): no exam chips of other subjects");
  assert(!wk1.sent.find(m => m.type === "remind").items.some(i => i.key.startsWith("qf:") && !i.key.startsWith("qf:abd:")), "reminders: only exams of enrolled subjects");
  const nx1 = wk1.sent.find(m => m.type === "next"), abdS3 = C.COURSES.find(c => c.id === "abd").items.find(i => i.id === "s3");
  assert(nx1.date === null || nx1.date === abdS3.date, "icon: only an exam of an enrolled subject");
  // the term ended: no grade parts, the update line; no course of the term: the announcements say so
  const old = await runContent("/", null, {}, { Date: fakeDate("2027-02-10T12:00:00-03:00") }), obx = old.anchor.kids.find(k => k.id === "cp-dash");
  assert(obx && !all(obx).some(e => /kpi|tile|upnext/.test(e.className)), "term over: no grade parts");
  assert(all(obx).some(e => e.className === "muted why" && e.textContent === "As regras de 2026/2 acabaram. Atualize o Caderno+ quando sair a versão do próximo semestre."), "term over: the update line");
  assert(!old.sent.find(m => m.type === "remind").items.some(i => i.key.startsWith("qf:")), "term over: no Plano exams reminded");
  const noTerm = await runContent("/", null, {}, { courseName: "Inglês Instrumental - 2025 / 1º Sem" }), ntb = noTerm.anchor.kids.find(k => k.id === "cp-dash");
  assert(all(ntb).some(e => e.textContent === "Nenhuma matéria de 2026/2 no seu Canvas."), "no course of the term: the announcements say so");
  assert(!all(ntb).some(e => e.textContent === "Nenhum aviso nos últimos 60 dias."), "and do not claim there were no announcements");
  // course panel: the source line; garantido explained as a reading of the grades
  const cp = await runContent("/courses/71306", [], {}), cpb = cp.anchor.kids.find(k => k.id === "qf-panel");
  assert(all(cpb).some(e => e.className === "muted src" && /^Pesos do Plano de Ensino 2026\/2 · Ciência da Computação, manhã · não oficial, confira no Canvas$/.test(e.textContent)), "course panel: source line");
  assert(all(cpb).filter(e => e.className === "big" && /garantido/.test(text(e))).every(e => e.title === C.GARANTIDO_TIP), "garantido tooltip: not official");
  assert.strictEqual(C.GARANTIDO_TIP, "Garantido pelas notas lançadas; não considera frequência nem recuperação"); ok();

  // Canvas calls per dashboard load (1 course). Before: /users/self on every page + /courses twice = 6 cold, 1 warm, 6 after 10 min.
  // Now the user is always confirmed (the id in the page, else /users/self); /courses once; one tab reads at a time.
  const reads = r => r.fetches.filter(u => !/\/(files|modules)\?|\/users\?enrollment_type/.test(u));   // what changed (hourly) and the teachers (daily) have their own tests   // "what changed" reads files and modules at most once an hour (its own test)
  const cold = await runContent("/", null);
  assert.deepStrictEqual(reads(cold).map(u => u.split("?")[0]).sort(), ["/api/v1/announcements", "/api/v1/conversations", "/api/v1/courses", "/api/v1/courses/71306/assignments", "/api/v1/planner/items", "/api/v1/users/self"], "cold: 6 calls, /courses once");
  const KEEP_P = ["plannable_type", "plannable_id", "plannable_date", "plannable", "html_url", "course_id", "context_name", "submissions", "planner_override"];
  assert(cold.store.cache.planner.length && cold.store.cache.planner.every(p => Object.keys(p).every(k => KEEP_P.includes(k)) && (!p.plannable || Object.keys(p.plannable).join() === "title")), "the stored planner keeps only what the week reads");
  const warm = await runContent("/", null, cold.store);
  assert.deepStrictEqual(reads(warm), ["/api/v1/users/self"], "warm, no user id in the page: only the user is confirmed (1 call)");
  const warmEnv = await runContent("/", null, cold.store, { scripts: [{ textContent: 'ENV = {"current_user_id":"5"}' }] });
  assert.strictEqual(reads(warmEnv).length, 0, "warm with the user id in the page: no call");
  const st10 = Object.assign({}, cold.store, { cache: Object.assign({}, cold.store.cache, { at: Date.now() - 11 * 60 * 1000 }) });
  const later = await runContent("/", null, st10);
  assert.deepStrictEqual(reads(later).map(u => u.split("?")[0]).sort(), ["/api/v1/announcements", "/api/v1/conversations", "/api/v1/courses", "/api/v1/courses/71306/assignments", "/api/v1/planner/items", "/api/v1/users/self"], "reading older than 10 min, no user id in the page: the user is confirmed before reading (6 calls)");
  const pageEnv = [{ textContent: 'ENV = {"current_user_id":"5"}' }];
  const laterEnv = await runContent("/", null, st10, { scripts: pageEnv });
  assert.strictEqual(reads(laterEnv).length, 5, "reading older than 10 min with the user id in the page: 5 calls");
  // an older reading shows at once; the new one replaces it when Canvas answers (one panel, never two)
  const oldFirst = await runContent("/", null, st10, { scripts: pageEnv, slow: 80 });
  const dashes = () => all(oldFirst.anchor).filter(e => e.id === "cp-dash");
  assert.strictEqual(dashes().length, 1, "the panel is drawn from the older reading before Canvas answers");
  assert.strictEqual(oldFirst.store.cache.at, st10.cache.at, "(Canvas has not answered yet)");
  await new Promise(r => setTimeout(r, 400));
  assert(oldFirst.store.cache.at > st10.cache.at && dashes().length === 1 && dashes()[0] !== undefined, "new reading saved and drawn in place of the old panel");
  // an update (older version in the reading): drawn at once from it, read again behind
  const upd = Object.assign({}, cold.store, { cache: Object.assign({}, cold.store.cache, { v: "3.0.0", at: Date.now() }) });
  const updRun = await runContent("/", null, upd, { scripts: pageEnv, slow: 80 });
  assert.strictEqual(all(updRun.anchor).filter(e => e.id === "cp-dash").length, 1, "after an update the panel is drawn from the last reading, not after Canvas answers");
  await new Promise(r => setTimeout(r, 400));
  assert(updRun.store.cache.v === C.EXT_LATEST && reads(updRun).length === 5, "and the reading is redone in the background");
  // a failed reading (Canvas throttled or down) keeps the lock a minute: the next page shows the last reading, no new burst
  const failed = await runContent("/", null, st10, { scripts: pageEnv, failCourses: true }); await new Promise(r => setTimeout(r, 50));
  assert(failed.store.refreshing > 0, "a failed reading leaves the lock");
  const afterFail = await runContent("/", null, failed.store, { scripts: pageEnv });
  assert.strictEqual(reads(afterFail).length, 0, "the next page within a minute does not read everything again");
  const lockedSlow = await runContent("/", null, {}, { slow: 40 });
  assert.strictEqual(all(lockedSlow.anchor).filter(e => e.id === "cp-dash").length, 0, "no reading at all: waits for Canvas");
  await new Promise(r => setTimeout(r, 250));
  assert.strictEqual(all(lockedSlow.anchor).filter(e => e.id === "cp-dash").length, 1, "and draws once it lands");
  // new grades: compared with the last reading of the same user; saved for the dashboard and handed to the service worker
  const oldData = JSON.parse(JSON.stringify(st10.cache)); oldData.data.courses[0].assignments.find(x => /RA2/.test(x.name)).score = null;
  const ngr = await runContent("/", null, Object.assign({}, st10, { cache: oldData }), { scripts: pageEnv });
  await new Promise(r => setTimeout(r, 60));
  const gmsg1 = ngr.sent.find(m => m.type === "grades");
  assert(gmsg1 && gmsg1.items.length === 1 && /RA2/.test(gmsg1.items[0].name) && gmsg1.items[0].score === 3 && gmsg1.items[0].course === "Arquitetura de Banco de Dados", "one new grade found and sent");
  assert.strictEqual(ngr.store.recent[5].length, 1, "kept for this user");
  const ngBox = ngr.anchor.kids.find(k => k.id === "cp-dash");
  assert.match(text(ngBox), /Notas novas \| 1 nova/); assert.match(text(ngBox), /Avaliação somativa RA2 22\/10 \| Arquitetura de Banco de Dados · hoje \| 3 \|  de 3/);
  const firstRead = await runContent("/", null, {}, { scripts: pageEnv });
  assert(!firstRead.sent.some(m => m.type === "grades") && !firstRead.store.recent, "the first reading only sets the baseline");
  const otherUser = await runContent("/", null, Object.assign({}, st10, { cache: Object.assign({}, oldData, { user: 9 }) }), { scripts: pageEnv });
  await new Promise(r => setTimeout(r, 60));
  assert(!otherUser.sent.some(m => m.type === "grades"), "another user's reading is not a baseline");
  const quietG = await runContent("/", null, Object.assign({}, st10, { cache: oldData, prefs: { newgrades: false } }), { scripts: pageEnv });
  await new Promise(r => setTimeout(r, 60));
  assert(!quietG.sent.some(m => m.type === "grades") && quietG.store.recent && !/Notas novas/.test(text(quietG.anchor)), "switched off: no notification, no card (still recorded)");
  local.prefs = { newgrades: true }; notes.length = 0;
  await ask({ type: "grades", items: [{ name: "RA2", course: "BD", score: 8.5, points: 10, url: "https://pucpr.instructure.com/courses/71306/assignments/2" }] }, CANVAS_TAB);
  assert.deepStrictEqual([notes[0].title, notes[0].message], ["Nota nova: BD", "RA2: 8,5 de 10"], "notification text");
  await ask({ type: "grades", items: [1, 2, 3, 4].map(i => ({ name: "T" + i, course: "C" + i, score: i, points: 10, url: "https://evil.example/" })) }, CANVAS_TAB);
  assert.strictEqual(notes.length, 2, "more than 3: one notification"); assert.strictEqual(notes[1].title, "4 notas novas");
  assert.strictEqual(local.shown[notes[1].id], "https://pucpr.instructure.com/grades", "its click opens the grades, never an outside link");
  await ask({ type: "grades", items: [{ k: "71306:RA2", name: "RA2", course: "BD", score: 8.5, points: 10 }] }, CANVAS_TAB);
  await ask({ type: "grades", items: [{ k: "71306:RA2", name: "RA2", course: "BD", score: 8.5, points: 10 }] }, CANVAS_TAB);
  assert.strictEqual(notes.length, 3, "the same grade from two tabs: one notification");
  local.prefs = { newgrades: false }; await ask({ type: "grades", items: [{ name: "X", score: 1, points: 1 }] }, CANVAS_TAB);
  assert.strictEqual(notes.length, 3, "switched off in the popup: nothing shown"); ok();
  // Monday summary: next Monday 08:00, from the list the page sent
  const nm = new Date(sw.nextMonday8(new Date(2026, 10, 8, 12)));   // a Sunday
  assert.deepStrictEqual([nm.getDay(), nm.getHours(), nm.getDate()], [1, 8, 9], "Sunday noon: the next day at 08:00");
  assert.strictEqual(new Date(sw.nextMonday8(new Date(2026, 10, 9, 9))).getDate(), 16, "Monday 09:00: next week");
  assert.strictEqual(new Date(sw.nextMonday8(new Date(2026, 10, 9, 7))).getDate(), 9, "Monday 07:00: today");
  local.prefs = {}; notes.length = 0;
  await ask({ type: "remind", items: [{ key: "a", title: "Entrega: Lista", course: "BD", date: isoIn(1) }, { key: "b", title: "Prova: RA2", course: "BD", date: isoIn(2) }, { key: "c", title: "Entrega: Longe", date: isoIn(9) }], alarms: false }, CANVAS_TAB);
  assert(!Object.keys(alarms).some(k => k.startsWith("r|")), "alarms: false sets no reminder");
  await sw.summary({ scheduledTime: Date.now() });
  const wd = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][new Date(isoIn(2) + "T12:00:00").getDay()];
  assert.deepStrictEqual([notes[0].title, notes[0].message], ["Sua semana: 1 entrega e 1 prova", "RA2 (" + wd + ")"], "summary text, only the next 7 days");
  await sw.summary({ scheduledTime: Date.now() - 13 * 36e5 }); assert.strictEqual(notes.length, 1, "a summary half a day late is dropped");
  local.prefs = { summary: false }; await sw.summary({ scheduledTime: Date.now() }); assert.strictEqual(notes.length, 1, "summary off");
  local.prefs = {};

  // cards fold to their title (kept); ↑ ↓ on long pages
  const fp = await runContent("/", null, {}, { tall: 4000 });
  const weekSec = () => all(fp.anchor).find(e => /card week/.test(e.className)), wh = () => weekSec().kids.find(e => e.tag === "h3");
  assert(wh().role === "button" && wh()["aria-expanded"] === "true", "the week title folds it");
  await wh().listeners.click({ target: all(wh()).find(e => e.textContent === "↓ .ics") });
  assert(!/folded/.test(weekSec().className), "a button in the title does not fold");
  await wh().listeners.click({ target: wh() });
  assert(/ folded$/.test(weekSec().className) && fp.store.fold.week === true && wh()["aria-expanded"] === "false", "folded and kept");
  const fp2 = await runContent("/", null, { fold: { week: true } });
  assert(/ folded$/.test(all(fp2.anchor).find(e => /card week/.test(e.className)).className), "stays folded on the next page");
  const sc = fp.body.kids.find(k => k.id === "cp-scroll");
  assert(sc && sc.style.display === "block", "long page: ↑ ↓ shown");
  all(sc).find(e => e["aria-label"] === "Ir para o fim").listeners.click(); assert.deepStrictEqual(fp.env.window.scrolled, { top: 4000, behavior: "smooth" });
  const shortPage = await runContent("/", null, {}, { tall: 1000 });
  assert.strictEqual(shortPage.body.kids.find(k => k.id === "cp-scroll").style.display, "none", "short page: hidden");
  const noScroll = await runContent("/", null, { prefs: { scroll: false } }, { tall: 4000 });
  assert(!noScroll.body.kids.some(k => k.id === "cp-scroll"), "switched off: none"); ok();

  // Simular notas on the course page: the ring and the needs follow the typed grades; nothing is saved
  const simP = await runContent("/courses/71306", []), sp = simP.anchor.kids.find(k => k.id === "qf-panel");
  const headTxt = () => text(all(sp).find(e => /^card cring/.test(e.className)));
  const keys0 = JSON.stringify(simP.store), before = headTxt(), sbtn = all(sp).find(e => e.textContent === "Simular ou lançar notas");
  assert(sbtn && !all(sp).some(e => e.className === "simi"), "a Simular button, no inputs yet");
  sbtn.listeners.click();
  const ins = all(sp).filter(e => e.className === "simi");
  assert(ins.length > 0 && ins.every(i => i.placeholder && /^Simular a nota de /.test(i["aria-label"])), "one input per item without a grade, the need as placeholder");
  ins.forEach(i => { i.value = "abc"; i.listeners.input(); });
  assert.strictEqual(headTxt().replace(" (simulação)", ""), before, "an invalid grade changes nothing");
  ins.forEach(i => { i.value = String(i["aria-label"].match(/de ([\d,]+)\)$/)[1]); i.listeners.input(); });
  assert(/\(simulação\)/.test(headTxt()) && /10 garantidos de 10|garantida com essas notas/.test(headTxt()), "full marks everywhere: the head says so: " + headTxt());
  assert(/simulating/.test(all(sp).find(e => /^card cring/.test(e.className)).className), "the head is marked as a simulation");
  sbtn.listeners.click();
  assert.strictEqual(headTxt(), before, "leaving puts the real numbers back"); assert(!all(sp).some(e => e.className === "simi"), "inputs gone");
  assert.strictEqual(JSON.stringify(simP.store), keys0, "nothing saved");
  // the same inputs, with "guardar como minhas notas": kept per user, shown as "sua nota", and counted everywhere
  sbtn.listeners.click(); const in2 = all(sp).filter(e => e.className === "simi");
  const top0 = String(in2[0]["aria-label"].match(/de ([\d,]+)\)$/)[1]); in2[0].value = top0; in2[0].listeners.input();
  const saveB = all(sp).find(e => e.textContent === "Guardar"), keepBox = all(sp).find(e => e.tag === "input" && e.type === "checkbox");
  await saveB.listeners.click(); assert(!simP.store.hand, "without the box ticked it is only a simulation");
  keepBox.checked = true; await saveB.listeners.click(); await new Promise(r => setTimeout(r, 10));
  const handKey = Object.keys(simP.store.hand[5])[0];
  assert(simP.store.hand[5][handKey] === top0 && /sua nota/.test(text(sp)) && !all(sp).some(e => e.className === "simi"), "saved for this user, shown as their grade: " + JSON.stringify(simP.store.hand) + " " + /sua nota/.test(text(sp)) + " " + all(sp).filter(e => e.className === "simi").length);
  const reload = await runContent("/courses/71306", [], { hand: simP.store.hand });
  assert(/sua nota/.test(text(reload.anchor)), "back on the next visit and in the numbers"); ok();

  // logging out also clears the reminders, the week list and the icon; a course panel in use is not swapped by a newer reading
  const lo2 = await runContent("/logout", null, cold.store);
  assert(lo2.sent.some(m => m.type === "remind" && m.items.length === 0 && m.alarms === false) && lo2.sent.some(m => m.type === "next" && m.date === null), "logout: service worker state dropped");
  const busy2 = await runContent("/courses/71306", [], st10, { scripts: pageEnv, slow: 60 });
  const p0 = busy2.anchor.kids.find(k => k.id === "qf-panel");
  all(p0).find(e => e.textContent === "Simular ou lançar notas").listeners.click();
  await new Promise(r => setTimeout(r, 350));
  assert(busy2.store.cache.at > st10.cache.at && busy2.anchor.kids.find(k => k.id === "qf-panel") === p0, "simulating: the panel stays while the new reading is saved");
  const idle2 = await runContent("/courses/71306", [], st10, { scripts: pageEnv, slow: 60 });
  const q0 = idle2.anchor.kids.find(k => k.id === "qf-panel"); await new Promise(r => setTimeout(r, 350));
  assert(idle2.anchor.kids.find(k => k.id === "qf-panel") !== q0 && idle2.anchor.kids.filter(k => k.id === "qf-panel").length === 1, "idle: redrawn once with the new reading"); ok();

  // the course page: hero, tabs (Visão geral first), Anotações per course and user, the last tab kept
  const np = await runContent("/courses/71306", [], { notes: { 9: { 71306: "do outro" } } }); await new Promise(r => setTimeout(r, 20));
  const nbx = np.anchor.kids.find(k => k.id === "qf-panel"), tabB = label => all(nbx).find(e => e.role === "tab" && e.textContent.startsWith(label));
  const paneOf = label => all(nbx).filter(e => e.role === "tabpanel")[["Visão geral", "Notas", "Materiais", "Avisos", "Anotações"].indexOf(label)];
  assert(["Visão geral", "Notas", "Materiais", "Avisos", "Anotações"].every(l => tabB(l)), "five tabs");
  assert(tabB("Visão geral")["aria-selected"] === "true" && !paneOf("Visão geral").hidden && paneOf("Notas").hidden, "opens on Visão geral");
  assert(/A seguir/.test(text(paneOf("Visão geral"))) && all(paneOf("Visão geral")).filter(e => /^mc-day/.test(e.className)).length >= 28 && all(paneOf("Visão geral")).some(e => e.href === "/courses/71306/modules"), "what comes next and the shortcuts");
  assert(/Avisos da matéria/.test(text(paneOf("Avisos"))) && /Prova adiada/.test(text(paneOf("Avisos"))), "this course's announcements");
  await tabB("Anotações").listeners.click(); await new Promise(r => setTimeout(r, 5));
  const ta = all(paneOf("Anotações")).find(e => e.tag === "textarea");
  assert(!paneOf("Anotações").hidden && !ta.value && np.store.ctab === "anot", "Anotações open, empty for this user (another user's note is not mine), the tab kept");
  ta.value = "RA3 cai JOIN"; ta.listeners.input(); await new Promise(r => setTimeout(r, 450));
  assert.deepStrictEqual(np.store.notes, { 9: { 71306: "do outro" }, 5: { 71306: "RA3 cai JOIN" } }, "saved per user and course");
  const np2 = await runContent("/courses/71306", [], { notes: np.store.notes, ctab: "anot" }); await new Promise(r => setTimeout(r, 20));
  const box2 = np2.anchor.kids.find(k => k.id === "qf-panel"), pane2 = all(box2).filter(e => e.role === "tabpanel")[4];
  assert(!pane2.hidden && all(pane2).find(e => e.tag === "textarea").value === "RA3 cai JOIN", "back on the next visit, on the same tab");
  ta.value = ""; ta.listeners.input(); await new Promise(r => setTimeout(r, 450));
  assert.deepStrictEqual(np.store.notes[5], {}, "emptied: removed");
  { const ck = () => all(paneOf("Anotações")).find(e => /card notes chk/.test(e.className)), cf = () => all(ck()).find(e => e.tag === "form");
    assert(ck() && /Checklist da matéria/.test(text(ck())), "a checklist under the note");
    all(cf()).find(e => e.tag === "input").value = "  refazer a lista 3 "; await cf().listeners.submit({ preventDefault() {} }); await new Promise(r => setTimeout(r, 15));
    all(cf()).find(e => e.tag === "input").value = "   "; await cf().listeners.submit({ preventDefault() {} }); await new Promise(r => setTimeout(r, 15));
    const mine = np.store.checks[5][71306];
    assert(mine.length === 1 && mine[0].t === "refazer a lista 3" && !mine[0].done && /refazer a lista 3/.test(text(ck())), "added, trimmed, blank ignored, saved per user and course");
    await all(ck()).find(e => /^Marcar: /.test(e["aria-label"] || (e.getAttribute && e.getAttribute("aria-label")) || "")).listeners.click(); await new Promise(r => setTimeout(r, 15));
    assert(np.store.checks[5][71306][0].done === true, "ticked");
    await all(ck()).find(e => /^Apagar: /.test(e["aria-label"] || (e.getAttribute && e.getAttribute("aria-label")) || "")).listeners.click(); await new Promise(r => setTimeout(r, 15));
    assert.deepStrictEqual(np.store.checks[5], {}, "deleted: removed");
    const ins = all(cf()).filter(e => e.tag === "input"); ins[0].value = "lista 4"; ins[1].value = isoIn(2); await cf().listeners.submit({ preventDefault() {} }); await new Promise(r => setTimeout(r, 15));
    assert(np.store.checks[5][71306][0].date === isoIn(2) && !ins[1].value, "a day goes with the item");
    const r2 = np.sent.filter(m => m.type === "remind").pop();
    assert(r2 && r2.items.some(i => i.title === "Lembrete: lista 4"), "a dated item on the course page gets its reminder at once"); }
  await tabB("Materiais").listeners.click(); await new Promise(r => setTimeout(r, 20));
  assert(np.fetches.some(u => u.startsWith("/api/v1/courses/71306/modules?include[]=items")) && /Módulos/.test(text(paneOf("Materiais"))), "Materiais reads the modules when opened");
  np.winListeners.keydown({ key: "n", code: "KeyN", altKey: true, preventDefault() {}, stopPropagation() {} }); await new Promise(r => setTimeout(r, 5));
  assert(!paneOf("Anotações").hidden && paneOf("Materiais").hidden, "Alt+N opens the course's Anotações");
  { // the dashboard: the checklist's dated items in the 7 days, ticked there; Alt+N or the bar's button opens the column
    const dsh = await runContent("/", null, { checks: { 5: { painel: [{ id: "p1", t: "imprimir resumo", done: false, date: isoIn(1) }, { id: "p2", t: "sem dia", done: false }], 71306: [{ id: "c1", t: "refazer lista", done: false, date: isoIn(2) }] } } });
    await new Promise(r => setTimeout(r, 20));
    const lab = e => e["aria-label"] || "";
    assert(all(dsh.anchor).some(e => /^imprimir resumo · Meu checklist/.test(lab(e))) && all(dsh.anchor).some(e => /^refazer lista · /.test(lab(e))) && !all(dsh.anchor).some(e => /^sem dia · /.test(lab(e))), "dated checklist items (dashboard and course) in the 7 days, undated ones not");
    await all(dsh.anchor).find(e => lab(e) === "Marcar como feito: imprimir resumo").listeners.click({ preventDefault() {} }); await new Promise(r => setTimeout(r, 20));
    assert(dsh.store.checks[5].painel[0].done === true && !dsh.store.marks, "ticked in the week: done in the checklist itself");
    const nbtn = all(dsh.header).concat(all(dsh.anchor)).find(e => e.textContent === "Anotações" && e.tag === "button");
    assert(nbtn, "Anotações in the bar");
    const rem = dsh.sent.filter(m => m.type === "remind").pop();
    assert(rem && rem.items.some(i => i.title === "Lembrete: refazer lista") && !rem.items.some(i => /^Entrega: (refazer lista|imprimir resumo)/.test(i.title)), "the student's own items remind as Lembrete, not Entrega");
    dsh.winListeners.keydown({ key: "˜", code: "KeyN", altKey: true, target: { tagName: "TEXTAREA" }, preventDefault() { throw new Error("typing was blocked"); }, stopPropagation() {} }); await new Promise(r => setTimeout(r, 20));
    dsh.winListeners.keydown({ key: "x", code: "KeyN", altKey: true, composedPath: () => [{ tagName: "DIV", cpRoot: { activeElement: { tagName: "INPUT" } } }], preventDefault() { throw new Error("typing was blocked"); }, stopPropagation() {} }); await new Promise(r => setTimeout(r, 20));
    assert(dsh.store.notesOpen === undefined, "Alt+N inside a field (Canvas's, or ours behind a closed root) is the student's typing (Option+N is the tilde on a Mac)");
    dsh.winListeners.keydown({ key: "n", code: "KeyN", altKey: true, preventDefault() {}, stopPropagation() {} }); await new Promise(r => setTimeout(r, 20));
    assert(dsh.store.notesOpen === true && nbtn["aria-pressed"] === "true", "Alt+N opens the column (kept open)");
    await nbtn.listeners.click(); await new Promise(r => setTimeout(r, 20));
    assert(dsh.store.notesOpen === false, "the button closes it"); }
  ok();

  { // "Arquivo para a sua IA": off by default; on, one snapshot per reading, written over the same file and out of the history
    const off = await runContent("/", null, {}); await new Promise(r => setTimeout(r, 20));
    assert(!off.sent.some(m => m.type === "agentFile"), "switched off by default: no file");
    const af = await runContent("/", null, { prefs: { agentFile: true } }); await new Promise(r => setTimeout(r, 30));
    const m = af.sent.find(x => x.type === "agentFile"), d = m && m.data, js = JSON.stringify(d || {});
    assert(d && d.version === 2 && ["checklists", "tasks", "changes", "modules", "teachers"].every(k => Array.isArray(d[k])) && d.app === "caderno-plus" && typeof d.read_at === "string" && Array.isArray(d.subjects) && Array.isArray(d.upcoming) && Array.isArray(d.announcements) && Array.isArray(d.grades), "the snapshot");
    assert(!/"author"|"avatar"|"user"|"message"|"url"/.test(js), "no author, photo, user id, message body or links");
    assert(d.upcoming.concat(d.announcements).every(x => x.untrusted_canvas_text && typeof x.untrusted_canvas_text.title === "string") && d.grades.every(g => g.untrusted_canvas_text && g.assignments.every(x => x.untrusted_canvas_text)), "every Canvas string inside untrusted_canvas_text");
    assert(d.subjects.every(x => typeof x.label === "string" && x.untrusted_canvas_text === undefined) && js.length < 96 * 1024, "quanto falta as the panel's labels, under 96 KB");
    assert(d.subjects.length >= 1 && d.upcoming.length >= 1 && d.announcements.length >= 1 && d.grades.length >= 1 && d.turma_confirmed === true, "every part filled from the reading");
    { // version 2 with the student's own items: checklists, tasks (done from the ticks), module titles without links, teachers
      const big = "x".repeat(200), lists = {}; for (let i = 1; i <= 13; i++) lists[String(i)] = Array.from({ length: 50 }, (_, j) => ({ id: "c" + j, t: big, done: j % 2 === 0 }));
      const own = await runContent("/", null, { prefs: { agentFile: true }, checks: { 5: Object.assign({ painel: [{ id: "p1", t: "revisar JOIN", done: false, date: "2026-12-01" }] }, lists) },
        tasks: { 5: [{ id: "t1", title: "imprimir resumo", date: null }] }, marks: { 5: { "own:t1": "2026-11-01" } },
        search: { user: 5, at: Date.now(), items: [{ t: "Lista JOIN", c: "BD · Semana 5", u: "https://pucpr.instructure.com/courses/71306/modules/items/9", k: "tarefa" }] },
        teachers: { user: 5, at: Date.now(), list: [{ id: 7, name: "Prof. Ana Lima", avatar: "https://x/y.png", course: 71306, courseName: "BD" }] } });
      await new Promise(r => setTimeout(r, 40));
      const d2 = own.sent.filter(x => x.type === "agentFile").pop().data, j2 = JSON.stringify(d2), bytes = Buffer.byteLength(j2);
      assert(bytes <= 90 * 1024, "13 full checklists still fit: trimmed to 90 KB (" + bytes + " bytes)");
      assert(d2.checklists.some(c => c.items.some(x => x.untrusted_canvas_text.text === "revisar JOIN" && x.date === "2026-12-01")) && d2.tasks[0].done === true, "checklists kept with their day, tasks done from the ticks");
      assert(!/instructure\.com\/courses|"avatar"|"u":|y\.png/.test(j2) && d2.teachers[0].untrusted_canvas_text.name === "Prof. Ana Lima", "no module link, no photo; teacher by name"); }
    assert(/^\d+\|PUCPR\|[0-9a-z]+$/.test(af.store.agentAt), "the reading, folder and own items written are remembered (one file per reading, folder and own items)");
    local.prefs = { agentFile: false }; let r = await ask({ type: "agentFile", data: { a: 1 } }, CANVAS_TAB);
    assert(r && r.ok === false, "the worker refuses when the switch is off");
    local.prefs = { agentFile: true, dlFolder: "Minha Pasta" }; const n0 = swSaved.length;
    r = await ask({ type: "agentFile", data: { a: 1 } }, CANVAS_TAB);
    const w = swSaved[swSaved.length - 1];
    assert(r.ok && swSaved.length === n0 + 1 && w.filename === "Minha Pasta/caderno-agente.json" && w.conflictAction === "overwrite" && w.saveAs === false && /^data:application\/json;charset=utf-8,/.test(w.url), "written over <pasta>/caderno-agente.json");
    const did = session.agentDl[session.agentDl.length - 1];
    assert(typeof did === "number", "its id kept to clear the history line");
    chromeSW.downloads.search = async q => [{ id: q.id, state: "complete", filename: "/Users/aluno/Downloads/Minha Pasta/caderno-agente.json" }];
    await listeners.changed({ id: did, state: { current: "complete" } });
    assert.strictEqual(local.agentPath, "/Users/aluno/Downloads/Minha Pasta/caderno-agente.json", "the absolute path kept for the popup");
    delete chromeSW.downloads.search;
    assert(!session.agentDl.includes(did) && local.prefs.agentFile === true, "finished: out of the download history, switch still on");
    await ask({ type: "agentFile", data: { a: 2 } }, CANVAS_TAB); const did2 = session.agentDl[session.agentDl.length - 1];
    await listeners.changed({ id: did2, state: { current: "interrupted" } });
    assert(local.prefs.agentFile === false && /Perguntar onde salvar/.test(local.agentErr), "interrupted (Chrome asks where to save): the switch turns itself off and says why");
    delete local.agentErr; local.prefs = { agentFile: true, dlFolder: "Minha Pasta" };
    assert.strictEqual((await ask({ type: "agentFile", data: { x: "a".repeat(100 * 1024) } }, CANVAS_TAB)).ok, false, "over 96 KB refused");
    assert.strictEqual(await ask({ type: "agentFile", data: [1] }, CANVAS_TAB), "no reply", "not a plain object: ignored");
    assert.strictEqual(await ask({ type: "agentFile", data: { a: 1 } }, { id: "other", origin: "https://pucpr.instructure.com" }), "no reply", "another extension: ignored");
    local.prefs = {}; ok(); }

  // unread Canvas messages on the dashboard (subject and who), read with the rest; a failure never blocks the panel
  const ib = await runContent("/", null, {}, { inbox: [{ subject: "Dúvida RA3", participants: [{ id: 5, name: "Eu mesmo" }, { id: 7, name: "Prof. Ana" }, { id: 8, name: "Aluno" }], last_message_at: new Date().toISOString(), last_message: "segredo" }] });
  const ibx = all(ib.anchor).find(e => /card news inbox/.test(e.className));
  assert(ibx && /Caixa de entrada \| 1 não lida/.test(text(ibx)) && /Dúvida RA3 \| Prof\. Ana, Aluno/.test(text(ibx)), "subject and who (not the student themself)");
  assert.strictEqual(ib.fetches.filter(u => u.includes("/api/v1/conversations")).length, 1, "one page of messages only, even with more pages");
  assert(!/segredo/.test(JSON.stringify(ib.store.cache)), "the message text is never read into the cache");
  assert.strictEqual(all(ibx).find(e => e.textContent === "Dúvida RA3").href, "https://pucpr.instructure.com/conversations");
  const ibf = await runContent("/", null, {}, { inboxFails: true });
  assert(ibf.store.cache && ibf.store.cache.inbox === null && /Próximos 7 dias/.test(text(ibf.anchor)), "inbox refused: the rest still drawn");
  const ibo = await runContent("/", null, { prefs: { inbox: false } }, { inbox: [{ subject: "x", participants: [] }] });
  assert(!all(ibo.anchor).some(e => /inbox/.test(e.className)), "switched off: no card"); ok();

  // Foco: the alarm the popup sets ends with a notification
  local.focus = { kind: "foco", end: Date.now() }; notes.length = 0;
  await listeners.alarm({ name: "focus|foco", scheduledTime: Date.now() }); await new Promise(r => setTimeout(r, 5));
  assert(notes[0] && /hora da pausa/.test(notes[0].title) && local.focus === undefined, "study block over: break notice, timer cleared");
  await listeners.alarm({ name: "focus|pausa", scheduledTime: Date.now() }); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(notes[1].title, "Pausa acabou"); ok();

  // modes on the dashboard panel: limpo drops the KPI row and read announcements; foco is one "Agora" list; switch in the header
  const mFull = await runContent("/", null);
  const mClean = await runContent("/", null, { prefs: { mode: "limpo" } });
  assert(/Garantido até agora/.test(text(mFull.anchor)) && !/Garantido até agora/.test(text(mClean.anchor)) && /Próximos 7 dias/.test(text(mClean.anchor)), "limpo: no KPI row, the week stays");
  assert(/Prova adiada/.test(text(mClean.anchor)) && !/Bem-vindos/.test(text(mClean.anchor)), "limpo: only unread announcements");
  const mFocus = await runContent("/", null, { prefs: { mode: "foco" } }), ft = all(mFocus.anchor).filter(e => e.tag !== "style").map(e => e.textContent).join(" | ");
  assert(/Agora \| 2 coisas/.test(ft) && /\d\d\/\d\d[ |]+Relatório/.test(ft) && /Lista 3/.test(ft) && !/Próximos 7 dias|Avisos|Garantido até agora|Quiz feito/.test(ft), "foco: only what to do now: " + ft.slice(0, 200));
  const segB = all(mFull.anchor).find(e => e.role === "radio" && e.textContent === "Foco");
  assert(segB && all(mFull.anchor).find(e => e.role === "radio" && e.textContent === "Completo")["aria-checked"] === "true", "the header switch shows the mode");
  await segB.listeners.click(); await new Promise(r => setTimeout(r, 10));
  assert(mFull.store.prefs.mode === "foco" && /Agora/.test(text(mFull.anchor)) && all(mFull.anchor).filter(e => e.id === "cp-dash").length === 1, "switched from the panel: saved and redrawn once");
  // the popup changes the mode: the panel follows at once (no reload, no fight with the header switch)
  const sync = await runContent("/", null); await sync.env.window.cpPrefsChanged({ mode: "foco" }); await new Promise(r => setTimeout(r, 15));
  assert(/Agora/.test(text(sync.anchor)) && all(sync.anchor).filter(e => e.id === "cp-dash").length === 1, "the panel redraws in the popup's mode");

  // Canvas's widget dashboard: ours goes inside it, above its widgets; its Avisos widget replaces ours; "Só Caderno+" hides its widgets
  const WENV = [{ textContent: 'ENV = {"current_user_id":"5","widget_dashboard":true}' }];
  const wdash = await runContent("/", null, {}, { scripts: WENV, widgetCols: true });
  await new Promise(r => setTimeout(r, 150));
  const dashHost = wdash.anchor.kids.find(k => k.id === "cp-dash");
  assert(dashHost && wdash.cols.parent.kids.every(k => k.id !== "cp-dash"), "at the top of #content, never inside Canvas's React widget grid");
  assert(!/Prova adiada/.test(text(dashHost)) && !/Todas as matérias/.test(text(dashHost)), "no duplicate announcements while Canvas shows its own");
  await wdash.env.window.cpPrefsChanged({ native: false }); await new Promise(r => setTimeout(r, 30));
  const dashHost2 = wdash.anchor.kids.find(k => k.id === "cp-dash");
  assert(/Prova adiada/.test(text(dashHost2)) && /Todas as matérias/.test(text(dashHost2)), "Canvas's widgets off (popup): ours carries announcements and every course"); ok();

  // own tasks: added in the card (or with + in Ctrl+K), in the week when they have a day, ticked and deleted; per user
  const tk = await runContent("/", null, { tasks: { 9: [{ id: "x", title: "do outro", date: null }] } });
  const tcard = () => all(tk.anchor).find(e => /card news tasks/.test(e.className));
  assert(tcard() && !/do outro/.test(text(tcard())), "the card is there; another user's tasks are not mine");
  const [tin] = all(tcard()).filter(e => e.tag === "input");
  tin.value = "prova 31/02"; await all(tcard()).find(e => e.tag === "form").listeners.submit({ preventDefault() {} }); await new Promise(r => setTimeout(r, 15));
  assert(tk.store.tasks[5][0].title === "prova 31/02" && tk.store.tasks[5][0].date === null, "31/02 is not a day: kept in the title");
  await all(tcard()).find(e => /^Apagar: prova/.test(e["aria-label"] || "")).listeners.click(); await new Promise(r => setTimeout(r, 15));
  all(tcard()).find(e => e.tag === "input").value = "imprimir resumo amanhã"; await all(tcard()).find(e => e.tag === "form").listeners.submit({ preventDefault() {} }); await new Promise(r => setTimeout(r, 15));
  assert(tk.store.tasks[5].length === 1 && tk.store.tasks[5][0].title === "imprimir resumo" && tk.store.tasks[5][0].date === isoIn(1) && tk.store.tasks[9], "saved per user, the day read from the words");
  assert(all(tk.anchor).some(e => /^ev /.test(e.className) && /^imprimir resumo · Minha tarefa/.test(e["aria-label"] || "")), "a task with a day shows in the week");
  assert(tk.sent.filter(m => m.type === "remind").pop().items.some(i => /imprimir resumo/.test(i.title)), "and gets a reminder");
  await all(tcard()).find(e => /^Marcar como feito: imprimir/.test(e["aria-label"] || "")).listeners.click(); await new Promise(r => setTimeout(r, 15));
  assert(/ dn$/.test(all(tcard()).find(e => /^row/.test(e.className) && /imprimir/.test(text(e))).className), "ticked: greyed");
  await all(tcard()).find(e => /^Apagar: imprimir/.test(e["aria-label"] || "")).listeners.click(); await new Promise(r => setTimeout(r, 15));
  assert.strictEqual(tk.store.tasks[5].length, 0, "deleted");
  const key2 = k => tk.winListeners.keydown({ key: k, ctrlKey: true, preventDefault() {}, stopPropagation() {} });
  key2("k"); await new Promise(r => setTimeout(r, 15));
  const q3 = all(tk.body.kids.find(k => k.id === "cp-search")).find(e => e.className === "pal-q");
  q3.value = "+ ler capítulo 4"; q3.listeners.input();
  assert.match(text(all(tk.body.kids.find(k => k.id === "cp-search")).find(e => /^pal-i/.test(e.className))), /nova \|.*Criar tarefa: ler capítulo 4 \| sem dia/, "+ in the search offers a new task");
  await q3.listeners.keydown({ key: "Enter", preventDefault() {} }); await new Promise(r => setTimeout(r, 20));
  assert(tk.store.tasks[5].some(t => t.title === "ler capítulo 4" && t.date === null) && /ler capítulo 4/.test(text(tcard())), "created from the search, the panel redrawn"); ok();

  // what changed since the last visit: snapshot per user; new assignments, files, modules and announcements; "Visto" clears
  const firstLook = await runContent("/", [{ id: 1, display_name: "Aula 1.pdf", url: "/f/1", size: 5 }], {}, { modules: [{ id: 30, name: "Unidade 4", items: [] }] });
  await new Promise(r => setTimeout(r, 40));
  assert(firstLook.store.snap[5] && !all(firstLook.anchor).some(e => /changes/.test(e.className)), "the first look only takes the snapshot");
  const oldSnap = { 5: { at: 1, netAt: 0, asg: { 71306: ["Entrega PjBL - Parte 1 03/09", "Avaliação somativa RA1 10/09", "Entrega PjBL - Parte 2 15/10"] }, ann: ["https://evil.example/x"], files: { 71306: [] }, mods: { 71306: [[30, "Unidade 4"]] } } };
  const wc = await runContent("/", [{ id: 1, display_name: "Aula 1.pdf", url: "/f/1", size: 5 }], { snap: oldSnap }, { modules: [{ id: 30, name: "Unidade 4", items: [] }, { id: 31, name: "Unidade 5", items: [] }] });
  await new Promise(r => setTimeout(r, 60));
  const wcard = () => all(wc.anchor).find(e => /card news changes/.test(e.className)), wt2 = () => text(wcard());
  assert(wcard(), "a card with what changed");
  assert(/tarefa[ |]+Avaliação somativa RA2/.test(wt2()) && /arquivo[ |]+Aula 1\.pdf/.test(wt2()) && /módulo[ |]+Unidade 5/.test(wt2()) && /aviso[ |]+Prova adiada/.test(wt2()) && !/Unidade 4/.test(wt2()), "new assignment, file, module and announcement: " + wt2().slice(0, 300));
  assert.strictEqual(all(wcard()).find(e => e.textContent === "Unidade 5").href, "https://pucpr.instructure.com/courses/71306/modules#module_31");
  const netReads = wc.fetches.filter(u => /\/(files|modules)\?/.test(u)).length;
  await all(wcard()).find(e => e.textContent === "Visto ✓").listeners.click(); await new Promise(r => setTimeout(r, 30));
  assert(!wcard() && wc.store.changes[5].items.length === 0, "Visto clears it");
  const again = await runContent("/", [], { snap: wc.store.snap, changes: wc.store.changes, cache: wc.store.cache }, { scripts: pageEnv });
  await new Promise(r => setTimeout(r, 40));
  assert(!again.fetches.some(u => /\/(files|modules)\?/.test(u)) && netReads === 2, "files and modules read at most once an hour (one GET each per course)");
  const noCh = await runContent("/", null, { snap: oldSnap, prefs: { changes: false } }); await new Promise(r => setTimeout(r, 40));
  assert(!all(noCh.anchor).some(e => /changes/.test(e.className)) && !noCh.fetches.some(u => /\/(files|modules)\?/.test(u)), "switched off: no card, no extra reads"); ok();

  // "Notas do curso" (Canvas's widget): the card keeps its picture; on our subjects Canvas's figure is hidden and ours shown
  const gw = await runContent("/", null, {}, { gradeCard: true }); await new Promise(r => setTimeout(r, 20));
  const badge = all(gw.gcard).find(e => e["data-cp-grade"]);
  assert(badge && /(precisa|garantido|faltam|recuperação)[^|]* \| \d+% garantido/.test(text(badge)) && /[\d,]+ \| de 10/.test(text(badge)), "our numbers on the card: " + (badge && text(badge)));
  assert(gw.gcard.kids.indexOf(badge) === 1, "right under the course name");
  assert.strictEqual(gw.body.kids.find(k => k.id === "cp-grades").textContent, '[data-testid="course-71306-grade"] { display:none !important; }', "Canvas's percentage hidden for that course only");
  const gw2 = await runContent("/", null, {}, { gradeCard: true, courseId: 77, courseName: "Inglês - 2026 / 2º Sem" }); await new Promise(r => setTimeout(r, 20));
  assert(!all(gw2.gcard).some(e => e["data-cp-grade"]) && gw2.body.kids.find(k => k.id === "cp-grades").textContent === "", "a course without our rules keeps Canvas's figure"); ok();

  // the classic dashboard: our panel right above the course cards; courses outside the grade off the dashboard and back
  const EXT = { id: 88, name: "Fundamentos de Design de interação - Extensão - (21/09/2026 a 27/09/2026)" };
  const cl = await runContent("/", null, {}, { classic: true, more: [EXT] }); await new Promise(r => setTimeout(r, 30));
  const clHost = cl.cols.parent.kids.find(k => k.id === "cp-dash");
  assert(clHost && cl.cols.parent.kids.indexOf(clHost) === cl.cols.parent.kids.indexOf(cl.cols) - 1, "between the header and Canvas's course cards");
  assert(!all(clHost).some(e => e.className === "card tile") && /\d+[,\d]*\/10 · /.test(text(cl.header)), "no tiles of ours; Canvas's cards say X/10 and what is needed");
  assert(!all(clHost).some(e => /^Esconder \d|^Mostrar \d|^Só Caderno|^Buscar/.test(e.textContent || "")), "the header keeps only the modes, the meta and the fold");
  const pf = await runContent("/", null); await new Promise(r => setTimeout(r, 20));
  const pfBox = () => all(pf.anchor).find(e => /^box/.test(e.className)), pfB = all(pf.anchor).find(e => /^pfold/.test(e.className) && !/pnotes/.test(e.className));
  assert(pfB && pfB.textContent === "Esconder ▴" && !/pfolded/.test(pfBox().className), "the panel open, with Esconder");
  await pfB.listeners.click(); await new Promise(r => setTimeout(r, 10));
  assert(/pfolded/.test(pfBox().className) && pf.store.panelFold === true && pfB.textContent === "Mostrar ▾", "folded to its bar, kept");
  const pfOff = await runContent("/", null, { prefs: { dash: false } }); await new Promise(r => setTimeout(r, 20));
  assert(!all(pfOff.anchor).some(e => e.id === "cp-dash") && /\/10 · /.test(text(pfOff.header)), "panel switched off in the popup: gone, the cards keep their grades");
  const clTop = await runContent("/", null, { prefs: { cardsFirst: true } }, { classic: true }); await new Promise(r => setTimeout(r, 30));
  const topHost = clTop.cols.parent.kids.find(k => k.id === "cp-dash");
  assert(topHost && clTop.cols.parent.kids.indexOf(topHost) === clTop.cols.parent.kids.indexOf(clTop.cols) + 1, "cards first: our panel right below Canvas's cards");
  await clTop.env.window.cpPrefsChanged({ cardsFirst: false }); await new Promise(r => setTimeout(r, 20));
  assert(clTop.cols.parent.kids.indexOf(topHost) === clTop.cols.parent.kids.indexOf(clTop.cols) - 1, "switched off in the popup: back above the cards, at once");
  const clW = await runContent("/", null, {}, { classic: true, scripts: [{ textContent: 'ENV = {"current_user_id":"5","widget_dashboard":true}' }] });
  assert(/Prova adiada/.test(text(clW.anchor)), "back on the classic dashboard (the widget flag stays true): our announcements show");
  // the Cursos tray (left menu): our pill on our subjects, courses taken off the dashboard left out
  const tray = fakeEl("div"), mkItem = id => { const li = fakeEl("li"), a = fakeEl("a"); a.getAttribute = k => k === "href" ? "/courses/" + id : null; a.closest = () => li; li.append(a);
    li.querySelector = sel => all(li).find(e => e["data-cp-tray"]) || null; return { li, a }; };
  const t1 = mkItem(71306), t2 = mkItem(88); tray.append(t1.li, t2.li); tray.querySelectorAll = sel => [t1.a, t2.a];
  const trp = await runContent("/", null, { hidden: ["88"] }, { tray }); await new Promise(r => setTimeout(r, 200));
  assert(/\/10 · /.test(text(t1.li)) && t2.li.style.display === "none", "Cursos tray: pill on ours, hidden course left out");
  // /courses: our pill per subject and Tirar do painel / Mostrar no painel on every course
  const mkRow = id => { const tr = fakeEl("tr"), td = fakeEl("td"), a = fakeEl("a"); a.getAttribute = () => "/courses/" + id; td.append(a); tr.append(td);
    Object.defineProperty(a, "parentNode", { get() { return this.parent; } }); tr.querySelector = sel => sel === "[data-cp-row]" ? all(tr).find(e => e["data-cp-row"]) || null : a; return tr; };
  const r1 = mkRow(71306), r2 = mkRow(88);
  const cpage = await runContent("/courses", null, {}, { rows: [r1, r2], more: [{ id: 88, name: "Extensão X" }] }); await new Promise(r => setTimeout(r, 20));
  assert(/\/10 · /.test(text(r1)) && /Tirar do painel/.test(text(r2)) && !/\/10/.test(text(r2)), "pill on ours, the button on every course");
  await all(r2).find(e => e.textContent === "Tirar do painel").listeners.click(); await new Promise(r => setTimeout(r, 10));
  assert(cpage.store.hidden.includes("88") && /Mostrar no painel/.test(text(r2)), "taken off the dashboard from the course list");
  // the course menu: items hidden one by one per course, edited with an eye per item
  const mkTab = cls => { const li = fakeEl("li"), a = fakeEl("a"); a.className = cls; a.classList = cls.split(" "); a.textContent = cls; li.append(a);
    Object.defineProperty(a, "parentNode", { get() { return this.parent; } }); li.querySelector = () => all(li).find(e => /cp-eye/.test(e.className)) || null; return { li, a }; };
  const tabs3 = ["home active", "announcements", "context_external_tool_9"].map(mkTab), navEl = fakeEl("ul"); tabs3.forEach(t => navEl.append(t.li)); navEl.querySelectorAll = () => tabs3.map(t => t.a);
  const cn = await runContent("/courses/71306/modules", null, { navHide: { 71306: ["context_external_tool_9", "bad;}"] } }, { nav: navEl }); await new Promise(r => setTimeout(r, 30));
  const hideCss = cn.body.kids.find(k => k.id === "cp-navhide").textContent;
  assert(/li:has\(> a\.context_external_tool_9\) \{ display:none/.test(hideCss) && !/bad/.test(hideCss), "a hidden tab is hidden (odd keys ignored)");
  const editB = all(navEl).find(e => e.tag === "button" && /^Editar menu \(1 escondido\)$/.test(e.textContent));
  editB.listeners.click(); const eyes = all(navEl).filter(e => /cp-eye/.test(e.className));
  assert(eyes.length === 2 && /off/.test(eyes[1].className) && !all(tabs3[0].li).some(e => /cp-eye/.test(e.className)), "editing: an eye per item (not on Página inicial), the hidden one marked");
  await eyes[0].listeners.click({ preventDefault() {}, stopPropagation() {} }); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(cn.store.navHide[71306].sort(), ["announcements", "context_external_tool_9"], "hidden per course, saved");
  const openTab = cn.body.kids.find(k => k.id === "cp-navopen");
  assert(openTab && openTab.style.display === "none", "the menu shows by default; the reopen tab waits");
  const cn2 = await runContent("/courses/71306", null, { navFold: true }, { nav: (() => { const n = fakeEl("ul"); n.querySelectorAll = () => []; return n; })() }); await new Promise(r => setTimeout(r, 30));
  assert(cn2.body.kids.find(k => k.id === "cp-navopen").style.display === "", "folded last time: folded, with the › tab to bring it back");
  const cn3 = await runContent("/courses/71306", null, { prefs: { mode: "foco" } }, { nav: (() => { const n = fakeEl("ul"); n.querySelectorAll = () => []; return n; })() }); await new Promise(r => setTimeout(r, 30));
  assert(cn3.body.kids.find(k => k.id === "cp-navopen").style.display === "" && cn3.store.navFold === undefined, "Foco folds the course menu by itself, without saving it");

  // modules: whole modules or single items hidden one by one per course
  const wrap = fakeEl("div"), modsEl = fakeEl("div"); wrap.append(modsEl);
  Object.defineProperty(modsEl, "parentNode", { get() { return this.parent; } });
  const mod = fakeEl("div"), modHead = fakeEl("div"), item = fakeEl("li"), row = fakeEl("div");
  mod.id = "context_module_7"; mod.classList = { contains: c => c === "context_module" }; item.id = "context_module_item_70"; item.classList = { contains: () => false };
  mod.append(modHead); item.append(row); modsEl.append(mod, item);
  mod.querySelector = () => modHead; item.querySelector = () => row;
  modHead.querySelector = () => all(modHead).find(e => /cp-eye/.test(e.className)) || null; row.querySelector = () => all(row).find(e => /cp-eye/.test(e.className)) || null;
  modsEl.querySelectorAll = sel => sel === ".context_module" ? [mod] : [item];
  const mh = await runContent("/courses/71306/modules", null, { modHide: { 71306: ["context_module_item_70", "x;}"] } }, { mods: modsEl }); await new Promise(r => setTimeout(r, 30));
  const modCss = mh.body.kids.find(k => k.id === "cp-modhide").textContent;
  assert(/#context_module_item_70 \{ display:none/.test(modCss) && !/#x;/.test(modCss), "a hidden item is hidden (odd keys ignored)");
  const mEdit = all(wrap).find(e => e.tag === "button" && /^Editar módulos \(1 escondido\)$/.test(e.textContent));
  mEdit.listeners.click();
  const modEye = all(modHead).find(e => /cp-eye/.test(e.className)), itemEye = all(row).find(e => /cp-eye/.test(e.className));
  assert(modEye && itemEye && /off/.test(itemEye.className) && modEye.title === "Esconder o módulo", "editing: an eye on the module and on the item");
  await modEye.listeners.click({ preventDefault() {}, stopPropagation() {} }); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(mh.store.modHide[71306].sort(), ["context_module_7", "context_module_item_70"], "a whole module hidden too, saved per course");

  // the turma: a shared course (one or two matches) is not proof; ask, and use the rules only after a yes
  const ask1 = await runContent("/", null, {}, { askTurma: true }); await new Promise(r => setTimeout(r, 20));
  assert(/Você é da turma Ciência da Computação, manhã\?/.test(text(ask1.anchor)) && !/\/10 · /.test(text(ask1.header)), "one matching course: ask, no grades yet");
  const askOther = await runContent("/", null, { prefs: { turma: "outro" } }, { askTurma: true }); await new Promise(r => setTimeout(r, 20));
  assert(!/Você é da turma/.test(text(askOther.anchor)) && !/\/10 · /.test(text(askOther.header)) && /ainda não tem as regras da sua turma/.test(text(askOther.anchor)), "another program: no question, no grades, the week and announcements stay");
  const MORE6 = [{ id: 72009, name: "Programação Imperativa (Turma 2º B) - 2026 / 2º Sem" }, { id: 72011, name: "Conectividade (Turma 2º B) - 2026 / 2º Sem" }];
  const ask3 = await runContent("/", null, {}, { askTurma: true, more: MORE6 }); await new Promise(r => setTimeout(r, 20));
  assert(!/Você é da turma/.test(text(ask3.anchor)) && /\/10 · /.test(text(ask3.header)), "three or more matching courses: the turma, no question");

  // the classic dashboard header: a greeting with the first name, the date and what is coming (the title stays for screen readers)
  const lay = fakeEl("div"), flex = fakeEl("div"), titleItem = fakeEl("span"); titleItem.append(fakeEl("span")); flex.append(titleItem, fakeEl("span")); lay.append(flex);
  lay.firstElementChild = flex; flex.firstElementChild = titleItem; titleItem.prepend = function (c) { c.parent = this; this.kids.unshift(c); };
  titleItem.querySelector = sel => all(titleItem).find(e => e.className === "cp-greet") || null;
  const greetRun = await runContent("/", null, {}, { header: lay, scripts: [{ textContent: 'ENV = {"current_user_id":"5","current_user":{"id":"5","display_name":"Enzo Bossmann"}}' }] });
  const greetEl = titleItem.kids[0];
  assert(greetEl && greetEl.className === "cp-greet" && /^(Bom dia|Boa tarde|Boa noite), Enzo!$/.test(greetEl.kids[0].textContent) && /de (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) · /.test(greetEl.kids[1].textContent), "greeting: " + (greetEl && text(greetEl)));
  const clHidden = await runContent("/", null, { hidden: ["71306"] }, { classic: true });
  assert(!/\/10 · /.test(text(clHidden.header)), "a course unticked in the popup leaves the dashboard"); ok();

  // /calendar: the semester calendar in place of Canvas's; months of the term; other months read once from the planner
  const cal = await runContent("/calendar", null); await new Promise(r => setTimeout(r, 30));
  const calBox = cal.anchor.kids.find(k => k.id === "cp-cal"), ym = isoIn(0).slice(0, 7);
  const MN = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  assert(calBox && all(calBox).find(e => e.className === "calt").textContent === MN[Number(ym.slice(5)) - 1] + " " + ym.slice(0, 4), "opens on this month");
  const cells = all(calBox).filter(e => /^cday/.test(e.className) && !/off/.test(e.className));
  assert.strictEqual(cells.length, new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate(), "one cell per day");
  if (isoIn(1).slice(0, 7) === ym) assert(all(calBox).some(e => /^ev /.test(e.className) && /Lista 3/.test(e.title || "")), "Canvas deadlines in their day");
  const nextB = all(calBox).find(e => e["aria-label"] === "Próximo mês");
  const planBefore = cal.fetches.filter(u => u.startsWith("/api/v1/planner")).length;
  if (!nextB.disabled) { nextB.listeners.click(); await new Promise(r => setTimeout(r, 20));
    assert(cal.fetches.filter(u => u.startsWith("/api/v1/planner")).length === planBefore + 1 && cal.fetches.some(u => /planner\/items\?start_date=\d{4}-\d\d-01&end_date=/.test(u)), "the next month read once from the planner"); }
  const calOff = await runContent("/calendar", null, { prefs: { calendar: false } });
  assert(!calOff.anchor.kids.some(k => k.id === "cp-cal"), "switched off: Canvas's calendar only"); ok();

  // announcements with the author's photo; "Pergunte ao professor" opens Canvas's compose addressed to the teacher
  const askRun = await runContent("/", null); await new Promise(r => setTimeout(r, 40));
  const askSec = all(askRun.anchor).find(e => /card news ask/.test(e.className));
  const askB = askSec && all(askSec).find(e => e.textContent === "Perguntar");
  assert(askB && askB.href === "https://pucpr.instructure.com/conversations?user_id=7&user_name=Prof.%20Ana%20Lima&context_id=course_71306", "a Perguntar link per teacher, to Canvas's compose: " + (askB && askB.href));
  assert(all(askSec).some(e => e.tag === "img" && e.src === "https://pucpr.instructure.com/images/thumbnails/7/ana.png"), "with the teacher's photo");
  assert(askRun.store.teachers && askRun.store.teachers.user === 5, "read once a day, per user");
  const again2 = await runContent("/", null, { teachers: askRun.store.teachers, cache: askRun.store.cache }, { scripts: pageEnv }); await new Promise(r => setTimeout(r, 30));
  assert(!again2.fetches.some(u => /users\?enrollment_type/.test(u)), "not read again the same day"); ok();

  // course cards: our pill under Canvas's title (Canvas's own ⋮ menu untouched); courses unticked in the popup leave the dashboard
  const cd = await runContent("/", null, { hidden: [] });
  assert(/\d+[,\d]*\/10 · /.test(text(cd.header)) && !all(cd.header).some(e => e.tag === "button"), "a pill, and no buttons of ours on the card");
  { // a course without rules of ours (another turma or program): the pill comes from the Centro de Notas formula
    const curso = { grupos: [{ id_grupo: 1, grupo_colunas: [{ coluna: { id_coluna: 5, tipo_coluna: "padrao", atividade: { pontos_possiveis: 10 }, notas: [{ nota: "4,00" }] } }, { coluna: { id_coluna: 6, tipo_coluna: "padrao", atividade: { pontos_possiveis: 10 }, notas: [] } }] }],
      colunas: [{ id_coluna: 9, tipo_coluna: "final", tipo_calculo: "media_ponderada", notas: [{ nota: "2,00" }], colunas_associadas_pai: [{ id_coluna: 5, pivot: { peso_coluna_filho: 50 } }, { id_coluna: 6, pivot: { peso_coluna_filho: 50 } }] }] };
    const other = await runContent("/", null, { hidden: [], centro: { user: 5, at: Date.now(), courses: { 99901: curso } } }, { courseId: 99901, courseName: "Cálculo Diferencial (Turma 1A) - Engenharia - 2026 / 2º Sem" });
    assert(/2,0\/10 · precisa 10,0\/10/.test(text(other.header)), "no rules: the Centro de Notas formula on the card (2 + 0,5 × x ≥ 7 → x = 10): " + text(other.header));
    assert(other.sent.some(m => m.type === "centro" && m.user === 5 && m.ids.includes(99901)), "a fresh reading asks the worker for the Centro de Notas");
    const noF = await runContent("/", null, { hidden: [], centro: { user: 5, at: Date.now(), courses: { 99901: { grupos: [], colunas: [{ id_coluna: 9, tipo_coluna: "final" }] } } } }, { courseId: 99901, courseName: "Cálculo Diferencial (Turma 1A) - Engenharia - 2026 / 2º Sem" });
    assert(!/\/10 · /.test(text(noF.header)), "no formula in the Centro de Notas: no number invented");
    curso.grupos[0].grupo_colunas[1].coluna.nome_coluna = "Prova final";
    const cp = await runContent("/courses/99901", [], { centro: { user: 5, at: Date.now(), courses: { 99901: curso } } }, { courseId: 99901, courseName: "Cálculo Diferencial (Turma 1A) - Engenharia - 2026 / 2º Sem" });
    const cph = cp.anchor.kids[0];
    assert(cph && /2,0 de 10 agora/.test(text(cph)) && /precisa 10,0\/10 em média no que falta/.test(text(cph)) && /Falta: Prova final/.test(text(cph)), "the course page: now, the need and what is left, from the Centro de Notas: " + (cph && text(cph)).slice(0, 200));
  }
  const cdh = await runContent("/", null, { hidden: ["71306"] });
  assert(!/\/10 · /.test(text(cdh.header)), "a hidden course gets nothing");
  cd.env.window.cpHiddenChanged(["71306"]); assert(!/\/10 · /.test(text(cd.header)), "unticked in the popup: off at once, no reload"); ok();

  // .ics: the deadlines and exams from today on
  const icsPage = await runContent("/", null);
  const icsBtn = all(icsPage.anchor).find(e => e.textContent === "↓ .ics");
  let blob = null; const realCreate = URL.createObjectURL; URL.createObjectURL = b => { blob = b; return "blob:x"; };
  icsBtn.listeners.click(); URL.createObjectURL = realCreate;
  const ics = await blob.text();
  assert(/^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics), "a calendar file");
  assert(/SUMMARY:Lista 3 · Arquitetura de Banco de Dados\r\n/.test(ics) && /DTSTART:\d{8}T\d{6}Z/.test(ics) && /URL:https:\/\/pucpr.instructure.com\/courses\/71306\/assignments\/1/.test(ics), "timed deadline with its link");
  assert(!/Relatório/.test(ics), "past work left out"); assert(/UID:assignment:1@caderno-plus/.test(ics)); ok();
  const locked = await runContent("/", null, Object.assign({}, st10, { refreshing: Date.now() - 5000 }), { scripts: pageEnv });
  assert.strictEqual(reads(locked).length, 0, "another tab is reading: this one uses the last reading");
  assert(all(locked.anchor).some(e => /kpi/.test(e.className)), "and still draws it");
  const freed = await runContent("/", null, Object.assign({}, st10, { refreshing: Date.now() - 2 * 60 * 1000 }));
  assert.strictEqual(reads(freed).length, 6, "a lock left by a closed tab expires after a minute"); assert.strictEqual(freed.store.refreshing, undefined, "lock released");
  // SSO or cookie switch: no user id in the page, a fresh reading of A, but the session is B → nothing of A is drawn
  const toB = await runContent("/", null, Object.assign({}, cold.store, { who: { id: 5, at: Date.now() } }), { selfId: 8, failCourses: true });
  assert.strictEqual(toB.store.cache, undefined, "A's reading dropped"); assert.strictEqual(toB.anchor.kids.length, 0, "nothing of A drawn"); assert.strictEqual(toB.fetches[0], "/api/v1/users/self");
  const lockB = await runContent("/", null, Object.assign({}, st10, { refreshing: Date.now() - 5000 }), { selfId: 8, failCourses: true });
  assert(lockB.store.cache === undefined && lockB.anchor.kids.length === 0, "the other-tab lock path does not show A's reading to B either");
  const fromPage = await runContent("/", null, {}, { scripts: [{ textContent: 'ENV = {"current_user_id":"5","x":1}' }] });
  assert(!fromPage.fetches.includes("/api/v1/users/self") && fromPage.store.cache.user === 5, "user id printed in the page: no /users/self");
  const switched = await runContent("/", null, cold.store, { scripts: [{ textContent: 'ENV = {"current_user_id":"8"}' }] });
  assert(switched.store.cache.user === 8 && reads(switched).length === 5, "another user in the page: the reading is not reused");
  for (const pth of ["/login/canvas", "/logout", "/users/sign_out"]) {
    const lo = await runContent(pth, null, cold.store);
    assert.strictEqual(lo.store.who, undefined, pth + ": cached user forgotten"); assert.strictEqual(lo.store.cache, undefined, pth + ": last reading removed, not only marked old");
    assert.strictEqual(lo.fetches.length, 0, pth + ": nothing read"); assert.strictEqual(lo.anchor.kids.length, 0, pth + ": nothing drawn");
  }
  // no user id in the page, a 12 h cached user A, but the session is now B: a fresh read is labelled with B, A's reading dropped
  const asA = Object.assign({}, st10, { who: { id: 5, at: Date.now() } });
  const asB = await runContent("/", null, asA, { selfId: 8 });
  assert.strictEqual(asB.store.cache.user, 8, "fresh reading stored as user B");
  assert.strictEqual(asB.fetches[0], "/api/v1/users/self", "user confirmed before reading");
  const sw2 = await runContent("/", null, cold.store, { scripts: [{ textContent: 'ENV = {"current_user_id":"9"}' }], denied: true });
  assert.strictEqual(sw2.store.cache, undefined, "another user in the page: the old reading is dropped before anything is drawn, even when Canvas fails");
  assert.strictEqual(sw2.anchor.kids.length, 0, "and nothing of the previous user is drawn");
  const out = await runContent("/", null, st10, { denied: true });
  assert(out.store.cache === undefined && out.store.who === undefined, "401 (logged out): last reading and user forgotten");
  assert.strictEqual(out.anchor.kids.length, 0, "and nothing drawn"); ok();

  // every module off: nothing on the page, and the reminders cleared
  const off = await runContent("/", null, { prefs: { week: false, news: false, grades: false, remind: false, summary: false } });
  assert.strictEqual(off.anchor.kids.length, 0, "no dashboard panel"); assert(!/precisa|garantido|faltam|recuperação/.test(text(off.header)), "no card pill");
  assert.deepStrictEqual(off.sent.find(m => m.type === "remind").items, [], "reminders and summary off: the list sent is empty");
  const sumOnly = await runContent("/", null, { prefs: { remind: false } });
  const sm = sumOnly.sent.find(m => m.type === "remind");
  assert(sm.items.length > 0 && sm.alarms === false, "reminders off, summary on: the list goes for the summary, no alarms");
  const nofiles = await runContent("/courses/71306", [], { prefs: { files: false } });
  assert(!all(nofiles.anchor).some(e => e.textContent === "Baixar arquivos da matéria"), "files off: no download button");
  assert.match(text(nofiles.anchor), /garantidos de 10/, "grades still shown");
  plannerFails = true;
  const noPlan = await runContent("/", null); plannerFails = false;
  assert.doesNotMatch(text(noPlan.anchor), /Próximos 7 dias/, "planner down: no week");
  assert(!noPlan.sent.some(m => m.type === "remind"), "planner down: the reminders already set are kept"); assert.match(text(noPlan.anchor), /Prova adiada/, "announcements still shown"); ok();

  // theme.js: class on <html> from the setting, live when the popup changes it
  const theme = (pref, systemDark, hour, last, more) => {
    const cls = new Set(), listen = {}, doc = { createElement: () => ({}), head: { appendChild() {}, append() {} }, documentElement: { classList: { toggle: (c, on) => on ? cls.add(c) : cls.delete(c) } } };
    const chrome = { storage: { local: { get: async () => ({ prefs: Object.assign({ theme: pref }, more) }) }, onChanged: { addListener: f => { listen.change = f; } } } };
    const ticks = [], RealDate = Date, D = hour == null ? Date : class extends RealDate { getHours() { return hour; } }, styles = [], ls = {};
    doc.createElement = () => { const st = {}; styles.push(st); return st; };
    const storage = { getItem: k => ls[k] == null ? null : ls[k], setItem: (k, v) => { ls[k] = String(v); } };
    if (last) ls["cp-look"] = JSON.stringify(last);
    new Function("document", "chrome", "matchMedia", "setInterval", "Date", "localStorage", "location", read("prefs.js") + "\n" + read("theme.js"))(doc, chrome, () => ({ matches: systemDark, addEventListener() {} }), f => ticks.push(f), D, storage, { pathname: (more && more.path) || "/" });
    return { cls, listen, ticks, styles, ls };
  };
  const th = theme("dark", false); await new Promise(r => setTimeout(r, 5));
  assert(th.cls.has("cp-dark"), "dark theme"); th.listen.change({ prefs: { newValue: { theme: "off" } } }, "local"); assert(!th.cls.has("cp-dark"), "turned off live");
  const auto = theme("auto", true), light = theme(undefined, true); await new Promise(r => setTimeout(r, 5));
  assert(auto.cls.has("cp-dark") && !light.cls.has("cp-dark"), "auto follows the system; default is the Canvas light theme");
  const thDim = theme("dim", false), thLate = theme("night", false, 22), thDay = theme("night", true, 13); await new Promise(r => setTimeout(r, 5));
  assert(thDim.cls.has("cp-dark") && thDim.cls.has("cp-dim"), "dim: dark, softer"); assert(thLate.cls.has("cp-dark") && !thLate.cls.has("cp-dim"), "night at 22h: dark");
  assert(!thDay.cls.has("cp-dark"), "night at 13h: light, whatever the system"); assert.strictEqual(thDay.ticks.length, 1, "checked again every few minutes");
  // looks: the whole Canvas, Caderno by default, through Canvas's own brand variables, plus the left menu; no font changes
  const lk = theme("off", false); await new Promise(r => setTimeout(r, 5));
  const lookCss = () => lk.styles.find(x => x.id === "cp-look").textContent;
  assert(lk.cls.has("cp-look") && lk.cls.has("cp-look-nav") && /--ic-brand-primary:#E2482B !important/.test(lookCss()) && /--ic-brand-global-nav-bgd:var\(--cp-menu\)/.test(lookCss()), "default: the Caderno look and menu");
  assert(!/font-family/.test(lookCss()) && !/Fraunces/.test(lookCss()), "no font forced on Canvas (InstUI sets its own; mixed families looked broken)");
  assert(/\.ic-DashboardCard \{ border-radius:14px/.test(lookCss()), "cards rounded");
  assert(/\.ic-DashboardCard__box__container \{ text-align:center/.test(lookCss()) && !/\.ic-DashboardCard \{ display:flex/.test(lookCss()) && !/__header_hero, \.ic-DashboardCard__header_image \{ height/.test(lookCss()), "Canvas's own card layout kept, rows only centered (no forced sizes)");
  assert.strictEqual(lk.ls["cp-look"], JSON.stringify({ theme: "off", look: "caderno", bg: "liso", bgColor: "", nav: "tema", mode: "completo", native: true, cardImg: true, nativeCal: false, navHide: false }), "kept for the next first paint");
  assert(!/translateX\(calc\(-100% \+ 10px\)\)/.test(lookCss()), "the left menu stays by default");
  assert(!/background-attachment:fixed/.test(lookCss()), "plain background by default");
  lk.listen.change({ prefs: { newValue: { look: "oceano" } } }, "local");
  assert(/--cp-paper:#E2EDF9;/.test(lookCss()), "Oceano paints a light blue page");
  lk.listen.change({ prefs: { newValue: { look: "oceano", bgColor: "#FBE6EC" } } }, "local");
  assert(/--cp-paper:#FBE6EC;/.test(lookCss()), "the student's own background color wins over the look's");
  lk.listen.change({ prefs: { newValue: { look: "oceano", bgColor: "red;}" } } }, "local");
  assert(/--cp-paper:#E2EDF9;/.test(lookCss()), "only a #RRGGBB color is taken");
  const dkT = theme("dark", false); await new Promise(r => setTimeout(r, 5)); dkT.listen.change({ prefs: { newValue: { theme: "dark", look: "oceano" } } }, "local");
  const dkCss = dkT.styles.find(x => x.id === "cp-look").textContent;
  assert(/--cp-paper:#E2EDF9; --cp-card:color-mix\(in srgb, #E2EDF9 94%, #000\);/.test(dkCss), "dark Oceano: page and cards from the same blue, not neutral gray");
  lk.listen.change({ prefs: { newValue: { bg: "quadriculado" } } }, "local");
  assert(/#right-side, \.ic-Dashboard-header, [^{]*\{ background-image:linear-gradient\(90deg/.test(lookCss()) && /background-size:24px 24px !important; background-attachment:fixed/.test(lookCss()), "a background pattern on every page layer, fixed so they line up");
  assert(/\.ic-Dashboard-header :is\(div, span, header\):not\(\.cp-host, button \*, \[role="button"\] \*\)\) \{ background-image:/.test(lookCss()), "the dashboard header (its React box paints white) carries the same background");
  lk.listen.change({ prefs: { newValue: { look: "original", bg: "quadriculado" } } }, "local");
  assert(!/background-attachment:fixed/.test(lookCss()), "Original keeps Canvas's own background");
  lk.listen.change({ prefs: { newValue: { navHide: true } } }, "local");
  assert(/\.ic-app-header \{ transform:translateX\(calc\(-100% \+ 10px\)\)/.test(lookCss()) && /\.ic-app-header:is\(:hover, :focus-within\) \{ transform:none/.test(lookCss()) && /\.ic-Layout-wrapper \{ margin-left:10px !important/.test(lookCss()) && /:has\(#nav-tray-portal \[role="dialog"\]\) \.ic-app-header \{ transform:none/.test(lookCss()), "menu hidden: a strip that opens on hover or focus, the page takes the room");
  lk.listen.change({ prefs: { newValue: {} } }, "local");
  assert(/cp-has-panel \[data-testid="widget-container-course-work-combined-widget"\] \{ display:none/.test(lookCss()) && !/section\[role="region"\]\[data-testid\^="widget-"\]/.test(lookCss()), "widget dashboard: our week replaces its Course work widget; the rest is left to Canvas");
  assert(/#right-side \.button-sidebar-wide \{ display:flex/.test(lookCss()) && /ToDoSidebarItem, \.to-do-list > li, \.group_list > li, \.event/.test(lookCss()) && /context-course_"\] #right-side :is\(\.ToDoSidebarItem__Title \+ span/.test(lookCss()), "the course page's right column: buttons and items as cards, the repeated course name hidden");
  assert(/#section-tabs a\.announcements::before \{ -webkit-mask-image:url\("data:image\/svg\+xml/.test(lookCss()) && /a\[class\*="context_external_tool"\]::before/.test(lookCss()), "an icon per course menu item (tools too)");
  assert(/:is\(#my_courses_table, #past_enrollments_table/.test(lookCss()) && /#nav-tray-portal li \{/.test(lookCss()) && !/:root\.cp-look \.ic-Table/.test(lookCss()), "table look only on the Cursos and Grupos lists (the grades page is left alone)");
  assert(/menu-list-item--active \.ic-app-header__menu-list-link \{ background:#E2482B !important/.test(lookCss()), "the active menu item takes the look (over the PUCPR purple)");
  lk.listen.change({ prefs: { newValue: { native: false } } }, "local"); assert(/cp-has-panel \[data-testid="widget-columns"\] \{ display:none/.test(lookCss()), "Canvas's widgets off: hidden");
  const dk = theme("dark", false); await new Promise(r => setTimeout(r, 5));
  assert(/--cp-paper:#F7EFDF; --cp-card:color-mix\(in srgb, #F7EFDF 94%, #000\)/.test(dk.styles.find(x => x.id === "cp-look").textContent), "dark Caderno: the cream turns into a warm dark, cards from it");
  dk.listen.change({ prefs: { newValue: { theme: "dark", look: "grafite" } } }, "local");
  assert(/--cp-paper:#FFFFFF; --cp-card:#F3F3F3/.test(dk.styles.find(x => x.id === "cp-look").textContent), "dark Grafite: neutral gray");
  lk.listen.change({ prefs: { newValue: { mode: "limpo" } } }, "local");
  assert(lk.cls.has("cp-mode-limpo") && /#right-side-wrapper, #right-side, #footer/.test(lookCss()) && !/:is\(#DashboardCard_Container/.test(lookCss()), "limpo: Canvas clutter hidden, cards kept");
  assert(lk.cls.has("cp-dash-page") && /:root\.cp-dash-page :is\(#right-side-wrapper/.test(lookCss()), "the clutter rules apply on the dashboard only");
  const quizPage = theme("off", false, undefined, undefined, { path: "/courses/1/quizzes/2/take", mode: "limpo" }); await new Promise(r => setTimeout(r, 5));
  assert(!quizPage.cls.has("cp-dash-page"), "a quiz page keeps its side column (timer, questions)");
  lk.listen.change({ prefs: { newValue: { mode: "foco" } } }, "local");
  assert(/:root\.cp-course-page #right-side-wrapper \{ display:none/.test(lookCss()) && /#footer, \.ic-app-footer/.test(lookCss()), "Limpo/Foco reach the course pages: no side column on home/modules, no footers");
  assert(lk.cls.has("cp-mode-foco") && !lk.cls.has("cp-mode-limpo") && !/#DashboardCard_Container[^{]*\{ display:none/.test(lookCss()), "foco: the course cards stay");
  lk.listen.change({ prefs: { newValue: { cardImg: false } } }, "local");
  assert(/__header_image \{ background-image:none/.test(lookCss()), "cards without pictures");
  lk.listen.change({ prefs: { newValue: { look: "original", nav: "original" } } }, "local");
  assert(!lk.cls.has("cp-look") && !lk.cls.has("cp-look-nav") && !/--ic-brand|cp-look-nav/.test(lookCss()), "Canvas original: no colors or menu changed, live");
  lk.listen.change({ prefs: { newValue: { look: "original", nav: "verde" } } }, "local");
  assert(!lk.cls.has("cp-look") && lk.cls.has("cp-look-nav") && /#1F5C42/.test(lookCss()), "menu color works without a look");
  lk.listen.change({ prefs: { newValue: { look: "pastel" } } }, "local"); assert(/#7C5CDB/.test(lookCss()), "pastel");
  const firstPaint = theme("off", false, undefined, { look: "original", nav: "original" });
  assert(!firstPaint.cls.has("cp-look"), "the first paint already uses the last choice (before prefs arrive)"); ok();

  // no separate page: no menu item, no #campus overlay; the meta lives on the dashboard and is saved
  const camp = await runContent("/", null, {}, { hash: "#campus" });
  assert(!camp.menu.kids.length && !camp.body.kids.some(k => k.id === "cp-app") && !all(camp.anchor).some(e => /^#campus/.test(e.href || "")), "no Caderno+ page, menu item or #campus link");
  const metaUp = all(camp.anchor).find(e => e["aria-label"] === "Meta maior");
  assert(metaUp && /Meta[ |]+−[ |]+7[ |]+\+/.test(text(all(camp.anchor).find(e => e.className === "meta"))), "meta 7 on the dashboard");
  await metaUp.listeners.click(); await new Promise(r => setTimeout(r, 15));
  assert(camp.store.prefs.meta === "7.5" && /Meta[ |]+−[ |]+7,5/.test(text(all(camp.anchor).find(e => e.className === "meta"))), "meta raised, saved and redrawn");
  const up2 = all(camp.anchor).find(e => e["aria-label"] === "Meta maior"); up2.listeners.click(); up2.listeners.click(); await new Promise(r => setTimeout(r, 30));
  assert.strictEqual(camp.store.prefs.meta, "8.5", "two quick clicks add up"); ok();

  // the bookmarklet on the site: the extension's page scripts, bundled with an in-memory chrome stand-in
  const lit = fs.readFileSync(path.join(root, "index.html"), "utf8").match(/\/\*CP-BM\*\/("(?:[^"\\]|\\.)*")\/\*CP-BM\*\//);
  assert(lit, "bookmarklet source on index.html"); const bm = JSON.parse(lit[1]);
  let at = 0; if (!process.env.EXT_DIR) for (const f of ["prefs.js", "collect.js", "core.js", "files.js", "content.js"]) { const i = bm.indexOf(read(f), at); assert(i > at, f + " bundled as is, in order: run scripts/sync-bookmarklet"); at = i; }
  new Function(bm);   // valid code
  const bmDash = await runContent("/", null, {}, { src: bm });
  assert.match(text(bmDash.anchor), /Próximos 7 dias/); assert.match(text(bmDash.anchor), /Prova adiada/);
  assert(!bmDash.menu.kids.length, "no menu item in the bookmarklet");
  const bmCourse = await runContent("/courses/71306", [], {}, { src: bm });
  assert(!/garantidos de 10/.test(text(bmCourse.anchor)), "the bookmarklet keeps no turma answer: no grades from another turma");
  assert(!all(bmCourse.anchor).some(e => /^Baixar|^Abrir no Caderno|^Anotações/.test(e.textContent)), "no downloads, no calculator page and no notes in the bookmarklet");
  const bmOther = await runContent("/profile", null, {}, { src: bm });
  assert.strictEqual(bmOther.alerts.length, 1, "elsewhere it asks for the dashboard or a course"); ok();

  const none = await runContent("/courses/71306/quizzes", null);
  assert.strictEqual(none.anchor.kids.length, 0, "no panel on other course pages"); ok();
  console.log("inside canvas ok: core copy, " + n + " groups (routing, safe names, download guard and completion, badge, dashboard pill, course panel, files download, per-user cache, modules fallback, reminders, week timeline and announcements, dashboard grades, exams and empty week, modules off, theme, no separate page and meta, bookmarklet, ticks, search, new grades, summary and .ics, fold and scroll, simulator, notes, inbox, focus, cards, modes, tasks, what changed, course grades widget, calendar, ask the teacher)");
})().catch(e => { console.error(e); process.exit(1); });
