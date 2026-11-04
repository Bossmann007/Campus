// Extension: collectCanvasGrades against a mocked Canvas, and the popup's base64url hand-off decoded the way index.html decodes it.
const assert = require("assert"), fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "extension");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
assert.strictEqual(manifest.manifest_version, 3);
assert.deepStrictEqual(manifest.permissions, ["activeTab", "scripting"], "no broad permissions");
assert(!manifest.host_permissions, "no host permissions");
for (const f of Object.values(manifest.icons)) assert(fs.existsSync(path.join(dir, f)), "icon " + f);
const priv = fs.readFileSync(path.join(__dirname, "..", "privacidade.html"), "utf8");
assert(/activeTab/.test(priv) && /localStorage/.test(priv) && !/<script/.test(priv), "privacy page lists permissions and storage, no scripts");
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
const popupSrc = fs.readFileSync(path.join(dir, "popup.js"), "utf8");
const b64url = new Function(popupSrc.match(/function b64url[\s\S]*?\n\}/)[0] + "\nreturn b64url;")();   // Node's own btoa, like the browser
const page2 = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const decodeLines = page2.match(/const b = atob\(location\.hash[^\n]*\n[^\n]*TextDecoder[^\n]*/);
assert(decodeLines, "index.html hash decode found");
const decodeHash = hash => { const location = { hash }, ta = {}; eval(decodeLines[0]); return ta.value; };   // runs index.html's own lines
(async () => {
  const out = await collect();
  assert.deepStrictEqual(out, { v: 1, courses: [{ name: "Ética (Turma 2º B) - 2026 / 2º Sem", assignments: [
    { name: "Avaliação somativa -  Prova", points: 10, score: 7, due: null, missing: false, submitted: true, online: true, stats: { mean: 6.5, min: 2, max: 10 } }, { name: "TDE - TAREFA SOMATIVA - VÍDEO", points: 10, score: null, due: "2026-11-11T02:59:59Z", missing: true, submitted: false, online: false, stats: null }] }],
    announcements: [{ course: "Ética (Turma 2º B) - 2026 / 2º Sem", title: "Prova adiada", at: "2026-11-03T15:00:00Z", unread: true, url: "https://pucpr.instructure.com/courses/7/discussion_topics/1" }] });
  const big = JSON.stringify({ v: 1, courses: Array.from({ length: 8 }, (_, i) => ({ name: "Matéria " + i + " ção", assignments: Array.from({ length: 60 }, (_, j) => ({ name: "Avaliação " + j + " é", points: 10, score: j, due: "2026-11-11T02:59:59Z", missing: false })) })) });
  const enc = b64url(big);
  assert(/^[A-Za-z0-9_-]+$/.test(enc), "url-safe");
  const dec = decodeHash("#canvas=" + enc);
  assert.strictEqual(dec, big, "hand-off round trip (" + big.length + " chars)");
  global.fetch = async () => page([{ id: 1, name: "X - 2026 / 2º Sem" }], "https://evil.example/x");
  assert.match((await collect()).error, /fora do Canvas/);
  global.fetch = async () => ({ ok: false, status: 401, text: async () => "", headers: { get: () => null } });
  assert.deepStrictEqual(await collect(), { error: "o Canvas respondeu 401" });
  assert(!/javascript:|canvasExport/.test(page2), "no bookmarklet left on the site");
  assert(page2.includes('href="https://github.com/Bossmann007/quanto-falta-pucpr/releases/latest/download/quanto-falta-extension.zip"'), "download link matches scripts/package-extension");
  assert(/cp "\$out" dist\/quanto-falta-extension\.zip/.test(fs.readFileSync(path.join(__dirname, "..", "scripts", "package-extension"), "utf8")), "package script writes the stable name");
  console.log("extension ok: MV3, activeTab+scripting only, collect + pagination, url-safe hand-off decoded by index.html's own code, " + big.length + " chars, off-origin and 401 returned as errors");
})().catch(e => { console.error(e); process.exit(1); });
