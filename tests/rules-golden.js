// Golden test for the rule packs: the calculator's numbers for the cc-manha turma must not change when the rules move from
// hardcoded data to rules/<term>/*.json. Captured with the code before the move (node tests/rules-golden.js app.html --write);
// verify runs it without --write and compares. Made-up grades only.
const fs = require("fs"), path = require("path"), assert = require("assert");
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, "..", "app.html"), "utf8");
const C = new Function(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + "\nreturn NotasCore;")();
const out = path.join(__dirname, "golden", "cc-manha.json");
const enc = (k, v) => typeof v === "number" && !Number.isFinite(v) ? "num:" + v : v;
const K = (c, it) => c.id + ":" + it.id;
const stateOut = (c, st) => Object.assign({}, st, { future: st.future.map(it => K(c, it)), late: st.late.map(it => K(c, it)), invalid: st.invalid.map(it => K(c, it)) });

const ids = C.COURSES.map(c => c.id);
const FIX = { "abd:pj1":"0.9", "abd:s1":"1", "abd:s2":"2.6", "abd:pj2":"2", "etica:ra1":"6.3", "cscf:as1":"8" };
const half = {}; for (const c of C.COURSES) for (const it of c.items) half[K(c, it)] = String(it.inMax / 2);
const odd = {}; C.COURSES.forEach((c, i) => c.items.forEach((it, j) => { if ((i + j) % 3 === 0) odd[K(c, it)] = String(Math.round(it.inMax * 0.37 * 1000) / 1000); else if ((i + j) % 3 === 1) odd[K(c, it)] = "x"; }));
const grades = { empty: {}, fix: FIX, full: C.fullMarks(C.COURSES), half, odd, comma: { "abd:pj1": "0,9", "imp:p1": "7,5", "rpnd:as5": "9" } };
const todays = ["2026-08-01", "2026-09-28", "2026-11-04", "2026-11-10", "2026-11-19", "2027-02-01"], targets = [5, 7, 10];

const snap = { courses: C.COURSES, canvas: Object.fromEntries(Object.entries(C.CANVAS).map(([k, v]) => [k, { cid: v.cid, match: v.match, items: v.items }])),
  short: ids.map(id => C.SHORT[id]), term: C.TERM, termEnd: C.TERM_END, turma: C.TURMA, semesterKey: C.SEMESTER,
  weightSum: ids.map(id => C.weightSum(C.COURSES.find(c => c.id === id))), runs: {} };
for (const [gn, g] of Object.entries(grades)) for (const t of todays) for (const T of targets) {
  const r = {};
  for (const c of C.COURSES) {
    const st = C.courseState(c, g, t, T);
    r[c.id] = { st: stateOut(c, st), need: C.courseNeed(st), tone: C.statusTone(st), ring: C.ringParts(st), next: (C.nextItem(st) || {}).id || null,
      req: c.items.map(it => C.requiredFor(st, it)), min: st.future.map(it => C.minimumFor(st, it, T)) };
  }
  r.upcoming = C.upcoming(C.COURSES, g, t, T).map(u => ({ k: K(u.course, u.item), req: u.req, min: u.min, status: u.st.status }));
  r.still = C.stillCounts(C.COURSES, g, t, T).map(u => K(u.course, u.item));
  const sem = C.semester(C.COURSES, g, t, T);
  r.semester = { mean: sem.mean, tight: sem.tight && sem.tight.id, counts: sem.counts, items: sem.items.map(x => K(x.course, x.item) + "=" + x.s), done: sem.done, late: sem.late };
  snap.runs[gn + "@" + t + "@" + T] = r;
}
// fromCanvas: the test fixtures (names, ids, the real name listing) with made-up scores
const cv = (name, assignments, id) => Object.assign(id ? { id } : {}, { name: name + " (Turma 2º B) - Ciência da Computação (Manhã) - 2026 / 2º Sem", assignments });
const A = (name, points, score, extra) => Object.assign({ name, points, score }, extra || {});
const real = JSON.parse(fs.readFileSync(path.join(__dirname, "canvas-names.json"), "utf8"));
const cids = Object.fromEntries(Object.entries(C.CANVAS).map(([k, v]) => [v.match, v.cid]));
const realIds = { v: 1, ext: "1.0.1", courses: real.courses.map(c => ({ id: Object.entries(cids).find(([m]) => c.name.startsWith(m)) ? Object.entries(cids).find(([m]) => c.name.startsWith(m))[1] : 1,
  name: c.name, assignments: c.assignments.map((a, i) => ({ name: a.name, points: a.points, score: i % 4 === 3 ? null : a.points * ((i % 5) / 4), due: "2026-11-1" + (i % 10) + "T15:00:00Z", missing: i % 6 === 0, submitted: i % 3 === 0, online: i % 7 !== 0, stats: i % 2 ? { mean: a.points / 2, min: 0, max: a.points } : null })) })),
  announcements: [{ course: real.courses[0].name, courseId: 71306, title: "Aviso", at: "2026-11-03T15:00:00Z", unread: true, url: "https://pucpr.instructure.com/courses/1" }] };
const inputs = {
  exp: { v: 1, courses: [
    cv("Resolução de Problemas de Natureza Discreta", [A("AS 01", 10, 8), A("AS 05", 10, 5), A("AS 07", 10, null)]),
    cv("Arquitetura de Banco de Dados", [A("Entrega PjBL - Parte 1 03/09", 1, 0.75), A("Avaliação somativa RA2 22/10", 3, 2.4)]),
    cv("Programação Imperativa", ["TDE 1: Motivação", "TDE 2: Boas", "PBL01", "PBL02", "PBL03", "PBL04", "PBL05"].map((n, i) => A(n, 10, i < 6 ? 10 : 3)).concat([A("Prova do RA1", 10, 6.5), A("PBL06", 10, 9), A("PBL07", 10, null)])),
    cv("Programação WEB", [A("Avaliação Somativa RA1 - GRUPO B e GRUPO A", 2.1, 2.1), A("Entrega TDE", 1.5, 2)]),
    { name: "PUC Acolhe - Apoio ao estudante", assignments: [A("x", 1, 1)] } ] },
  cscf0: { v: 1, courses: [cv("Conectividade em Sistemas Ciberfísicos", [A("AS01 - NOTAS", 0, 7.5)])] },
  etica: { v: 1, courses: [{ name: "Ética (Turma 2º B) - 2026 / 2º Sem", assignments: [A("Aula 4 - TAREFA SOMATIVA ENTREGA - A justiça", 10, 8), A("Aula 7 - TAREFA SOMATIVA - O utilitarismo", 10, 7), A("Avaliação somativa -  Prova", 10, 10)] }] },
  dup: { v: 1, courses: [cv("Resolução de Problemas de Natureza Discreta", [A("AS 01", 10, 8)]), cv("Resolução de Problemas de Natureza Discreta", [A("AS 01", 10, 2)])] },
  byIdOurs: { v: 1, courses: [cv("Arquitetura de Banco de Dados", [A("Entrega PjBL - Parte 1 03/09", 1, 0.75)], 71306), cv("Ética", [A("Avaliação somativa -  Prova", 10, 9)], 72006)] },
  byIdOther: { v: 1, courses: [cv("Arquitetura de Banco de Dados", [A("Entrega PjBL - Parte 1 03/09", 1, 0.75, { missing: true, due: "2026-10-01T15:00:00Z" })], 99001)], announcements: [{ course: "x", courseId: 99001, title: "Oi" }] },
  real: realIds,
  realNoIds: { v: 1, courses: real.courses.map(c => ({ name: c.name, assignments: c.assignments.map(a => ({ name: a.name, points: a.points, score: a.points })) })) } };
snap.fromCanvas = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, C.fromCanvas(v)]));
snap.subjectOf = [[{ id: 72006, name: "x" }, true], [{ id: 1, name: "Ética - 2026 / 2" }, true], [{ name: "Ética - 2026 / 2" }, false], [{ id: "71310" }, true], [{ name: "Programação WEB - x" }, false]]
  .map(([cvx, b]) => (C.subjectOf(cvx, b) || {}).id || null);
const bk = JSON.parse(C.toBackup(Object.assign({}, FIX, { "imp:p1": " 7,5 ", "zz:1": "3" }), "6,5")); delete bk.exported;
snap.backup = bk; snap.fromBackup = C.fromBackup(JSON.stringify({ app: "quanto-falta", v: 1, semester: "2026-2", grades: Object.assign({}, half, { "abd:xx": "1", "web:p1": 99 }) }));
snap.itemByKey = ["abd:s3", "web:p23", "x:y", "abd:s3:z"].map(k => (C.itemByKey(k) || {}).name || null);

// Each grade run is kept as a sha256 of its JSON (108 runs would be ~1 MB); the data and the Canvas imports are kept whole.
const sha = x => require("crypto").createHash("sha256").update(JSON.stringify(x, enc)).digest("hex").slice(0, 16);
snap.runs = Object.fromEntries(Object.entries(snap.runs).map(([k, v]) => [k, sha(v)]));
const text = JSON.stringify(snap, enc, 1) + "\n";
if (process.argv.includes("--write")) { fs.writeFileSync(out, text); console.log("golden written: " + out + " (" + text.length + " bytes)"); }
else { assert.deepStrictEqual(JSON.parse(text), JSON.parse(fs.readFileSync(out, "utf8")), "cc-manha numbers changed"); console.log("golden ok: cc-manha numbers identical (" + Object.keys(snap.runs).length + " grade runs, " + Object.keys(snap.fromCanvas).length + " Canvas imports)"); }
