// Campus+ on pucpr.instructure.com pages (after prefs.js, collect.js, core.js and files.js). Each part can be turned off in the popup:
// dashboard: the week (deadlines and exams of every course) and the announcements; cards: the course status (quanto falta);
// course pages: the next assessments, what each needs, and a files download; reminders handed to the service worker.
// Same-origin read-only GETs with the student's session; everything stays in chrome.storage.local on this computer.
(() => {
  if (window.top !== window) return;
  const C = NotasCore, F = QFFiles, T = 7, TTL = 10 * 60 * 1000;
  const VERSION = chrome.runtime.getManifest().version;
  const APP = chrome.runtime.getURL ? chrome.runtime.getURL("app.html") : null;   // the full calculator; null in the bookmarklet
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
    const upcoming = C.upcoming(C.COURSES, grades, t, T);
    const has = Object.keys(byCanvasId).length > 0 && Object.keys(grades).length > 0;   // no matched course or no grade read: no grade parts
    return { grades, byCanvasId, state, label, tone: C.statusTone, upcoming, has };
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

  const COLORS = { ok: ["#e2f1e9", "#1f5c42"], warn: ["#fbefd6", "#744405"], bad: ["#fce4dd", "#912713"] };
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

  // The Campus+ page: the full calculator over the Canvas content, opened by #campus (left menu item, panel buttons);
  // #campus=<subject id> (course page button) opens it on that subject.
  function campusPage() {
    const cur = document.getElementById("cp-app"), m = /^#campus(?:=([a-z0-9]{1,20}))?$/.exec(location.hash);
    if (!m || !APP) { if (cur) cur.remove(); return; }
    const src = APP + (m[1] ? "?m=" + m[1] : "");
    if (cur) { if (cur.cpFrame && cur.cpFrame.src !== src) cur.cpFrame.src = src; return; }
    const nav = document.querySelector(".ic-app-header"), left = nav && nav.getBoundingClientRect ? Math.round(nav.getBoundingClientRect().width) : 0;
    const box = el("div"); box.id = "cp-app";
    box.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:" + left + "px;z-index:9999;background:#FBF7EF";
    const frame = el("iframe"); frame.src = src; frame.title = "Campus+"; frame.style.cssText = "border:0;width:100%;height:100%;display:block";
    const close = el("button", null, "Fechar"); close.type = "button";
    close.style.cssText = "position:absolute;bottom:16px;right:16px;font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:10px 16px;border-radius:10px;border:1px solid #1D2433;background:#1D2433;color:#FBF7EF;cursor:pointer;box-shadow:0 2px 0 #E2482B,0 8px 20px -8px rgba(29,36,51,.5)";
    close.addEventListener("click", closeCampus);
    box.cpFrame = frame; box.append(frame, close); document.body.appendChild(box);
  }
  function closeCampus() { history.replaceState(null, "", location.pathname + location.search); campusPage(); }
  // "Campus+" in the Canvas left menu, after Painel.
  function navItem() {
    const menu = document.getElementById("menu");
    if (!menu || !APP || document.getElementById("cp-nav")) return;
    const li = el("li", "menu-item ic-app-header__menu-list-item"); li.id = "cp-nav";
    const a = el("a", "ic-app-header__menu-list-link"); a.href = "#campus";
    a.style.cssText = "text-decoration:none;color:var(--ic-brand-global-nav-menu-item__text-color,#fff)";   // Canvas's own classes style it; this only guards the link look
    const icon = el("div", "menu-item-icon-container", "C"), plus = el("span", null, "+"); icon.setAttribute("aria-hidden", "true");
    icon.style.cssText = "font:600 22px/26px 'Iowan Old Style','New York',Georgia,serif";
    plus.style.cssText = "font:700 14px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#FF7A5C;vertical-align:8px;margin-left:1px";
    icon.appendChild(plus);
    icon.style.color = "var(--ic-brand-global-nav-ic-icon-svg-fill,#fff)";
    a.append(icon, el("div", "menu-item__text", "Campus+")); li.appendChild(a);
    const dash = document.getElementById("global_nav_dashboard_link"), after = dash && dash.closest ? dash.closest("li") : null;
    menu.insertBefore(li, after ? after.nextSibling : null);
  }

  const CSS = `
    :host { all: initial; display:block; margin:0 0 18px; --fg:#1D2433; --muted:#5F6675; --line:#ECE4D3; --bg:#fff; --soft:#FBF7EF; --ring:#E2482B; --coral:#E2482B; --tile:#1D2433; --tile-c:#FBF7EF; --band1:#FFE6DF; --band2:#FFF5F1;
      --paper:#FBF7EF; --track:#F1EBDF; --ok:#2F7D5B; --warn:#A8650F; --bad:#C2361F; --ok-s:#CFE6D9; --warn-s:#F1DDB8; --bad-s:#F6CFC4; --lift:0 8px 20px -12px rgba(29,36,51,.35);
      --serif:"Iowan Old Style","New York",Georgia,"Times New Roman",serif; --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      font:14px/1.45 var(--sans); color:var(--fg); font-variant-numeric:tabular-nums; }
    :host-context(html.cp-dark) { --fg:#F3EDE1; --muted:#A9AFBC; --line:#2A3242; --bg:#1B2130; --soft:#222938; --ring:#F0603F; --coral:#F0603F; --tile:#F3EDE1; --tile-c:#1D2433; --band1:#3B2220; --band2:#2A2129;
      --paper:#141925; --track:#2A3242; --ok:#6CC59A; --warn:#E6B15C; --bad:#FF876C; --ok-s:#24493A; --warn-s:#4A3B22; --bad-s:#5A2E29; --lift:0 8px 20px -12px rgba(0,0,0,.6); }
    .box { position:relative; container:cp / inline-size; border:1px solid var(--line); border-radius:14px; background:var(--paper); padding:0 14px 14px; box-shadow:0 1px 2px rgba(29,36,51,.05); }
    .card { display:block; position:relative; background:var(--bg); border:1px solid var(--line); border-radius:12px; color:inherit; }
    a.card { transition:transform .18s cubic-bezier(.23,1,.32,1), box-shadow .18s, border-color .15s; } a.card:hover { text-decoration:none; transform:translateY(-1px); border-color:var(--muted); box-shadow:var(--lift); } a.card:active { transform:scale(.99); }
    .box > .card, .box > .kpis, .box > .tiles { margin-bottom:10px; }
    .k { font-size:10.5px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }
    .upnext { display:flex; align-items:center; gap:16px; padding:12px 14px; } .upnext .k { text-transform:none; letter-spacing:0; font-size:12px; font-weight:500; }
    .upnext .t, .cring .t { font:600 17px/1.25 var(--serif); letter-spacing:-.01em; margin:2px 0; overflow:hidden; text-overflow:ellipsis; } .upnext .mid, .cring .mid { flex:1; }
    .big { flex:none; text-align:right; } .big .v { display:block; font:500 30px/1 var(--serif); letter-spacing:-.02em; } .big span { display:block; margin-top:3px; color:var(--muted); font-size:12px; }
    .v.t-ok { color:var(--ok); } .v.t-warn { color:var(--warn); } .v.t-bad { color:var(--coral); }
    .kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .kpi { padding:10px 12px 12px; min-width:0; } .kpi .v { font:500 24px/1.15 var(--serif); letter-spacing:-.02em; margin:2px 0 4px; } .kpi .v.need { color:var(--coral); } .kpi .v.need.t-ok { color:var(--ok); }
    .meter { position:relative; height:6px; margin-top:6px; border-radius:99px; background:var(--track); }
    .meter i { position:absolute; left:0; top:0; bottom:0; border-radius:99px; background:var(--fg); } .meter b { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; border-radius:2px; background:var(--coral); }
    .trk { display:flex; gap:2px; margin-top:7px; } .trk i { position:relative; flex:1; min-width:2px; height:8px; border-radius:2px; background:var(--track); } .trk i.ok { background:var(--ok); } .trk i.late { background:var(--coral); }
    .trk i:hover { outline:1.5px solid var(--fg); outline-offset:1px; }
    [data-tip]::after { content:attr(data-tip); position:absolute; z-index:6; left:50%; bottom:calc(100% + 8px); width:max-content; max-width:240px; padding:6px 9px; border-radius:7px; background:var(--fg); color:var(--bg);
      font:500 12px/1.35 var(--sans); box-shadow:0 10px 24px -10px rgba(29,36,51,.5); opacity:0; visibility:hidden; pointer-events:none; transform:translate(-50%,3px); transition:opacity .12s, transform .12s, visibility 0s .12s; }
    [data-tip]:hover::after { opacity:1; visibility:visible; transform:translate(-50%,0); transition-delay:0s; }
    .trk i:nth-child(-n+5)::after { left:0; transform:translateY(3px); } .trk i:nth-last-child(-n+5)::after { left:auto; right:0; transform:translateY(3px); }
    .trk i:nth-child(-n+5):hover::after, .trk i:nth-last-child(-n+5):hover::after { transform:none; }
    .tiles { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .tile { display:grid; grid-template-columns:46px minmax(0,1fr); gap:10px; align-items:center; padding:9px 10px; }
    .tile .nm { display:block; font-weight:600; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .tile .c { display:block; margin:1px 0 4px; } .tile .pill { display:inline-block; }
    .ring { position:relative; flex:none; width:46px; height:46px; border-radius:50%; }
    .ring::after { content:""; position:absolute; inset:5px; border-radius:50%; background:var(--bg); }
    .ring b { position:absolute; inset:0; z-index:1; display:grid; place-items:center; font:600 13px/1 var(--serif); }
    .ring i { position:absolute; inset:0; z-index:1; } .ring i::before { content:""; position:absolute; left:50%; top:-2px; width:2px; height:9px; margin-left:-1px; border-radius:1px; background:var(--fg); }
    .ring.big { width:64px; height:64px; } .ring.big::after { inset:6px; } .ring.big b { font-size:17px; } .ring.big i::before { height:11px; }
    .cring { display:flex; align-items:center; gap:14px; padding:12px 14px; }
    .items { overflow:hidden; } .ir { display:grid; grid-template-columns:minmax(0,1fr) 56px 140px; gap:10px; align-items:center; padding:8px 12px; border-top:1px solid var(--line); }
    .ih { border-top:0; background:var(--track); font-size:11px; font-weight:600; color:var(--muted); padding:7px 12px; }
    .ir .n { display:flex; align-items:center; gap:8px; min-width:0; } .ir .n .pill { font-size:10.5px; line-height:18px; } .ir .dt { color:var(--muted); font-size:11.5px; }
    .ir .w { color:var(--muted); font-size:12px; } .ir .g { font:600 15px/1.2 var(--serif); } .ir .g small { font:500 11px var(--sans); color:var(--muted); } .ir .g.e { font:400 12px/1.3 var(--sans); color:var(--muted); }
    .card.week, .card.news { padding:12px 14px; }
    @container cp (max-width:700px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @container cp (max-width:560px) { .kpis { grid-template-columns:minmax(0,1fr); } .upnext .t { font-size:15px; } .big .v { font-size:26px; } .ir { grid-template-columns:minmax(0,1fr) 40px 104px; } }
    @container cp (max-width:420px) { .tiles { grid-template-columns:minmax(0,1fr); } .cring .ring { display:none; } }
    .hd { display:flex; align-items:center; gap:8px; margin:0 -14px 12px; padding:10px 14px; border-bottom:1px solid var(--line); }
    .hd b { font:600 15px/1 var(--serif); letter-spacing:-.01em; } .hd b i { font-style:normal; color:var(--coral); }
    .brand { margin-left:auto; font-size:12px; font-weight:600; color:var(--muted); }
    .mk { position:relative; flex:none; width:18px; height:18px; border-radius:4.5px; background:var(--tile); }
    .mk::before { content:"C"; position:absolute; left:2.5px; top:0; font:600 14px/18px var(--serif); color:var(--tile-c); }
    .mk::after { content:""; position:absolute; right:2px; top:3px; width:5px; height:5px;
      background:linear-gradient(var(--coral),var(--coral)) center/100% 1.6px no-repeat, linear-gradient(var(--coral),var(--coral)) center/1.6px 100% no-repeat; }
    .muted { color:var(--muted); font-size:12.5px; }
    h3 { margin:0 0 6px; font:600 17px/1.3 var(--serif); letter-spacing:-.01em; display:flex; gap:8px; align-items:center; }
    .lbl { margin:12px 0 2px; font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
    .pill { flex:none; padding:0 8px; border-radius:999px; font:600 11.5px/20px var(--sans); white-space:nowrap; }
    .ok { background:#E2F1E9; color:#1F5C42; } .warn { background:#FBEFD6; color:#744405; } .bad { background:#FCE4DD; color:#912713; } .nt { background:var(--soft); color:var(--fg); }
    ul { list-style:none; margin:0; padding:0; }
    .day + .day { margin-top:4px; }
    .dh { padding:4px 0 1px; font-size:11.5px; font-weight:600; color:var(--muted); }
    .row { display:grid; grid-template-columns:44px minmax(0,1fr) auto; gap:10px; align-items:center; padding:3px 0; }
    .news .row { grid-template-columns:8px minmax(0,1fr) auto; }
    .d { color:var(--muted); font-size:12.5px; white-space:nowrap; }
    .mid { min-width:0; } .n { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .c { color:var(--muted); font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .unread .n { font-weight:600; } .dot { width:6px; height:6px; border-radius:50%; background:var(--coral); overflow:hidden; color:transparent; font-size:0; }
    .acts { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px; }
    button { font:inherit; font-size:13px; font-weight:550; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:9px; padding:6px 12px; cursor:pointer; transition:background-color .15s, border-color .15s, box-shadow .15s, transform .15s cubic-bezier(.23,1,.32,1); }
    button:hover:not(:disabled) { background:var(--soft); border-color:var(--muted); transform:translateY(-1px); } button:active:not(:disabled) { transform:scale(.97); }
    button.primary { background:var(--fg); color:var(--bg); border-color:var(--fg); } button.primary:hover:not(:disabled) { background:var(--fg); border-color:var(--fg); box-shadow:0 2px 0 var(--coral); }
    button:disabled { opacity:.5; cursor:default; }
    a { color:inherit; text-decoration:none; } a:hover { text-decoration:underline; text-decoration-color:var(--coral); text-underline-offset:3px; }
    :is(a, button):focus-visible { outline:2px solid var(--ring); outline-offset:2px; border-radius:6px; }
    .grid { display:grid; gap:10px; }
    @container cp (min-width:760px) { .news > ul { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); column-gap:32px; } }
    .empty { padding:14px 12px; border:1px dashed var(--line); border-radius:10px; color:var(--muted); font:italic 14px/1.4 var(--serif); text-align:center; }
    .late { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:4px 0 12px; }
    .late .ev { max-width:240px; }
    .tl { position:relative; margin-top:6px; }
    .heads, .lanes, .rules { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
    .heads .dh { padding:0 6px 6px; font-size:11.5px; font-weight:600; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .heads .we { color:var(--muted); font-weight:500; } .heads .today { color:var(--coral); }
    .rules { position:absolute; left:0; right:0; top:24px; bottom:0; border-top:1px solid var(--line); }
    .rules > span { border-left:1px solid var(--line); } .rules > span:last-of-type { border-right:1px solid var(--line); }
    .rules > span.today { background:color-mix(in srgb, var(--coral) 5%, transparent); }
    .band { position:absolute; top:0; bottom:0; background:repeating-linear-gradient(135deg, var(--band1) 0 6px, var(--band2) 6px 12px); }
    .band b { position:absolute; left:7px; bottom:5px; font:700 10px/1 var(--sans); letter-spacing:.07em; text-transform:uppercase; color:var(--coral); white-space:nowrap; }
    .now { position:absolute; top:-3px; bottom:0; width:2px; margin-left:-1px; background:var(--coral); border-radius:2px; }
    .now::before { content:""; position:absolute; top:-3px; left:-3px; width:8px; height:8px; border-radius:50%; background:var(--coral); }
    .lanes { position:relative; padding:10px 0 12px; } .banded .lanes { padding-bottom:26px; }
    .col { display:flex; flex-direction:column; gap:5px; min-width:0; padding:0 4px; }
    .ev { position:relative; display:flex; align-items:center; min-width:0; height:26px; padding:0 8px; border-radius:7px; border:1px solid transparent; font:600 11.5px/1 var(--sans);
      white-space:nowrap; cursor:pointer; outline-offset:2px; transition:transform .15s cubic-bezier(.23,1,.32,1), box-shadow .15s; }
    .ev .t { overflow:hidden; text-overflow:ellipsis; }
    .col .ev { display:block; height:auto; padding:5px 7px 6px; white-space:normal; }
    .col .ev .t { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-height:1.2; overflow-wrap:anywhere; }
    .col .ev .s { display:block; margin-top:2px; font-weight:500; font-size:10.5px; line-height:1.2; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .col .ev.more { padding:4px 7px; text-align:center; background:var(--soft); color:var(--fg); border-color:var(--line); }
    .ev:hover, .ev:focus-visible { z-index:4; transform:translateY(-1px); box-shadow:0 6px 14px -6px rgba(29,36,51,.45); text-decoration:none; } .ev:active { transform:scale(.98); } .ev:focus-visible { outline:2px solid var(--ring); border-radius:7px; }
    .ev.ok { background:#E2F1E9; color:#1F5C42; border-color:#BFE0CC; } .ev.wa { background:#FBEFD6; color:#744405; border-color:#F0D9A8; }
    .ev.ex { background:var(--coral); color:#fff; } .ev.in { background:var(--fg); color:var(--bg); } .ev.bd { background:#FCE4DD; color:#912713; border-color:#F6C3B5; }
    .tip { position:absolute; left:0; bottom:calc(100% + 7px); z-index:5; display:grid; gap:1px; width:max-content; max-width:260px; padding:7px 10px; border-radius:8px;
      background:var(--fg); color:var(--bg); font:500 12px/1.4 var(--sans); white-space:normal; text-align:left; box-shadow:0 10px 24px -10px rgba(29,36,51,.5);
      opacity:0; visibility:hidden; transform:translateY(3px); pointer-events:none; transition:opacity .12s, transform .12s, visibility 0s .12s; }
    .tip b { font-weight:650; } .tip span { opacity:.78; }
    .ev.r .tip { left:auto; right:0; }
    .ev:hover .tip, .ev:focus-visible .tip { opacity:1; visibility:visible; transform:none; transition-delay:0s; }
    .wl { display:none; }
    @container cp (max-width:520px) { .tl { display:none; } .wl { display:block; } }
    @media (prefers-reduced-motion:reduce) { button, .ev, .tip, a.card, [data-tip]::after { transition:none; } a.card:hover, a.card:active { transform:none; } button:hover:not(:disabled), button:active:not(:disabled), .ev:hover, .ev:focus-visible, .ev:active { transform:none; } }
    :host-context(html.cp-dark) .ok { background:#173229; color:#8FD8B3; } :host-context(html.cp-dark) .warn { background:#33291A; color:#F0C67E; }
    :host-context(html.cp-dark) .bad { background:#3A1F1D; color:#FFA28C; }
    :host-context(html.cp-dark) .ev.ok { background:#173229; color:#8FD8B3; border-color:#25493A; } :host-context(html.cp-dark) .ev.wa { background:#33291A; color:#F0C67E; border-color:#4A3B22; }
    :host-context(html.cp-dark) .ev.bd { background:#3A1F1D; color:#FFA28C; border-color:#5A2E29; } :host-context(html.cp-dark) .ev.ex { color:#1B1210; } :host-context(html.cp-dark) .trk i.ok { background:var(--ok); }`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const mark = () => { const m = el("span", "mk"); m.setAttribute("aria-hidden", "true"); return m; };   // the logo tile, drawn in CSS
  const wordmark = () => { const b = el("b", null, "Campus"); b.appendChild(el("i", null, "+")); b.setAttribute("aria-label", "Campus+"); return b; };

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

  // The next 7 days as a timeline (today + 6): a column per day, each item a chip in its due day (lanes so none overlap), the
  // exam days banded, a marker at the current time; overdue work in a row above. Narrow panels show the same days as a list
  // (both are built; a container query picks one). Every link goes through the same origin check as before.
  function weekView(list, prefs) {
    const t = today(), cols = [0, 1, 2, 3, 4, 5, 6].map(addDays);
    const late = list.filter(x => x.late && !x.done && x.date < t), next = list.filter(x => x.date >= t && x.date <= cols[6]);
    const status = x => x.done ? "entregue" : x.late ? "atrasada" : x.exam ? (prefs.grades ? need(x.exam) : "prova") : x.task ? "a entregar" : "evento";
    const name = x => (x.exam && !/prova/i.test(x.title) ? "Prova: " : "") + x.title;   // core names already say "Prova do RA2"
    const kind = x => x.late && !x.done ? "bd" : x.done ? "ok" : x.exam ? "ex" : x.task ? "wa" : "in";
    const chip = (x, text, right, sub) => {
      const c = el(x.url ? "a" : "span", "ev " + kind(x) + (right ? " r" : ""));
      if (x.url) c.href = x.url; else c.tabIndex = 0;   // focusable either way, so the tooltip opens from the keyboard too
      const when = cap(dayLabel(x.date)) + (x.due ? ", " + hhmm(x.due) : "");
      c.setAttribute("aria-label", name(x) + " · " + x.course + " · " + when + " · " + status(x));
      const tip = el("span", "tip"); tip.setAttribute("aria-hidden", "true");
      tip.append(el("b", null, name(x)), el("span", null, x.course), el("span", null, when + " · " + status(x)));
      c.append(el("span", "t", text)); if (sub) c.appendChild(el("span", "s", sub)); c.appendChild(tip);
      return c;
    };
    const sec = el("section", "card week"), h = el("h3", null, "Próximos 7 dias"), open = next.filter(x => (x.task || x.exam) && !x.done).length;
    h.appendChild(el("span", "pill " + (late.length ? "bad" : open ? "warn" : "ok"), late.length ? late.length + (late.length === 1 ? " atrasada" : " atrasadas") : open ? open + " pela frente" : "tudo entregue"));
    sec.appendChild(h);
    if (late.length) {
      const row = el("div", "late"); row.appendChild(el("span", "pill bad", "Atrasadas"));
      late.slice(0, 6).forEach(x => row.appendChild(chip(x, x.title + " · " + dmy(x.date))));
      if (late.length > 6) row.appendChild(el("span", "muted", "+" + (late.length - 6)));
      sec.appendChild(row);
    }
    if (!next.length) { sec.appendChild(el("div", "empty", late.length ? "Nada novo nos próximos 7 dias: dá para pôr as atrasadas em dia." : "Nada nos próximos 7 dias. Semana livre!")); return sec; }

    const tl = el("div", "tl"), heads = el("div", "heads"), rules = el("div", "rules"), lanes = el("div", "lanes");
    cols.forEach((iso, i) => {
      const d = new Date(iso + "T12:00:00"), wd = d.getDay();
      heads.appendChild(el("span", "dh" + (i === 0 ? " today" : wd === 0 || wd === 6 ? " we" : ""), WD[wd] + " " + d.getDate()));
      rules.appendChild(el("span", i === 0 ? "today" : null));
    });
    // exam days close together (at most one free day between) read as one "semana de provas" band
    const examCols = cols.map((iso, i) => next.some(x => x.exam && x.date === iso) ? i : -1).filter(i => i >= 0), runs = [];
    for (const i of examCols) { const r = runs[runs.length - 1]; if (r && i - r[1] <= 2) r[1] = i; else runs.push([i, i]); }
    for (const [s, e] of runs) {
      const band = el("div", "band"); band.style.left = (s / 7 * 100) + "%"; band.style.width = ((e - s + 1) / 7 * 100) + "%";
      band.appendChild(el("b", null, e > s ? "semana de provas" : "prova")); rules.appendChild(band);
    }
    const now = new Date(), mk = el("div", "now"); mk.setAttribute("aria-hidden", "true");
    mk.style.left = ((now.getHours() * 60 + now.getMinutes()) / 1440 / 7 * 100) + "%"; rules.appendChild(mk);
    // each chip only in its own day column, stacked by time; past 4 in a day, 3 chips and a "+N" listing the rest
    const MAX = 4;
    cols.forEach((iso, col) => {
      const day = el("div", "col"), items = next.filter(x => x.date === iso), shown = items.length > MAX ? items.slice(0, MAX - 1) : items;
      for (const x of shown) day.appendChild(chip(x, name(x), col >= 4, x.done ? "✓ entregue" : x.exam ? (prefs.grades ? need(x.exam) : "prova") : x.due ? hhmm(x.due) : "dia todo"));
      const rest = items.slice(shown.length);
      if (rest.length) {
        const more = el("span", "ev more" + (col >= 4 ? " r" : ""), "+" + rest.length); more.tabIndex = 0;
        more.setAttribute("aria-label", "Mais " + rest.length + ": " + rest.map(x => name(x) + " (" + status(x) + ")").join("; "));
        const tip = el("span", "tip"); tip.setAttribute("aria-hidden", "true");
        rest.forEach(x => tip.appendChild(el("span", null, name(x) + " · " + (x.due ? hhmm(x.due) + " · " : "") + status(x))));
        more.appendChild(tip); day.appendChild(more);
      }
      lanes.appendChild(day);
    });
    tl.className = "tl" + (runs.length ? " banded" : "");
    tl.append(heads, rules, lanes);

    const wl = el("ul", "wl");   // the narrow fallback: grouped by day
    let group = null, rows = null;
    for (const x of next) {
      const g = cap(dayLabel(x.date));
      if (g !== group) { group = g; const day = el("li", "day"); rows = el("ul"); day.append(el("div", "dh", g), rows); wl.appendChild(day); }
      const right = x.done ? el("span", "pill ok", "entregue") : x.exam ? el("span", "pill " + (prefs.grades ? needTone(x.exam) : "nt"), prefs.grades ? need(x.exam) : "prova") : el("span");
      const li = el("li", "row");
      li.append(el("span", "d", x.due ? hhmm(x.due) : "–"), mid(name(x), x.url, x.course), right);
      rows.appendChild(li);
    }
    sec.append(tl, wl);
    return sec;
  }

  // The calculator's own components, drawn from the shared core (same numbers as the Campus+ page): ring, next card,
  // KPI row and subject tiles. Links open Campus+ on a subject (#campus=<id>); in the bookmarklet they are plain text.
  const toCampus = (tag, cls, id) => { const x = el(APP ? "a" : tag, cls); if (APP) x.href = "#campus" + (id ? "=" + id : ""); return x; };
  const earnedText = st => st.earned >= 10 ? "10" : fmt(Math.floor(st.earned * 10) / 10, 1);
  function ring(st, big) {
    const r = el("span", "ring" + (big ? " big" : "")), rp = C.ringParts(st), tn = C.statusTone(st), e = rp.earned * 100, f = (rp.earned + rp.future) * 100;
    r.style.background = "conic-gradient(var(--" + tn + ") 0 " + e + "%, var(--" + tn + "-s) " + e + "% " + f + "%, var(--track) " + f + "% 100%)";
    const goal = el("i"); goal.style.transform = "rotate(" + Math.min(T, 9.9) * 36 + "deg)";   // the goal mark on the ring
    r.append(goal, el("b", null, earnedText(st))); r.setAttribute("aria-hidden", "true");
    return r;
  }
  // Big needed grade on 0-10 and its caption, as the calculator's hero card shows it.
  function needBig(st) {
    const nd = C.courseNeed(st), box = el("div", "big");
    const v = st.status === "garantido" ? "✓" : nd.impossible ? "não dá" : (nd.approx ? "≈ " : "") + up(nd.of10, 1);
    const cap = st.status === "garantido" ? "garantido" : st.status === "depende-atrasadas" ? "faltam notas antigas" : nd.impossible ? "nem com nota cheia" : "precisa, em 10";
    box.append(el("b", "v t-" + (st.status === "depende-atrasadas" ? "warn" : nd.tone), v), el("span", null, cap));
    return box;
  }
  function gradesView(a) {
    const t = today(), out = [], list = C.stillCounts(C.COURSES, a.grades, t, T);
    if (list.length) {
      const u = list[0], d = days(u.item.date), card = toCampus("div", "card upnext", u.course.id), left = el("div", "mid");
      left.append(el("div", "k", "Próxima avaliação que conta"), el("div", "t", u.item.name), el("div", "c", C.SHORT[u.course.id] + " · " + dmy(u.item.date) + ", " + (d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias")));
      card.append(left, needBig(u.st)); out.push(card);
    }
    const sem = C.semester(C.COURSES, a.grades, t, T), kpis = el("div", "kpis");
    const kpi = (k, v, cls, sub) => { const d = el("div", "card kpi"); d.append(el("div", "k", k), el("div", "v" + (cls ? " " + cls : ""), v)); if (sub) d.appendChild(sub); kpis.appendChild(d); return d; };
    const meter = el("div", "meter"), fill = el("i"), goal = el("b"); meter.setAttribute("aria-hidden", "true");
    fill.style.width = Math.min(100, sem.mean * 10) + "%"; goal.style.left = Math.min(99.5, T * 10) + "%"; meter.append(fill, goal);
    kpi("Média atual", fmt(Math.floor(sem.mean * 10) / 10, 1), null, meter).title = "pontos garantidos de 10, média das " + C.COURSES.length + " matérias · meta " + fmt(T, 1);
    const cnt = s => sem.counts[s] || 0;
    if (sem.tight) kpi("Quanto falta", up(sem.states[sem.tight.id].fraction * 10, 1), "need", el("div", "c", C.SHORT[sem.tight.id] + ", a mais apertada"));
    else if (cnt("depende-atrasadas")) kpi("Quanto falta", "?", "need", el("div", "c", "faltam notas antigas"));
    else if (cnt("nao-da")) kpi("Quanto falta", "—", "need", el("div", "c", cnt("nao-da") + (cnt("nao-da") === 1 ? " matéria na recuperação" : " matérias na recuperação")));
    else kpi("Quanto falta", "0", "need t-ok", el("div", "c", "tudo garantido"));
    const trk = el("div", "trk"); trk.setAttribute("aria-label", sem.done + " lançadas, " + sem.late + " sem nota, " + (sem.items.length - sem.done - sem.late) + " pela frente");
    for (const x of sem.items) { const b = el("i", x.s); b.dataset.tip = C.SHORT[x.course.id] + " · " + x.item.name + " · " + dmy(x.item.date) + " · " + (x.s === "ok" ? "lançada" : x.s === "late" ? "sem nota" : "pela frente"); trk.appendChild(b); }
    kpi("Entregues", sem.done + " de " + sem.items.length, null, trk);
    out.push(kpis);
    const tiles = el("div", "tiles");
    for (const c of C.COURSES) {
      const st = sem.states[c.id], nx = C.nextItem(st), tile = toCampus("div", "card tile", c.id), txt = el("span", "mid");
      txt.append(el("span", "nm", C.SHORT[c.id]), el("span", "c", nx ? "próxima " + dmy(nx.date) : "nada pela frente"), el("span", "pill " + C.statusTone(st), a.label(st)));
      tile.setAttribute("aria-label", c.name + ": " + fmt(st.earned, 2) + " garantidos de 10; " + a.label(st));
      tile.append(ring(st), txt); tiles.appendChild(tile);
    }
    out.push(tiles);
    return out;
  }

  // Dashboard: the next assessment, the KPI row and the subject tiles (grades), the next 7 days of every course (week)
  // and the latest announcements (news); each part follows its switch in the popup.
  function dashPanel(a, cache, prefs) {
    const grades = prefs.grades && a.has, week = prefs.week && cache.planner, news = prefs.news && Array.isArray(cache.data.announcements);
    if (!grades && !week && !news) return;
    const box = panelHost("cp-dash");
    if (!box) return;
    const grid = el("div", "grid");
    const hd = el("div", "hd"); hd.append(mark(), wordmark());
    if (APP) { const brand = el("a", "brand", "Abrir Campus+ →"); brand.href = "#campus"; hd.appendChild(brand); }
    box.append(hd);
    if (grades) box.append(...gradesView(a));
    box.appendChild(grid);
    if (week) grid.appendChild(weekView(agenda(a, cache), prefs));
    if (news) {
      const all = cache.data.announcements.slice().sort((x, y) => String(y.at).localeCompare(String(x.at))), unread = all.filter(x => x.unread).length;
      const sec = el("section", "card news"), h = el("h3", null, "Avisos");
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

  // Course pages: the ring card (earned, what is left, the needed grade), every assessment of the subject with its weight
  // and grade or what it needs, and the actions (files download, open Campus+ on this subject).
  function coursePanel(courseId, a, cache, prefs) {
    const c = prefs.grades && a.has ? a.byCanvasId[courseId] : null, cv = cache.ids.find(x => String(x.id) === courseId);
    if (!c && !prefs.files) return;
    const box = panelHost("qf-panel");
    if (!box) return;
    const top = el("div", "hd"); top.append(mark(), wordmark());
    if (c) top.appendChild(el("span", "brand", "meta " + fmt(T, 0) + " · lido do Canvas " + ago(C.localISO(new Date(cache.at)))));
    box.appendChild(top);
    if (c) {
      const st = a.state(c), nx = C.nextItem(st), head = el("div", "card cring"), mid = el("div", "mid");
      mid.append(el("div", "t", earnedText(st) + " garantidos de 10"),
        el("div", "c", (st.status === "garantido" ? "meta " + fmt(T, 0) + " garantida" : "faltam " + up(st.need, 1) + " pontos pra meta " + fmt(T, 0)) + (nx ? " · próxima " + dmy(nx.date) : "")));
      head.append(ring(st, true), mid, needBig(st)); box.appendChild(head);
      const tbl = el("div", "card items"), th = el("div", "ir ih"); th.append(el("span", null, "Avaliação"), el("span", null, "Peso"), el("span", null, "Nota"));
      tbl.appendChild(th);
      const total = C.weightSum(c), d2 = it => it.inMax >= 5 ? 1 : 2;
      for (const it of c.items) {
        const row = el("div", "ir"), k = C.key(c, it), p = C.itemPoints(it, a.grades[k]), name = el("span", "n", it.name);
        if (nx === it) name.appendChild(el("span", "pill ok", dmy(it.date))); else if (st.future.includes(it)) name.appendChild(el("span", "dt", dmy(it.date)));
        let g;
        if (Number.isNaN(p)) g = el("span", "g e", "nota inválida");
        else if (p !== null) { g = el("span", "g", fmt(C.parseNum(a.grades[k]), d2(it))); if (it.inMax !== 10) g.appendChild(el("small", null, " de " + fmt(it.inMax, d2(it)))); }
        else if (st.late.includes(it)) g = el("span", "g e", "falta a nota");
        else g = el("span", "g e", st.status === "depende-atrasadas" ? "—" : need({ req: C.requiredFor(st, it), item: it }));
        row.append(name, el("span", "w", Math.round(it.max / total * 100) + "%"), g); tbl.appendChild(row);
      }
      box.appendChild(tbl);
    }
    const acts = el("div", "acts"), status = el("span", "muted");
    if (prefs.files) {
      const files = el("button", "primary", "Baixar arquivos da matéria");
      files.addEventListener("click", () => listFiles(courseId, cv ? cv.name : document.title, acts, files, status));
      acts.appendChild(files);
    }
    if (c && APP) { const open = el("button", null, "Abrir no Campus+ →"); open.addEventListener("click", () => { location.hash = "campus=" + c.id; }); acts.appendChild(open); }
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
    navItem(); campusPage(); window.addEventListener("hashchange", campusPage);
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
