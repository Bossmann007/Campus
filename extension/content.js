// Campus+ on pucpr.instructure.com pages (after prefs.js, collect.js, core.js and files.js). Each part can be turned off in the popup:
// dashboard: the week (deadlines and exams of every course) and the announcements; cards: the course status (quanto falta);
// course pages: the next assessments, what each needs, and a files download; reminders handed to the service worker.
// Same-origin read-only GETs with the student's session; everything stays in chrome.storage.local on this computer.
(() => {
  if (window.top !== window) return;
  const C = NotasCore, F = QFFiles, T = 7, TTL = 10 * 60 * 1000;
  const SITE = "https://falta-quanto.vercel.app/app", VERSION = chrome.runtime.getManifest().version;
  const fmt = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const up = (n, d) => fmt(Math.ceil(n * 10 ** d - 1e-9) / 10 ** d, d);   // round up: never shows less than needed
  const dmy = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const today = () => C.localISO(new Date());
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const dayLabel = iso => { const d = days(iso); return d === 0 ? "hoje" : d === 1 ? "amanhã" : d === -1 ? "ontem" : WD[new Date(iso + "T12:00:00").getDay()] + " " + dmy(iso); };
  const hhmm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const addDays = n => C.localISO(new Date(Date.now() + n * 864e5));
  const days = iso => Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 864e5);

  async function getAll(url) {
    const out = [];
    while (url) {
      const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("o Canvas respondeu " + r.status);
      const body = JSON.parse((await r.text()).replace(/^while\(1\);/, ""));
      if (Array.isArray(body)) out.push(...body); else return body;
      const m = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get("Link") || "");
      url = m ? m[1] : null;
      if (url && new URL(url, location.href).origin !== location.origin) throw new Error("o Canvas indicou uma página fora do Canvas");
    }
    return out;
  }

  // Canvas export + course ids, cached for 10 minutes so moving between pages does not re-read everything.
  async function load(force) {
    let user;
    try { user = (await getAll("/api/v1/users/self")).id; } catch (e) { await chrome.storage.local.remove("cache"); throw e; }   // logged out: forget the last reading
    const { cache } = await chrome.storage.local.get("cache");
    if (!force && cache && cache.v === VERSION && cache.user === user && Date.now() - cache.at < TTL) return cache;
    const data = await collectCanvasGrades();
    if (data.error) throw new Error(data.error);
    const ids = (await getAll("/api/v1/courses?enrollment_state=active&per_page=100")).filter(c => c && typeof c.name === "string").map(c => ({ id: c.id, name: c.name }));
    const planner = await getAll("/api/v1/planner/items?start_date=" + addDays(-7) + "&end_date=" + addDays(15) + "&per_page=100").catch(() => null);   // the week and the reminders
    const fresh = { v: VERSION, user, at: Date.now(), data, ids, planner: Array.isArray(planner) ? planner : null };
    await chrome.storage.local.set({ cache: fresh });
    return fresh;
  }
  function analyse(cache) {
    const grades = C.fromCanvas(cache.data).grades, t = today(), byCanvasId = {};
    for (const c of C.COURSES) {
      const match = C.CANVAS[c.id] && C.CANVAS[c.id].match, hits = match ? cache.ids.filter(x => x.name.startsWith(match)) : [];
      if (hits.length === 1) byCanvasId[hits[0].id] = c;
    }
    const state = c => C.courseState(c, grades, t, T);
    const label = st => ({ garantido: "garantido", "nao-da": "recuperação", "depende-atrasadas": "faltam notas" }[st.status] || "precisa " + up(st.fraction * 10, 1) + "/10");
    const tone = st => st.status === "garantido" ? "ok" : st.status === "nao-da" ? "bad" : "warn";
    const upcoming = C.upcoming(C.COURSES, grades, t, T);
    return { grades, byCanvasId, state, label, tone, upcoming };
  }

  // The icon number: days to the next exam that still matters.
  function sendNext(a) {
    const u = a.upcoming.find(x => x.item.exam && x.st.status !== "garantido");
    chrome.runtime.sendMessage({ type: "next", date: u ? u.item.date : null, label: u ? u.item.name : "" }).catch(() => {});
  }

  // Deadlines from the Canvas planner (every course) plus our exams that are not in Canvas, from today on.
  function agenda(a, cache) {
    const short = (name, id) => { const c = a.byCanvasId[id]; return c ? c.name : String(name || "").split(" (")[0].split(" - ")[0]; };
    const out = [];
    for (const p of cache.planner || []) {
      if (!p || !p.plannable || typeof p.plannable_date !== "string" || /^(announcement|planner_note)$/.test(p.plannable_type)) continue;
      const s = p.submissions || {};
      const url = p.html_url ? new URL(p.html_url, location.href).href : "";
      out.push({ key: p.plannable_type + ":" + p.plannable_id, title: String(p.plannable.title || ""), course: short(p.context_name, p.course_id), ours: a.byCanvasId[p.course_id] || null,
        task: !!p.submissions, date: C.localISO(new Date(p.plannable_date)), due: p.plannable_date, url: url.startsWith(location.origin + "/") ? url : null,   // task: has a submission (events and pages do not)
        done: !!(s.submitted || s.graded || s.excused || (p.planner_override && p.planner_override.marked_complete)), late: !!s.missing });
    }
    for (const u of a.upcoming) if (u.item.exam && !out.some(x => x.ours === u.course && x.date === u.item.date))
      out.push({ key: "qf:" + C.key(u.course, u.item), title: u.item.name, course: u.course.name, ours: u.course, date: u.item.date, due: null, url: null, done: false, late: false, exam: u });
    return out.sort((x, y) => (x.due || x.date + "T12:00:00").localeCompare(y.due || y.date + "T12:00:00"));
  }
  const need = u => u.req.impossible ? "não dá" : u.req.f <= 1e-9 ? "já garantido" : "precisa " + up(u.req.raw, u.item.inMax >= 5 ? 1 : 2) + (u.item.inMax === 10 ? "" : " de " + fmt(u.item.inMax, u.item.inMax >= 5 ? 1 : 2));

  // What the service worker should remind: work not yet handed in and exams, in the next 14 days. Without a planner reading
  // (Canvas failed) nothing is sent, so a passing error does not wipe the reminders already set.
  function sendReminders(list, prefs, cache) {
    if (prefs.remind && !cache.planner) return;
    const t = today(), end = addDays(14);
    const items = prefs.remind ? list.filter(x => (x.task || x.exam) && !x.done && x.date >= t && x.date <= end).slice(0, 60)
      .map(x => ({ key: x.key, title: (x.exam ? "Prova: " : "Entrega: ") + x.title, course: x.course, due: x.due, date: x.date, url: x.url })) : [];
    chrome.runtime.sendMessage({ type: "remind", items }).catch(() => {});
  }

  const COLORS = { ok: ["#e9f6e9", "#2a7e3b"], warn: ["#fff7c2", "#ab6400"], bad: ["#feebe7", "#d13415"] };
  function pill(text, tone) {
    const s = document.createElement("span"), [bg, fg] = COLORS[tone] || COLORS.warn;
    s.textContent = text;   // no cp-host: the dark theme inverts it with the card, so it stays readable there
    s.style.cssText = "display:block;width:fit-content;margin-top:6px;padding:0 8px;border-radius:999px;font:600 11.5px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:" + bg + ";color:" + fg;
    return s;
  }

  // Dashboard: one status pill per card of the six courses. Cards render late (React), so watch the page.
  function decorateCards(a) {
    for (const card of document.querySelectorAll(".ic-DashboardCard:not([data-qf])")) {
      const link = card.querySelector('a[href*="/courses/"]'), m = link && /\/courses\/(\d+)/.exec(link.getAttribute("href"));
      const c = m && a.byCanvasId[m[1]];
      card.dataset.qf = "1";
      if (!c) continue;
      const st = a.state(c), p = pill(a.label(st), a.tone(st));
      p.title = "Campus+ · quanto falta (notas do Canvas, meta 7)";
      (card.querySelector(".ic-DashboardCard__header_content") || card).appendChild(p);
    }
  }

  function b64url(s) {
    const bytes = new TextEncoder().encode(s); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const CSS = `
    :host { all: initial; display:block; margin:0 0 18px; --fg:#18181b; --muted:#71717a; --line:#e4e4e7; --bg:#fff; --soft:#f4f4f5; --ring:#a1a1aa;
      font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--fg); }
    :host-context(html.cp-dark) { --fg:#f4f4f5; --muted:#a1a1aa; --line:#2e2e33; --bg:#18181b; --soft:#27272a; --ring:#71717a; }
    .box { position:relative; border:1px solid var(--line); border-radius:12px; background:var(--bg); padding:14px 16px; }
    .brand { position:absolute; top:14px; right:16px; font-size:11.5px; font-weight:600; color:var(--muted); letter-spacing:.01em; }
    .top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; } .top b { font-size:14px; font-weight:650; }
    .muted { color:var(--muted); font-size:12.5px; }
    h3 { margin:0 0 6px; font-size:13.5px; font-weight:650; display:flex; gap:8px; align-items:center; }
    .lbl { margin:14px 0 2px; font-size:11.5px; font-weight:600; color:var(--muted); }
    .pill { flex:none; padding:0 8px; border-radius:999px; font-weight:600; font-size:11.5px; line-height:20px; white-space:nowrap; }
    .ok { background:#e9f6e9; color:#1f6f31; } .warn { background:#fff4c2; color:#8a5100; } .bad { background:#feebe7; color:#c22d10; } .nt { background:var(--soft); color:var(--fg); }
    ul { list-style:none; margin:0; padding:0; }
    .day + .day { margin-top:4px; }
    .dh { padding:4px 0 1px; font-size:11.5px; font-weight:600; color:var(--muted); }
    .row { display:grid; grid-template-columns:44px minmax(0,1fr) auto; gap:10px; align-items:center; padding:3px 0; }
    .news .row { grid-template-columns:8px minmax(0,1fr) auto; }
    .d { color:var(--muted); font-size:12.5px; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .mid { min-width:0; } .n { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .c { color:var(--muted); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .unread .n { font-weight:600; } .dot { width:6px; height:6px; border-radius:50%; background:#2563eb; overflow:hidden; color:transparent; font-size:0; }
    .acts { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid var(--line); }
    button { font:inherit; font-size:13px; font-weight:500; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:5px 12px; cursor:pointer; }
    button:hover:not(:disabled) { background:var(--soft); }
    button.primary { background:var(--fg); color:var(--bg); border-color:var(--fg); } button.primary:hover:not(:disabled) { background:var(--fg); opacity:.88; }
    button:disabled { opacity:.5; cursor:default; }
    a { color:inherit; text-decoration:none; } a:hover { text-decoration:underline; text-underline-offset:2px; }
    :is(a, button):focus-visible { outline:2px solid var(--ring); outline-offset:2px; border-radius:6px; }
    .grid { display:grid; gap:20px; } @media (min-width:900px) { .grid.two { grid-template-columns:minmax(0,3fr) minmax(0,2fr); gap:32px; } }
    @media (max-width:899px) { .grid.two > section + section { border-top:1px solid var(--line); padding-top:14px; } }
    :host-context(html.cp-dark) .ok { background:#14301b; color:#86dc98; } :host-context(html.cp-dark) .warn { background:#362c05; color:#f5cb5c; }
    :host-context(html.cp-dark) .bad { background:#3f1710; color:#ffa08c; } :host-context(html.cp-dark) .dot { background:#60a5fa; }`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // A panel in a shadow root at the top of the page content; null when it is already there or the page has no content area.
  function panelHost(id) {
    const anchor = document.getElementById("content");
    if (document.getElementById(id) || !anchor) return null;
    const host = el("div", "cp-host"); host.id = id;
    const root = host.attachShadow({ mode: "open" }), box = el("div", "box"), style = el("style");
    style.textContent = CSS; root.append(style, box); anchor.prepend(host);
    return box;
  }
  const link = (text, url) => { const x = el(url ? "a" : "span", "n", text); if (url) x.href = url; x.title = text; return x; };
  const mid = (title, url, sub) => { const m = el("span", "mid"); m.append(link(title, url), el("div", "c", sub)); return m; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const ago = iso => { const d = -days(iso); return d <= 0 ? "hoje" : d === 1 ? "ontem" : d < 7 ? "há " + d + " dias" : dmy(iso); };
  const needTone = u => u.req.impossible ? "bad" : u.req.f <= 1e-9 ? "ok" : "warn";

  // Dashboard: this week's deadlines and exams of every course, grouped by day, and the latest announcements.
  function dashPanel(a, cache, prefs) {
    const week = prefs.week && cache.planner, news = prefs.news && Array.isArray(cache.data.announcements);
    if (!week && !news) return;
    const box = panelHost("cp-dash");
    if (!box) return;
    const grid = el("div", "grid" + (week && news ? " two" : ""));
    box.append(el("span", "brand", "Campus+"), grid);
    if (week) {
      const t = today(), end = addDays(7), list = agenda(a, cache);
      const late = list.filter(x => x.late && !x.done && x.date < t), next = list.filter(x => x.date >= t && x.date <= end);
      const sec = el("section"), h = el("h3", null, "Esta semana"), open = next.filter(x => (x.task || x.exam) && !x.done).length;
      h.appendChild(el("span", "pill " + (late.length ? "bad" : open ? "warn" : "ok"), late.length ? late.length + (late.length === 1 ? " atrasada" : " atrasadas") : open ? open + " pela frente" : "tudo entregue"));
      sec.appendChild(h);
      const byDay = el("ul");
      let group = null, rows = null;
      for (const x of [...late, ...next].slice(0, 12)) {
        const g = x.date < t ? "Atrasadas" : cap(dayLabel(x.date));
        if (g !== group) { group = g; const day = el("li", "day"); rows = el("ul"); day.append(el("div", "dh", g), rows); byDay.appendChild(day); }
        const right = x.done ? el("span", "pill ok", "entregue") : x.late ? el("span", "pill bad", "atrasada")
          : x.exam ? el("span", "pill " + (prefs.grades ? needTone(x.exam) : "nt"), prefs.grades ? need(x.exam) : "prova") : el("span");
        const li = el("li", "row");   // the late group shows the day, the others the time (exams have none)
        li.append(el("span", "d", x.date < t ? dmy(x.date) : x.due ? hhmm(x.due) : "–"), mid((x.exam ? "Prova: " : "") + x.title, x.url, x.course), right);
        rows.appendChild(li);
      }
      sec.appendChild(late.length + next.length ? byDay : el("div", "muted", "Nada para os próximos 7 dias."));
      grid.appendChild(sec);
    }
    if (news) {
      const all = cache.data.announcements.slice().sort((x, y) => String(y.at).localeCompare(String(x.at))), unread = all.filter(x => x.unread).length;
      const sec = el("section", "news"), h = el("h3", null, "Avisos");
      if (unread) h.appendChild(el("span", "pill nt", unread + (unread === 1 ? " não lido" : " não lidos")));
      sec.appendChild(h);
      const ul = el("ul");
      for (const x of all.slice(0, 6)) {
        const li = el("li", "row" + (x.unread ? " unread" : ""));
        li.append(x.unread ? el("span", "dot", "não lido") : el("span"), mid(x.title, x.url && x.url.startsWith(location.origin + "/") ? x.url : null, String(x.course || "").split(" (")[0]),
          el("span", "d", x.at ? ago(C.localISO(new Date(x.at))) : ""));
        ul.appendChild(li);
      }
      sec.appendChild(all.length ? ul : el("div", "muted", "Nenhum aviso nos últimos 60 dias."));
      grid.appendChild(sec);
    }
  }

  // Course pages: the status, the next assessments of this course and the actions (files download, open in Campus+).
  function coursePanel(courseId, a, cache, prefs) {
    const c = prefs.grades ? a.byCanvasId[courseId] : null, cv = cache.ids.find(x => String(x.id) === courseId);
    if (!c && !prefs.files) return;
    const box = panelHost("qf-panel");
    if (!box) return;
    const top = el("div", "top"); top.appendChild(el("b", null, "Campus+"));
    if (c) { const st = a.state(c); top.appendChild(el("span", "pill " + a.tone(st), a.label(st))); top.appendChild(el("span", "muted", "quanto falta pelas notas do Canvas, meta 7")); }
    box.appendChild(top);
    if (c) {
      const list = el("ul"), next = a.upcoming.filter(u => u.course.id === c.id).slice(0, 4);
      for (const u of next) {
        const li = el("li", "row"), d = days(u.item.date);
        li.title = d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias";
        li.append(el("span", "d", dmy(u.item.date)), el("span", "n", u.item.name), el("span", "pill " + needTone(u), need(u)));
        list.appendChild(li);
      }
      box.appendChild(el("div", "lbl", "Próximas avaliações"));
      box.appendChild(next.length ? list : el("div", "muted", "Nada pela frente nesta matéria."));
    }
    const acts = el("div", "acts"), status = el("span", "muted");
    if (prefs.files) {
      const files = el("button", "primary", "Baixar arquivos da matéria");
      files.addEventListener("click", () => listFiles(courseId, cv ? cv.name : document.title, acts, files, status));
      acts.appendChild(files);
    }
    if (c) { const open = el("button", null, "Abrir no Campus+"); open.addEventListener("click", () => window.open(SITE + "#canvas=" + b64url(JSON.stringify(Object.assign({ ext: VERSION }, cache.data))), "_blank", "noopener")); acts.appendChild(open); }
    acts.appendChild(status); box.appendChild(acts);
  }

  async function courseFiles(id) {
    try { return await getAll("/api/v1/courses/" + id + "/files?sort=created_at&order=desc&per_page=100"); }
    catch (e) {   // Files tab hidden by the professor: the files linked in modules
      const out = [], seen = new Set();
      for (const m of await getAll("/api/v1/courses/" + id + "/modules?include[]=items&per_page=100"))
        for (const it of m.items || []) if (it.type === "File" && it.content_id && !seen.has(it.content_id)) {
          seen.add(it.content_id);
          try { out.push(await getAll("/api/v1/courses/" + id + "/files/" + it.content_id)); } catch (err) { /* locked file */ }
        }
      return out;
    }
  }
  async function listFiles(id, canvasName, acts, btn, status) {
    btn.disabled = true; status.textContent = "Listando arquivos…";
    try {
      const all = (await courseFiles(id)).filter(f => f && f.url && !f.locked_for_user)
        .map(f => ({ id: f.id, url: new URL(f.url, location.href).href, filename: F.target(canvasName, f, C.COURSES, C.CANVAS) })).filter(f => f.filename);
      const { dl } = await chrome.storage.local.get("dl"), have = new Set(Array.isArray(dl) ? dl : []);
      const fresh = all.filter(f => !have.has(f.id));
      btn.remove();
      status.textContent = all.length + (all.length === 1 ? " arquivo" : " arquivos") + ", " + fresh.length + (fresh.length === 1 ? " novo" : " novos") + " · vão para Downloads/PUCPR";
      const btns = [];
      const save = async items => {
        btns.forEach(b => { b.disabled = true; }); status.textContent = "Baixando " + items.length + "…";
        let started = 0;
        for (let i = 0; i < items.length; i += 300) {   // the service worker takes up to 300 per message
          const res = await chrome.runtime.sendMessage({ type: "download", items: items.slice(i, i + 300) });
          started += res && Array.isArray(res.done) ? res.done.length : 0;
        }
        status.textContent = started + " de " + items.length + " enviados para Downloads/PUCPR";
        btns.forEach(b => { b.disabled = false; });
      };
      if (fresh.length) { const b = el("button", "primary", "Baixar " + fresh.length + (fresh.length === 1 ? " novo" : " novos")); b.addEventListener("click", () => save(fresh)); acts.prepend(b); btns.push(b); }
      if (all.length) { const b = el("button", null, "Baixar todos"); b.addEventListener("click", () => save(all)); acts.insertBefore(b, status); btns.push(b); }
    } catch (e) { status.textContent = "Não consegui listar: " + (e && e.message || e); btn.disabled = false; }
  }

  async function run() {
    const prefs = cpPrefs((await chrome.storage.local.get("prefs")).prefs);
    let cache;
    try { cache = await load(false); } catch (e) { return; }   // logged out or Canvas down: stay quiet
    const a = analyse(cache);
    sendNext(a);
    sendReminders(agenda(a, cache), prefs, cache);
    const m = /^\/courses\/(\d+)(\/(modules|files|assignments|grades|announcements))?\/?$/.exec(location.pathname);
    if (m) coursePanel(m[1], a, cache, prefs);
    if (location.pathname === "/" || location.pathname === "/dashboard") {
      dashPanel(a, cache, prefs);
      if (!prefs.grades) return;
      decorateCards(a);
      let t = 0;
      new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => decorateCards(a), 250); }).observe(document.body, { childList: true, subtree: true });
    }
  }
  run();
})();
