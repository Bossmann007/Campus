// Generated from app.html <script id="ui"> by scripts/sync-ext-core; do not edit by hand.
(() => {
  const C = NotasCore, LS = "notas-pucpr-2026-2";
  const CHEV = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>', ALERT = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.4v.1"/></svg>';
  const SHORT = { imp:"Imperativa", abd:"Banco de Dados", rpnd:"RPND", web:"WEB", etica:"Ética", cscf:"Conectividade" };
  let saved;
  try { saved = JSON.parse(localStorage.getItem(LS)); } catch (e) { saved = null; }
  if (!saved || typeof saved !== "object" || !saved.grades || typeof saved.grades !== "object" || Array.isArray(saved.grades))
    saved = { grades: Object.assign({}, C.SEED), meta: "7" };
  if (typeof saved.meta !== "string") saved.meta = "7";
  if (!saved.open || typeof saved.open !== "object") saved.open = {};
  if (!saved.pending || typeof saved.pending.at !== "string" || !Array.isArray(saved.pending.list)) delete saved.pending;
  if (!saved.todo || typeof saved.todo.at !== "string" || !Array.isArray(saved.todo.list)) delete saved.todo;
  if (!saved.cdates || typeof saved.cdates !== "object" || Array.isArray(saved.cdates)) saved.cdates = {};
  if (!Array.isArray(saved.fresh)) saved.fresh = [];
  if (!saved.stats || typeof saved.stats !== "object" || Array.isArray(saved.stats)) saved.stats = {};
  if (!saved.news || typeof saved.news.at !== "string" || !Array.isArray(saved.news.list)) delete saved.news;
  const ISO = /^\d{4}-\d\d-\d\d$/;
  let warned = false;
  const store = () => { try { localStorage.setItem(LS, JSON.stringify(saved)); } catch (e) {
    if (warned) return; warned = true;
    const w = el("div", "savewarn", "Este navegador não está salvando suas notas (aba anônima ou sem espaço). Antes de fechar, exporte um backup em Backup."); w.setAttribute("role", "alert"); document.body.appendChild(w); } };

  const $ = id => document.getElementById(id);
  const metaEl = $("meta");
  metaEl.value = saved.meta;
  metaEl.closest(".meta").addEventListener("click", e => { if (!e.target.closest("button")) metaEl.focus(); });
  let today = C.localISO(new Date());   // refreshed on every calc (tab left open past midnight)
  const dec = n => n >= 5 ? 1 : 2;
  const fmt = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits:d, maximumFractionDigits:d });
  const up = (n, d) => fmt(Math.ceil(n * 10 ** d - 1e-9) / 10 ** d, d);   // round up: never shows less than needed
  const exact = n => n.toLocaleString("pt-BR", { minimumFractionDigits:2, maximumFractionDigits:3 });   // earned/ceiling never rounded up
  const dmy = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const days = iso => Math.round((Date.parse(iso) - Date.parse(today)) / 864e5);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function cell(label, cls, text) { const d = el("div", cls, text); if (label) d.dataset.label = label; return d; }
  const badge = (cls, text) => el("span", "badge " + cls, text);
  const tone = f => f > 0.8 ? "bad" : f > 0.6 ? "warn" : "ok";

  function reqText(req, it, st) {
    if (!req) return "—";
    if (st && st.status === "depende-atrasadas") {   // estimate: late grades at the same fraction as the rest
      const f = st.fractionIfLate;
      if (f == null || f > 1 + 1e-9) return "não dá";
      return "≈ " + reqText({ f, raw: f * it.inMax, of10: f * 10, impossible: false }, it);
    }
    if (req.f <= 1e-9) return "0";
    if (req.impossible) return "não dá";
    return it.inMax === 10 ? up(req.raw, 1) : up(req.raw, dec(it.inMax)) + " de " + fmt(it.inMax, dec(it.inMax)) + " · " + up(req.of10, 1) + "/10";
  }
  const minText = (m, it) => m.impossible ? "não dá" : m.f <= 1e-9 ? "0" : up(m.raw, dec(it.inMax));
  function srcText(it) { return it.dateSrc + (it.alt ? " · outra fonte: " + it.alt : "") + (it.unv ? " · não verificada" : ""); }
  // Class mean/min/max from Canvas for one item, already on the item's scale.
  const classStat = (k, it) => { const v = saved.stats[k];
    return v && [v.mean, v.min, v.max].every(x => typeof x === "number" && x >= 0 && x <= it.inMax + 1e-9) ? v : null; };
  function classBar(cs, raw, it) {
    const pct = x => Math.max(0, Math.min(100, x / it.inMax * 100)) + "%", w = el("div", "vs");
    const bar = el("span", "vsbar"), rng = el("i", "rng"), mean = el("i", "mean"), you = el("i", "you");
    rng.style.left = pct(cs.min); rng.style.width = "calc(" + pct(cs.max) + " - " + pct(cs.min) + ")"; mean.style.left = pct(cs.mean); you.style.left = pct(raw);
    bar.append(rng, mean, you);
    const d = raw - cs.mean, dec2 = dec(it.inMax);
    w.append(bar, el("span", "vst", "turma " + fmt(cs.mean, dec2) + " · você " + (d >= 0 ? "+" : "−") + fmt(Math.abs(d), dec2)));
    w.title = "Turma no Canvas: média " + fmt(cs.mean, dec2) + ", mínima " + fmt(cs.min, dec2) + ", máxima " + fmt(cs.max, dec2);
    return w;
  }
  // The Canvas due date for this item, when the last import had one and it differs from the Plano date.
  const canvasDate = (k, it) => { const v = saved.cdates[k]; return typeof v === "string" && ISO.test(v) && v !== it.date ? "Canvas: " + dmy(v) : ""; };
  function whenCell(it, k) {
    const d = days(it.date), w = cell("Data", "when");
    const top = el("span", "d num", dmy(it.date));
    let note = null;
    if (it.unv || it.alt) { const f = el("button", "flag"); f.type = "button"; f.innerHTML = ALERT; f.title = "Data a conferir: " + srcText(it); f.setAttribute("aria-label", "data a conferir: mostrar a fonte"); f.setAttribute("aria-expanded", "false");
      note = el("span", "flagnote", "Data a conferir: " + srcText(it)); note.hidden = true; note.id = "fn-" + Math.random().toString(36).slice(2); f.setAttribute("aria-controls", note.id);
      f.addEventListener("click", e => { e.stopPropagation(); note.hidden = !note.hidden; f.setAttribute("aria-expanded", !note.hidden); }); top.appendChild(f); }
    w.append(top, el("span", "rel" + (d >= 0 && d <= 3 ? " soon" : d >= 0 && d <= 7 ? " week" : ""),
      d === 0 ? "hoje" : d === 1 ? "amanhã" : d > 0 ? "em " + d + " dias" : d >= -7 ? "há " + -d + " dias" : "passou"));
    const cd = el("span", "cdate", k ? canvasDate(k, it) : ""); if (k) cd.id = "cd-" + k; cd.title = "Prazo no Canvas na última importação; a conta usa a data do Plano de Ensino";
    w.append(cd, el("span", "src fonte", srcText(it))); if (note) w.appendChild(note);
    return w;
  }
  function needBadge(st, it) {
    if (st.status === "garantido") return badge("ok", "garantido");
    const dep = st.status === "depende-atrasadas", req = C.requiredFor(st, it);
    return badge(dep ? "warn" : req.impossible ? "bad" : tone(req.f), reqText(req, it, st));
  }
  function target() {
    const n = C.parseNum(metaEl.value), ok = n != null && !Number.isNaN(n) && n <= 10;
    metaEl.classList.toggle("bad", !ok); metaEl.title = ok ? "" : "Meta inválida: usando 7,0";
    return ok ? n : 7;
  }

  let filter = "all", cardFilter = "all", showAll = false, showAllPend = false, showAllNews = false, exportICS = () => {};
  // ?view=calendario shows only the calendar.
  const urlCal = () => new URLSearchParams(location.search).get("view") === "calendario";
  let CAL = urlCal();
  const applyView = () => { document.body.classList.toggle("cal", CAL); document.title = CAL ? "Calendário · Campus+" : "Minhas matérias · Campus+";
    for (const b of document.querySelectorAll("#viewsw button")) b.setAttribute("aria-pressed", (b.dataset.v === "cal") === CAL); };
  applyView();
  // The switch changes the view in place and keeps the address in step (?view=calendario).
  const swap = e => { if (!e) return; e.classList.remove("swap"); void e.offsetWidth; e.classList.add("swap"); };   // replay the short fade-in
  function setView(cal, push) {
    if (cal === CAL) return; CAL = cal; applyView(); calc(); swap($(CAL ? "calendario" : "materias")); scrollTo({ top:0, behavior:"auto" });
    if (push) history.pushState(null, "", cal ? "?view=calendario" : location.pathname);
  }
  const syncAll = () => { const b = $("allbtn"); if (b) b.textContent = [...document.querySelectorAll(".card")].every(x => x.classList.contains("open")) ? "Fechar todas" : "Abrir todas"; };
  function build() {
    const main = $("cards");
    for (const c of C.COURSES) {
      const card = el("article", "card"); card.id = "card-" + c.id;
      const head = el("div", "chead"); head.tabIndex = 0; head.setAttribute("role", "button");
      const pill = badge("done", "…"); pill.id = "pill-" + c.id;
      const ttl = el("div"), sub = el("span", "csub"); sub.id = "sub-" + c.id; ttl.append(el("span", "cname", c.name), sub); head.setAttribute("aria-controls", "detail-" + c.id);
      const figs = el("div", "figs"); figs.id = "figs-" + c.id;
      const bar = el("div", "bar"); bar.append(el("span", "g"), el("span", "f"), el("span", "m")); bar.id = "bar-" + c.id;
      const chev = el("span", "chev"); chev.innerHTML = CHEV;   // static markup, no data
      head.append(chev, ttl, figs, bar, pill);
      const setOpen = on => { card.classList.toggle("open", on); head.setAttribute("aria-expanded", on); saved.open[c.id] = on; store(); syncAll(); };
      card.setOpen = setOpen;
      head.addEventListener("click", () => setOpen(!card.classList.contains("open")));
      head.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(!card.classList.contains("open")); } });
      card.classList.toggle("open", !!saved.open[c.id]); head.setAttribute("aria-expanded", !!saved.open[c.id]);

      const msg = el("div", "msg"); msg.id = "msg-" + c.id;
      const detail = el("div", "detail"); detail.id = "detail-" + c.id;
      detail.append(msg, el("div", "formula", c.formula), el("div", "formula fonte", "Pesos: " + c.src));
      const items = el("div", "items"), hr = el("div", "row head");
      ["Avaliação", "Data", "Nota", "Precisa", "Mín"].forEach(x => hr.appendChild(el("div", null, x)));
      items.appendChild(hr);
      for (const it of c.items) {
        const k = C.key(c, it), row = el("div", "row"); row.id = "row-" + k;
        const name = cell(null, "wide");
        name.append(el("span", "title", it.name + (it.exam ? " · prova" : "")),
          el("span", "sub", "vale " + fmt(it.max, 3).replace(/0+$/, "").replace(/,$/, "") + " da final"), el("span", "src fonte", it.wSrc));
        const g = cell("Nota"), inp = el("input");
        inp.inputMode = "decimal"; inp.placeholder = "—"; inp.value = saved.grades[k] == null ? "" : String(saved.grades[k]); inp.id = "in-" + k;
        inp.setAttribute("aria-label", "Nota de " + it.name + ", " + c.name);
        inp.addEventListener("input", () => { saved.grades[k] = inp.value; saved.fresh = saved.fresh.filter(x => x !== k); store(); calc(); });
        g.append(inp, el("span", "scale", "/ " + fmt(it.inMax, dec(it.inMax))));
        const rq = cell("Precisa"); rq.id = "rq-" + k;
        const mn = cell("Mín", "muted num"); mn.id = "mn-" + k;
        row.append(name, whenCell(it, k), g, rq, mn); items.appendChild(row);
      }
      detail.appendChild(items);
      card.append(head, detail); main.appendChild(card);
    }

    const foot = $("foot");
    foot.append(el("p", null, "Feito por um aluno para a turma. Não é um sistema oficial da PUCPR: confira pesos e datas no Canvas e no Plano de Ensino."),
      el("p", null, "Suas notas ficam salvas só neste navegador (localStorage). Nada é enviado para servidor nenhum."),
      el("p", null, "Recuperação (só informação, não simulada): os Planos permitem recuperar um único RA com média abaixo de 7,0. Conectividade: recuperação estendida para final entre 4,0 e 7,0, com teto 7,0."));

    metaEl.addEventListener("input", () => { saved.meta = metaEl.value; store(); calc(); });
    let metaT;
    const metaRun = () => { clearTimeout(metaT); metaT = setTimeout(() => { const T = target(), st = C.COURSES.map(c => C.courseState(c, saved.grades, today, T));
      con.run({ ask:"Mudar a meta para " + fmt(T, 1), title:"Recalculando", doneTitle:"Recalculado", steps:[["6 matérias", st.filter(x => x.status === "garantido").length + " garantidas, " + st.filter(x => x.status === "precisa").length + " precisam de nota"]],
        text:"Com a meta " + fmt(T, 1) + ":", lines:nextLines(saved.grades, 2) }); }, 450); };
    metaEl.addEventListener("input", metaRun);
    const stepMeta = d => { const n = Math.min(10, Math.max(0, Math.round((target() + d) * 2) / 2));
      metaEl.value = fmt(n, 1); saved.meta = metaEl.value; store(); calc(); metaRun(); };
    $("metadown").addEventListener("click", () => stepMeta(-0.5)); $("metaup").addEventListener("click", () => stepMeta(0.5));
    metaEl.addEventListener("keydown", e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); stepMeta(e.key === "ArrowUp" ? 0.5 : -0.5); } });
    // Feedback: opens a prefilled issue form on GitHub (the site has no server; the student sends it from their own account).
    const fb = $("fb");
    $("fbbtn").addEventListener("click", () => { fb.showModal(); $("fbtext").focus(); });
    fb.addEventListener("click", e => { if (e.target === fb) fb.close(); });   // click on the backdrop closes
    $("fbsend").addEventListener("click", () => {
      const t = $("fbtext").value.trim(); if (!t) { $("fbtext").focus(); return; }
      const q = new URLSearchParams({ template:"feedback.yml", title:"Feedback: " + t.split(/\s+/).slice(0, 8).join(" ").slice(0, 70), mensagem:t.slice(0, 1200), origem:"site, " + today });
      window.open("https://github.com/Bossmann007/quanto-falta-pucpr/issues/new?" + q, "_blank", "noopener,noreferrer");
      fb.close(); $("fbtext").value = "";
    });
    exportICS = () => {
      const esc = t => String(t).replace(/[\\;,]/g, m => "\\" + m).replace(/\r?\n/g, " ");
      const day = iso => iso.replace(/-/g, ""), next = iso => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + 1); return day(C.localISO(d)); };
      const ev = [], stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      const add = (id, date, title, desc) => ev.push("BEGIN:VEVENT", "UID:" + id + "@quanto-falta", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + day(date), "DTEND;VALUE=DATE:" + next(date),
        "SUMMARY:" + esc(title), "DESCRIPTION:" + esc(desc), "END:VEVENT");
      for (const u of C.upcoming(C.COURSES, saved.grades, today, target())) add(C.key(u.course, u.item), u.item.date, (u.item.exam ? "Prova: " : "") + u.item.name + " · " + SHORT[u.course.id], "Campus+: " + reqText(u.req, u.item, u.st) + ". Data do Plano de Ensino.");
      if (saved.todo) saved.todo.list.filter(t => t && typeof t.name === "string" && typeof t.due === "string" && ISO.test(t.due) && days(t.due) >= 0)
        .forEach(t => add("todo-" + [...(t.courseName + "|" + t.name)].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7).toString(36) + "-" + day(t.due), t.due, "Entregar: " + t.name, "Prazo no Canvas." + (t.courseName ? " " + t.courseName : "")));
      const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campus+//PUCPR 2026-2//PT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Campus+"].concat(ev, "END:VCALENDAR").join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type:"text/calendar" })); a.download = "quanto-falta-" + C.SEMESTER + ".ics";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const nTodo = ev.filter(x => x.startsWith("UID:todo-")).length, nAll = ev.filter(x => x.startsWith("UID:")).length;
      if (CAL) { $("calmsg").textContent = "Arquivo .ics baixado: " + pl(nAll - nTodo, "avaliação", "avaliações") + " e " + pl(nTodo, "entrega", "entregas") + ". Abra no Google Agenda, Apple ou Outlook."; return; }
      con.run({ ask:"Exportar para o calendário", title:"Montando o calendário", doneTitle:"Calendário pronto", steps:[["Avaliações", pl(nAll - nTodo, "evento", "eventos")], ["Prazos do Canvas", pl(nTodo, "entrega", "entregas")], ["Arquivo .ics", "baixado"]],
        text:"Abra o arquivo no Google Agenda, no Calendário da Apple ou no Outlook.", scroll:true });
    };
    $("calics").addEventListener("click", () => exportICS());
    const shiftMonth = k => { const [y, m] = (calMonth || today.slice(0, 7)).split("-").map(Number), d = new Date(y, m - 1 + k, 1); calMonth = C.localISO(d).slice(0, 7); calDay = null; calc(); };
    $("calprev").addEventListener("click", () => shiftMonth(-1)); $("calnext").addEventListener("click", () => shiftMonth(1));
    $("caltoday").addEventListener("click", () => { calMonth = today.slice(0, 7); calDay = null; calc(); });
    for (const b of document.querySelectorAll("#viewsw button")) b.addEventListener("click", () => setView(b.dataset.v === "cal", true));
    addEventListener("popstate", () => setView(urlCal(), false));
    for (const a of $("nav").querySelectorAll('a[href^="#"]')) a.addEventListener("click", () => setView(false, true));   // section links always mean the subjects view
    const links = [...$("nav").querySelectorAll('a[href^="#"]')];
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting)
        links.forEach(a => a.setAttribute("aria-current", a.getAttribute("href") === "#" + e.target.id)); }, { rootMargin:"-45% 0px -50% 0px" });
      links.forEach(a => { const t = document.getElementById(a.getAttribute("href").slice(1)); if (t) io.observe(t); });
    }
    for (const b of $("filter").children) b.addEventListener("click", () => {
      filter = b.dataset.f; for (const x of $("filter").children) x.setAttribute("aria-pressed", x === b); calc(); swap($("next")); });
    $("startbtn").addEventListener("click", () => { const first = document.querySelector(".card"); if (first && !document.querySelector(".card.open")) first.setOpen(true); });
    const sb = el("button", "linkbtn", "Mostrar de onde vêm os pesos e as datas"); sb.type = "button"; sb.setAttribute("aria-pressed", "false");
    sb.addEventListener("click", () => { const on = document.body.classList.toggle("src-on"); sb.setAttribute("aria-pressed", on);
      sb.textContent = on ? "Esconder as fontes" : "Mostrar de onde vêm os pesos e as datas"; });
    foot.appendChild(sb);
    const fbl = el("button", "linkbtn", "Mandar um feedback"); fbl.type = "button"; fbl.style.marginLeft = "16px";
    fbl.addEventListener("click", () => { $("fb").showModal(); $("fbtext").focus(); }); foot.appendChild(fbl);
    const all = $("allbtn"); syncAll();
    all.addEventListener("click", () => { const cards = [...document.querySelectorAll(".card")], on = cards.some(x => !x.classList.contains("open"));
      cards.forEach(x => x.setOpen(on)); });
    const openHash = () => { const t = document.getElementById(location.hash.slice(1)); if (t && t.setOpen) t.setOpen(true); if (t && t.tagName === "DETAILS") t.open = true; };
    window.addEventListener("hashchange", openHash); openHash();
    document.addEventListener("click", e => { const a = e.target.closest('a[href^="#card-"]'); if (!a) return;
      const card = document.getElementById(a.getAttribute("href").slice(1)); if (card) card.setOpen(true); });   // same hash twice fires no hashchange
  }

  function calc() {
    today = C.localISO(new Date());
    const T = target();
    const groups = { garantido:[], precisa:[], "depende-atrasadas":[], "nao-da":[] };
    const states = {};
    for (const c of C.COURSES) {
      const st = states[c.id] = C.courseState(c, saved.grades, today, T);
      groups[st.status].push(SHORT[c.id]);

      const figs = $("figs-" + c.id); figs.textContent = "";
      [["Garantido", exact(st.earned)], ["Faltam", st.need <= 1e-9 ? "0" : up(st.need, 2)], ["Teto", exact(st.ceiling)]].forEach(([k, v]) => {
        const d = el("div"); d.append(el("span", "k", k), el("span", "v num", v)); figs.appendChild(d); });
      const nGraded = c.items.filter(it => { const p = C.itemPoints(it, saved.grades[C.key(c, it)]); return p !== null && !Number.isNaN(p); }).length;
      const nx = st.future.slice().sort((a, b) => a.date < b.date ? -1 : 1)[0];
      const nFresh = c.items.filter(it => saved.fresh.includes(C.key(c, it))).length;
      const [g, f, m] = $("bar-" + c.id).children;
      g.style.width = Math.min(100, st.earned * 10) + "%";
      g.style.background = "var(--" + (st.status === "garantido" ? "ok" : st.status === "nao-da" ? "bad" : st.status === "depende-atrasadas" ? "warn" : tone(st.fraction)) + ")";
      f.style.left = Math.min(100, st.earned * 10) + "%"; f.style.width = st.futureMax * 10 + "%";
      m.style.left = Math.min(99.5, T * 10) + "%";

      let above = 0, compared = 0;
      for (const it of c.items) {
        const k = C.key(c, it), inp = $("in-" + k), rq = $("rq-" + k), mn = $("mn-" + k);
        const p = C.itemPoints(it, saved.grades[k]);
        inp.classList.toggle("bad", Number.isNaN(p)); inp.title = Number.isNaN(p) ? "Fora de 0 a " + fmt(it.inMax, 2) + " ou não é número: ignorada" : "";
        rq.textContent = ""; mn.textContent = "";
        const graded = p !== null && !Number.isNaN(p); $("row-" + k).classList.toggle("graded", graded);
        $("cd-" + k).textContent = canvasDate(k, it);
        if (graded) { rq.appendChild(el("span", "check", "✓ lançada")); if (saved.fresh.includes(k)) rq.appendChild(badge("acc", "nova"));
          const cs = classStat(k, it); if (cs) { const raw = C.parseNum(saved.grades[k]); rq.appendChild(classBar(cs, raw, it)); if (raw >= cs.mean) above++; compared++; }
          continue; }
        if (st.late.includes(it)) { rq.appendChild(badge("warn", "falta a nota")); continue; }
        rq.appendChild(needBadge(st, it));
        mn.textContent = st.status === "garantido" || st.status === "depende-atrasadas" ? "—" : minText(C.minimumFor(st, it, T), it);
      }

      const vsTurma = compared ? " · na média da turma ou acima em " + above + " de " + compared : "";
      $("sub-" + c.id).textContent = nGraded + " de " + c.items.length + " lançadas" + (nFresh ? " · " + nFresh + (nFresh === 1 ? " nova" : " novas") : "") + vsTurma + (nx ? " · próxima: " + nx.name + ", " + (days(nx.date) === 0 ? "hoje" : days(nx.date) === 1 ? "amanhã" : "em " + days(nx.date) + " dias") : "");
      let cls, text;
      if (st.status === "garantido") { cls = "ok"; text = "Passou: " + fmt(st.earned, 2) + " já garantidos, mesmo com zero no resto."; }
      else if (st.status === "nao-da") { cls = "bad"; text = "Mesmo com nota cheia em tudo chega a " + fmt(st.ceilingIfLate, 2) + ". Caminho: recuperação de um RA."; }
      else if (st.status === "depende-atrasadas") { cls = "warn"; text = "Só com o que falta não chega (teto " + fmt(st.ceiling, 2) + "). Lance as notas que já saíram."; }
      else { cls = tone(st.fraction);
             text = "Faltam " + up(st.need, 2) + " pontos: " + up(st.fraction * 10, 1) + " em 10 em cada item que falta."; }
      if (st.late.length && st.status !== "garantido") text = (st.late.length === 1 ? "1 nota antiga sem lançar conta 0" : st.late.length + " notas antigas sem lançar contam 0") +
        (st.fractionIfLate != null ? (st.fractionIfLate > 1 + 1e-9 ? " (não dá nem com nota cheia)" : " (se forem iguais ao resto: " + up(st.fractionIfLate * 10, 1) + " em 10)") : "") + ". " + text;
      if (st.invalid.length) text = (st.invalid.length === 1 ? "1 nota inválida ignorada: " : st.invalid.length + " notas inválidas ignoradas: ") + st.invalid.map(i => i.name).join(", ") + ". " + text;
      const box = $("msg-" + c.id); box.className = "msg " + cls; box.textContent = text;
      const label = { garantido:"garantido", "nao-da":"recuperação", "depende-atrasadas":"faltam notas" }[st.status] || "precisa " + up(st.fraction * 10, 1) + "/10";
      const pill = $("pill-" + c.id); pill.className = "badge " + cls; pill.textContent = label;
    }

    const sum = $("summary"); sum.textContent = "";
    if (!groups[cardFilter] || !groups[cardFilter].length) cardFilter = "all";
    [["all", "Todas", C.COURSES.length], ["precisa", "Precisa de nota"], ["depende-atrasadas", "Faltam notas"], ["nao-da", "Recuperação"], ["garantido", "Garantido"]].forEach(([k, l, n]) => {
      const count = n != null ? n : groups[k].length; if (!count) return;
      const b = el("button", null, l); b.type = "button"; b.setAttribute("aria-pressed", k === cardFilter);
      b.appendChild(el("span", "c", String(count))); b.addEventListener("click", () => { cardFilter = k; calc(); swap($("cards")); }); sum.appendChild(b); });
    for (const c of C.COURSES) { const cd = $("card-" + c.id); cd.hidden = cardFilter !== "all" && states[c.id].status !== cardFilter && !cd.contains(document.activeElement); }

    const next = $("next"); next.textContent = "";
    const hr = el("div", "row head"); ["Data", "Avaliação", "Precisa", "Mín"].forEach(x => hr.appendChild(el("div", null, x))); next.appendChild(hr);
    const list = C.upcoming(C.COURSES, saved.grades, today, T)
      .filter(u => filter === "all" || (filter === "exam" ? u.item.exam : days(u.item.date) <= 7));
    if (!list.length) next.appendChild(el("div", "empty", filter === "all" ? "Nada pendente." : "Nada neste filtro."));
    for (const u of showAll ? list : list.slice(0, 6)) {
      const row = el("div", "row"), name = cell(null, "wide"), a = el("a", null, u.course.name), sub = el("span", "sub");
      a.href = "#card-" + u.course.id; sub.appendChild(a);
      name.append(el("span", "title", u.item.name + (u.item.exam ? " · prova" : "")), sub);
      const rq = cell("Precisa"); rq.appendChild(needBadge(u.st, u.item));
      if (u.st.provisional && u.st.status === "precisa") { const fl = el("span", "flag", "*"); fl.title = "Provisório: notas antigas sem lançar contam 0"; rq.appendChild(fl); }
      row.append(whenCell(u.item, C.key(u.course, u.item)), name, rq,
        cell("Mín", "muted num", u.st.status === "garantido" || u.st.status === "depende-atrasadas" ? "—" : minText(u.min, u.item)));
      next.appendChild(row);
    }

    if (!showAll && list.length > 6) { const b = el("button", "more", "Ver todas (" + list.length + ")"); b.type = "button";
      b.addEventListener("click", () => { showAll = true; calc(); }); next.appendChild(b); }
    renderFocus(T); renderKpis(states, T); renderTiles(states, T); renderTodo(); renderNews(); renderCal(T);
    const late = $("late"); late.textContent = "";
    const lh = el("div", "row head late-row"); ["Matéria", "Avaliações", "Vale"].forEach(x => lh.appendChild(el("div", null, x))); late.appendChild(lh);
    let any = false;
    for (const c of C.COURSES) {
      const st = states[c.id];
      if (!st.late.length) continue;
      any = true;
      const row = el("div", "row late-row"), mt = cell(null, "wide"), a = el("a", "title", c.name); a.href = "#card-" + c.id; mt.appendChild(a);
      const items = cell(null, "late wide");
      for (const it of st.late) items.appendChild(badge("done", dmy(it.date) + " · " + it.name));
      row.append(mt, items, cell("Vale", "muted num", fmt(st.lateMax, 2) + " pts"));
      late.appendChild(row);
    }
    if (!any) late.appendChild(el("div", "empty", "Nenhuma. Tudo lançado."));
    renderPending();
  }


  // ---- live console: the window runs each tool with the student's real data; example data only before the first grade ----
  const RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = ms => new Promise(r => setTimeout(r, RM ? 0 : ms));
  const CHECK = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="m5.3 8.2 1.8 1.8 3.6-3.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const COLORS = { imp:"#E9A77F", abd:"#8FB4D9", rpnd:"#B9A6DA", web:"#E8C766", etica:"#E6A0B0", cscf:"#8CCBB4" };
  function stepRow(title, sub) {
    const r = el("div", "stp enter"), ic = el("span", "ico-s"), tx = el("div"), t = el("span", "t");
    ic.appendChild(el("span", "spin")); tx.append(el("span", null, title), el("span", "sub", sub)); r.append(ic, tx, t);
    r.done = (secs, sub2) => { ic.className = "ico-s ok-ic"; ic.innerHTML = CHECK; t.textContent = secs; if (sub2 != null) tx.lastChild.textContent = sub2; };   // static icon markup
    return r;
  }
  function stepsCard(title) {
    const c = el("div", "steps-card enter"), h = el("div", "steps-head"), cnt = el("span", "cnt"), ttl = el("span", null, title);
    h.append(ttl, cnt); c.appendChild(h);
    c.set = (n, total, running) => { cnt.textContent = ""; if (running) cnt.appendChild(el("span", "spin")); cnt.append(n + " de " + total); };
    c.setTitle = t => { ttl.textContent = t; };
    return c;
  }
  const con = (() => {
    const w = el("div", "win"), bar = el("div", "win-bar"), dots = el("span", "dots"), tab = el("span", "tab"), tag = el("span", "demo-tag");
    dots.append(el("i"), el("i"), el("i")); tab.innerHTML = '<svg class="logo" viewBox="0 0 32 32" width="14" height="14" aria-hidden="true"><rect class="lt" x="1" y="1" width="30" height="30" rx="7"/><path class="lc" d="M18.71 19.77Q18.7 20.58 18.26 21.39Q17.82 22.21 17 22.89Q16.17 23.58 14.99 23.99Q13.81 24.4 12.3 24.4Q9.84 24.4 8.04 23.34Q6.25 22.28 5.28 20.4Q4.3 18.52 4.3 16.09Q4.3 14.24 4.88 12.7Q5.45 11.16 6.5 10.01Q7.54 8.87 8.95 8.23Q10.35 7.6 12 7.6Q13.15 7.6 13.86 7.82Q14.58 8.05 14.99 8.27Q15.4 8.5 15.64 8.5Q15.93 8.5 16.08 8.3Q16.23 8.1 16.39 7.91Q16.55 7.71 16.83 7.71Q17.04 7.71 17.17 7.85Q17.31 7.98 17.4 8.28L18.6 12.22Q18.68 12.48 18.55 12.69Q18.42 12.9 18.16 12.95Q17.88 13.01 17.66 12.9Q17.45 12.79 17.32 12.52Q16.71 11.15 15.96 10.34Q15.21 9.54 14.34 9.19Q13.48 8.83 12.47 8.83Q11.46 8.83 10.61 9.29Q9.77 9.76 9.15 10.61Q8.53 11.47 8.2 12.67Q7.86 13.87 7.86 15.36Q7.86 17.65 8.57 19.25Q9.29 20.84 10.52 21.66Q11.75 22.48 13.34 22.48Q14.86 22.48 15.98 21.76Q17.11 21.03 17.73 19.71Q17.86 19.45 18.02 19.36Q18.18 19.28 18.37 19.31Q18.54 19.33 18.63 19.45Q18.71 19.57 18.71 19.77Z"/><path class="lp" d="M24.5 9v6.6M21.2 12.3h6.6" transform="rotate(-6 24.5 12.3)"/></svg>';
    tab.append(" Campus+"); bar.append(dots, tab, el("span", "sp"), tag);
    const body = el("div", "win-body"), side = el("div", "win-side"), main = el("div", "win-main fade");
    main.setAttribute("aria-live", "polite");
    side.appendChild(el("h4", null, "Matérias · 2026/2"));
    const smalls = {};
    for (const c of C.COURSES) { const r = el("a", "srow"), av = el("span", "av", SHORT[c.id].slice(0, 2).toUpperCase()), t = el("div"), sm = el("small", null, "—");
      r.href = "#card-" + c.id; av.style.background = COLORS[c.id]; t.append(el("b", null, SHORT[c.id]), sm); r.append(av, t); side.appendChild(r); smalls[c.id] = sm; }
    body.append(side, main); w.append(bar, body);
    let run = 0, busy = false, used = false;
    const api = { el:w, get busy() { return busy; }, get used() { return used; } };
    api.side = (texts, on) => { for (const id in smalls) { smalls[id].textContent = texts[id] || "—"; smalls[id].className = on ? "on" : ""; } };
    const bubble = (cls, text, lines) => { const b = el("div", "bub " + cls + " enter"); b.append(text);
      if (lines && lines.length) { const ul = el("ul"); lines.forEach(x => ul.appendChild(el("li", null, x))); b.appendChild(ul); } main.appendChild(b); return b; };
    // One tool run: the student's request, the steps with real counts, the result and an optional action.
    api.run = async ({ ask, title, doneTitle, steps, text, lines, action, scroll }) => {
      const me = ++run, alive = () => me === run; busy = true; used = true; document.body.classList.add("ran"); tag.textContent = "ao vivo";
      main.textContent = ""; if (scroll) w.scrollIntoView({ behavior:RM ? "auto" : "smooth", block:"center" });
      bubble("me", ask); await wait(300); if (!alive()) return;
      const card = stepsCard(title); card.set(0, steps.length, true); main.appendChild(card);
      const t0 = performance.now();
      for (let i = 0; i < steps.length; i++) {
        const r = stepRow(steps[i][0], ""); card.appendChild(r); await wait(240); if (!alive()) return;
        r.done(fmt((performance.now() - t0) / 1000, 1) + "s", steps[i][1]); card.set(i + 1, steps.length, i + 1 < steps.length);
      }
      card.setTitle(doneTitle || title); await wait(200); if (!alive()) return;
      if (text) bubble("bot", text, lines);
      if (action) { const ap = el("div", "apply-demo enter"), btn = el("button", "btn primary sm", action.label); btn.type = "button";
        btn.addEventListener("click", () => { if (!action.live || action.live()) action.onClick(); ap.remove(); }); ap.appendChild(btn); if (!action.live || action.live()) main.appendChild(ap); }
      busy = false;
    };
    // Resting state for a student with grades: the next thing that counts, from the real numbers.
    api.idle = (text, lines) => { if (busy) return; run++; tag.textContent = "suas notas"; main.textContent = ""; bubble("bot", text, lines); };
    api.stop = () => { if (!busy) run++; };
    return api;
  })();
  $("demo-hero").appendChild(con.el);
  // What matters next, as short lines, for any set of grades (used before and after applying an import).
  function nextLines(grades, n) {
    return C.upcoming(C.COURSES, grades, today, target()).filter(u => u.st.status !== "garantido").slice(0, n)
      .map(u => SHORT[u.course.id] + ": " + reqText(u.req, u.item, u.st) + " em " + u.item.name + " (" + dmy(u.item.date) + ")");
  }
  const pl = (n, one, many) => n + " " + (n === 1 ? one : many);
  function importRun(res, ask, applyBtn) {
    const steps = [["Notas", pl(Object.keys(res.grades).length, "nota encontrada", "notas encontradas")]];
    if (res.stats) steps.push(["Média da turma", pl(Object.keys(res.stats).length, "avaliação com média da turma", "avaliações com média da turma")]);
    if (res.todo) steps.push(["Prazos", pl(res.todo.filter(t => t.due >= today && days(t.due) <= 14).length, "entrega", "entregas") + " nos próximos 14 dias"]);
    if (res.pending) steps.push(["Atrasadas", res.pending.length + " sem entrega no Canvas"]);
    if (res.news) steps.push(["Avisos", pl(res.news.length, "aviso", "avisos") + ", " + pl(res.news.filter(n => n.unread).length, "não lido", "não lidos")]);
    const merged = Object.assign({}, saved.grades, res.grades), n = Object.keys(res.grades).length;
    con.run({ ask, title:"Lendo", doneTitle:"Pronto: confira antes de aplicar", steps, scroll:true,
      text:(n ? "Com essas notas, o que importa agora:" : "Nenhuma nota nova para aplicar."), lines:n ? nextLines(merged, 3) : [],
      action:n && applyBtn ? { label:"Aplicar " + n + " notas", onClick:() => applyBtn.click(), live:() => applyBtn.isConnected } : null });
  }
  // Calendar page: month grid and the next 21 days, from the Plano dates, the grades and the last Canvas import.
  let calMonth = null, calDay = null;
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function calEvents(T) {
    const ev = [], up = new Map(C.upcoming(C.COURSES, saved.grades, today, T).map(u => [C.key(u.course, u.item), u]));
    for (const c of C.COURSES) for (const it of c.items) {
      const k = C.key(c, it), p = C.itemPoints(it, saved.grades[k]), graded = p !== null && !Number.isNaN(p), u = up.get(k);
      ev.push({ date:it.date, course:c.id, kind:graded ? "done" : "", label:(it.exam ? "Prova · " : "") + it.name,
        info:graded ? "nota lançada" : u ? "precisa " + reqText(u.req, u.item, u.st) : "falta a nota" });
    }
    if (saved.todo) for (const t of saved.todo.list) if (t && typeof t.name === "string" && typeof t.due === "string" && ISO.test(t.due))
      ev.push({ date:t.due, course:C.COURSES.some(c => c.id === t.course) ? t.course : null, kind:"todo", label:"Entregar: " + t.name, info:"prazo no Canvas" });
    return ev;
  }
  function chip(e) {
    const c = el("span", "chip " + e.kind); if (e.course) c.style.setProperty("--c", COLORS[e.course]);
    c.append(el("b", null, e.course ? SHORT[e.course] + " " : ""), e.label); c.title = (e.course ? SHORT[e.course] + ": " : "") + e.label + " · " + e.info; return c;
  }
  function renderCal(T) {
    if (!CAL) return;
    if (!calMonth) calMonth = today.slice(0, 7);
    const [y, m] = calMonth.split("-").map(Number), first = new Date(y, m - 1, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    $("calttl").textContent = MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1) + " de " + y;
    const ev = calEvents(T), byDay = {}; for (const e of ev) (byDay[e.date] = byDay[e.date] || []).push(e);
    const g = $("calgrid"); g.textContent = "";
    ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].forEach(d => g.appendChild(el("div", "dow", d)));
    const cells = Math.ceil(((first.getDay() + 6) % 7 + new Date(y, m, 0).getDate()) / 7) * 7;   // whole weeks only
    for (let i = 0; i < cells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const iso = C.localISO(d);
      const cell = el("div", "cday" + (d.getMonth() !== m - 1 ? " out" : "") + (iso === today ? " today" : ""));
      cell.appendChild(el("span", "n", String(d.getDate())));
      for (const e of (byDay[iso] || [])) cell.appendChild(chip(e));
      if (byDay[iso]) { cell.classList.add("has"); cell.classList.toggle("sel", iso === calDay); cell.tabIndex = 0; cell.setAttribute("role", "button"); cell.dataset.iso = iso; cell.setAttribute("aria-pressed", iso === calDay);
        cell.setAttribute("aria-label", dmy(iso) + ": " + byDay[iso].length + (byDay[iso].length === 1 ? " evento" : " eventos"));
        const pick = () => { calDay = iso === calDay ? null : iso; renderCal(T); const again = $("calgrid").querySelector('[data-iso="' + iso + '"]'); if (again) again.focus({ preventScroll:true }); if (calDay) $("calaghead").scrollIntoView({ behavior:"smooth", block:"start" }); };
        cell.addEventListener("click", pick); cell.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }); }
      g.appendChild(cell);
    }
    const ag = $("calagenda"); ag.textContent = "";
    if (calDay && !byDay[calDay]) calDay = null;
    $("calagh").textContent = calDay ? "Dia " + dmy(calDay) : "Próximos 21 dias";
    const soon = calDay ? [calDay] : Object.keys(byDay).filter(d => days(d) >= 0 && days(d) <= 21).sort();
    for (const d of soon) {
      const row = el("div", "agday"), dd = el("div", "d"), dt = new Date(d + "T12:00:00"), n = days(d);
      dd.append(el("b", null, dmy(d)), ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][dt.getDay()] + " · " + (n === 0 ? "hoje" : n === 1 ? "amanhã" : n > 0 ? "em " + n + " dias" : "há " + -n + " dias"));
      const evs = el("div", "evs"); byDay[d].forEach(e => { const c = chip(e); c.textContent = ""; c.append(el("b", null, (e.course ? SHORT[e.course] + " · " : "")), e.label + " — " + e.info); evs.appendChild(c); });
      row.append(dd, evs); ag.appendChild(row);
    }
    if (!soon.length) ag.appendChild(el("div", "empty", "Nada nos próximos 21 dias."));
    if (calDay) { const all = el("button", "linkbtn", "Ver os próximos 21 dias"); all.type = "button"; all.style.margin = "10px 16px";
      all.addEventListener("click", () => { calDay = null; renderCal(T); }); ag.appendChild(all); }
  }

  // Hero for returning students: the next assessment that still matters and what it needs, then the two after it.
  function renderFocus(T) {
    const box = $("focus"), hero = box.parentElement, sb = $("startbtn");
    const any = Object.keys(saved.grades).some(k => String(saved.grades[k]).trim() !== "");
    const all = C.upcoming(C.COURSES, saved.grades, today, T), list = all.filter(u => u.st.status !== "garantido");
    hero.classList.toggle("mine", any && list.length > 0); box.hidden = !(any && list.length > 0);
    document.body.classList.toggle("fresh", !any);
    if (!any) { con.side({}, false); if (!con.busy) con.idle("Ainda sem notas. Importe do Canvas ou lance uma nota: cada passo aparece aqui.", []); }
    if (any) { const side = {};
      for (const c of C.COURSES) side[c.id] = $("pill-" + c.id).textContent;
      con.side(side, true);
      if (!con.busy) { const nl = nextLines(saved.grades, 3); con.idle(nl.length ? "O que importa agora:" : "Tudo garantido por enquanto.", nl); } }
    const open = C.COURSES.filter(c => C.courseState(c, saved.grades, today, T).status !== "garantido").length;
    $("h1a").textContent = !any ? "Campus+" : open ? "Faltam " + open + (open === 1 ? " matéria" : " matérias") : "Semestre garantido";
    $("h1b").textContent = !any ? "quanto falta?" : open ? "pra fechar o semestre." : "bom descanso.";
    const how = $("exthow"); if (!how.dataset.set) { how.open = !any; how.dataset.set = "1"; }
    sb.textContent = any ? "Ver minhas matérias" : "Lançar minhas notas";
    box.textContent = ""; if (box.hidden) return;
    const u = list[0], d = days(u.item.date), when = d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias";
    const left = el("div"), need = el("div", "need");
    left.append(el("div", "t", u.item.name), el("div", "s", (SHORT[u.course.id] || u.course.name) + " · " + dmy(u.item.date) + ", " + when));
    const st = u.st, dep = st.status === "depende-atrasadas";
    const v = st.status === "nao-da" || u.req.impossible ? "não dá" : dep ? (st.fractionIfLate == null || st.fractionIfLate > 1 + 1e-9 ? "não dá" : "≈ " + up(st.fractionIfLate * 10, 1)) : up(u.req.of10, 1);
    const tn = v === "não dá" ? "bad" : dep ? "warn" : tone(u.req.f);
    const vv = el("div", "v num", v); vv.style.color = "var(--" + tn + ")";
    need.append(vv, el("div", "u", v === "não dá" ? "nem com nota cheia" : "precisa, em 10" + (dep ? " (faltam notas antigas)" : "")));
    box.append(el("div", "k", "Próxima avaliação que conta"), left, need);
    const rest = list.slice(1, 3);
    if (rest.length) { const t = el("div", "then", "Depois: ");
      rest.forEach((r, i) => { const a = el("a", null, r.item.name + " (" + (SHORT[r.course.id] || r.course.name) + ", " + dmy(r.item.date) + ")"); a.href = "#card-" + r.course.id; if (i) t.append(" · "); t.appendChild(a); });
      box.appendChild(t); }
  }

  // KPI row over the tiles, from the same states: the mean of the points earned, the tightest grade still needed, and every item
  // of the semester as a tracker block (graded, past without a grade, still to come).
  function renderKpis(states, T) {
    const box = $("kpis"); box.textContent = "";
    const card = (k, v, sub, cls) => { const d = el("div", "kpi"); d.append(el("div", "k", k), el("div", "v num" + (cls ? " " + cls : ""), v), el("div", "s", sub)); box.appendChild(d); return d; };
    const sts = C.COURSES.map(c => states[c.id]), mean = sts.reduce((s, st) => s + Math.min(10, st.earned), 0) / sts.length;
    const avg = card("Média atual", fmt(Math.floor(mean * 10) / 10, 1), "pontos garantidos de 10, nas " + sts.length + " matérias · meta " + fmt(T, 1));
    const meter = el("div", "meter"), fill = el("i"), goal = el("b"); meter.setAttribute("aria-hidden", "true");
    fill.style.width = Math.min(100, mean * 10) + "%"; goal.style.left = Math.min(99.5, T * 10) + "%"; meter.append(fill, goal); avg.insertBefore(meter, avg.lastChild);
    const tight = C.COURSES.filter(c => states[c.id].status === "precisa").sort((a, b) => states[b.id].fraction - states[a.id].fraction)[0];
    const count = s => C.COURSES.filter(c => states[c.id].status === s).length;
    if (tight) card("Quanto falta", up(states[tight.id].fraction * 10, 1), "em 10 em cada item que falta, em " + SHORT[tight.id] + " (a mais apertada)", "need");
    else if (count("depende-atrasadas")) card("Quanto falta", "?", "lance as notas que já saíram para calcular", "need");
    else if (count("nao-da")) card("Quanto falta", "—", count("nao-da") + (count("nao-da") === 1 ? " matéria vai" : " matérias vão") + " para a recuperação", "need");
    else card("Quanto falta", "0", "tudo garantido, pela meta " + fmt(T, 1), "need ok");
    const items = [];
    for (const c of C.COURSES) for (const it of c.items) {
      const p = C.itemPoints(it, saved.grades[C.key(c, it)]), graded = p !== null && !Number.isNaN(p);
      items.push({ c, it, s: graded ? "ok" : it.date < today ? "late" : "next" });
    }
    items.sort((a, b) => a.it.date.localeCompare(b.it.date));
    const done = items.filter(x => x.s === "ok").length, late = items.filter(x => x.s === "late").length;
    const kp = card("Entregues", done + " de " + items.length, late ? late + (late === 1 ? " passou da data sem nota" : " passaram da data sem nota") : "notas lançadas no semestre");
    const trk = el("div", "trk"); trk.setAttribute("role", "img"); trk.setAttribute("aria-label", done + " lançadas, " + late + " sem nota, " + (items.length - done - late) + " pela frente");
    for (const x of items) { const b = el("i", x.s); b.dataset.tip = SHORT[x.c.id] + " · " + x.it.name + " · " + dmy(x.it.date) + " · " + (x.s === "ok" ? "lançada" : x.s === "late" ? "sem nota" : "pela frente"); trk.appendChild(b); }
    kp.insertBefore(trk, kp.lastChild);
  }

  // One tile per course: ring = points earned of 10 (lighter: still possible), tick = the goal.
  function renderTiles(states, T) {
    const box = $("tiles"), R = 26, L = 2 * Math.PI * R; box.textContent = "";
    const NS = "http://www.w3.org/2000/svg";
    const arc = (cls, from, len) => { const c = document.createElementNS(NS, "circle");
      c.setAttribute("class", cls); c.setAttribute("cx", 32); c.setAttribute("cy", 32); c.setAttribute("r", R);
      c.setAttribute("stroke-dasharray", Math.max(0, len) + " " + L); c.setAttribute("stroke-dashoffset", -from); return c; };
    for (const c of C.COURSES) {
      const st = states[c.id], e = Math.min(10, st.earned) / 10 * L, f = Math.min(10 - Math.min(10, st.earned), st.futureMax) / 10 * L;
      const cls = st.status === "garantido" ? "ok" : st.status === "nao-da" ? "bad" : st.status === "depende-atrasadas" ? "warn" : tone(st.fraction);
      const t = el("a", "tile"); t.href = "#card-" + c.id;
      const ring = el("span", "ring"), svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("aria-hidden", "true");
      const er = arc("er", 0, e), fu = arc("fu", e, f); er.style.stroke = "var(--" + cls + ")"; fu.style.stroke = "color-mix(in srgb, var(--" + cls + ") 22%, transparent)";
      svg.append(arc("tr", 0, L), fu); if (e > 0.5) svg.appendChild(er); svg.appendChild(arc("mk", Math.min(T, 9.9) / 10 * L, 2));
      ring.append(svg, el("b", null, st.earned >= 10 ? "10" : fmt(Math.floor(st.earned * 10) / 10, 1)));
      const txt = el("span"), nx = st.future.slice().sort((a, b) => a.date < b.date ? -1 : 1)[0];
      txt.append(el("span", "nm", SHORT[c.id]), el("span", "nx", nx ? "próxima " + dmy(nx.date) : "nada pela frente"), badge(cls, $("pill-" + c.id).textContent));
      t.append(ring, txt); t.setAttribute("aria-label", c.name + ": " + fmt(st.earned, 2) + " garantidos de 10; " + $("pill-" + c.id).textContent); box.appendChild(t);
    }
  }

  // Announcements from the last 60 days (snapshot): unread first; titles link to Canvas only.
  function renderNews() {
    const nw = saved.news, box = $("avisolist"); $("avisos").hidden = !nw; box.textContent = ""; if (!nw) return;
    const list = nw.list.filter(a => a && typeof a.title === "string"), unread = list.filter(a => a.unread).length;
    $("avisosat").textContent = (unread ? unread + (unread === 1 ? " não lido" : " não lidos") + " · " : "") + "lido do Canvas em " + dmy(nw.at);
    for (const a of showAllNews ? list : list.slice(0, 5)) {
      const row = el("div", "row pend-row"), name = cell(null, "wide"), sub = el("span", "sub");
      const ours = C.COURSES.find(c => c.id === a.course); sub.textContent = ours ? SHORT[ours.id] : String(a.courseName || "");
      // The link is rebuilt from two numbers; no imported text reaches href.
      const m = typeof a.url === "string" ? /^https:\/\/pucpr\.instructure\.com\/courses\/(\d+)\/discussion_topics\/(\d+)$/.exec(a.url) : null;
      const t = m ? el("a", "title", a.title) : el("span", "title", a.title);
      if (m) { t.href = "https://pucpr.instructure.com/courses/" + Number(m[1]) + "/discussion_topics/" + Number(m[2]); t.target = "_blank"; t.rel = "noopener noreferrer"; }
      name.append(t, sub); if (a.unread) name.appendChild(badge("acc", "não lido"));
      row.append(cell("Data", "muted num", typeof a.at === "string" && ISO.test(a.at) ? dmy(a.at) : "—"), name); box.appendChild(row);
    }
    if (!showAllNews && list.length > 5) { const b = el("button", "more", "Ver todos (" + list.length + ")"); b.type = "button";
      b.addEventListener("click", () => { showAllNews = true; renderNews(); }); box.appendChild(b); }
    if (!list.length) box.appendChild(el("div", "empty", "Nenhum aviso nos últimos 60 dias."));
  }

  // Canvas assignments not handed in yet, due in the next 14 days (a snapshot from the last import).
  function renderTodo() {
    const td = saved.todo, box = $("todolist"); $("todo").hidden = !td; box.textContent = ""; if (!td) return;
    const list = td.list.filter(t => t && typeof t.name === "string" && typeof t.due === "string" && ISO.test(t.due) && days(t.due) >= 0 && days(t.due) <= 14);
    $("todoat").textContent = list.length + (list.length === 1 ? " entrega" : " entregas") + " nos próximos 14 dias · lido do Canvas em " + dmy(td.at);
    const h = el("div", "row head pend-row"); ["Prazo", "Entrega"].forEach(x => h.appendChild(el("div", null, x))); box.appendChild(h);
    for (const t of list) {
      const row = el("div", "row pend-row"), name = cell(null, "wide"), sub = el("span", "sub"), d = days(t.due);
      const ours = C.COURSES.find(c => c.id === t.course);
      if (ours) { const a = el("a", null, SHORT[ours.id]); a.href = "#card-" + ours.id; sub.appendChild(a); } else sub.textContent = String(t.courseName || "");
      name.append(el("span", "title", t.name), sub);
      const w = cell("Prazo", "when"); w.append(el("span", "d num", dmy(t.due)), el("span", "rel" + (d <= 3 ? " soon" : d <= 7 ? " week" : ""), d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias"));
      row.append(w, name); box.appendChild(row);
    }
    if (!list.length) box.appendChild(el("div", "empty", "Nada para entregar nos próximos 14 dias."));
  }

  // What Canvas marked as missing at the last import (a snapshot: it does not refresh by itself).
  function renderPending() {
    const box = $("pend"), pd = saved.pending; box.textContent = "";
    $("pendat").textContent = pd ? "lido do Canvas em " + dmy(pd.at) + "; importe de novo para atualizar" : "";
    $("pendentes").hidden = !pd; if (!pd) return;
    const h = el("div", "row head pend-row"); ["Prazo", "Entrega"].forEach(x => h.appendChild(el("div", null, x))); box.appendChild(h);
    const okList = pd.list.filter(p => p && typeof p.name === "string");
    for (const p of showAllPend ? okList : okList.slice(0, 6)) {
      if (!p || typeof p.name !== "string") continue;
      const row = el("div", "row pend-row"), name = cell(null, "wide"), sub = el("span", "sub");
      const ours = C.COURSES.find(c => c.id === p.course);   // link built from our own ids only, never from imported text
      if (ours) { const a = el("a", null, SHORT[ours.id]); a.href = "#card-" + ours.id; sub.appendChild(a); }
      else sub.textContent = String(p.courseName || "");
      name.append(el("span", "title", p.name), sub);
      row.append(cell("Prazo", "muted num", typeof p.due === "string" && /^\d{4}-\d\d-\d\d$/.test(p.due) ? dmy(p.due) : "sem data"), name);
      box.appendChild(row);
    }
    if (!showAllPend && okList.length > 6) { const b = el("button", "more", "Ver todas (" + okList.length + ")"); b.type = "button";
      b.addEventListener("click", () => { showAllPend = true; renderPending(); }); box.appendChild(b); }
    if (!pd.list.length) box.appendChild(el("div", "empty", "Nenhuma. O Canvas não marcou nada como atrasado."));
  }

  function buildImport() {
    const out = $("importout"), ta = $("paste");
    const itemOf = k => { const [cid, iid] = k.split(":"), c = C.COURSES.find(x => x.id === cid); return { c, it:c.items.find(i => i.id === iid) }; };
    const label = k => { if (!k) return "Arquivo"; if (!C.itemByKey(k)) return k; const { c, it } = itemOf(k); return (SHORT[c.id] || c.name) + ": " + it.name; };
    $("pastebtn").addEventListener("click", () => {
      if (!navigator.clipboard || !navigator.clipboard.readText) { out.textContent = "Seu navegador não deixa ler a área de transferência. Cole no campo com Ctrl+V ou Cmd+V."; return; }
      navigator.clipboard.readText().then(t => { ta.value = t; read(); }, () => { out.textContent = "Sem permissão para ler a área de transferência. Cole no campo com Ctrl+V ou Cmd+V."; });
    });
    $("readbtn").addEventListener("click", () => read(false));
    $("exportbtn").addEventListener("click", () => {
      const blob = new Blob([C.toBackup(saved.grades, saved.meta)], { type:"application/json" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "quanto-falta-notas-" + C.SEMESTER + ".json";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      out.textContent = ""; out.appendChild(el("div", "msg ok", "Arquivo salvo. Guarde-o para levar suas notas a outro navegador."));
      const ng = Object.values(saved.grades).filter(v => String(v).trim() !== "").length;
      con.run({ ask:"Exportar um backup das minhas notas", title:"Exportando", doneTitle:"Backup salvo", steps:[["Notas", pl(ng, "nota", "notas")], ["Meta", "meta " + saved.meta], ["Arquivo", "quanto-falta-notas-" + C.SEMESTER + ".json"]],
        text:"Guarde o arquivo: em outro navegador, use Importar arquivo.", scroll:true });
    });
    $("importfilebtn").addEventListener("click", () => $("importfile").click());
    $("importfile").addEventListener("change", e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
      out.textContent = "";
      if (f.size > 1e6) { out.appendChild(el("div", "msg bad", "Arquivo grande demais para ser um backup do Campus+.")); return; }
      f.text().then(t => {
        let res;
        try { res = C.fromBackup(t); } catch (err) { out.appendChild(el("div", "msg bad", "Não reconheci esse arquivo (" + err.message + ").")); return; }
        preview(res, "Ignorado do arquivo", () => {});
        importRun(res, "Importar o backup " + f.name, [...out.querySelectorAll("button")].find(b => /^Aplicar/.test(b.textContent)));
      });
    });
    // Inside the extension (the Campus+ page in Canvas): the last Canvas reading is applied as the page opens.
    if (window.CP_EXT && window.CP_EXT.data) { ta.value = JSON.stringify(window.CP_EXT.data); read(true); }
    function read(auto) {
      out.textContent = "";
      let res;
      try { res = C.fromCanvas(ta.value.trim()); } catch (e) { out.appendChild(el("div", "msg bad", "Não reconheci esse texto (" + e.message + "). Copie de novo pela extensão no Canvas.")); return; }
      // Inside the extension: only grades that changed in Canvas since the last reading are applied, so one corrected by hand stays.
      const canvasAll = res.grades;
      if (auto) { const last = saved.canvas || {}; res.grades = Object.fromEntries(Object.entries(canvasAll).filter(([k, v]) => last[k] !== v)); }
      preview(res, "Sem nota do Canvas", () => { ta.value = ""; });
      if (auto) {
        const b = [...out.querySelectorAll("button")].find(x => /^(Aplicar|Atualizar)/.test(x.textContent));
        if (b) b.click();
        saved.canvas = canvasAll; store();
        out.textContent = ""; ta.value = "";
        const at = window.CP_EXT.at ? new Date(window.CP_EXT.at) : null;
        out.appendChild(el("div", "muted", "Notas lidas do Canvas" + (at ? " às " + String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0") : "") + ". Abra o Canvas para atualizar."));
        return;
      }
      importRun(res, res.ext === "script" ? "Ler o texto do script com o meu token" : "Importar minhas notas do Canvas", [...out.querySelectorAll("button")].find(b => /^Aplicar/.test(b.textContent)));
    }
    function preview(res, extraTitle, afterApply) {
      const keys = Object.keys(res.grades), pend = res.pending;
      if (res.extOld) { const n = el("div", "msg warn");
        n.append("Sua extensão está desatualizada" + (res.ext ? " (v" + res.ext + ")" : "") + ". A v" + C.EXT_LATEST + " traz a média da turma, os avisos e a lista Para entregar. ");
        const a = el("a", null, "Como atualizar"); a.href = "#exthow-up"; n.appendChild(a); out.appendChild(n); }
      const savePending = () => { if (pend) { saved.pending = { at:today, list:pend }; renderPending(); }
        if (res.todo) saved.todo = { at:today, list:res.todo };
        if (res.dates) saved.cdates = res.dates;
        if (res.stats) saved.stats = res.stats;
        if (res.news) saved.news = { at:today, list:res.news }; };
      const pendNote = pend ? " " + (pend.length ? pend.length + " entrega(s) que o Canvas marca como não entregue(s) vão para Entregas atrasadas." : "O Canvas não marca nenhuma entrega como atrasada.") : "";
      if (!keys.length) {
        out.appendChild(el("div", "msg warn", "Nenhuma nota para importar ainda. As avaliações abaixo ficam para lançar à mão." + pendNote));
        if (pend) { const b = el("button", "btn primary", "Atualizar entregas atrasadas"); b.type = "button";
          b.addEventListener("click", () => { savePending(); store(); calc(); out.textContent = ""; out.appendChild(el("div", "msg ok", "Entregas atrasadas atualizadas.")); });
          out.appendChild(b); }
      }
      else {
        out.appendChild(el("div", null, keys.length + " notas encontradas. Confira antes de aplicar:" + pendNote));
        const ul = el("ul", "imp-list");
        for (const k of keys) {
          const li = el("li"), old = saved.grades[k], v = res.grades[k];
          li.append(el("span", null, label(k)), el("span", "num" + (old && old !== v ? " chg" : ""), (old && old !== v ? old + " → " : "") + v.replace(".", ",")));
          ul.appendChild(li);
        }
        out.appendChild(ul);
        const apply = el("button", "btn primary", "Aplicar " + keys.length + " notas"); apply.type = "button";
        apply.addEventListener("click", () => {
          const hadImport = !!(saved.pending || saved.todo);   // the first import would mark every grade as new
          saved.fresh = hadImport ? keys.filter(k => C.parseNum(saved.grades[k]) !== C.parseNum(res.grades[k])) : [];
          for (const k of keys) { saved.grades[k] = res.grades[k]; const inp = $("in-" + k); if (inp) inp.value = res.grades[k]; }
          if (res.meta != null) { saved.meta = res.meta; metaEl.value = res.meta; }
          savePending(); store(); calc(); afterApply(); out.textContent = ""; out.appendChild(el("div", "msg ok", keys.length + " notas aplicadas. Os números da página já foram atualizados."));
          if (res.missing.length) out.appendChild(el("div", "muted", res.missing.length + " avaliações continuam para lançar à mão nas matérias."));
        });
        out.appendChild(apply);
      }
      const extra = res.notes.concat(res.missing);
      if (extra.length) {
        const d = el("details"), sm = el("summary", null, extraTitle + " (" + extra.length + ")"); d.appendChild(sm);
        const ul = el("ul", "imp-list");
        for (const m of extra) { const li = el("li"); li.append(el("span", null, label(m.key)), el("span", "muted", m.reason)); ul.appendChild(li); }
        d.appendChild(ul); d.style.marginTop = "12px"; out.appendChild(d);
      }
    }
  }
  build(); buildImport(); calc();
})();
