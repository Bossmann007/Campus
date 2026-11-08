// Extension: manifest and permissions, collectCanvasGrades against a mocked Canvas, the generated calculator page, the site's download links.
const assert = require("assert"), fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
assert.strictEqual(manifest.manifest_version, 3);
assert.deepStrictEqual(manifest.permissions, ["storage", "downloads", "alarms", "notifications"], "no broad permissions");
assert.deepStrictEqual(manifest.host_permissions, ["https://pucpr.instructure.com/*"], "host access only to the PUCPR Canvas");
assert.deepStrictEqual(manifest.content_scripts.map(c => c.matches), [["https://pucpr.instructure.com/*"], ["https://pucpr.instructure.com/*"]], "page scripts only on the PUCPR Canvas");
assert.deepStrictEqual(manifest.content_scripts.map(c => c.run_at), ["document_start", "document_idle"], "theme before the page paints, the rest after it loads");
assert.strictEqual([].concat(...manifest.content_scripts.map(c => c.js)).filter(f => f === "prefs.js").length, 1, "prefs.js once: the scripts share one scope, a second copy would redeclare its consts");
const pack = fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8");
for (const f of [...manifest.content_scripts.flatMap(c => c.js), manifest.background.service_worker, "popup.js", "popup.html", "popup.css", "app.html", "app-ui.js", "app-boot.js"]) {
  assert(fs.existsSync(path.join(dir, f)), "file " + f); assert(new RegExp("\\b" + f.replace(".", "\\.") + "\\b").test(pack), "packaged: " + f); }
for (const f of Object.values(manifest.icons)) assert(fs.existsSync(path.join(dir, f)), "icon " + f);
const priv = fs.readFileSync(path.join(__dirname, "..", "privacidade.html"), "utf8");
assert(["storage", "downloads", "alarms", "notifications", "pucpr.instructure.com"].every(w => priv.includes(w)) && /localStorage/.test(priv) && !/<script/.test(priv), "privacy page lists every permission and storage, no scripts");
const html = fs.readFileSync(path.join(dir, "popup.html"), "utf8");
assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html) && !/\son\w+=/.test(html), "no inline script or handler (MV3 CSP)");
global.location = { href: "https://pucpr.instructure.com/courses", origin: "https://pucpr.instructure.com" };
const page = (body, next) => ({ ok: true, text: async () => "while(1);" + JSON.stringify(body), headers: { get: h => h === "Link" && next ? "<" + next + '>; rel="next"' : null } });
global.fetch = async url => {
  if (url.startsWith("/api/v1/courses?")) return page([{ id: 7, name: "Ética (Turma 2º B) - 2026 / 2º Sem" }, { id: 8, name: "Penso, Logo Programo - 2023/1" }]);
  if (url.startsWith("/api/v1/courses/7/assignments")) return page([{ name: "Avaliação somativa -  Prova", points_possible: 10, score_statistics: { mean: 6.5, min: 2, max: 10 }, submission: { score: 7, workflow_state: "graded" } }], "https://pucpr.instructure.com/n2");
  if (url === "https://pucpr.instructure.com/n2") return page([{ name: "TDE - TAREFA SOMATIVA - VÍDEO", points_possible: 10, due_at: "2026-11-11T02:59:59Z", submission_types: ["on_paper"], submission: { score: null, missing: true } }]);
  if (/^\/api\/v1\/announcements\?context_codes\[\]=course_7&start_date=\d{4}-\d\d-\d\d&end_date=\d{4}-\d\d-\d\d&/.test(url)) return page([{ context_code: "course_7", title: "Prova adiada", posted_at: "2026-11-03T15:00:00Z", read_state: "unread", html_url: "https://pucpr.instructure.com/courses/7/discussion_topics/1" }]);
  throw new Error("unexpected " + url);
};
const collect = new Function(fs.readFileSync(path.join(dir, "collect.js"), "utf8") + "\nreturn collectCanvasGrades;")();
const app = fs.readFileSync(path.join(dir, "app.html"), "utf8");
assert(!/<script(?![^>]*\bsrc=)[^>]*>/.test(app) && !/\son\w+=/.test(app), "calculator page in the extension: no inline script or handler (MV3)");
assert(/default-src 'none'; script-src 'self';/.test(app) && !/script-src[^;"]*unsafe-inline/.test(app), "calculator page: scripts from the package only, network blocked");
assert.deepStrictEqual(manifest.web_accessible_resources, [{ resources: ["app.html"], matches: ["https://pucpr.instructure.com/*"] }], "only the calculator page can be framed, only by the PUCPR Canvas");
(async () => {
  const out = await collect();
  assert.deepStrictEqual(out, { v: 1, courses: [{ name: "Ética (Turma 2º B) - 2026 / 2º Sem", assignments: [
    { name: "Avaliação somativa -  Prova", points: 10, score: 7, due: null, missing: false, submitted: true, online: true, stats: { mean: 6.5, min: 2, max: 10 } }, { name: "TDE - TAREFA SOMATIVA - VÍDEO", points: 10, score: null, due: "2026-11-11T02:59:59Z", missing: true, submitted: false, online: false, stats: null }] }],
    announcements: [{ course: "Ética (Turma 2º B) - 2026 / 2º Sem", title: "Prova adiada", at: "2026-11-03T15:00:00Z", unread: true, url: "https://pucpr.instructure.com/courses/7/discussion_topics/1" }] });
  global.fetch = async () => page([{ id: 1, name: "X - 2026 / 2º Sem" }], "https://evil.example/x");
  assert.match((await collect()).error, /fora do Canvas/);
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "", headers: { get: () => null } });
  assert.deepStrictEqual(await collect(), { error: "o Canvas respondeu 401" });
  const landing = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert(landing.includes('href="https://github.com/Bossmann007/quanto-falta-pucpr/releases/latest/download/quanto-falta-extension.zip"'), "download link matches scripts/package-extension");
  assert(/cp "\$out" dist\/quanto-falta-extension\.zip/.test(fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8")), "package script writes the stable name");
  console.log("extension ok: MV3, permissions limited to the PUCPR Canvas, collect + pagination, calculator page without inline scripts, off-origin and 401 returned as errors");
})().catch(e => { console.error(e); process.exit(1); });
