// Tests the pure core block of index.html. Run: node tests/notas-test.js index.html
const fs = require("fs"), assert = require("assert");
const html = fs.readFileSync(process.argv[2], "utf8");
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
assert(m, "core block found");
const C = new Function(m[1] + "\nreturn NotasCore;")();
const near = (a, b, msg) => assert(Math.abs(a - b) < 1e-9, msg + ": got " + a + " want " + b);
let n = 0; const ok = s => { n++; console.log("ok " + n + " - " + s); };
const byId = id => C.COURSES.find(c => c.id === id);
const T = 7, TODAY = "2026-11-04";
// Fixture grades (professor scale) used only by this test; the public page ships with an empty SEED.
const FIX = { "abd:pj1":"0.9", "abd:s1":"1", "abd:s2":"2.6", "abd:pj2":"2", "etica:ra1":"6.3", "cscf:as1":"8" };   // made-up example grades

assert.strictEqual(C.COURSES.length, 6);
for (const c of C.COURSES) { near(C.weightSum(c), 10, c.id + " weights"); ok(c.id + " weights sum to 100% (10 pts)"); }
for (const c of C.COURSES) for (const it of c.items) assert(it.wSrc && it.dateSrc, c.id + ":" + it.id + " has sources");
ok("every item has a weight source and a date source");

near(C.courseState(byId("abd"), FIX, TODAY, T).earned, 6.5, "BD"); ok("BD garantido 6,5");
near(C.courseState(byId("etica"), FIX, TODAY, T).earned, 6.3, "Ética"); ok("Ética garantido 6,3");
near(C.courseState(byId("cscf"), FIX, TODAY, T).earned, 4, "Cone"); ok("Conectividade garantido 4,0 (=8,0/2)");

const full = C.fullMarks(C.COURSES);
for (const c of C.COURSES) near(C.courseState(c, full, TODAY, T).earned, 10, c.id + " full");
ok("full marks give 10 in every course");

// uniform requirement closes the gap exactly, weighted by each item's max
for (const c of C.COURSES) {
  const st = C.courseState(c, FIX, TODAY, T);
  if (st.fraction != null && st.status === "precisa") {
    const got = st.earned + st.future.reduce((s, it) => s + C.requiredFor(st, it).raw / it.inMax * it.max, 0);
    near(got, T, c.id + " required closes gap");
  }
}
ok("required grades reach exactly the target");
const et = C.courseState(byId("etica"), FIX, TODAY, T);
near(C.requiredFor(et, byId("etica").items[1]).raw, 0.7, "Ética RA2 needs 0,7 of 3"); ok("Ética RA2 needs 0,7 of 3,0");

// minimum: others full -> exact target
const bd = C.courseState(byId("abd"), FIX, TODAY, T), s3 = byId("abd").items.find(i => i.id === "s3");
near(C.minimumFor(bd, s3, T).f, 0, "BD min s3 clamps to 0 (rest covers the gap)");
const web = byId("web"), wg = { "web:p1": "10" }, ws = C.courseState(web, wg, TODAY, T), wp2 = web.items.find(i => i.id === "p23");
const wm = C.minimumFor(ws, wp2, T); assert(wm.f > 0);
near(ws.earned + (ws.futureMax - wp2.max) + wm.f * wp2.max, T, "WEB min p2"); ok("minimum closes the gap with the rest full; clamps to 0 when not needed");

// past item without a grade counts 0, never as still achievable
const imp = C.courseState(byId("imp"), {}, TODAY, T);
assert.deepStrictEqual(imp.late.map(i => i.id), ["ex1", "p1", "ex2"]); assert(imp.provisional);
near(imp.ceiling, 5, "imp ceiling excludes late"); near(imp.ceilingIfLate, 10, "imp ceiling if late");
assert.strictEqual(imp.status, "depende-atrasadas"); ok("past ungraded items are late, counted 0, flagged provisional");

// date boundary: an item on 'today' is still upcoming
assert(C.courseState(byId("etica"), FIX, "2026-11-10", T).future.some(i => i.id === "ra2")); ok("item dated today is upcoming");
assert.strictEqual(C.localISO(new Date(2026, 10, 4, 23, 30)), "2026-11-04"); ok("localISO uses local date, not UTC");

// parsing and range
assert.strictEqual(C.parseNum("1,1"), 1.1); assert.strictEqual(C.parseNum(""), null); assert(Number.isNaN(C.parseNum("abc")));
assert(Number.isNaN(C.itemPoints(s3, "1.3"))); assert(Number.isNaN(C.parseNum("-1")));
const bad = C.courseState(byId("abd"), Object.assign({}, FIX, { "abd:s3": "9" }), TODAY, T);
near(bad.earned, 6.5, "invalid ignored"); assert.strictEqual(bad.invalid.length, 1); ok("comma decimals parse; out-of-range grades are ignored and flagged");

// garantido and impossible
assert.strictEqual(C.courseState(byId("abd"), full, TODAY, T).status, "garantido");
const lowRpnd = {}; for (const it of byId("rpnd").items) lowRpnd["rpnd:" + it.id] = it.date < TODAY ? "0" : "";
assert.strictEqual(C.courseState(byId("rpnd"), lowRpnd, TODAY, T).status, "nao-da"); ok("status garantido / nao-da");

// upcoming sorted by date
const up = C.upcoming(C.COURSES, FIX, TODAY, T);
for (let i = 1; i < up.length; i++) assert(up[i - 1].item.date <= up[i].item.date);
assert(up.every(u => u.item.date >= TODAY)); ok("upcoming list in date order, " + up.length + " items");

// ---- Canvas import: fromCanvas(json) maps the bookmarklet export to grades in each item's scale ----
const cv = (name, assignments) => ({ name: name + " (Turma 2º B) - Ciência da Computação (Manhã) - 2026 / 2º Sem", assignments });
const A = (name, points, score) => ({ name, points, score });
const exp = { v: 1, courses: [
  cv("Resolução de Problemas de Natureza Discreta", [A("AS 01", 10, 8), A("AS 05", 10, 5), A("AS 07", 10, null)]),
  cv("Arquitetura de Banco de Dados", [A("Entrega PjBL - Parte 1 03/09", 1, 0.75), A("Avaliação somativa RA2 22/10", 3, 2.4)]),
  cv("Programação Imperativa", ["TDE 1: Motivação", "TDE 2: Boas", "PBL01", "PBL02", "PBL03", "PBL04", "PBL05"].map((n, i) => A(n, 10, i < 6 ? 10 : 3))
     .concat([A("Prova do RA1", 10, 6.5), A("PBL06", 10, 9), A("PBL07", 10, null)])),
  cv("Programação WEB", [A("Avaliação Somativa RA1 - GRUPO B e GRUPO A", 2.1, 2.1), A("Entrega TDE", 1.5, 2)]),
  { name: "PUC Acolhe - Apoio ao estudante", assignments: [A("x", 1, 1)] } ] };
const got = C.fromCanvas(exp);
near(Number(got.grades["rpnd:as1"]), 0.4, "AS01 8/10 -> 0,4 of 0,5"); near(Number(got.grades["rpnd:as5"]), 3.5, "AS05 5/10 -> 3,5 of 7");
near(Number(got.grades["abd:pj1"]), 0.75, "same scale kept"); near(Number(got.grades["abd:s2"]), 2.4, "BD s2");
ok("single assignments rescale score/points to the item's scale");
near(Number(got.grades["imp:ex1"]), (6 * 10 + 3) / 7, "ex1 mean of 7"); assert(!("imp:ex2" in got.grades), "ex2 waits for PBL07");
near(Number(got.grades["imp:p1"]), 6.5, "p1");
ok("average items need every part graded");
near(Number(got.grades["web:p1"]), 10, "WEB p1 2,1/2,1 -> 10"); near(Number(got.grades["web:tde"]), 10, "score above points is capped");
assert(got.missing.some(m => m.key === "web:tde" && /acima/.test(m.reason)) || got.notes.some(m => m.key === "web:tde"), "cap is reported");
ok("scores above the maximum are capped and reported");
assert(!("rpnd:as7" in got.grades) && got.missing.some(m => m.key === "rpnd:as7" && /sem nota/.test(m.reason)), "ungraded");
assert(got.missing.some(m => m.key === "rpnd:as8" && /não está/.test(m.reason)), "absent assignment");
assert(got.missing.some(m => m.key === "etica:ra1"), "course not in export or manual item is reported");
ok("ungraded, absent and manual items are listed with a reason");
const cs = C.fromCanvas({ v: 1, courses: [cv("Conectividade em Sistemas Ciberfísicos", [A("AS01 - NOTAS", 0, 7.5)])] });
near(Number(cs.grades["cscf:as1"]), 7.5, "AS01 - NOTAS with 0 points uses scale 10"); ok("0-point Canvas column uses the rule's own scale");
const et3 = C.fromCanvas({ v: 1, courses: [{ name: "Ética (Turma 2º B) - 2026 / 2º Sem", assignments: [A("Aula 4 - TAREFA SOMATIVA ENTREGA - A justiça", 10, 8), A("Aula 7 - TAREFA SOMATIVA - O utilitarismo", 10, 7), A("Avaliação somativa -  Prova", 10, 10)] }] });
near(Number(et3.grades["etica:ra1"]), 5.75, "Ética RA1 = (8 + 7 + 10) x 0,23"); ok("Ética RA1 sums the three somativas times 2,3 (in pontos de 7)");
const dup = C.fromCanvas({ v: 1, courses: [cv("Resolução de Problemas de Natureza Discreta", [A("AS 01", 10, 8)]), cv("Resolução de Problemas de Natureza Discreta", [A("AS 01", 10, 2)])] });
assert(!("rpnd:as1" in dup.grades) && dup.missing.some(m => m.key === "rpnd:as1" && /mais de uma turma/.test(m.reason))); ok("two enrolments of one course are not guessed");
for (const [k, v] of Object.entries(got.grades)) { const [cid, iid] = k.split(":"); const it = byId(cid).items.find(i => i.id === iid);
  assert(!Number.isNaN(C.itemPoints(it, v)) && C.itemPoints(it, v) !== null, k + " parses in range"); }
ok("every imported grade is a valid entry for its input");
assert.throws(() => C.fromCanvas("not json"), /formato/); assert.throws(() => C.fromCanvas({ v: 1 }), /formato/);
assert.throws(() => C.fromCanvas(JSON.parse('{"v":1,"courses":[{"name":{"toString":1},"assignments":[]}]}')), /formato/);
assert.deepStrictEqual(C.fromCanvas(JSON.stringify(exp)).grades, got.grades);
ok("bad input is rejected; JSON text and objects give the same result");

// missing submissions: only Canvas "missing" flags, any 2026/2 course, oldest first; bad dates kept as null, not crashes
const M = (name, due, missing) => ({ name, points: 1, score: null, due, missing });
const pend = C.fromCanvas({ v: 1, courses: [
  cv("Ética", [M("Fórum 3", "2026-10-20T15:00:00Z", true), M("Fórum 4", "2026-11-30T15:00:00Z", false), M("Leitura", "ontem", true), M("Resumo", "2026-10-25", true)]),
  cv("Programação WEB", [M("Lista 2", "2026-09-10T15:00:00Z", true), M("Lista 3", null, "true")]),
  { name: "PUC Acolhe - Apoio ao estudante (Turma A) - 2026 / 2º Sem", assignments: [M("Quiz", "2026-10-01T15:00:00Z", true)] } ] }).pending;
assert.deepStrictEqual(pend, [
  { course: "web", courseName: "Programação WEB", name: "Lista 2", due: "2026-09-10" },
  { course: null, courseName: "PUC Acolhe", name: "Quiz", due: "2026-10-01" },
  { course: "etica", courseName: "Ética", name: "Fórum 3", due: "2026-10-20" },
  { course: "etica", courseName: "Ética", name: "Resumo", due: "2026-10-25" },
  { course: "etica", courseName: "Ética", name: "Leitura", due: null } ]);
assert.strictEqual(got.pending, null, "old exports without the flag: unknown, so the saved list is left alone");
assert.deepStrictEqual(C.fromCanvas({ v: 1, courses: [cv("Ética", [M("Fórum 4", null, false)])] }).pending, [], "flag present, none missing");
ok("pending submissions come only from Canvas missing flags, sorted by due date");

// to-do (not handed in, not late) and Canvas due dates for single-assignment items
const S = (name, due, submitted, missing) => ({ name, points: 10, score: null, due, missing: !!missing, submitted });
const td = C.fromCanvas({ v: 1, courses: [
  cv("Ética", [S("TDE - TAREFA SOMATIVA - VÍDEO", "2026-11-11T02:59:59Z", false), S("Fórum 5", "2026-11-06T15:00:00Z", true), S("Fórum 2", "2026-10-01T15:00:00Z", false, true), S("Leitura", null, false)]),
  cv("Programação Imperativa", [S("Prova do RA2", "2026-11-11T15:00:00Z", false), Object.assign(S("Prova do RA1", "2026-11-12T15:00:00Z", false), { online: false })]) ] });
assert.deepStrictEqual(td.todo.map(t => t.name + "@" + t.due), ["TDE - TAREFA SOMATIVA - VÍDEO@2026-11-10", "Prova do RA2@2026-11-11"], "unsubmitted, not missing, online, with a date, soonest first");
assert.deepStrictEqual(td.dates, { "etica:ra2": "2026-11-10", "imp:p1": "2026-11-12", "imp:p2": "2026-11-11" }, "single-assignment items carry the Canvas date");
assert.strictEqual(got.todo, null, "old exports without the flag: unknown");
ok("to-do comes from the submitted flag; single items get Canvas due dates");
assert.strictEqual(C.verLess("0.3.0", "0.4.0"), true); assert.strictEqual(C.verLess("0.4.0", "0.4.0"), false); assert.strictEqual(C.verLess("0.10.0", "0.4.0"), false);
assert.strictEqual(C.fromCanvas({ v: 1, ext: "0.3.0", courses: [] }).extOld, true); assert.strictEqual(C.fromCanvas({ v: 1, courses: [] }).extOld, true);
assert.strictEqual(C.fromCanvas({ v: 1, ext: C.EXT_LATEST, courses: [] }).extOld, false); assert.strictEqual(C.fromCanvas({ v: 1, ext: "script", courses: [] }).extOld, false); assert.strictEqual(C.fromCanvas({ v: 1, ext: "<b>", courses: [] }).ext, null);
const man = JSON.parse(fs.readFileSync(require("path").join(__dirname, "..", "extension", "manifest.json"), "utf8"));
assert.strictEqual(man.version, C.EXT_LATEST, "EXT_LATEST matches the extension manifest");
ok("outdated extensions are detected; EXT_LATEST matches the manifest");

// the name table matches the real Canvas listing: every rule hits exactly one assignment (Somativa III not created yet)
const real = JSON.parse(fs.readFileSync(require("path").join(__dirname, "canvas-names.json"), "utf8"));
const withScores = { v: 1, courses: real.courses.map(c => ({ name: c.name, assignments: c.assignments.map(a => ({ name: a.name, points: a.points, score: a.points })) })) };
const realRun = C.fromCanvas(withScores);
const absent = realRun.missing.filter(m => /não está no Canvas/.test(m.reason)).map(m => m.key);
assert.deepStrictEqual(absent, ["abd:s3"], "unexpected unmatched: " + absent);
ok("Canvas name table matches the real listing (only abd:s3 absent)");

// ---- backup (#7): toBackup/fromBackup round trip, only known items, hostile files rejected ----
const mine = { "abd:pj1": "0.9", "rpnd:as5": "5,5", "etica:ra1": "", "imp:p1": "7.5" };
const file = C.toBackup(mine, "6,5");
const back = C.fromBackup(file);
assert.deepStrictEqual(back.grades, { "abd:pj1": "0.9", "rpnd:as5": "5,5", "imp:p1": "7.5" }, "empty entries are not exported");
assert.strictEqual(back.meta, "6,5"); assert.deepStrictEqual(back.missing, []);
assert.strictEqual(JSON.parse(file).app, "quanto-falta"); assert.strictEqual(JSON.parse(file).semester, C.SEMESTER);
ok("backup round trip keeps the same grades and goal");
assert.throws(() => C.fromBackup("{oops"), /arquivo/); assert.throws(() => C.fromBackup(JSON.stringify({ app: "outro", grades: {} })), /arquivo/);
assert.throws(() => C.fromBackup(JSON.stringify({ app: "quanto-falta", v: 1, grades: [] })), /arquivo/);
const odd = C.fromBackup('{"app":"quanto-falta","v":1,"semester":"' + C.SEMESTER + '","grades":{"abd:pj1":"0.5","__proto__":"1","abd:xx":"1","web:p1":9,"imp:p1":"abc"}}');   // text, so __proto__ is a real key
assert.deepStrictEqual(odd.grades, { "abd:pj1": "0.5" }, "only known items with text grades that parse");
assert(odd.missing.length === 4, "the other entries are reported: " + JSON.stringify(odd.missing));
assert(C.fromBackup(JSON.stringify({ app: "quanto-falta", v: 1, semester: "2027-1", grades: {} })).notes.some(n => /semestre/.test(n.reason)), "other semester flagged");
ok("invalid backups are rejected; unknown, non-text and unparsable entries are skipped and listed");
assert.deepStrictEqual(C.SEED, {}); assert(!/Enzo|~\//.test(html), "no personal data in the page"); ok("public page has no seed grades or personal notes");
console.log("all " + n + " checks passed");
