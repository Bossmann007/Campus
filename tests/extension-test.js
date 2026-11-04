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
assert(!/<script>(?!<)/.test(html) && !/on\w+="/.test(html), "no inline script (MV3 CSP)");
global.location = { href: "https://pucpr.instructure.com/courses", origin: "https://pucpr.instructure.com" };
const page = (body, next) => ({ ok: true, text: async () => "while(1);" + JSON.stringify(body), headers: { get: h => h === "Link" && next ? "<" + next + '>; rel="next"' : null } });
global.fetch = async url => {
  if (url.startsWith("/api/v1/courses?")) return page([{ id: 7, name: "Ética (Turma 2º B) - 2026 / 2º Sem" }, { id: 8, name: "Penso, Logo Programo - 2023/1" }]);
  if (url.startsWith("/api/v1/courses/7/assignments")) return page([{ name: "Avaliação somativa -  Prova", points_possible: 10, submission: { score: 7 } }], "https://pucpr.instructure.com/n2");
  if (url === "https://pucpr.instructure.com/n2") return page([{ name: "TDE - TAREFA SOMATIVA - VÍDEO", points_possible: 10, submission: { score: null } }]);
  throw new Error("unexpected " + url);
};
const collect = new Function(fs.readFileSync(path.join(dir, "collect.js"), "utf8") + "\nreturn collectCanvasGrades;")();
const popupSrc = fs.readFileSync(path.join(dir, "popup.js"), "utf8");
const b64url = new Function("btoa", "TextEncoder", popupSrc.match(/function b64url[\s\S]*?\n\}/)[0] + "\nreturn b64url;")(s => Buffer.from(s, "binary").toString("base64"), TextEncoder);
(async () => {
  const out = await collect();
  assert.deepStrictEqual(out, { v: 1, courses: [{ name: "Ética (Turma 2º B) - 2026 / 2º Sem", assignments: [
    { name: "Avaliação somativa -  Prova", points: 10, score: 7 }, { name: "TDE - TAREFA SOMATIVA - VÍDEO", points: 10, score: null }] }] });
  const big = JSON.stringify({ v: 1, courses: Array.from({ length: 8 }, (_, i) => ({ name: "Matéria " + i + " ção", assignments: Array.from({ length: 60 }, (_, j) => ({ name: "Avaliação " + j + " é", points: 10, score: j })) })) });
  const enc = b64url(big);
  assert(/^[A-Za-z0-9_-]+$/.test(enc), "url-safe");
  const dec = Buffer.from(enc.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  assert.strictEqual(dec, big, "hand-off round trip (" + big.length + " chars)");
  global.fetch = async () => page([{ id: 1, name: "X - 2026 / 2º Sem" }], "https://evil.example/x");
  await assert.rejects(collect(), /fora do Canvas/);
  console.log("extension ok: MV3, activeTab+scripting only, collect + pagination, url-safe hand-off of " + big.length + " chars, off-origin refused");
})().catch(e => { console.error(e); process.exit(1); });
