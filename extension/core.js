// Generated from app.html <script id="core"> by scripts/sync-ext-core; do not edit by hand.
// Pure functions and data only: no DOM, no storage, no network. Tested by a node script that evals this block.
const NotasCore = (() => {
  const EPS = 1e-9;
  const r9 = x => Math.round(x * 1e9) / 1e9;

  // The rules come from rule packs, one per turma: rules/<term>/<turma>.json (format in rules/schema.json, checked by
  // scripts/check-rules), embedded below by scripts/sync-rules so nothing is fetched at runtime. Every item: max = points of
  // the FINAL grade (course sum = 10); inMax = the scale the professor uses for that grade; date = the date used; dateSrc =
  // where it came from; alt = a conflicting date; unv = date not verified. Subject ids are unique across the term's packs.
  const PACKS = /*RULES*/[
    { term:"2026 / 2", termEnd:"2027-01-31", turma:"Ciência da Computação, manhã", subjects:[
      { id:"imp", name:"Programação Imperativa", short:"Imperativa", canvasIds:[72009], formula:"Pesos diretos na nota do semestre (10/30/10/10/40%)", src:"Plano de Ensino de Programação Imperativa l.335-371",
        canvas:{"items":{"ex1":{"avg":["TDE 1:","TDE 2:","PBL01","PBL02","PBL03","PBL04","PBL05"]},"p1":{"one":"Prova do RA1"},"ex2":{"avg":["PBL06","PBL07","PBL08","PBL09","PBL10"]},"t2":{"one":"Trabalho do RA2"},"p2":{"one":"Prova do RA2"}}},
        items:[
          {"id":"ex1","name":"Exercícios do RA1 (TDE 1, TDE 2, PBL01–05)","max":1,"inMax":10,"date":"2026-09-13","dateSrc":"Plano: de 5/8 a 13/9","wSrc":"Plano l.341: 10%"},
          {"id":"p1","name":"Prova do RA1","max":3,"inMax":10,"exam":true,"date":"2026-09-16","dateSrc":"Plano","wSrc":"Plano l.359: 30%"},
          {"id":"ex2","name":"Exercícios do RA2 (PBL06–10)","max":1,"inMax":10,"date":"2026-10-28","dateSrc":"Plano: de 23/9 a 28/10","alt":"Canvas: PBL10 até 03/11","unv":true,"wSrc":"Plano l.360: 10%"},
          {"id":"t2","name":"Trabalho do RA2 (equipe)","max":1,"inMax":10,"date":"2026-11-17","dateSrc":"Canvas: 17/11 23:59","alt":"Plano l.349: 18/11","wSrc":"Plano l.361: 10%"},
          {"id":"p2","name":"Prova do RA2","max":4,"inMax":10,"exam":true,"date":"2026-11-11","dateSrc":"Canvas: 11/11 14:10; Plano l.365","wSrc":"Plano l.371: 40%"} ] },
      { id:"abd", name:"Arquitetura de Banco de Dados", short:"Banco de Dados", canvasIds:[71306], formula:"Final = 25% RA1 + 50% RA2 + 25% RA3; RA1 e RA3 = 50% prova + 40% PjBL + 10% TDE; RA2 = 60% prova + 30% PjBL + 10% TDE. Notas em pontos da final; PjBL II na escala do Canvas (0–2).", src:"Plano de Ensino de Arquitetura de Banco de Dados l.365-446",
        canvas:{"items":{"pj1":{"one":"PjBL - Parte 1"},"s1":{"one":"Avaliação somativa RA1"},"pj2":{"one":"PjBL - Parte 2"},"s2":{"one":"Avaliação somativa RA2"},"pj3":{"one":"Pjbl Parte 3"},"s3":{"one":"Avaliação somativa RA3"}}},
        items:[
          {"id":"pj1","name":"RA1 · PjBL Parte I","max":1,"inMax":1,"date":"2026-09-03","dateSrc":"Plano","wSrc":"Plano: 40% de RA1 (25%) = 1,0 pt"},
          {"id":"s1","name":"RA1 · Somativa individual I","max":1.25,"inMax":1.25,"exam":true,"date":"2026-09-10","dateSrc":"Plano","wSrc":"Plano: 50% de RA1 = 1,25 pt"},
          {"id":"tde1","name":"RA1 · TDE","max":0.25,"inMax":0.25,"date":"2026-11-12","dateSrc":"Plano l.436: TDE 12/11","unv":true,"wSrc":"Plano: 10% de RA1 = 0,25 pt"},
          {"id":"pj2","name":"RA2 · PjBL Parte II","max":1.5,"inMax":2,"date":"2026-10-15","dateSrc":"Plano","wSrc":"Tabela do prof.: 30% de RA2 (50%) = 1,5 pt (Canvas lança de 0 a 2)"},
          {"id":"s2","name":"RA2 · Somativa individual II","max":3,"inMax":3,"exam":true,"date":"2026-10-22","dateSrc":"Plano l.396","wSrc":"Tabela do prof.: 60% de RA2 (50%) = 3,0 pt"},
          {"id":"tde2","name":"RA2 · TDE","max":0.5,"inMax":0.5,"date":"2026-11-12","dateSrc":"Tabela do prof.: TDE 12/11","unv":true,"wSrc":"Tabela do prof.: 10% de RA2 = 0,5 pt"},
          {"id":"pj3","name":"RA3 · PjBL Parte III (entrega final)","max":1,"inMax":1,"date":"2026-11-18","dateSrc":"Canvas: 18/11 10:40","alt":"Plano l.426: 19/11","wSrc":"Plano: 40% de RA3 (25%) = 1,0 pt"},
          {"id":"s3","name":"RA3 · Somativa individual III","max":1.25,"inMax":1.25,"exam":true,"date":"2026-11-19","dateSrc":"Plano l.416","wSrc":"Plano: 50% de RA3 = 1,25 pt"},
          {"id":"tde3","name":"RA3 · TDE","max":0.25,"inMax":0.25,"date":"2026-11-12","dateSrc":"Plano l.436: TDE 12/11","unv":true,"wSrc":"Plano: 10% de RA3 = 0,25 pt"} ] },
      { id:"rpnd", name:"Resolução de Problemas de Natureza Discreta", short:"RPND", canvasIds:[72005], formula:"Final = 60% RA1 + 40% RA2; cada RA soma 10 pontos (AS lançadas em pontos do RA)", src:"Plano de Ensino de RPND l.315-374",
        canvas:{"items":{"as1":{"one":"AS 01"},"as2":{"one":"AS 02"},"as3":{"one":"AS 03"},"as4":{"one":"AS 04"},"as5":{"one":"AS 05"},"as6":{"one":"AS 06"},"as7":{"one":"AS 07"},"as8":{"one":"AS 08"}}},
        items:[
          {"id":"as1","name":"RA1 · AS 01 (grupo)","max":0.3,"inMax":0.5,"date":"2026-08-17","dateSrc":"Plano l.319","wSrc":"Plano: 0,5 de 10 no RA1"},
          {"id":"as2","name":"RA1 · AS 02 (grupo)","max":0.3,"inMax":0.5,"date":"2026-08-26","dateSrc":"Plano l.325","wSrc":"Plano: 0,5 de 10 no RA1"},
          {"id":"as3","name":"RA1 · AS 03 (grupo)","max":0.6,"inMax":1,"date":"2026-09-09","dateSrc":"Plano l.331","wSrc":"Plano: 1,0 de 10 no RA1"},
          {"id":"as4","name":"RA1 · AS 04 (grupo)","max":0.6,"inMax":1,"date":"2026-09-23","dateSrc":"Plano l.337","wSrc":"Plano: 1,0 de 10 no RA1"},
          {"id":"as5","name":"RA1 · AS 05 (individual)","max":4.2,"inMax":7,"exam":true,"date":"2026-09-28","dateSrc":"Plano l.343","wSrc":"Plano: 7,0 de 10 no RA1"},
          {"id":"as6","name":"RA2 · AS 06 (grupo)","max":0.6,"inMax":1.5,"date":"2026-10-21","dateSrc":"Plano l.349","wSrc":"Plano: 1,5 de 10 no RA2"},
          {"id":"as7","name":"RA2 · AS 07 (grupo)","max":0.6,"inMax":1.5,"date":"2026-11-11","dateSrc":"Canvas: 11/11 14:10; Plano l.355","wSrc":"Plano: 1,5 de 10 no RA2"},
          {"id":"as8","name":"RA2 · AS 08 (individual)","max":2.8,"inMax":7,"exam":true,"date":"2026-11-18","dateSrc":"Canvas: 18/11 14:10; Plano l.361","wSrc":"Plano: 7,0 de 10 no RA2"} ] },
      { id:"web", name:"Programação WEB", short:"WEB", canvasIds:[71310], formula:"Final = 25% RA1 + 40% RA2 + 35% RA3; cada RA = 85% prova + 15% TDE", src:"PDF do Plano p.6, linha Total (25/40/35, texto sobreposto ao 100%) e Plano-de-Ensino.md l.336-376",
        canvas:{"items":{"p1":{"one":"Avaliação Somativa RA1 - GRUPO B e GRUPO A"},"tde":{"one":"Entrega TDE"}}},
        items:[
          {"id":"p1","name":"Prova do RA1","max":2.125,"inMax":10,"exam":true,"date":"2026-09-28","dateSrc":"Plano","wSrc":"85% de RA1 (25%)"},
          {"id":"tde","name":"TDE (CRUD, conta nos 3 RAs)","max":1.5,"inMax":10,"date":"2026-11-06","dateSrc":"PDF do trabalho: 06/11 07:50","alt":"Plano l.368: 09/nov","unv":true,"wSrc":"15% de cada RA"},
          {"id":"p23","name":"Prova do RA2 e do RA3 (uma prova, conta nos dois)","max":6.375,"inMax":10,"exam":true,"date":"2026-11-13","dateSrc":"Cronograma: 13/11","alt":"Plano l.358: 16/nov","unv":true,"wSrc":"85% de RA2 (40%) + 85% de RA3 (35%) = 3,4 + 2,975"} ] },
      { id:"etica", name:"Ética", short:"Ética", canvasIds:[72006], formula:"Final = 70% RA1 + 30% RA2; notas em pontos da final", src:"Plano de Ensino de Ética l.208 e l.261",
        canvas:{"items":{"ra1":{"sum":["Aula 4 - TAREFA SOMATIVA","Aula 7 - TAREFA SOMATIVA","Avaliação somativa -  Prova"],"factor":0.23333333333333334},"ra2":{"one":"TDE - TAREFA SOMATIVA - VÍDEO"}}},
        items:[
          {"id":"ra1","name":"RA1 (prova e atividades)","max":7,"inMax":7,"exam":true,"date":"2026-10-16","dateSrc":"Plano l.409: prova 16/10","wSrc":"Plano l.208: 70%"},
          {"id":"ra2","name":"RA2 · TDE vídeo (TBL)","max":3,"inMax":3,"date":"2026-11-10","dateSrc":"Prof.: link 10/11, apresenta 13/11","unv":true,"wSrc":"Plano l.261: 30%"} ] },
      { id:"cscf", name:"Conectividade em Sistemas Ciberfísicos", short:"Conectividade", canvasIds:[72011], formula:"Final = (RA1 + RA2) / 2; RA1 = AS1; RA2 = AS2 (60%) + PjBL (40%)", src:"Plano de Ensino de Conectividade l.288-306 e l.554",
        canvas:{"items":{"as1":{"one":"AS01 - NOTAS","pts":10},"pj":{"one":"Projeto CSCF"}}},
        items:[
          {"id":"as1","name":"RA1 · Avaliação Somativa 1 (nota do RA1)","max":5,"inMax":10,"exam":true,"date":"2026-09-21","dateSrc":"Data não confirmada no Plano","unv":true,"wSrc":"Plano l.294: AS1 = 100% do RA1"},
          {"id":"as2","name":"RA2 · Avaliação Somativa 2","max":3,"inMax":10,"exam":true,"date":"2026-11-09","dateSrc":"Aviso em aula: 09/11 07:50","unv":true,"wSrc":"Plano l.300: 60% do RA2"},
          {"id":"pj","name":"RA2 · Projeto PjBL (MQTT)","max":2,"inMax":10,"date":"2026-11-09","dateSrc":"Canvas: 09/11 (hora a conferir)","unv":true,"wSrc":"Plano l.306: 40% do RA2"} ] } ] } ]/*RULES*/;
  const COURSES = [], PACK_OF = {};
  for (const p of PACKS) for (const s of p.subjects) { COURSES.push({ id:s.id, name:s.name, formula:s.formula, src:s.src, items:s.items }); PACK_OF[s.id] = p; }

  // Public build: everyone starts empty; grades live only in each visitor's browser.
  const SEED = {};

  // "" or null -> null (not graded); bad text -> NaN; accepts a decimal comma.
  function parseNum(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().replace(",", ".");
    if (s === "") return null;
    return /^(\d+(\.\d*)?|\.\d+)$/.test(s) ? Number(s) : NaN;
  }
  // Points of the final for one grade; NaN when outside 0..inMax.
  function itemPoints(item, raw) {
    const n = parseNum(raw);
    if (n === null) return null;
    if (Number.isNaN(n) || n > item.inMax + EPS) return NaN;
    return n / item.inMax * item.max;
  }
  const weightSum = c => r9(c.items.reduce((s, it) => s + it.max, 0));
  const key = (c, it) => c.id + ":" + it.id;

  // today: "YYYY-MM-DD" in local time. An item dated today is still upcoming.
  function courseState(c, grades, today, target) {
    let earned = 0, futureMax = 0, lateMax = 0;
    const future = [], late = [], invalid = [];
    for (const it of c.items) {
      const p = itemPoints(it, grades[key(c, it)]);
      if (Number.isNaN(p)) invalid.push(it);
      if (p !== null && !Number.isNaN(p)) { earned += p; continue; }
      if (it.date < today) { late.push(it); lateMax += it.max; }
      else { future.push(it); futureMax += it.max; }
    }
    earned = r9(earned); futureMax = r9(futureMax); lateMax = r9(lateMax);
    const need = r9(Math.max(0, target - earned));
    const ceiling = r9(earned + futureMax);            // late items count 0
    const ceilingIfLate = r9(ceiling + lateMax);       // late items still full
    let status;
    if (need <= EPS) status = "garantido";
    else if (ceilingIfLate < target - EPS) status = "nao-da";
    else if (ceiling < target - EPS) status = "depende-atrasadas";
    else status = "precisa";
    const fraction = need <= EPS ? 0 : futureMax > EPS ? need / futureMax : null;
    const fractionIfLate = need <= EPS ? 0 : futureMax + lateMax > EPS ? need / (futureMax + lateMax) : null;
    return { earned, futureMax, lateMax, need, ceiling, ceilingIfLate, status, fraction, fractionIfLate,
             future, late, invalid, provisional: late.length > 0 || invalid.length > 0 };
  }
  // Same fraction of each pending item's maximum (so the weight of each item counts). Returned in the item's own scale.
  function requiredFor(st, item) {
    if (st.fraction == null) return null;
    const f = st.fraction;
    return { f, raw: f * item.inMax, of10: f * 10, impossible: f > 1 + EPS };
  }
  // Minimum on this item when every other upcoming item gets full marks.
  function minimumFor(st, item, target) {
    const f = Math.max(0, (target - st.earned - (st.futureMax - item.max)) / item.max);
    return { f, raw: f * item.inMax, impossible: f > 1 + EPS };
  }
  function upcoming(courses, grades, today, target) {
    const out = [];
    for (const c of courses) {
      const st = courseState(c, grades, today, target);
      for (const it of st.future) out.push({ course:c, item:it, st, req:requiredFor(st, it), min:minimumFor(st, it, target) });
    }
    return out.sort((a, b) => a.item.date.localeCompare(b.item.date) || a.course.name.localeCompare(b.course.name));
  }
  const pad = n => String(n).padStart(2, "0");
  const localISO = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  function fullMarks(courses) {
    const g = {};
    for (const c of courses) for (const it of c.items) g[key(c, it)] = String(it.inMax);
    return g;
  }

  // A turma is recognised by its Canvas course ids (canvasIds); other turmas (same course names, other ids) get no grades
  // from its rules. TERM is how Canvas names the semester (one term per build); after TERM_END the rules are old.
  const TERM = PACKS[0].term, TERM_END = PACKS[0].termEnd, TURMA = PACKS.map(p => p.turma).join(" / ");
  const turmaOf = c => PACK_OF[c.id] ? PACK_OF[c.id].turma : null;
  const expired = today => today > TERM_END;
  const EXPIRED_NOTE = "As regras de " + TERM.replace(/ /g, "") + " acabaram. Atualize o Campus+ quando sair a versão do próximo semestre.";
  // The calculator inside the extension (cpExt = window.CP_EXT): after the term, the notice and no automatic import of the
  // Canvas reading. Site copy (no cpExt): unchanged.
  const extBoot = (cpExt, today) => ({ notice: cpExt && expired(today) ? EXPIRED_NOTE : null, autoImport: !!(cpExt && cpExt.data) && !expired(today) });
  // Canvas assignment names per item, from each pack's canvas.items; cids = the subject's Canvas course ids (cid: the first).
  // one: one assignment; avg: mean of score/points over all parts; sum: (each part on 0-10) summed times factor, already in the item's scale; pts: scale to use when Canvas lists 0 points; missing ids are typed by hand.
  const CANVAS = {};
  for (const p of PACKS) for (const s of p.subjects) CANVAS[s.id] = { cid:s.canvasIds[0], cids:s.canvasIds, match:s.name, items:(s.canvas || {}).items || {} };
  const str = x => typeof x === "string" ? x : null;
  const num = x => typeof x === "number" && Number.isFinite(x) ? x : null;
  const cidOf = x => typeof x === "number" && Number.isInteger(x) && x > 0 ? x : typeof x === "string" && /^\d{1,15}$/.test(x) ? Number(x) : null;
  // The subject of one Canvas course ({ id, name }): by course id when the data has ids; by name prefix only for data without
  // ids (old backups, older exports).
  // A name shared by subjects of two turmas pairs to none (no guessing).
  function subjectOf(cv, byId) {
    if (byId) return COURSES.find(c => CANVAS[c.id].cids.includes(cidOf(cv.id))) || null;
    const hits = typeof cv.name === "string" ? COURSES.filter(c => cv.name.startsWith(CANVAS[c.id].match)) : [];
    return hits.length === 1 ? hits[0] : null;
  }
  // Extension export -> { grades: {"course:item": "x"}, missing: [{key, reason}], notes: [{key, reason}] }. Never evaluates input.
  function fromCanvas(input) {
    let data = input;
    if (typeof input === "string") { try { data = JSON.parse(input); } catch (e) { throw new Error("formato inválido: não é o texto copiado do Canvas"); } }
    if (!data || typeof data !== "object" || !Array.isArray(data.courses)) throw new Error("formato inválido: falta a lista de matérias");
    const courses = data.courses.map(c => {
      if (!c || str(c.name) === null || !Array.isArray(c.assignments)) throw new Error("formato inválido: matéria sem nome ou sem avaliações");
      return { id:cidOf(c.id), name:c.name, assignments:c.assignments.filter(a => a && str(a.name) !== null).map(a => ({ name:a.name, points:num(a.points), score:num(a.score),
        due:str(a.due) === null ? null : /^\d{4}-\d\d-\d\d$/.test(a.due) ? a.due : Number.isNaN(Date.parse(a.due)) ? null : localISO(new Date(a.due)), missing:a.missing === true, flagged:"missing" in a,
        submitted:a.submitted === true, hasSub:"submitted" in a, offline:a.online === false,
        stats:a.stats && typeof a.stats === "object" && [a.stats.mean, a.stats.min, a.stats.max].every(x => num(x) !== null) ? { mean:a.stats.mean, min:a.stats.min, max:a.stats.max } : null })) };
    });
    const byId = courses.some(cv => cv.id !== null);
    // Assignments Canvas marks as missing (due date passed, nothing handed in), in any 2026/2 course, oldest first.
    const pending = [];
    for (const cv of courses) {
      const ours = subjectOf(cv, byId);
      for (const a of cv.assignments) if (a.missing) pending.push({ course:ours ? ours.id : null, courseName:cv.name.split(" (")[0].split(" - ")[0], name:a.name, due:a.due });
    }
    pending.sort((x, y) => (x.due || "9") < (y.due || "9") ? -1 : (x.due || "9") > (y.due || "9") ? 1 : 0);
    const known = courses.some(cv => cv.assignments.some(a => a.flagged));   // older exports have no flag: unknown, not "none"
    // Not handed in yet and not late: everything with a due date, soonest first; the page keeps the next two weeks.
    const todo = [];
    for (const cv of courses) {
      const ours = subjectOf(cv, byId);
      for (const a of cv.assignments) if (a.hasSub && !a.submitted && !a.missing && !a.offline && a.due) todo.push({ course:ours ? ours.id : null, courseName:cv.name.split(" (")[0].split(" - ")[0], name:a.name, due:a.due });
    }
    todo.sort((x, y) => x.due < y.due ? -1 : x.due > y.due ? 1 : 0);
    const knownSub = courses.some(cv => cv.assignments.some(a => a.hasSub)), dates = {}, stats = {};
    const knownStats = Array.isArray(data.courses) && data.courses.some(c => c && Array.isArray(c.assignments) && c.assignments.some(a => a && "stats" in a));
    const grades = {}, missing = [], notes = [];
    const turmas = new Set(courses.map(cv => subjectOf(cv, byId)).filter(Boolean).map(c => PACK_OF[c.id]));   // the reading's turmas
    for (const c of COURSES) {
      if (turmas.size && !turmas.has(PACK_OF[c.id])) continue;   // another turma's subject: not this student's
      const map = CANVAS[c.id], cvs = map ? courses.filter(x => subjectOf(x, byId) === c) : [], cv = cvs.length === 1 ? cvs[0] : null;
      for (const it of c.items) {
        const k = key(c, it), rule = map && map.items[it.id];
        if (!rule) { missing.push({ key:k, reason:"lance à mão: não há uma avaliação equivalente no Canvas" }); continue; }
        if (!cv) { missing.push({ key:k, reason:cvs.length > 1 ? "a matéria aparece em mais de uma turma no Canvas: lance à mão" : "matéria não veio do Canvas" }); continue; }
        const parts = (rule.avg || rule.sum || [rule.one]).map(n => cv.assignments.filter(a => a.name.includes(n)));
        if (parts.some(p => p.length !== 1)) { missing.push({ key:k, reason:"avaliação não está no Canvas (ou aparece repetida)" }); continue; }
        const got = parts.map(p => p[0]);
        if (rule.one && got[0].due) dates[k] = got[0].due;   // Canvas due date of a single-assignment item
        if (got.some(a => a.score === null)) { missing.push({ key:k, reason:"sem nota ainda no Canvas" }); continue; }
        const pts = a => rule.pts && !(a.points > 0) ? rule.pts : a.points;
        if (got.some(a => !(pts(a) > 0))) { missing.push({ key:k, reason:"avaliação sem pontuação no Canvas" }); continue; }
        if (rule.one && got[0].stats && pts(got[0]) > 0) {   // class mean/min/max on the item's own scale
          const sc = x => r9(Math.round(Math.min(1, Math.max(0, x / pts(got[0]))) * it.inMax * 1000) / 1000), s = got[0].stats;
          stats[k] = { mean:sc(s.mean), min:sc(s.min), max:sc(s.max) };
        }
        let f = rule.sum ? got.reduce((s, a) => s + a.score / pts(a) * 10, 0) * rule.factor / it.inMax
                         : got.reduce((s, a) => s + a.score / pts(a), 0) / got.length;
        if (f > 1 + EPS) { notes.push({ key:k, reason:"nota acima do máximo no Canvas: usei a nota cheia" }); f = 1; }
        grades[k] = String(r9(Math.round(Math.max(0, f) * it.inMax * 1000) / 1000));
      }
    }
    const ext = data.ext === "script" || data.ext === "bookmarklet" || (str(data.ext) !== null && /^\d+(\.\d+){0,3}$/.test(data.ext)) ? data.ext : null;   // "script": tools/canvas-export.py
    // Announcements: plain text only; links kept only when they point into the PUCPR Canvas.
    const news = !Array.isArray(data.announcements) ? null : data.announcements.filter(a => a && str(a.title) !== null).slice(0, 50).map(a => {
      const cn = str(a.course) || "", ours = "courseId" in a ? subjectOf({ id:a.courseId }, true) : subjectOf({ name:cn }, false);
      const url = str(a.url) !== null && /^https:\/\/pucpr\.instructure\.com\//.test(a.url) ? a.url : null;
      return { course:ours ? ours.id : null, courseName:cn.split(" (")[0].split(" - ")[0], title:a.title.slice(0, 200),
               at:str(a.at) !== null && !Number.isNaN(Date.parse(a.at)) ? localISO(new Date(a.at)) : null, unread:a.unread === true, url };
    }).sort((x, y) => (y.unread - x.unread) || ((y.at || "") > (x.at || "") ? 1 : -1));
    return { grades, missing, notes, pending: known ? pending.slice(0, 200) : null, todo: knownSub ? todo.slice(0, 200) : null, dates, stats:knownStats ? stats : null, news, ext,
             extOld: ext !== "script" && ext !== "bookmarklet" && (!ext || verLess(ext, EXT_LATEST)) };
  }

  // Latest extension on the release page; an import from an older copy (or one too old to say) shows how to update.
  const EXT_LATEST = "1.0.3";
  const verLess = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };

  // Backup file (#7): the student's own grades as JSON, to move between browsers. Only known items, text values.
  const SEMESTER = TERM.replace(" / ", "-");
  const itemByKey = k => { const p = String(k).split(":"); if (p.length !== 2) return null; const [cid, iid] = p; const c = COURSES.find(x => x.id === cid); return c && c.items.find(i => i.id === iid) || null; };
  function toBackup(grades, meta) {
    const out = {};
    for (const c of COURSES) for (const it of c.items) { const v = grades[key(c, it)]; if (typeof v === "string" && v.trim() !== "") out[key(c, it)] = v.trim(); }
    return JSON.stringify({ app:"quanto-falta", v:1, semester:SEMESTER, exported:new Date().toISOString().slice(0, 10), meta:String(meta), grades:out }, null, 1);
  }
  function fromBackup(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error("arquivo inválido: não é um backup do Campus+"); }
    if (!d || d.app !== "quanto-falta" || !d.grades || typeof d.grades !== "object" || Array.isArray(d.grades)) throw new Error("arquivo inválido: não é um backup do Campus+");
    const grades = {}, missing = [], notes = [];
    if (d.semester !== SEMESTER) notes.push({ key:"", reason:"backup de outro semestre (" + String(d.semester) + "): confira antes de aplicar" });
    for (const k of Object.keys(d.grades)) {
      const it = itemByKey(k), v = d.grades[k];
      if (!it) { missing.push({ key:k, reason:"avaliação que não existe nesta calculadora" }); continue; }
      if (typeof v !== "string") { missing.push({ key:k, reason:"nota em formato estranho, ignorada" }); continue; }
      const p = itemPoints(it, v);
      if (p === null || Number.isNaN(p)) { missing.push({ key:k, reason:"nota fora da escala, ignorada" }); continue; }
      grades[k] = v;
    }
    return { grades, missing, notes, meta: typeof d.meta === "string" ? d.meta : null };
  }
  // localStorage key of the calculator: per Canvas user inside the extension (a shared computer keeps each student's grades
  // apart); the first user to open it adopts grades saved before the key had a user, and the old key is never written there
  // again. Inside the extension without a user (no Canvas reading): a key of its own that nobody adopts. Site copy: the old key.
  const STORE = "notas-pucpr-" + SEMESTER;
  function storageKey(ls, user, inExt) {
    const u = user != null && /^\d{1,20}$/.test(String(user)) ? String(user) : null;
    if (!u) return inExt ? STORE + ":nouser" : STORE;
    const k = STORE + ":u" + u;
    try { if (ls.getItem(k) == null) { const old = ls.getItem(STORE); if (old != null) { ls.setItem(k, old); ls.removeItem(STORE); } } } catch (e) { /* storage off: nothing to move */ }
    return k;
  }
  // "garantido" is a reading of the grades, not an official result.
  const GARANTIDO_TIP = "Garantido pelas notas lançadas; não considera frequência nem recuperação";
  const SHORT = Object.fromEntries(PACKS.flatMap(p => p.subjects.map(s => [s.id, s.short])));
  // The subjects the calculator shows: the whole turma(s) of the Canvas courses in the reading; every subject when the
  // reading matches no turma (or there is none), as with a single turma.
  function coursesFor(data) {
    const cs = data && Array.isArray(data.courses) ? data.courses.filter(c => c && typeof c === "object") : [];
    const turmas = new Set(cs.map(c => subjectOf({ id:c.id }, true)).filter(Boolean).map(c => PACK_OF[c.id]));
    return turmas.size ? COURSES.filter(c => turmas.has(PACK_OF[c.id])) : COURSES;
  }
  // Shared by the calculator page and the panels inside Canvas (extension/content.js), so both show the same numbers.
  const fractionTone = f => f > 0.8 ? "bad" : f > 0.6 ? "warn" : "ok";
  const statusTone = st => st.status === "garantido" ? "ok" : st.status === "nao-da" ? "bad" : st.status === "depende-atrasadas" ? "warn" : fractionTone(st.fraction);
  const nextItem = st => st.future.slice().sort((a, b) => a.date < b.date ? -1 : 1)[0] || null;
  // Ring: share of 10 already earned, and the share still possible (capped so both fit in one turn).
  const ringParts = st => { const e = Math.min(10, st.earned); return { earned: e / 10, future: Math.min(10 - e, st.futureMax) / 10 }; };
  // What a course still needs on 0-10 in each remaining item: of10 null when it cannot reach the goal; approx when
  // old items have no grade yet (counted as if they were like the rest).
  function courseNeed(st) {
    if (st.status === "garantido") return { of10: 0, approx: false, impossible: false, tone: "ok" };
    if (st.status === "nao-da" || st.fraction == null || st.fraction > 1 + EPS) return { of10: null, approx: false, impossible: true, tone: "bad" };
    if (st.status === "depende-atrasadas") { const f = st.fractionIfLate;
      return f == null || f > 1 + EPS ? { of10: null, approx: true, impossible: true, tone: "bad" } : { of10: f * 10, approx: true, impossible: false, tone: "warn" }; }
    return { of10: st.fraction * 10, approx: false, impossible: false, tone: fractionTone(st.fraction) };
  }
  // The upcoming assessments that still count (course not yet guaranteed), soonest first.
  const stillCounts = (courses, grades, today, target) => upcoming(courses, grades, today, target).filter(u => u.st.status !== "garantido");
  // The semester overview: mean of the points earned, the tightest course still reachable, and every item as a tracker
  // block (ok graded, late past without a grade, next still to come), in date order.
  function semester(courses, grades, today, target) {
    const states = {}; for (const c of courses) states[c.id] = courseState(c, grades, today, target);
    const mean = courses.reduce((s, c) => s + Math.min(10, states[c.id].earned), 0) / courses.length;
    const tight = courses.filter(c => states[c.id].status === "precisa").sort((a, b) => states[b.id].fraction - states[a.id].fraction)[0] || null;
    const counts = {}; for (const c of courses) counts[states[c.id].status] = (counts[states[c.id].status] || 0) + 1;
    const items = [];
    for (const c of courses) for (const it of c.items) {
      const p = itemPoints(it, grades[key(c, it)]), graded = p !== null && !Number.isNaN(p);
      items.push({ course: c, item: it, s: graded ? "ok" : it.date < today ? "late" : "next" });
    }
    items.sort((a, b) => a.item.date.localeCompare(b.item.date));
    return { states, mean, tight, counts, items, done: items.filter(x => x.s === "ok").length, late: items.filter(x => x.s === "late").length };
  }
  return { COURSES, SEED, CANVAS, TERM, TERM_END, TURMA, turmaOf, coursesFor, expired, EXPIRED_NOTE, extBoot, subjectOf, storageKey, GARANTIDO_TIP, fromCanvas, EXT_LATEST, verLess, SEMESTER, toBackup, fromBackup, itemByKey, parseNum, itemPoints, weightSum, key, courseState, requiredFor, minimumFor, upcoming, localISO, fullMarks,
           SHORT, fractionTone, statusTone, nextItem, ringParts, courseNeed, stillCounts, semester };
})();
