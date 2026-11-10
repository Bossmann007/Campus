// The Centro de Notas engine (NotasCore.centro): synthetic trees shaped like the real tool's JSON (props.curso), no
// personal data. The Imperativa-like tree reproduces the values the tool computed on 2026-11-09 (bridge/SPEC-centro-notas.md).
const assert = require("assert"), fs = require("fs"), path = require("path");
const NotasCore = new Function(fs.readFileSync(path.join(__dirname, "..", "extension", "core.js"), "utf8") + "\nreturn NotasCore;")();
const { centro } = NotasCore;
let n = 0; const ok = () => n++;

// columns: id, tipo_coluna, tipo_calculo, points, grade ("8,00" or null), children [[id, weight]], published
const col = (id, tipo, calc, pts, nota, kids = [], pub = 1) => ({ id_coluna: id, nome_coluna: "c" + id, tipo_coluna: tipo, tipo_calculo: calc, publicacao_nota: pub,
  atividade: pts == null ? null : { pontos_possiveis: pts, omitir_nota_final: 0 }, notas: nota == null ? [] : [{ nota }],
  colunas_associadas_pai: kids.map(([k, w]) => ({ id_coluna: k, pivot: { id_coluna_filho: k, peso_coluna_filho: w == null ? null : w } })) });
const curso = (groups, finals) => ({ grupos: groups.map((cols, i) => ({ nome_grupo: "g" + i, grupo_colunas: cols.map(c => ({ coluna: c })) })), colunas: finals });

// Imperativa-like: RA1 = prova 75 + exercícios 25 (mean of 3 leaves); RA2 = max(nota do RA2, recuperação); final = RA1 40 + RA2 60
const imp = (ra2work, ra2exam, finalShown) => curso([
  [col(1, "padrao", null, 10, "10,00"), col(2, "padrao", null, 10, "10,00"), col(3, "padrao", null, 10, "10,00")],
  [col(10, "padrao", null, 10, "8,00"), col(11, "calculo", "media_aritmetica", null, "10,00", [[1], [2], [3]]), col(12, "grupo", "media_ponderada", null, "8,50", [[10, 75], [11, 25]])],
  [col(20, "padrao", null, 10, ra2work), col(21, "padrao", null, 10, ra2exam), col(22, "padrao", null, 10, null, [], 0), col(23, "grupo", "media_ponderada", null, null, [[20, 30], [21, 70]]),
   col(24, "recuperacao_grupo", "total", 10, null, [[22]]), col(25, "final_grupo", "maximo", null, null, [[23], [24]])],
], [col(99, "final", "media_ponderada", null, finalShown, [[12, 40], [25, 60]])]);

{ // now: the tool's own value when it has one, else the formula (a part without a grade counts 0)
  const r = centro(imp(null, null, "3,40"), 7);
  assert.strictEqual(r.status, "precisa"); assert.strictEqual(r.now, 3.4, "the tool's Nota Final");
  assert.strictEqual(centro(imp(null, null, null), 7).now, 3.4, "computed like the tool: 0,4 × 8,5 + 0,6 × 0");
  ok();
}
{ // quanto falta: 7 = 3,4 + 0,6 × x → x = 6 on the RA2 work and exam (the recovery exam is not counted on)
  const r = centro(imp(null, null, "3,40"), 7);
  assert(Math.abs(r.need - 6) < 0.01, "need 6,0 in what is left: " + r.need);
  assert.deepStrictEqual(r.left.sort(), [20, 21], "left: the RA2 work and exam, not the recovery");
  ok();
}
{ // the simulator: the final with a given grade on everything left (3,4 + 0,6 × 8 = 8,2)
  assert.strictEqual(centro(imp(null, null, "3,40"), 7, 8).projected, 8.2); assert.strictEqual(centro(imp(null, null, "3,40"), 7).projected, undefined);
  ok();
}
{ // partly graded and the extremes
  const half = centro(imp("10,00", null, null), 7);   // 3,4 + 0,6 × (0,3 × 10 + 0,7 × x) ≥ 7 → x = 4,29
  assert(Math.abs(half.need - 4.29) < 0.01, "one RA2 part graded: " + half.need);
  const done = centro(imp("10,00", "10,00", null), 7);
  assert.strictEqual(done.status, "garantido"); assert.strictEqual(done.now, 9.4);
  const no = centro(imp("0,00", "0,00", null), 7);
  assert.strictEqual(no.status, "nao-da", "nothing left and below the meta");
  assert.strictEqual(centro(imp(null, null, "3,40"), 9.9).status, "nao-da", "not even with 10 in everything left");
  ok();
}
{ // RPND-like: the maximum of the RA grade and the recovery, and the recovery's own grade counts once given
  const c = curso([[col(1, "padrao", null, 10, "2,00"), col(2, "padrao", null, 10, null, [], 0), col(3, "grupo", "media_ponderada", null, null, [[1, 100]]),
    col(4, "recuperacao_grupo", "total", 10, null, [[2]]), col(5, "final_grupo", "maximo", null, null, [[3], [4]])]], [col(9, "final", "media_ponderada", null, null, [[5, 100]])]);
  assert.strictEqual(centro(c, 7).now, 2, "max(2, 0)");
  c.grupos[0].grupo_colunas[1].coluna.notas = [{ nota: "8,00" }];
  assert.strictEqual(centro(c, 7).now, 8, "a recovery grade replaces a lower RA grade (maximo)");
  ok();
}
{ // the student's view hides some formula columns (real Imperativa: the RA2 "Nota Final do RA" is only a reference with
  // its group): the hidden one is the mean of its group's leaves, recovery exams out; approximate once the group is part-graded
  const hide = (ra2work, finalShown) => { const c = imp(ra2work, null, finalShown);
    c.grupos[2].grupo_colunas = c.grupos[2].grupo_colunas.filter(gc => ![23, 25].includes(gc.coluna.id_coluna));
    for (const gc of c.grupos[2].grupo_colunas) gc.coluna.grupos = undefined;
    c.grupos[2].id_grupo = 7; for (const gc of c.grupos[2].grupo_colunas) gc.id_grupo = 7;
    c.colunas[0].colunas_associadas_pai[1] = { id_coluna: 25, tipo_coluna: "final_grupo", pivot: { id_coluna_filho: 25, peso_coluna_filho: 60 }, grupos: [{ id_grupo: 7 }] };
    return c; };
  const r = centro(hide(null, "3,40"), 7);
  assert.strictEqual(centro(hide(null, null), 7).now, 3.4, "hidden RA2 counts 0 while nothing in it has a grade: 0,4 × 8,5");
  assert(Math.abs(r.need - 6) < 0.01 && r.approx && r.left.sort().join() === "20,21", "same need as the full tree when the group has no grade, said approximate (the hidden formula may count items of other groups): " + JSON.stringify(r));
  assert.strictEqual(centro(hide("10,00", null), 7).approx, true, "part of the hidden group graded: the weights inside are unknown, say approximate");
  ok();
}
{ // calibrated by the tool's Nota Final: one hidden part, its current value is what the shown final leaves over
  // (hidden RA2 really = 0,2 × trabalho + 0,8 × prova; with trabalho 10 the tool shows 0,4 × 8,5 + 0,6 × 2 = 4,60)
  const c = imp("10,00", null, "4,60");
  c.grupos[2].grupo_colunas = c.grupos[2].grupo_colunas.filter(gc => ![23, 25].includes(gc.coluna.id_coluna)); c.grupos[2].id_grupo = 7;
  c.colunas[0].colunas_associadas_pai[1] = { id_coluna: 25, tipo_coluna: "final_grupo", pivot: { id_coluna_filho: 25, peso_coluna_filho: 60 }, grupos: [{ id_grupo: 7 }] };
  const r = centro(c, 7);
  assert.strictEqual(r.now, 4.6); assert(r.approx, "still approximate: the share left inside is a guess");
  // calibrated: 4,6 + 0,6 × (x × 1/2) ≥ 7 → x = 8,0 (uncalibrated equal weights would say (7 − 3,4)/0,6 × 2 − 10 = 2,0)
  assert(Math.abs(r.need - 8) < 0.01, "calibrated need: " + r.need);
  ok();
}
{ // review fixes: a lost part keeps its weight (no false garantido), total sums raw points, now and status agree
  const lost = imp(null, null, "3,40"); lost.grupos[2].grupo_colunas = []; lost.colunas[0].colunas_associadas_pai[1] = { id_coluna: 25, pivot: { id_coluna_filho: 25, peso_coluna_filho: 60 } };
  assert.strictEqual(centro(lost, 7).status, "incompleto", "a part neither shown nor in a group: no number, never a false garantido");
  const tot = curso([[1, 2, 3, 4].map(i => col(i, "padrao", null, 2.5, i < 4 ? "2,50" : null))], [col(9, "final", "total", null, null, [[1], [2], [3], [4]])]);
  const rt = centro(tot, 7); assert.strictEqual(rt.status, "garantido", "7,5 of 10 raw points, not 30 of 40"); assert.strictEqual(rt.now, 7.5);
  const rt2 = centro(tot, 9); assert(rt2.status === "precisa" && Math.abs(rt2.need - 6) < 0.01, "9 − 7,5 = 1,5 of 2,5 → 6,0/10: " + JSON.stringify(rt2));
  const off = imp(null, null, "4,00");   // the tool shows 4,00 where the visible formula gives 3,40: status and need follow the tool
  const ro = centro(off, 7); assert(ro.now === 4 && Math.abs(ro.need - 5) < 0.01, "need shifted by the tool's own value (4 + 0,6 × x ≥ 7 → 5): " + JSON.stringify(ro));
  const odd = imp(null, null, null); odd.grupos[0].grupo_colunas[0].coluna.atividade.pontos_possiveis = 5; odd.grupos[0].grupo_colunas[0].coluna.notas = [{ nota: "5,00" }];
  assert.strictEqual(centro(odd, 7).approx, true, "a leaf not on 10 inside a mean: the scale is a guess, say approximate");
  const om = imp(null, null, "3,40"); om.grupos[2].grupo_colunas[0].coluna.atividade.omitir_nota_final = 1;
  assert.deepStrictEqual(centro(om, 7).left, [21], "an item left out of the final grade is not asked for");
  ok();
}
{ // no formula (BD, Web, Ética, Conectividade): nothing invented
  const bd = curso([[col(1, "padrao", null, 1.25, "1,10"), col(2, "padrao", null, 3, "3,00")]], [col(9, "final", null, null, null)]);
  assert.strictEqual(centro(bd, 7).status, "sem-formula"); assert.strictEqual(centro(null, 7).status, "sem-formula");
  ok();
}
{ // a hostile tree: 30 layers of two columns each pointing at both of the next layer (2^30 paths) answers at once, with no number
  const layers = []; let idn = 100;
  for (let l = 0; l < 30; l++) layers.push([idn++, idn++]);
  const cs = []; layers.forEach((pair, l) => pair.forEach(id => cs.push(col(id, l === 29 ? "padrao" : "grupo", l === 29 ? null : "media_ponderada", l === 29 ? 10 : null, null, l === 29 ? [] : layers[l + 1].map(k => [k, 50])))));
  const t0 = Date.now(), r = centro(curso([cs], [col(9, "final", "media_ponderada", null, null, layers[0].map(k => [k, 50]))]), 7);
  assert(Date.now() - t0 < 2000 && ["sem-formula", "incompleto"].includes(r.status), "bounded work on a hostile tree: " + (Date.now() - t0) + " ms, " + r.status);
  ok();
}
{ // odd input never throws: unknown calc, a missing child, a loop, a grade that is not a number
  const bad = curso([[col(1, "padrao", null, 10, "abc"), col(2, "grupo", "estranho", null, null, [[1], [404]]), col(3, "grupo", "media_ponderada", null, null, [[4, 50]]), col(4, "grupo", "media_ponderada", null, null, [[3, 50]])]],
    [col(9, "final", "media_ponderada", null, null, [[2, 50], [3, 50]])]);
  const r = centro(bad, 7); assert(["precisa", "nao-da", "garantido", "sem-formula", "incompleto"].includes(r.status) && Number.isFinite(r.now), "safe on odd input: " + JSON.stringify(r));
  ok();
}
{ // the student's own rule (NotasCore.custom): points that count, summed up to the top the Plano de Ensino gives
  const it = [{ key: "a", points: 1.25, score: 1.1 }, { key: "b", points: 3, score: 3 }, { key: "c", points: 2, score: null }, { key: "x", points: 1, score: 0.5 }];
  const r = NotasCore.custom(it, { off: ["x"] }, 7);
  assert(r.status === "precisa" && r.now === 4.1 && Math.abs(r.need - 5.04) < 0.01 && r.open === 2 && Math.abs(r.notYet - 3.75) < 1e-9, "4,1 earned; 2,9 to go over 2 open + 3,75 not yet in Canvas: " + JSON.stringify(r));
  assert(NotasCore.custom(it, { total: 20 }, 7).now === 2.3, "a top of 20 points scales to 10");
  assert.strictEqual(NotasCore.custom(it, {}, 4).status, "garantido", "4,6 ≥ 4");
  const big = NotasCore.custom([{ key: "a", points: 10, score: 9 }, { key: "b", points: 10, score: 8 }], {}, 7);
  assert(big.status === "acima" && big.now === null && big.planned === 20, "points adding up past the top: no number, never a false garantido: " + JSON.stringify(big));
  assert.strictEqual(NotasCore.custom([{ key: "a", points: 10, score: 9 }, { key: "b", points: 10, score: 8 }], { total: 20 }, 7).now, 8.5, "told the top: 17 of 20 = 8,5");
  assert.strictEqual(NotasCore.custom([{ key: "a", points: 10, score: 2 }], {}, 7).status, "nao-da", "nothing left, below the meta");
  assert.strictEqual(NotasCore.custom(it, { off: ["a", "b", "c", "x"] }, 7).status, "vazio", "nothing counts");
  assert.strictEqual(NotasCore.custom([{ key: "a", points: 2, score: 5 }], {}, 7).now, 2, "a score above the points is capped");
  assert.strictEqual(NotasCore.custom(null, null, 7).status, "vazio", "no items: no number");
  assert.strictEqual(NotasCore.custom([{ key: "a", points: 10, score: 6.995 }], {}, 7).status, "nao-da", "6,995 is not 7 (compared before rounding)");
  // weighted parts: RA1 40% (P1 10 pts, graded 8) and RA2 60% (P2 10 pts, open): 0,4 × 8 = 3,2; 3,2 + 0,6 × x ≥ 7 → x = 6,33
  const its = [{ key: "p1", points: 10, score: 8 }, { key: "p2", points: 10, score: null }, { key: "ex", points: 1, score: 1 }];
  const wr = NotasCore.custom(its, { parts: { A: { w: 40 }, B: { w: 60 } }, part: { p1: "A", p2: "B" } }, 7);
  assert(wr.status === "precisa" && wr.now === 3.2 && Math.abs(wr.need - 6.33) < 0.01 && wr.parts.length === 2, "weighted parts: " + JSON.stringify(wr));
  const wt = NotasCore.custom(its, { parts: { A: { w: 40, top: 20 }, B: { w: 60 } }, part: { p1: "A", p2: "B" } }, 7);
  assert(wt.now === 1.6 && wt.notYet === 10, "a part's top above its items: the rest is still to come (0,4 × 8/20 × 10 = 1,6)");
  assert.strictEqual(NotasCore.custom(its, { parts: { A: { w: 40 }, B: { w: 60 } }, part: { p1: "A" } }, 7).status, "vazio", "a weighted part with no item and no top: no number");
  assert.strictEqual(NotasCore.custom(its, { parts: { A: { w: 100, top: 5 } }, part: { p1: "A" } }, 7).status, "acima", "a part past its top: no number");
  assert.strictEqual(NotasCore.custom(its, { parts: { A: { w: 40 }, B: { w: 60 } }, part: { p1: "A", p2: "B" }, off: ["p2"] }, 7).status, "vazio", "an unticked item leaves its part too");
  ok();
}
{ // the student's formula, written as the Plano de Ensino writes it (Imperativa-like: the Centro de Notas gives 3,4 and 6,0)
  const it = [{ key: "1", name: "Prova do RA1", points: 10, score: 8 }, { key: "2", name: "TDE 1: Motivação", points: 10, score: 10 }, { key: "3", name: "TDE 10", points: 10, score: 0 },
    { key: "4", name: "PBL01", points: 10, score: 10 }, { key: "5", name: "Prova do RA2", points: 10, score: null }, { key: "6", name: "Trabalho do RA2", points: 10, score: null }];
  const f = "Final = 40% RA1 + 60% RA2\nRA1 = 75% Prova do RA1 + 25% Exercícios\nExercícios = média(TDE 1, PBL01)\nRA2 = 70% Prova do RA2 + 30% Trabalho do RA2";
  const r = NotasCore.custom(it, { formula: f }, 7);
  assert(r.status === "precisa" && r.now === 3.4 && Math.abs(r.need - 6) < 0.01, "the Centro's numbers from the written formula: " + JSON.stringify(r).slice(0, 200));
  assert.deepStrictEqual(r.leaves.find(l => l.name === "TDE 1").items, ["TDE 1: Motivação"], "\"TDE 1\" is a whole word: not TDE 10");
  assert.strictEqual(NotasCore.custom(it, { formula: "Final = 0,4 RA1 + 0,6 RA2\nRA1 = 75% Prova do RA1 + 25% Exercícios\nExercícios = média(TDE 1, PBL01)\nRA2 = 70% Prova do RA2 + 30% Trabalho do RA2" }, 7).now, 3.4, "weights as decimals too");
  assert.strictEqual(NotasCore.custom(it, { formula: "Final = soma(Prova do RA1, PBL01) de 20" }, 7).now, 9, "soma(...) de N: 18 of 20 = 9");
  const miss = NotasCore.custom(it, { formula: "Final = 50% Prova do RA1 + 50% Prova do RA3" }, 7);
  assert(miss.notYet === 1 && miss.leaves[1].missing && miss.now === 4 && Math.abs(miss.need - 6) < 0.01, "a name not in Canvas yet counts as left: " + JSON.stringify(miss).slice(0, 160));
  assert.strictEqual(NotasCore.custom(it, { formula: "Final = 40 RA1" }, 7).status, "erro", "a term without a weight is an error");
  assert(NotasCore.custom(it, { formula: "Final = 40% A\nA = 100% Final" }, 7).errors.some(e => /ela mesma/.test(e)), "a loop is an error, not a hang");
  assert.strictEqual(NotasCore.custom(it, { formula: "Final = 30% Prova do RA1 + 30% PBL01" }, 7).weights[0], "Final", "weights that do not add to 100 are said (and normalised)");
  assert.strictEqual(NotasCore.custom(it, { formula: "Final = média(Prova do RA1, PBL01)" }, 9).status, "garantido", "média of 8 and 10 = 9");
  ok();
}
console.log("centro ok: " + n + " groups (tool value, quanto falta, extremes, recovery, no formula, odd input)");
