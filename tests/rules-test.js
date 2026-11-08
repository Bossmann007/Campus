// Rule packs (rules/<term>/<turma>.json): the validator (scripts/check-rules), the generator that embeds them in the core
// (scripts/sync-rules), a core built with two turmas, and the draft a student of another turma copies (no grades in it).
const fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, ".."), rel = f => path.relative(root, f);
const { checkPacks, loadPacks } = require("../scripts/check-rules");
const { rulesBlock, termPacks } = require("../scripts/sync-rules");
let n = 0; const ok = s => { n++; console.log("ok " + n + " - " + s); };
const load = f => ({ file: rel(f), data: JSON.parse(fs.readFileSync(f, "utf8")) });

// the packs in the repo pass
const real = loadPacks(path.join(root, "rules"));
assert(real.length >= 1, "at least one pack");
assert.deepStrictEqual(checkPacks(real), [], "rules/ packs are valid");
ok("every pack in rules/ passes the validator (" + real.map(p => p.file).join(", ") + ")");
const cc = load(path.join(root, "rules", "2026-2", "cc-manha.json")), good = load(path.join(__dirname, "fixtures", "rules-good", "si-noite.json"));
assert.deepStrictEqual(checkPacks([cc, good]), [], "a second, made-up turma passes next to cc-manha");
ok("a second turma (fixture) passes next to cc-manha");

// every bad fixture is rejected, with a pt-BR message naming its file and field
const expect = {
  "weights-not-10": /subjects\[0\]: a soma dos pesos \(max\) é 9,5; precisa ser 10/,
  "date-not-iso": /subjects\[0\]\.items\[0\]\.date: "20\/09\/2026" não está no formato AAAA-MM-DD/,
  "date-impossible": /subjects\[0\]\.items\[0\]\.date: "2026-02-30" é uma data inválida/,
  "date-outside-term": /subjects\[1\]\.items\[1\]\.date: "2027-03-10" está fora do semestre \(2026-07-01 a 2027-01-31\)/,
  "item-id-repeated": /subjects\[0\]\.items\[2\]\.id: id "p1" repetido nesta matéria/,
  "subject-id-taken": /subjects\[0\]\.id: id de matéria "abd" já usado em rules\/2026-2\/cc-manha\.json/,
  "canvas-id-taken": /subjects\[1\]\.canvasIds: a matéria 71306 do Canvas já está em rules\/2026-2\/cc-manha\.json/,
  "canvas-id-repeated": /subjects\[1\]\.canvasIds: a matéria 900001 do Canvas aparece repetida/,
  "item-without-source": /subjects\[0\]\.items\[1\]: campo obrigatório "wSrc" ausente/,
  "unknown-field": /subjects\[0\]\.items\[0\]: campo desconhecido "peso"/,
  "canvas-unknown-item": /subjects\[0\]\.canvas\.items\.p3: avaliação "p3" não existe em items/,
  "canvas-two-kinds": /subjects\[0\]\.canvas\.items\.p1: use exatamente um de one, avg, sum/,
  "canvas-sum-without-factor": /subjects\[1\]\.canvas\.items\.a1: "sum" precisa de "factor"/,
  "id-bad-chars": /subjects\[1\]\.id: "si-web" deve ter só letras minúsculas e números/,
  "max-not-positive": /subjects\[1\]\.items\[0\]\.max: deve ser um número maior que 0/,
  "term-end-differs": /termEnd: "2027-02-15" difere de "2027-01-31" \(rules\/2026-2\/cc-manha\.json\); packs do mesmo semestre/,
  "draft-not-filled": /campo desconhecido "assignments"[\s\S]*turma: não pode ficar vazio|turma: não pode ficar vazio[\s\S]*campo desconhecido "assignments"/
};
const badDir = path.join(__dirname, "fixtures", "rules-bad"), bads = fs.readdirSync(badDir).filter(f => f.endsWith(".json")).sort();
assert.deepStrictEqual(bads.map(f => f.replace(/\.json$/, "")).sort(), Object.keys(expect).sort(), "each bad fixture has an expected message");
for (const f of bads) {
  const b = load(path.join(badDir, f)), errs = checkPacks([cc, b]);
  assert(errs.length > 0, f + " should be rejected");
  assert(errs.every(e => e.startsWith(b.file + ": ")), f + ": errors name the file: " + errs.join(" | "));
  assert.match(errs.join("\n"), expect[f.replace(/\.json$/, "")], f + ": got " + errs.join(" | "));
}
ok(bads.length + " bad packs rejected with messages naming file and field");

// the JSON Schema documents every field in pt-BR, and the validator follows it
const schema = JSON.parse(fs.readFileSync(path.join(root, "rules", "schema.json"), "utf8"));
const walk = (s, at) => { if (s.properties) for (const [k, v] of Object.entries(s.properties)) { assert(typeof v.description === "string" && v.description.length > 10, at + "." + k + " has a description"); walk(v, at + "." + k); }
  if (s.items) walk(s.items, at + "[]"); if (s.additionalProperties && typeof s.additionalProperties === "object") walk(s.additionalProperties, at + ".*"); };
walk(schema, "pack"); for (const d of Object.values(schema.$defs || {})) walk(d, "def");
ok("rules/schema.json describes every field");

// the generator embeds the term's packs; a core built with two turmas pairs each Canvas course to its own turma
assert.deepStrictEqual(termPacks(path.join(root, "rules"), "2026-11-07", {}).map(p => p.file), real.filter(p => p.file.startsWith("rules/" + real.map(x => x.file.split("/")[1]).sort().pop() + "/")).map(p => p.file), "latest term only");
const html = fs.readFileSync(path.join(root, "app.html"), "utf8"), core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
assert(core.includes("/*RULES*/" + rulesBlock([cc]) + "/*RULES*/"), "app.html carries the generated block (run scripts/sync-rules)");
const two = core.replace(/\/\*RULES\*\/[\s\S]*?\/\*RULES\*\//, "/*RULES*/" + rulesBlock([cc, good]) + "/*RULES*/");
const C = new Function(two + "\nreturn NotasCore;")(), C1 = new Function(core + "\nreturn NotasCore;")();
assert.deepStrictEqual(C.COURSES.map(c => c.id), ["imp", "abd", "rpnd", "web", "etica", "cscf", "sibd", "siweb"]);
assert.strictEqual(C.subjectOf({ id: 900003 }, true).id, "siweb", "a subject can list several Canvas ids");
assert.strictEqual(C.subjectOf({ id: 71306 }, true).id, "abd"); assert.strictEqual(C.SHORT.siweb, "Web");
assert.strictEqual(C.turmaOf(C.COURSES[7]), good.data.turma); assert.strictEqual(C.turmaOf(C.COURSES[0]), "Ciência da Computação, manhã");
const siData = { v: 1, courses: [{ id: 900001, name: "Banco de Dados I - 2026 / 2", assignments: [{ name: "Prova RA1", points: 10, score: 8 }] }] };
assert.deepStrictEqual(C.coursesFor(siData).map(c => c.id), ["sibd", "siweb"], "the calculator shows the student's turma");
assert.deepStrictEqual(C.coursesFor(null).map(c => c.id), C.COURSES.map(c => c.id), "no reading: every subject");
assert.deepStrictEqual(C1.coursesFor(siData).map(c => c.id), C1.COURSES.map(c => c.id), "one pack, no match: unchanged (every subject)");
const si = C.fromCanvas(siData);
assert.deepStrictEqual(si.grades, { "sibd:p1": "8" }); assert(si.missing.every(m => /^si/.test(m.key)), "other turmas' items are not listed as missing");
assert.strictEqual(C.fromCanvas({ v: 1, courses: [] }).missing.length, C.COURSES.reduce((s, c) => s + c.items.length, 0), "nothing matched: every item listed, as before");
assert.strictEqual(C.weightSum(C.COURSES[7]), 10);
assert.strictEqual(C.subjectOf({ name: "Programação WEB (Turma 2º B) - 2026 / 2" }, false), null, "legacy name match: two turmas share the name, no guess");
assert.strictEqual(C1.subjectOf({ name: "Programação WEB (Turma 2º B) - 2026 / 2" }, false).id, "web", "one subject with that name: still matched");
assert.strictEqual(C.subjectOf({ name: "Ética - 2026 / 2" }, false).id, "etica", "unique name across turmas: matched");
ok("a core with two turmas: Canvas ids pick the subject and the turma; the calculator shows only the student's turma");

// the embedded block has no raw "<": a pack string cannot open a comment or a script inside app.html
const evil = JSON.parse(JSON.stringify(good.data)); evil.subjects[0].formula = "<!--<script>x</script>"; evil.subjects[0].items[0].name = "a < b";
const blk = rulesBlock([{ file: "x.json", data: evil }]);
assert(!blk.includes("<"), "no raw < in the generated block");
assert.strictEqual(new Function("return " + blk)()[0].subjects[0].formula, "<!--<script>x</script>", "the text survives as data");
ok("generated block escapes every <");

// a term still running is never dropped silently when a newer term folder appears
const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "rules-"));
fs.mkdirSync(path.join(tmp, "2026-2")); fs.mkdirSync(path.join(tmp, "2027-1"));
fs.writeFileSync(path.join(tmp, "2026-2", "cc-manha.json"), JSON.stringify(cc.data));
const next = JSON.parse(JSON.stringify(good.data)); next.term = "2027 / 1"; next.termEnd = "2027-07-31";
next.subjects.forEach(s => s.items.forEach((it, i) => { it.date = "2027-0" + (3 + i) + "-10"; }));
fs.writeFileSync(path.join(tmp, "2027-1", "si-noite.json"), JSON.stringify(next));
assert.throws(() => termPacks(tmp, "2026-12-01", {}), /2026 \/ 2 ainda vale até 2027-01-31/, "older term still running: the sync stops");
assert.deepStrictEqual(termPacks(tmp, "2027-02-01", {}).map(p => p.data.term), ["2027 / 1"], "older term over: newest term only");
assert.deepStrictEqual(termPacks(tmp, "2026-12-01", { CP_RULES_NEW_TERM: "1" }).map(p => p.data.term), ["2027 / 1"], "explicit override");
fs.rmSync(tmp, { recursive: true });
ok("a newer term folder cannot silently drop a term that is still running");

// draft for a turma without rules: names, points, dates and groups; never grades, submissions or who the student is
const reading = { v: 1, ext: "1.0.1", courses: [
  { id: 71306, name: "Arquitetura de Banco de Dados (Turma 2º B) - 2026 / 2º Sem", assignments: [{ name: "Avaliação somativa RA1", points: 1.25, score: 1 }] },
  { id: 555001, name: "Cálculo I (Turma 1º C) - Engenharia (Noite) - 2026 / 2º Sem", groupWeights: true, groups: [{ id: 1, name: "Provas", weight: 70 }, { id: 2, name: "Trabalhos", weight: 30 }],
    assignments: [{ name: "Prova 1", points: 10, score: 7.5, due: "2026-09-21T22:00:00Z", missing: false, submitted: true, online: false, stats: { mean: 6, min: 1, max: 10 }, group: 1 },
                  { name: "Lista 1", points: 2, score: null, due: null, missing: true, submitted: false, online: true, stats: null, group: 2 }, { name: 5 }] } ],
  announcements: [{ course: "Cálculo I", title: "Aviso pessoal", unread: true }], user: 42 };
const draft = C1.draftPack(reading), text = JSON.stringify(draft);
assert(!/score|submitted|missing|stats|unread|announcements|"user"|7\.5|Aviso pessoal/.test(text), "no grades, submissions, announcements or user: " + text);
assert.deepStrictEqual(draft.subjects.map(s => s.canvasIds), [[555001]], "only courses without rules");
assert.deepStrictEqual(draft.subjects[0].assignments, [{ name: "Prova 1", points: 10, due: "2026-09-21", group: "Provas", groupWeight: 70 }, { name: "Lista 1", points: 2, due: null, group: "Trabalhos", groupWeight: 30 }]);
assert.strictEqual(draft.subjects[0].name, "Cálculo I"); assert.strictEqual(draft.subjects[0].canvasName, reading.courses[1].name); assert.strictEqual(draft.term, "2026 / 2");
assert.strictEqual(draft.subjects[0].groupWeights, true);
assert(checkPacks([{ file: "rascunho.json", data: draft }]).length > 0, "a draft is not a valid pack until someone fills it in");
assert.deepStrictEqual(C1.draftPack({ v: 1, courses: [{ id: 9, name: "X - 2026 / 2", assignments: [{ name: "A", points: 1, due: "2026-10-01" }] }] }).subjects[0].assignments, [{ name: "A", points: 1, due: "2026-10-01", group: null, groupWeight: null }], "no groups read: null");
assert.deepStrictEqual(C1.draftPack(null).subjects, []); assert.deepStrictEqual(C1.draftPack({ courses: "x" }).subjects, []);
ok("draft pack: course id and name, assignment names, points, dates and groups; no grades or personal data");
console.log("rules ok: all " + n + " checks passed");
