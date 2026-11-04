// Runs the Canvas bookmarklet (canvasExport in index.html) against a mocked Canvas: same-origin GETs, pagination, while(1) prefix.
const assert = require("assert");
const html = require("fs").readFileSync(process.argv[2], "utf8");
const fn = html.match(/  function canvasExport\(\) \{[\s\S]*?\n  \}\n/);
assert(fn, "canvasExport found in the ui block");
const src = "(" + fn[0].trim() + ")()";
const nodes = []; const mk = tag => ({ tag, style:{}, children:[], textContent:"", setAttribute(){}, append(...c){ this.children.push(...c); }, appendChild(c){ this.children.push(c); }, remove(){} });
global.document = { createElement: t => { const n = mk(t); nodes.push(n); return n; }, body: mk("body"), execCommand(){} };
global.location = { hostname: "pucpr.instructure.com", href: "https://pucpr.instructure.com/courses", origin: "https://pucpr.instructure.com" };
global.alert = m => { throw new Error("alert " + m); };
const calls = [];
const page = (body, next) => ({ ok:true, text: async () => "while(1);" + JSON.stringify(body), headers:{ get: h => h === "Link" && next ? '<' + next + '>; rel="next"' : null } });
global.fetch = async url => { calls.push(url);
  if (url.startsWith("/api/v1/courses?")) return page([{ id:1, name:"Programação WEB (Turma) - 2026 / 2º Sem" }, { id:2, name:"PUC Acolhe" }]);
  if (url === "/api/v1/courses/1/assignments?include[]=submission&per_page=100") return page([{ name:"Entrega TDE", points_possible:1.5, submission:{ score:1.2 } }], "https://pucpr.instructure.com/p2");
  if (url === "https://pucpr.instructure.com/p2") return page([{ name:"Prova", points_possible:10, due_at:"2026-10-20T15:00:00Z", submission:{ score:null, missing:true } }]);
  throw new Error("unexpected " + url); };
eval(src);
setTimeout(() => {
  const ta = nodes.find(n => n.tag === "textarea"); assert(ta, "export box shown");
  const out = JSON.parse(ta.value);
  assert.deepStrictEqual(out, { v:1, courses:[{ name:"Programação WEB (Turma) - 2026 / 2º Sem", assignments:[{ name:"Entrega TDE", points:1.5, score:1.2, due:null, missing:false }, { name:"Prova", points:10, score:null, due:"2026-10-20T15:00:00Z", missing:true }] }] });
  assert(calls.every(u => new URL(u, location.href).origin === location.origin), "only same-origin calls (absolute Link followed)");
  console.log("bookmarklet ok:", calls.length, "GETs, other semesters skipped, pagination and while(1) handled");
}, 50);

// error paths: wrong site alerts and stops; a Canvas error (logged out) is shown in the box, not thrown
setTimeout(() => {
  let alerted = ""; global.alert = m => { alerted = m; };
  global.location = { hostname: "falta-quanto.vercel.app" }; nodes.length = 0; calls.length = 0;
  eval(src);
  assert(/Abra o Canvas/.test(alerted) && calls.length === 0 && nodes.length === 0, "wrong host stops before any request");
  global.location = { hostname: "pucpr.instructure.com", href: "https://pucpr.instructure.com/courses", origin: "https://pucpr.instructure.com" };
  global.fetch = async () => ({ ok:false, status:401, text: async () => "", headers:{ get: () => null } });
  nodes.length = 0; eval(src);
  setTimeout(() => {
    assert(/Não consegui ler as notas: o Canvas respondeu 401/.test(nodes[0].textContent), "401 is reported: " + nodes[0].textContent);
    console.log("bookmarklet error paths ok: wrong site stops, Canvas 401 is shown");
  }, 20);
}, 100);

// a Link header pointing off-origin is refused, not fetched
setTimeout(() => {
  calls.length = 0; nodes.length = 0;
  global.fetch = async url => { calls.push(url); return page([{ id:1, name:"X - 2026 / 2º Sem" }], "https://evil.example/steal"); };
  eval(src);
  setTimeout(() => {
    assert(calls.length === 1 && /fora do Canvas/.test(nodes[0].textContent), "off-origin Link refused: " + calls + " / " + nodes[0].textContent);
    console.log("bookmarklet refuses off-origin pagination");
  }, 20);
}, 200);
