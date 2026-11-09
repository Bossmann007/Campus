// Extension: manifest and permissions, collectCanvasGrades against a mocked Canvas, the generated calculator page, the site's download links.
const assert = require("assert"), fs = require("fs"), path = require("path");
const dir = process.env.EXT_DIR || path.join(__dirname, "..", "extension");   // EXT_DIR: the packaged (compacted) copy
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
assert(manifest.description.length <= 132 && manifest.name.length <= 75, "Chrome Web Store limits: description <= 132 (" + manifest.description.length + "), name <= 75");
assert.strictEqual(manifest.manifest_version, 3);
assert.deepStrictEqual(manifest.permissions, ["storage", "downloads", "alarms", "notifications"], "no broad permissions");
assert.deepStrictEqual(manifest.host_permissions, ["https://pucpr.instructure.com/*"], "host access only to the PUCPR Canvas");
assert.deepStrictEqual(manifest.optional_host_permissions, ["https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io/*"], "the Centro de Notas host only on request (an update never disables the extension)");
assert.deepStrictEqual(manifest.content_scripts.map(c => c.matches), [["https://pucpr.instructure.com/*"], ["https://pucpr.instructure.com/*"]], "page scripts only on the PUCPR Canvas");
assert.deepStrictEqual(manifest.content_scripts.map(c => c.run_at), ["document_start", "document_idle"], "theme before the page paints, the rest after it loads");
assert.strictEqual([].concat(...manifest.content_scripts.map(c => c.js)).filter(f => f === "prefs.js").length, 1, "prefs.js once: the scripts share one scope, a second copy would redeclare its consts");
const pack = fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8");
for (const f of [...manifest.content_scripts.flatMap(c => c.js), manifest.background.service_worker, "popup.js", "popup.html", "popup.css", "onboarding.html", "onboarding.css", "onboarding.js", "ai.html", "ai.css", "ai.js"]) {
  assert(fs.existsSync(path.join(dir, f)), "file " + f); assert(new RegExp("\\b" + f.replace(".", "\\.") + "\\b").test(pack), "packaged: " + f); }
for (const f of Object.values(manifest.icons)) assert(fs.existsSync(path.join(dir, f)), "icon " + f);
const priv = fs.readFileSync(path.join(__dirname, "..", "privacidade.html"), "utf8");
assert(["storage", "downloads", "alarms", "notifications", "pucpr.instructure.com"].every(w => priv.includes(w)) && /localStorage/.test(priv) && !/<script/.test(priv), "privacy page lists every permission and storage, no scripts");
const html = fs.readFileSync(path.join(dir, "popup.html"), "utf8");
const ob = fs.readFileSync(path.join(dir, "onboarding.html"), "utf8");
{ const ai = fs.readFileSync(path.join(dir, "ai.html"), "utf8"), pk = fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8");
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(ai) && !/\son\w+=/.test(ai) && /id="agentFile"/.test(ai) && /ai\.html ai\.css ai\.js/.test(pk), "Sua IA page: no inline script (MV3 CSP), the switch, shipped in the zip"); }
assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(ob) && !/\son\w+=/.test(ob), "onboarding: no inline script or handler (MV3 CSP)");
assert(/details\.reason === "install"\) \{ chrome\.storage\.local\.set\(\{ notesSeen: chrome\.runtime\.getManifest\(\)\.version \}\); chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\("onboarding\.html"\) \}\)/.test(fs.readFileSync(path.join(dir, "background.js"), "utf8")), "the onboarding opens on first install");
for (const k of ["turma", "mode", "look", "theme", "navHide", "remind", "newgrades", "summary", "cardsFirst", "agentFile"]) assert(new RegExp('data-(set|pref|sel)="' + k + '"').test(ob) || (k === "turma" && /dataset\.set = "turma"/.test(fs.readFileSync(path.join(dir, "onboarding.js"), "utf8"))), "onboarding sets " + k);
assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html) && !/\son\w+=/.test(html), "no inline script or handler (MV3 CSP)");
assert(/id="agentErr"/.test(html) && /Perguntar onde salvar cada arquivo/.test(html), "popup: the file switch says Chrome must not ask where to save, and shows why it turned off");
{ // "Conectar sua IA": the popup only links to the site page; the page and the privacy text carry the warnings
  const root = path.join(__dirname, ".."), ia = fs.readFileSync(path.join(root, "ia.html"), "utf8"), pv = fs.readFileSync(path.join(root, "privacidade.html"), "utf8");
  assert(/<a id="ia" href="https:\/\/falta-quanto\.vercel\.app\/ia" target="_blank" rel="noopener noreferrer">/.test(html), "popup: one link to the site's /ia page");
  assert(!/mcp|caderno-mcp/i.test(fs.readdirSync(dir).join(" ")), "no MCP code inside the extension");
  assert(/^!ia\.html$/m.test(fs.readFileSync(path.join(root, ".vercelignore"), "utf8")) && !/<script/i.test(ia), "the /ia page is published, with no scripts");
  assert(!/npx|caderno-mcp (login|status|setup)/.test(ia.replace(/<!--[\s\S]*?-->/g, "")) && /Ainda não publicado/.test(ia), "no runnable install command before the npm name is ours");
  assert(/não usa token nenhum/.test(ia) && /Ligue o arquivo na extensão \(sem token\)/.test(ia) && /<details><summary>Opcional: com token/.test(ia), "the /ia page leads with the no-token way; the token is optional");
  for (const w of [/nuvem da empresa da IA/, /acesso <b>total<\/b>/, /3\(i\)/, /no seu computador/, /href="\/privacidade"/]) assert(w.test(ia), "the /ia page says " + w);
  assert(/Caderno\+ MCP: conectar sua IA/.test(pv) && /aqui os dados saem do computador/.test(pv) && /única exceção é opcional/.test(pv), "privacy page: the MCP section and the exception in the summary"); }
assert(/const KEEP = \[[^\]]*"checks"/.test(fs.readFileSync(path.join(dir, "popup.js"), "utf8")) && /checks: u =>/.test(fs.readFileSync(path.join(dir, "popup.js"), "utf8")), "the backup carries the checklists, validated on import");
{ const nj = fs.readFileSync(path.join(dir, "notes.js"), "utf8"), ver = (nj.match(/version: "([\d.]+)"/) || [])[1];
  assert.strictEqual(ver, manifest.version, "Novidades are for this version");
  assert(manifest.content_scripts.some(c => c.js.indexOf("notes.js") >= 0 && c.js.indexOf("notes.js") < c.js.indexOf("content.js")) && /src="notes\.js"/.test(html), "notes.js loads before the panel and in the popup");
  assert(/notes\.js/.test(fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8")), "notes.js goes into the store zip"); }
global.location = { href: "https://pucpr.instructure.com/courses", origin: "https://pucpr.instructure.com" };
const page = (body, next) => ({ ok: true, text: async () => "while(1);" + JSON.stringify(body), headers: { get: h => h === "Link" && next ? "<" + next + '>; rel="next"' : null } });
global.fetch = async url => {
  if (url.startsWith("/api/v1/courses?")) return page([{ id: 7, name: "Ética (Turma 2º B) - 2026 / 2º Sem" }, { id: 8, name: "Penso, Logo Programo - 2023/1" }]);
  if (url.startsWith("/api/v1/courses/7/assignments")) return page([{ name: "Avaliação somativa -  Prova", points_possible: 10, html_url: "https://pucpr.instructure.com/courses/7/assignments/70", score_statistics: { mean: 6.5, min: 2, max: 10 }, submission: { score: 7, workflow_state: "graded" } }], "https://pucpr.instructure.com/n2");
  if (url === "https://pucpr.instructure.com/n2") return page([{ name: "TDE - TAREFA SOMATIVA - VÍDEO", points_possible: 10, due_at: "2026-11-11T02:59:59Z", submission_types: ["on_paper"], submission: { score: null, missing: true } }]);
  if (/^\/api\/v1\/announcements\?context_codes\[\]=course_7&start_date=\d{4}-\d\d-\d\d&end_date=\d{4}-\d\d-\d\d&/.test(url)) return page([{ context_code: "course_7", title: "Prova adiada", posted_at: "2026-11-03T15:00:00Z", read_state: "unread", html_url: "https://pucpr.instructure.com/courses/7/discussion_topics/1", author: { display_name: "Prof. Ana", avatar_image_url: "https://pucpr.instructure.com/images/thumbnails/1/ana.png" } }]);
  throw new Error("unexpected " + url);
};
const collect = new Function(fs.readFileSync(path.join(dir, "core.js"), "utf8") + "\n" + fs.readFileSync(path.join(dir, "collect.js"), "utf8") + "\nreturn collectCanvasGrades;")();   // the term label comes from the core
assert.deepStrictEqual(manifest.web_accessible_resources, [{ resources: ["fonts/*.woff2"], matches: ["https://pucpr.instructure.com/*"] }], "only the fonts, only to the PUCPR Canvas (no extension page is exposed)");
(async () => {
  const seen = {}, out = await collect(seen);
  assert.deepStrictEqual(seen.courses, [{ id: 7, name: "Ética (Turma 2º B) - 2026 / 2º Sem" }, { id: 8, name: "Penso, Logo Programo - 2023/1" }], "the course list is handed back, so the caller does not fetch it again");
  assert.deepStrictEqual(out, { v: 1, courses: [{ id: 7, name: "Ética (Turma 2º B) - 2026 / 2º Sem", assignments: [
    { name: "Avaliação somativa -  Prova", points: 10, url: "https://pucpr.instructure.com/courses/7/assignments/70", score: 7, due: null, missing: false, submitted: true, online: true, stats: { mean: 6.5, min: 2, max: 10 } }, { name: "TDE - TAREFA SOMATIVA - VÍDEO", points: 10, url: null, score: null, due: "2026-11-11T02:59:59Z", missing: true, submitted: false, online: false, stats: null }] }],
    announcements: [{ course: "Ética (Turma 2º B) - 2026 / 2º Sem", courseId: 7, title: "Prova adiada", at: "2026-11-03T15:00:00Z", unread: true, url: "https://pucpr.instructure.com/courses/7/discussion_topics/1", author: "Prof. Ana", avatar: "https://pucpr.instructure.com/images/thumbnails/1/ana.png" }] });
  global.fetch = async () => page([{ id: 1, name: "X - 2026 / 2º Sem" }], "https://evil.example/x");
  assert.match((await collect()).error, /fora do Canvas/);
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "", headers: { get: () => null } });
  assert.deepStrictEqual(await collect(), { error: "o Canvas respondeu 401" });
  const landing = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(landing.includes('href="https://github.com/Bossmann007/Campus/releases/latest/download/quanto-falta-extension.zip"'), "download link matches scripts/package-extension");
  assert(/cp "\$out" dist\/quanto-falta-extension\.zip/.test(fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8")), "package script writes the stable name");
  // popup: "Atualizar agora" marks the last reading as old, so the next Canvas page reads everything again
  const els = {}, store = { cache: { at: Date.now(), user: 5, data: { courses: [] } }, refreshing: Date.now() };
  const pel = id => els[id] || (els[id] = { id, value: "", textContent: "", classList: { toggle() {} }, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } });
  const palarms = {}, pchrome = { runtime: { getManifest: () => manifest, getURL: f => f }, tabs: { create() {} },
    alarms: { create: async (n, o) => { palarms[n] = o; }, clear: async n => { delete palarms[n]; } },
    storage: { local: { get: async k => Object.fromEntries([].concat(k).map(x => [x, store[x]])), set: async o => { Object.assign(store, o); }, remove: async k => { [].concat(k).forEach(x => delete store[x]); } } } };
  const popupSrc = ["prefs.js", "popup.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const ticks = [];
  const oldLs = { "notas-pucpr-2026-2:u5": JSON.stringify({ grades: { "abd:s3": "1,1", "imp:pbl08": "9", "bad key": "1" }, meta: "8" }), other: "x" }, ks = Object.keys(oldLs);
  const pwin = { localStorage: { length: ks.length, key: i => ks[i], getItem: k => oldLs[k] } };
  store.hand = { 5: { "imp:pbl08": "7" } };
  new Function("document", "chrome", "setInterval", "window", popupSrc)({ getElementById: pel, querySelectorAll: () => [] }, pchrome, f => ticks.push(f), pwin);
  await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(store.hand, { 5: { "imp:pbl08": "7", "abd:s3": "1,1" } }, "old Caderno+ page grades move into the Canvas panels (grades already there win, odd keys dropped)");
  assert(store.migrated === 1 && store.prefs.meta === "8", "once, with the old meta");
  store.prefs = Object.assign({}, store.prefs, { mode: "foco" });   // changed by the Canvas panel while the popup is open
  await pel("theme").listeners.change(); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(store.prefs.mode, "foco", "a popup change writes only its own key: the panel's mode survives");
  global.location.hash = "#tab";   // the import runs in a tab (a file dialog closes the popup)
  store.tasks = { 9: [{ id: "a", title: "do outro", date: null }] };
  pel("importFile").files = [{ text: async () => JSON.stringify({ app: "caderno-plus", hand: { 5: { "abd:s3": "1", "x": 5 }, "../x": {} }, tasks: { 5: [{ id: "t", title: "ok", date: "2026-11-09" }, { id: "u", title: 3 }] }, hidden: ["88", "x;}"], prefs: { look: "menta" } }) }];
  await pel("importFile").listeners.change(); await new Promise(r => setTimeout(r, 5));
  assert.deepStrictEqual(store.hand[5], { "abd:s3": "1" }, "import: well-formed grades only"); assert(store.tasks[9] && store.tasks[5].length === 1, "merged per user, bad tasks dropped");
  assert.deepStrictEqual(store.hidden, ["88"], "hidden courses: only course ids"); assert(store.prefs.look === "menta" && store.prefs.meta === "8", "prefs merged");
  store.cache = Object.assign({}, store.cache, { user: 5 });
  pel("importFile").files = [{ text: async () => JSON.stringify({ app: "quanto-falta", grades: { "imp:pbl09": "8", "abd:s3": "0,9", "x y": "1" } }) }];
  await pel("importFile").listeners.change(); await new Promise(r => setTimeout(r, 5));
  assert(store.hand[5]["imp:pbl09"] === "8" && store.hand[5]["abd:s3"] === "1" && !store.hand[5]["x y"], "the site calculator's backup becomes this student's grades (ones already there win)");
  assert(/id="refresh"/.test(html), "popup has the Atualizar agora button");
  await pel("refresh").listeners.click(); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(store.cache.at, 0, "reading marked old"); assert.strictEqual(store.refreshing, undefined, "no read lock left"); assert.match(pel("status").textContent, /Atualiza/, "says what happens next");
  await pel("f25").listeners.click(); await new Promise(r => setTimeout(r, 5));
  assert(palarms["focus|foco"] && store.focus.kind === "foco" && Math.abs(store.focus.end - Date.now() - 25 * 60000) < 2000, "Foco 25 min: one alarm, end saved");
  assert.match(pel("focus").textContent, /^Foco: 2[45]:\d\d restantes$/); assert.strictEqual(pel("fstop").hidden, false); assert.strictEqual(ticks.length, 1, "the countdown ticks");
  await pel("f5").listeners.click(); await new Promise(r => setTimeout(r, 5));
  assert(!palarms["focus|foco"] && palarms["focus|pausa"], "a break replaces the study block");
  await pel("fstop").listeners.click(); await new Promise(r => setTimeout(r, 5));
  assert(!palarms["focus|pausa"] && !store.focus && pel("fstop").hidden, "Parar clears it");
  assert(!/rascunho|nova-turma|issues\/new/.test(html + fs.readFileSync(path.join(dir, "popup.js"), "utf8")), "no turma draft or issue in the popup (planned inside the extension, not shipped)");
  console.log("extension ok: MV3, permissions limited to the PUCPR Canvas, collect + pagination, off-origin and 401 returned as errors");
})().catch(e => { console.error(e); process.exit(1); });
