// Extension inside Canvas: core.js is app.html's core, file routing, the service worker's download guard, and content.js
// run against a mocked Canvas (dashboard pill, course panel, files download through the service worker).
const assert = require("assert"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dir = path.join(root, "extension");
const read = f => fs.readFileSync(path.join(dir, f), "utf8");
let n = 0; const ok = s => { n++; };

// core.js is a copy of app.html's core block
const core = fs.readFileSync(path.join(root, "app.html"), "utf8").match(/<script id="core">([\s\S]*?)<\/script>/)[1].replace(/^\n+|\n+$/g, "");
assert.strictEqual(read("core.js").split("\n").slice(1).join("\n").replace(/\n+$/, ""), core, "extension/core.js is stale: run scripts/sync-ext-core"); ok();
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
const area = o => ({ get: async k => ({ [k]: o[k] }), set: async v => { Object.assign(o, v); }, remove: async k => { delete o[k]; } });
let nextId = 100;
const chromeSW = { runtime: { id: "me", onMessage: { addListener: f => { listeners.msg = f; } }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
  storage: { local: area(local), session: area(session) }, alarms: { create() {}, onAlarm: { addListener() {} } },
  action: { setBadgeText: async o => { local.badge = o.text; }, setTitle: async () => {}, setBadgeBackgroundColor: async () => {} },
  downloads: { onChanged: { addListener: f => { listeners.changed = f; } }, download: async o => { if (/boom/.test(o.filename)) throw new Error("Invalid filename"); swSaved.push(o); return nextId++; } } };
const sw = new Function("chrome", read("background.js") + "\nreturn { okDownload };")(chromeSW);
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
    addEventListener(t, f) { this.listeners[t] = f; }, attachShadow() { this.shadow = fakeEl("#shadow"); return this.shadow; } };
  return e;
}
const all = e => [e, ...(e.shadow ? all(e.shadow) : []), ...e.kids.flatMap(all)];
const text = e => all(e).map(x => x.textContent).join(" | ");
const page = body => ({ ok: true, text: async () => "while(1);" + JSON.stringify(body), headers: { get: () => null } });
const BD = "Arquitetura de Banco de Dados (Turma 2º B) - 2026 / 2º Sem";
async function runContent(pathname, files, preStore) {
  const header = fakeEl("div"), card = fakeEl("div"), anchor = fakeEl("div"), sent = [], store = Object.assign({}, preStore);
  card.querySelector = sel => sel.startsWith("a[") ? { getAttribute: () => "/courses/42" } : header;
  const doc = { createElement: fakeEl, body: {}, getElementById: id => id === "content" ? anchor : null,
    querySelectorAll: sel => sel.startsWith(".ic-DashboardCard") && !card.dataset.qf ? [card] : [] };
  const chrome = { runtime: { getManifest: () => ({ version: C.EXT_LATEST }), sendMessage: async m => { sent.push(m); return m.type === "download" ? { done: m.items.map(i => i.id) } : { ok: true }; } },
    storage: { local: { get: async k => ({ [k]: store[k] }), set: async o => Object.assign(store, o) } } };
  const fetch = async url => {
    if (url === "/api/v1/users/self") return page({ id: 5 });
    if (url.startsWith("/api/v1/courses?")) return page([{ id: 42, name: BD }]);
    if (url.startsWith("/api/v1/courses/42/assignments")) return page([{ name: "Entrega PjBL - Parte 1 03/09", points_possible: 1, submission: { score: 1 } },
      { name: "Avaliação somativa RA1 10/09", points_possible: 1.25, submission: { score: 1.25 } }, { name: "Avaliação somativa RA2 22/10", points_possible: 3, submission: { score: 3 } },
      { name: "Entrega PjBL - Parte 2 15/10", points_possible: 2, submission: { score: 2 } }]);
    if (url.startsWith("/api/v1/announcements")) return page([]);
    if (url.startsWith("/api/v1/courses/42/files?")) return files ? page(files) : { ok: false, status: 401, text: async () => "", headers: { get: () => null } };
    if (url.startsWith("/api/v1/courses/42/modules?")) return page([{ items: [{ type: "File", content_id: 9 }, { type: "Page" }] }]);
    if (url === "/api/v1/courses/42/files/9") return page({ id: 9, display_name: "Aula 9.pdf", url: "https://pucpr.instructure.com/files/9/download?verifier=v", size: 5 });
    throw new Error("unexpected " + url);
  };
  const env = { window: {}, location: { pathname, href: "https://pucpr.instructure.com" + pathname, origin: "https://pucpr.instructure.com" } };
  env.window.top = env.window;
  const src = read("collect.js") + "\n" + read("core.js") + "\n" + read("files.js") + "\n" + read("content.js");
  new Function("window", "location", "document", "chrome", "fetch", "MutationObserver", "TextEncoder", "btoa", src)(env.window, env.location, doc, chrome, fetch,
    class { observe() {} }, TextEncoder, btoa);
  await new Promise(r => setTimeout(r, 30));
  return { header, anchor, sent, store };
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
  assert.match(text(host), /Quanto falta/); assert.match(text(host), /RA2 · TDE|RA3/, "next assessments of this course listed");
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

  const none = await runContent("/courses/42/quizzes", null);
  assert.strictEqual(none.anchor.kids.length, 0, "no panel on other course pages"); ok();
  console.log("inside canvas ok: core copy, " + n + " groups (routing, safe names, download guard and completion, badge, dashboard pill, course panel, files download, per-user cache, modules fallback)");
})().catch(e => { console.error(e); process.exit(1); });
