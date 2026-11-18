// Caderno+ on pucpr.instructure.com pages (after prefs.js, collect.js, core.js and files.js). Each part can be turned off in the popup:
// dashboard: the week (deadlines and exams of every course) and the announcements; cards: the course status (quanto falta);
// course pages: the next assessments, what each needs, and a files download; reminders handed to the service worker.
// Same-origin read-only GETs with the student's session; everything stays in chrome.storage.local on this computer.
(() => {
  if (window.top !== window) return;
  const C = NotasCore, F = QFFiles, TTL = 10 * 60 * 1000, LOCK = 60 * 1000;
  const TERM = C.TERM.replace(/ /g, "");   // "2026/2"
  const VERSION = chrome.runtime.getManifest().version;
  const EXT = !!chrome.runtime.getURL;   // the extension (the bookmarklet keeps nothing after a reload)
  let T = 7;   // the meta (goal), from the popup or the dashboard; 7 by default
  let KPI_COURSE = "";   // prefs.kpiCourse: the subject the three dashboard numbers are about ("" = every subject)
  let TURMA_PREF = null;   // prefs.turma: the turma the student confirmed, "outro" for another program, null when not asked yet
  const fmt = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const dn = n => fmt(Math.floor(n * 10 + 1e-9) / 10, 1);   // round down: never shows more than earned (the dashboard, the course page, the popup alike)
  const up = (n, d) => fmt(Math.ceil(n * 10 ** d - 1e-9) / 10 ** d, d);   // round up: never shows less than needed
  const dmy = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const today = () => C.localISO(new Date());
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const dayLabel = iso => { const d = days(iso); return d === 0 ? "hoje" : d === 1 ? "amanhã" : d === -1 ? "ontem" : WD[new Date(iso + "T12:00:00").getDay()] + " " + dmy(iso); };
  const hhmm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const addDays = n => C.localISO(new Date(Date.now() + n * 864e5));
  const days = iso => Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 864e5);

  // f over xs, at most n at a time, results in order: Canvas throttles a burst of requests (403), so side reads stay small
  const pool = (xs, n, f) => { let i = 0; const out = []; return Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k], k); } })).then(() => out); };
  // One Canvas GET: 20 s at most; a throttle (403 "Rate Limit Exceeded", 429) or a passing 5xx is tried again twice, later.
  async function canvasGet(url) {
    for (let i = 0; ; i++) {
      const ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(() => ctl.abort(), 20000) : 0;
      try {
        const r = await fetch(url, Object.assign({ credentials: "same-origin", headers: { Accept: "application/json" } }, ctl ? { signal: ctl.signal } : {}));
        const left = r.headers && r.headers.get ? parseFloat(r.headers.get("X-Rate-Limit-Remaining")) : NaN;
        if ((r.status === 429 || [502, 503, 504].includes(r.status) || (r.status === 403 && left <= 0)) && i < 2) { if (r.body && r.body.cancel) r.body.cancel().catch(() => {}); await new Promise(res => setTimeout(res, 1200 * (i + 1))); continue; }
        const body = await r.text();   // the whole answer inside the 20 s
        return { ok: r.ok, status: r.status, headers: r.headers, text: async () => body };
      } catch (e) { if (i < 2) { await new Promise(res => setTimeout(res, 800 * (i + 1))); continue; } throw new Error(e && e.name === "AbortError" ? "o Canvas demorou demais" : "sem conexão com o Canvas"); }
      finally { clearTimeout(t); }
    }
  }
  async function getAll(url, pages = Infinity) {   // pages: stop after that many (the inbox reads only the first)
    const out = [];
    while (url && pages-- > 0) {
      const r = await canvasGet(url);
      if (!r.ok) throw new Error("o Canvas respondeu " + r.status);
      const body = JSON.parse((await r.text()).replace(/^while\(1\);/, ""));
      if (Array.isArray(body)) out.push(...body); else return body;
      const m = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get("Link") || "");
      url = m ? m[1] : null;
      if (url && new URL(url, location.href).origin !== location.origin) throw new Error("o Canvas indicou uma página fora do Canvas");
    }
    return out;
  }

  // The Canvas user, always confirmed before any reading is shown: the id Canvas prints in the page (ENV.current_user_id), else
  // one GET /users/self. A reading of another user is dropped before anything is drawn. Logged out (401): forget the reading.
  function pageUser() {
    for (const sc of (document.scripts || [])) { const m = /"current_user_id":"?(\d+)/.exec(sc.textContent || ""); if (m) return Number(m[1]); }
    return null;
  }
  async function whoAmI(cache) {   // cache: the stored reading, already read by the caller
    let id = pageUser();
    if (!id) { try { id = (await getAll("/api/v1/users/self")).id; } catch (e) { await forget(); throw e; } }
    if (cache && cache.user !== id) await forget();
    await ownerIs(id);
    return id;
  }
  // The turma confirmed and the courses taken off the dashboard belong to a Canvas user ("mineOf" says whose the current
  // ones are). Another student on this Chrome starts clean (asked the turma again, nothing hidden) and each one gets
  // theirs back ("byUser"). The look and the mode are the browser's. The first run adopts what is already there.
  let ownerSwapped = false;
  async function ownerIs(id) {
    const { mineOf, prefs, hidden, byUser } = await chrome.storage.local.get(["mineOf", "prefs", "hidden", "byUser"]);
    if (mineOf === id) return;
    if (mineOf == null) { await chrome.storage.local.set({ mineOf: id }); return; }
    const stash = Object.assign({}, byUser && typeof byUser === "object" ? byUser : {}), p = Object.assign({}, prefs);
    stash[mineOf] = { turma: p.turma || null, hidden: Array.isArray(hidden) ? hidden.map(String).slice(0, 200) : [] };
    const mine = stash[id] && typeof stash[id] === "object" ? stash[id] : {};
    if (mine.turma) p.turma = String(mine.turma); else delete p.turma;
    delete stash[id];
    await chrome.storage.local.set({ mineOf: id, byUser: stash, prefs: p, hidden: Array.isArray(mine.hidden) ? mine.hidden.map(String) : [] });
    ownerSwapped = true;
  }
  // Forgetting a student also drops what the service worker holds for them: reminders, the week list, the exam on the icon.
  const forget = async () => {
    await chrome.storage.local.remove(["cache", "search", "teachers", "ccolors", "notified", "shown"]);   // notified/shown hold the last student's grade keys
    try { if (typeof sessionStorage !== "undefined") { sessionStorage.removeItem("cp-sent-remind"); sessionStorage.removeItem("cp-sent-next"); } } catch (e) { /* no storage */ }
    chrome.runtime.sendMessage({ type: "remind", items: [], alarms: false }).catch(() => {});
    chrome.runtime.sendMessage({ type: "next", date: null, label: "" }).catch(() => {});
  };
  // Canvas export + course ids, cached for 10 minutes so moving between pages does not re-read everything. One tab reads at a
  // time: while another tab is reading (lock under a minute old), this one uses the last reading. An older reading of the same
  // user is shown at once and the new one is handed to onFresh when it lands (the page does not wait for Canvas). A reading
  // made by an older version of the extension (same format, collect's data.v) counts as old, never as missing: an update
  // does not leave the panel waiting for a whole new reading.
  async function load(onFresh, pre) {   // pre: { cache, refreshing } read with the prefs (the reading, often large, is read once)
    const got = pre || await chrome.storage.local.get(["cache", "refreshing"]), user = await whoAmI(got.cache);
    const cache = got.cache && got.cache.user === user ? got.cache : null, refreshing = got.refreshing;
    const mine = cache && cache.user === user && cache.data && cache.data.v === 1, now = mine && cache.v === VERSION;
    if (now && Date.now() - cache.at < TTL) return cache;
    if (mine && refreshing && Date.now() - refreshing < LOCK) return cache;
    const known = mine && Array.isArray(cache.data.courses) ? cache.data.courses.map(c => c.id) : [];   // the head start for the assignments (collect.js)
    if (mine && onFresh) { refresh(user, known).then(onFresh, e => oops("atualizar a leitura", e)); return cache; }   // the old reading stays; the failure is kept for the popup
    return refresh(user, known);
  }
  // A planner item kept with only what agenda() reads: the raw Canvas object carries the whole assignment (about a third
  // of the stored reading), copied to every tab on each change and held in memory by each page.
  const slimPlan = p => !p || typeof p !== "object" ? null : { plannable_type: p.plannable_type, plannable_id: p.plannable_id, plannable_date: p.plannable_date,
    plannable: p.plannable ? { title: p.plannable.title } : null, html_url: p.html_url, course_id: p.course_id, context_name: p.context_name,
    submissions: p.submissions ? { submitted: !!p.submissions.submitted, graded: !!p.submissions.graded, excused: !!p.submissions.excused, missing: !!p.submissions.missing } : p.submissions,
    planner_override: p.planner_override ? { marked_complete: !!p.planner_override.marked_complete } : null };
  async function refresh(user, known) {
    await chrome.storage.local.set({ refreshing: Date.now() });
    try {
      const inbox = getAll("/api/v1/conversations?scope=unread&per_page=5", 1).then(list => list.slice(0, 5).map(m => ({ subject: String(m.subject || "(sem assunto)").slice(0, 140),
        from: (Array.isArray(m.participants) ? m.participants : []).filter(x => x && x.name && x.id !== user).map(x => x.name).slice(0, 2).join(", ").slice(0, 80), at: m.last_message_at || null })), () => null);   // unread messages (subject and who), read alongside
      const plan = getAll("/api/v1/planner/items?start_date=" + addDays(-7) + "&end_date=" + addDays(15) + "&per_page=100").catch(() => null);   // the week and the reminders, read alongside the grades
      const got = {}, data = await collectCanvasGrades(got, known);
      if (data.error) {   // a 401 on one request can be "not allowed": the reading is forgotten only when /users/self says logged out
        if (/ 401$/.test(data.error)) { let out = false; try { await getAll("/api/v1/users/self"); } catch (e) { out = / 401$/.test(String(e && e.message)); } if (out) await forget(); }
        throw new Error(data.error);
      }
      if (data.courses.some(c => c.failed)) {   // one course did not answer: its last assignments stay (no false "new" items, no lost grades)
        const { cache: old } = await chrome.storage.local.get("cache");
        for (const c of data.courses) if (c.failed) { const o = old && old.user === user && old.data && Array.isArray(old.data.courses) ? old.data.courses.find(x => x.id === c.id) : null; if (o && Array.isArray(o.assignments)) c.assignments = o.assignments; }
        oops("ler uma matéria", new Error(data.courses.filter(c => c.failed).length + " matéria(s) sem resposta do Canvas"));
      }
      const ids = (got.courses || []).map(c => ({ id: c.id, name: c.name }));
      const planner = await plan, { cache: before, lastError } = await chrome.storage.local.get(["cache", "lastError"]);
      await newGrades(user, data, before);
      await dueMoves(user, data, before);
      const fresh = { v: VERSION, user, at: Date.now(), data, ids, planner: Array.isArray(planner) ? planner.map(slimPlan) : null, inbox: await inbox };
      await chrome.storage.local.set({ cache: fresh, refreshing: 0 });   // one write (every write reaches every tab); 0 = not reading
      if (lastError) await chrome.storage.local.remove("lastError");   // a reading that worked: the old error is over
      // the Centro de Notas of the term's courses, read by the worker behind (the cards repaint when it lands)
      if (EXT) chrome.runtime.sendMessage({ type: "centro", user, ids: (data.courses || []).map(c => c.id) }).catch(() => {});
      return fresh;
    } catch (e) { await chrome.storage.local.set({ refreshing: Date.now() }); throw e; }   // failed (throttled, Canvas down): the lock stays a minute, so each page does not read everything again
  }
  // A course page reads that course's activities again (one request, at most once a minute per course): an activity or a
  // grade that just came out shows now, not at the next full reading. The reading is updated in place, the new grades and
  // moved due dates noticed as a full reading would. Returns the new reading, or null when nothing changed.
  async function freshCourse(courseId) {   // at most once a minute per course across page loads (kept in storage), never during a full reading
    const busy = r => r && Date.now() - r < LOCK, { freshAt, refreshing } = await chrome.storage.local.get(["freshAt", "refreshing"]), fa = freshAt && typeof freshAt === "object" ? freshAt : {};
    if (busy(refreshing) || Date.now() - (Number(fa[courseId]) || 0) < 60000) return null;
    await chrome.storage.local.set({ freshAt: Object.assign(Object.fromEntries(Object.entries(fa).filter(([, t]) => Date.now() - t < 60000)), { [courseId]: Date.now() }) });
    let as; try { as = await getAll(canvasAsgUrl(encodeURIComponent(courseId))); } catch (e) { return null; }
    const { cache: old } = await chrome.storage.local.get("cache"), cv = old && old.data && Array.isArray(old.data.courses) ? old.data.courses.find(x => String(x.id) === String(courseId)) : null;
    if (!cv || !Array.isArray(as)) return null;
    const next = as.filter(x => x && typeof x.name === "string").map(canvasAsg);
    if (JSON.stringify(next) === JSON.stringify(cv.assignments)) return null;
    const data = Object.assign({}, old.data, { courses: old.data.courses.map(x => x === cv ? Object.assign({}, cv, { assignments: next }) : x) }), fresh = Object.assign({}, old, { data, rev: (Number(old.rev) || 0) + 1 });
    const now = await chrome.storage.local.get(["cache", "refreshing"]);   // a full reading started or landed meanwhile: it wins (never write an older reading over it)
    if (busy(now.refreshing) || !now.cache || now.cache.at !== old.at || now.cache.rev !== old.rev || now.cache.user !== old.user) return null;
    await newGrades(old.user, data, old); await dueMoves(old.user, data, old);
    const last = await chrome.storage.local.get("cache"); if (!last.cache || last.cache.at !== old.at || last.cache.rev !== old.rev) return null;
    await chrome.storage.local.set({ cache: fresh }); return fresh;
  }
  // Ticked as done, per Canvas user: { <user>: { <planner key>: <due day> } } in chrome.storage.local "marks"; kept 30 days.
  async function myMarks(user) {
    const { marks } = await chrome.storage.local.get("marks");
    const mine = marks && typeof marks === "object" ? marks[user] : null;
    return mine && typeof mine === "object" ? mine : {};
  }
  let markQ = Promise.resolve();   // one write at a time, so two quick ticks do not overwrite each other
  const setMark = (user, x, on) => (markQ = markQ.catch(() => {}).then(() => writeMark(user, x, on)));
  async function writeMark(user, x, on) {
    const { marks } = await chrome.storage.local.get("marks"), all = marks && typeof marks === "object" ? marks : {}, old = addDays(-30);
    const mine = Object.assign({}, all[user]);
    if (on) mine[x.key] = x.date; else delete mine[x.key];
    for (const k of Object.keys(mine)) if (!(mine[k] >= old)) delete mine[k];
    await chrome.storage.local.set({ marks: Object.assign({}, all, { [user]: mine }) });
    return mine;
  }
  // New grades: what got a score (or a different one) since the last reading of this user. The first reading only sets the
  // baseline. Kept in "recent" per user (20 newest, 30 days) for the dashboard; the service worker shows a notification.
  const gradeKey = (c, x) => c.id + ":" + x.name;
  async function newGrades(user, data, old0) {
    const { cache: oldRead, recent, prefs } = await chrome.storage.local.get(old0 ? ["recent", "prefs"] : ["cache", "recent", "prefs"]), old = old0 || oldRead;   // the reading before this one, when the caller has it
    if (!old || old.user !== user || !old.data || !Array.isArray(old.data.courses)) return;
    const before = {};
    for (const c of old.data.courses) for (const x of c.assignments || []) before[gradeKey(c, x)] = x.score;
    const now = Date.now(), got = [];
    for (const c of data.courses) for (const x of c.assignments)
      if (typeof x.score === "number" && before[gradeKey(c, x)] !== x.score && gradeKey(c, x) in before)
        got.push({ k: gradeKey(c, x), course: shortName(c.name), courseId: c.id, name: String(x.name), score: x.score, points: x.points, url: x.url && inCanvas(x.url), at: now });
    if (!got.length) return;
    const all = recent && typeof recent === "object" ? recent : {}, mine = (Array.isArray(all[user]) ? all[user] : []).filter(r => r && now - r.at < 30 * 864e5 && !got.some(g => g.k === r.k));
    await chrome.storage.local.set({ recent: Object.assign({}, all, { [user]: got.concat(mine).slice(0, 20) }) });
    if (cpPrefs(prefs).newgrades) chrome.runtime.sendMessage({ type: "grades", items: got.slice(0, 10) }).catch(() => {});
  }
  // Prazo mudou: an assignment whose due date changed since the last reading (both dates known, one still ahead). Goes to
  // "Desde a sua última visita" and, with the reminders on, to a notification. The first reading only sets the baseline.
  const dueText = iso => { const d = new Date(iso); return C.localISO(d).slice(8, 10) + "/" + C.localISO(d).slice(5, 7) + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  async function dueMoves(user, data, old) {
    if (!old || old.user !== user || !old.data || !Array.isArray(old.data.courses)) return;
    const before = {}, now = Date.now(), moved = [];
    for (const c of old.data.courses) for (const x of c.assignments || []) before[gradeKey(c, x)] = x.due;
    for (const c of data.courses) for (const x of c.assignments || []) { const was = before[gradeKey(c, x)], t0 = Date.parse(was), t1 = Date.parse(x.due);
      if (!Number.isFinite(t0) || !Number.isFinite(t1) || Math.abs(t1 - t0) < 60e3 || Math.max(t0, t1) < now) continue;
      moved.push({ k: "d:" + gradeKey(c, x) + ":" + x.due, course: shortName(c.name), name: String(x.name), from: dueText(was), to: dueText(x.due), url: x.url && inCanvas(x.url) }); }
    if (!moved.length) return;
    const cur = await loadChanges(user), items = moved.map(m => ({ k: m.k, kind: "prazo", text: m.name + ": " + m.from + " → " + m.to, course: m.course, url: m.url, at: now }));
    await saveChanges(user, { seenAt: cur.seenAt, items: items.concat(cur.items.filter(x => now - x.at < 7 * 864e5 && !items.some(n => n.k === x.k))).slice(0, 40) });
    const { prefs } = await chrome.storage.local.get("prefs");
    if (cpPrefs(prefs).remind) chrome.runtime.sendMessage({ type: "due", items: moved.slice(0, 10) }).catch(() => {});
  }
  // Copiar: a button at the end of an assignment's, a page's or a discussion's text; copies the title, the dates and the text
  // with its images inside the copy (Canvas images need the student's session, so they go as data), to paste in Docs or Word
  const COPY_SEL = "#assignment_show .description.user_content, .show-content.user_content, .discussion-section .message.user_content, [data-resource-type='discussion_topic.body'] .user_content, #content .user_content.enhanced, #content .user_content";
  function copyButton() {
    const body = document.querySelector(COPY_SEL);
    if (!body || document.getElementById("cp-copy")) return;
    const host = el("div"), root = host.attachShadow({ mode: "closed" }), b = el("button", null, "Copiar texto e imagens"), st = el("style");
    host.id = "cp-copy";
    st.textContent = ":host { display:block; margin:14px 0 6px; } button { font:600 13px/1 system-ui, sans-serif; padding:9px 14px; border-radius:9px; border:1px solid #c9c2b4; background:#fffdf8; color:#2a2a2a; cursor:pointer; } button:hover { border-color:#e2685a; } button.ok { border-color:#3c8a5a; color:#2d6b45; }";
    b.type = "button"; b.title = "Copia o título, as datas e o texto, com as imagens, para colar no Docs, no Word ou no Notion";
    b.addEventListener("click", () => {
      const wrap = document.createElement("div"), h = document.querySelector("h1.title, .page-title, h1.discussion-title, h1"), meta = document.querySelector("#assignment_show .student-assignment-overview");
      wrap.appendChild(el("h2", null, String((h && h.textContent) || document.title).trim()));
      if (meta) wrap.appendChild(meta.cloneNode(true));
      wrap.appendChild(body.cloneNode(true));
      for (const x of wrap.querySelectorAll("script, style, iframe, button, input, .screenreader-only, #cp-copy")) x.remove();
      const text = [wrap.firstChild.textContent, meta ? meta.innerText : "", body.innerText].filter(Boolean).join("\n\n");
      const html = (async () => {
        for (const img of [...wrap.querySelectorAll("img")].slice(0, 30)) {
          let u; try { u = new URL(img.getAttribute("src") || "", location.href); } catch (e) { continue; }
          img.removeAttribute("srcset");
          if (u.origin !== location.origin) { img.setAttribute("src", u.href); continue; }   // outside Canvas: the link as it is
          try { const f = /\/files\/(\d+)/.exec(u.pathname);   // a Canvas file: its preview redirects to a CDN that refuses the page; the API's download link works
            const src = f ? (await (await fetch("/api/v1/files/" + f[1], { credentials: "include" })).json()).url : u.href;
            if (typeof src !== "string" || new URL(src, location.href).origin !== location.origin) { img.setAttribute("src", u.href); continue; }
            const r = await fetch(src, { credentials: "include" }), bl = await r.blob(); if (!r.ok || !/^image\//.test(bl.type) || bl.size > 5e6) { img.setAttribute("src", u.href); continue; }
            img.setAttribute("src", await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(bl); })); } catch (e) { img.setAttribute("src", u.href); }
        }
        for (const a of wrap.querySelectorAll("a[href]")) { try { a.setAttribute("href", new URL(a.getAttribute("href"), location.href).href); } catch (e) { a.removeAttribute("href"); } }
        return new Blob([new XMLSerializer().serializeToString(wrap)], { type: "text/html" }); })();
      b.textContent = "Copiando…";
      navigator.clipboard.write([new ClipboardItem({ "text/html": html, "text/plain": new Blob([text], { type: "text/plain" }) })])
        .then(() => { b.textContent = "Copiado ✓ (cole no Docs, no Word ou no Notion)"; b.className = "ok"; }, () => { b.textContent = "Não deu para copiar: clique de novo"; b.className = ""; });
    });
    root.append(st, b); body.after(host);
  }
  const pts = n => typeof n === "number" ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "?";
  // Grades typed by the student where Canvas has none (exams on paper, a grade not posted yet): chrome.storage.local "hand",
  // per Canvas user, { "<subject>:<item>": "8,5" }. Moved once from the old Caderno+ page by the popup.
  async function myHand(user) { const { hand } = await chrome.storage.local.get("hand"); const h = hand && typeof hand === "object" ? hand[user] : null; return h && typeof h === "object" ? h : {}; }
  async function setHand(user, changes) {
    const { hand } = await chrome.storage.local.get("hand"), all = hand && typeof hand === "object" ? hand : {}, mine = Object.assign({}, all[user]);
    for (const [k, v] of Object.entries(changes)) if (v == null || v === "") delete mine[k]; else mine[k] = String(v);
    await chrome.storage.local.set({ hand: Object.assign({}, all, { [user]: mine }) }); return mine;
  }
  // Own tasks (not from Canvas), per Canvas user in chrome.storage.local "tasks": [{ id, title, date|null }]; done = a tick.
  let myTasks = [];
  // The Centro de Notas read by the worker, per Canvas user ("centro": { user, at, courses: { <course id>: curso | null } }).
  let myCentro = {}, centroSnoozed = false;   // "Agora não" on the Centro offer: hidden for a week (centroSnooze)
  let centroOff = false;   // the worker could not read the Centro de Notas: its permission was never granted (centro.html grants it)
  async function loadCentro(user) { const { centro, centroOff: off, centroSnooze } = await chrome.storage.local.get(["centro", "centroOff", "centroSnooze"]); centroOff = !!off; centroSnoozed = Number(centroSnooze) > Date.now(); myCentro = centro && centro.user === user && centro.courses && typeof centro.courses === "object" ? centro.courses : {}; return myCentro; }
  // Grades the student entered ("Minhas notas") where Canvas has none, in a course without our rules: chrome.storage.local
  // "myGrades"[user][course][id] on 0-10, id = the Centro column or the Canvas activity key. They count like a grade read
  // from Canvas everywhere (course page, dashboard); "Simular" never writes here (centroSim).
  let myGrades = {};
  async function loadGrades(user) { const { myGrades: all } = await chrome.storage.local.get("myGrades"), m = all && typeof all === "object" ? all[user] : null; myGrades = m && typeof m === "object" ? m : {}; return myGrades; }
  async function setGrades(user, course, g) { const { myGrades: all } = await chrome.storage.local.get("myGrades"), base = all && typeof all === "object" ? all : {}, mine = Object.assign({}, base[user]);
    if (g && Object.keys(g).length) mine[course] = Object.assign({}, g); else delete mine[course];
    myGrades = mine; await chrome.storage.local.set({ myGrades: Object.assign({}, base, { [user]: mine }) }); }
  let gtMode = "sim";   // the grade card's mode last chosen (chrome.storage.local "gtMode"), Simular or Minhas notas
  chrome.storage.local.get("gtMode").then(({ gtMode: m }) => { if (m === "mine" || m === "sim") gtMode = m; }).catch(() => {});
  const gradesOf = id => { const g = myGrades[id]; return g && typeof g === "object" ? Object.fromEntries(Object.entries(g).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Math.min(10, Math.max(0, Number(v)))])) : {}; };
  // quanto falta from the professor's formula in the Centro de Notas, for a course without our rules; null without a formula
  const centroOf = id => { const mg = gradesOf(id), r = myCentro[id] ? C.centro(myCentro[id], T, Object.keys(mg).length ? { grades: mg, rest: 0 } : undefined) : null; return r && ["garantido", "precisa", "nao-da"].includes(r.status) ? r : null; };   // sem-formula and incompleto: no number
  // The student's own rule (C.custom) for a course with neither our rules nor a formula in the Centro de Notas: per Canvas
  // user, per course, in chrome.storage.local "myRules": { <user>: { <course id>: { off: [item keys], total } } }.
  // Without a saved rule every graded item counts, up to 10: the student unticks what is not graded.
  let myRules = {}, rulesUser = null;
  async function loadRules(user) { const { myRules: all } = await chrome.storage.local.get("myRules"); rulesUser = user; myRules = all && typeof all === "object" && all[user] && typeof all[user] === "object" ? all[user] : {}; return myRules; }
  async function saveRule(user, courseId, rule) {
    const { myRules: all } = await chrome.storage.local.get("myRules"), base = all && typeof all === "object" ? all : {};
    if (rule && rule.merge) { const stored = base[user] && base[user][courseId]; rule = Object.assign({}, stored, rule); delete rule.merge; }   // a change onto the rule as stored now
    const parts = {}, part = {};
    for (const k of ["A", "B", "C"]) { const x = rule.parts && rule.parts[k]; if (x && Number(x.w) > 0) parts[k] = Object.assign({ w: Math.min(100, Number(x.w)) }, Number(x.top) > 0 ? { top: Math.min(1000, Number(x.top)) } : {}); }
    for (const [key, k] of Object.entries(rule.part || {}).slice(0, 300)) if (/^[ABC]$/.test(k)) part[String(key).slice(0, 300)] = k;
    const mine = Object.assign({}, base[user], { [courseId]: Object.assign({ off: [...new Set((rule.off || []).map(String))].slice(0, 300), total: Number(rule.total) > 0 ? Math.min(1000, Number(rule.total)) : 10 }, Object.keys(parts).length ? { parts, part } : {}, rule.own ? { own: true } : {}, typeof rule.formula === "string" && rule.formula.trim() ? { formula: rule.formula.slice(0, 4000) } : {}) });
    myRules = mine; await chrome.storage.local.set({ myRules: Object.assign({}, base, { [user]: mine }) });
  }
  let ruleCache = null;   // the reading the items come from (set where the panels are drawn)
  const ruleItems = courseId => { const cv = ruleCache && ruleCache.data && ruleCache.data.courses.find(x => String(x.id) === String(courseId));
    const mg = gradesOf(courseId);
    // a grade Canvas posts as worth 0 points (CSCF's "AS01 - NOTAS"): the scale the rules pack gives it ("pts")
    const pk = C.COURSES.find(c => C.CANVAS[c.id] && C.CANVAS[c.id].cids.map(String).includes(String(courseId))), scales = pk ? Object.values(C.CANVAS[pk.id].items || {}).filter(r => r.one && r.pts > 0) : [];
    const ptsOf = x => Number(x.points) > 0 ? Number(x.points) : (scales.find(r => String(x.name).includes(r.one)) || {}).pts || 0;
    // a grade of the formula not in Canvas yet that the student typed ("Minhas notas", key "-<name>", on 0-10): an activity
    // of 10 points, until Canvas has one with that name (then Canvas's own counts)
    const typed = (list) => list.concat(Object.entries(mg).filter(([k]) => k[0] === "-" && k.length > 1 && !list.some(x => { const a = foldRef(x.name), n = foldRef(k.slice(1)); return a === n || (" " + a + " ").includes(" " + n + " "); }))
      .map(([k, v]) => ({ key: k, name: k.slice(1), points: 10, score: v, canvasScore: null, mine: true, typed: true })));
    return !cv ? [] : typed(cv.assignments.filter(x => x && ptsOf(x) > 0).map(x => { const key = String(x.url || x.name).slice(0, 300), mine = x.score == null && mg[key] != null ? mg[key] * ptsOf(x) / 10 : null;
      return Object.assign({ key, name: x.name, points: ptsOf(x), score: x.score == null ? mine : x.score, canvasScore: x.score == null ? null : x.score, mine: mine != null, due: x.due, group: x.group }, x.excused ? { excused: true } : {}); })); };   // excused: kept, flagged (the formula leaves it out, as Canvas does)
  // The professor's weights set in Canvas itself (weighted assignment groups): a rule made of them, official, used when the
  // student has not written one. Up to five groups (A-E); each group is its activities' points.
  const canvasWeightsRule = courseId => { const cv = ruleCache && ruleCache.data && ruleCache.data.courses.find(x => String(x.id) === String(courseId));
    const ws = cv && Array.isArray(cv.weights) ? cv.weights.slice(0, 5) : []; if (!ws.length) return null;
    const parts = {}, part = {}, L = "ABCDE"; ws.forEach((g, i) => { parts[L[i]] = { w: g.w }; });
    for (const x of ruleItems(courseId)) { const i = ws.findIndex(g => String(g.id) === String(x.group)); if (i >= 0) part[x.key] = L[i]; }
    return { parts, part, official: true, names: Object.fromEntries(ws.map((g, i) => [L[i], g.name])) }; };
  // Until the student confirms the rule (any change saves it), no "garantido" or "recuperação": the sum may miss items
  // that are not in Canvas yet, or count extras
  const customOf = courseId => { const items = ruleItems(courseId); if (!items.length) return null; const cw = myRules[courseId] ? null : canvasWeightsRule(courseId);
    const r = C.custom(items, myRules[courseId] || cw, T); if (r.status === "vazio" && !r.parts) return null;
    const mine = !!myRules[courseId]; return Object.assign(r, { mine, canvasWeights: !!cw, unsure: !mine && !cw && (r.status === "garantido" || r.status === "nao-da") }); };   // Canvas's own weights are not a guess
  const customPill = r => r.status === "acima" || r.unsure ? "confira" : r.status === "precisa" ? up(r.need, 1) : r.status === "garantido" ? "ok" : "rec.";
  // The formula the editor starts from: the professor's in the Centro de Notas (its tree written out), else the Plano de
  // Ensino weights Caderno+ has for the course, else the sum of the Canvas points. { text, from }.
  const shortName2 = n => String(n || "").split(/[:(,;+=#]/)[0].replace(/\s+/g, " ").trim().slice(0, 60);   // an activity's name, short enough for a formula
  // The shortest start of each activity's name (whole " - " pieces) that finds that activity alone, the way the formula reads
  // a name (the same words, or the whole name): "Aula 4 - TAREFA SOMATIVA ENTREGA - A justiça…" is "Aula 4".
  const foldRef = x => String(x == null ? "" : x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const shortRefs = (items, taken = []) => { const names = items.map(i => foldRef(i.name)), out = new Map(), used = new Set(taken.map(foldRef));
    const hits = k => names.filter(n => n === k || (" " + n + " ").includes(" " + k + " ")).length;
    for (const it of items) { const full = shortName2(it.name), segs = full.split(/\s+[-–—|]\s+/); let pick = full;
      for (let i = 1; i < segs.length; i++) { const cand = segs.slice(0, i).join(" - "), k = foldRef(cand); if (/[a-z]/.test(k) && k.length > 1 && !used.has(k) && hits(k) === 1) { pick = cand; break; } }
      used.add(foldRef(pick)); out.set(it.name, pick); }
    return out; };
  function startFormula(courseId, items, shortRef = shortName2) {
    const nm = x => shortRef(x) || "Parte", pct = x => String(Math.round(x * 100) / 100).replace(".", ",") + "%";
    const cu = myCentro[courseId], cr = cu ? C.centro(cu, T) : null;
    if (cu && cr && cr.status !== "sem-formula") {
      const cols = new Map(); for (const g of cu.grupos || []) for (const gc of (g && g.grupo_colunas) || []) if (gc && gc.coluna) cols.set(gc.coluna.id_coluna, gc.coluna);
      for (const c of cu.colunas || []) cols.set(c.id_coluna, c);
      const final = (cu.colunas || []).find(c => c && c.tipo_coluna === "final"), lines = [], seen = new Set();
      const write = (col, name) => { if (!col || seen.has(col.id_coluna) || lines.length > 30) return; seen.add(col.id_coluna);
        const kids = (col.colunas_associadas_pai || []).map(k => ({ col: cols.get(k.id_coluna) || { id_coluna: k.id_coluna, nome_coluna: "Parte " + k.id_coluna }, w: k.pivot && Number(k.pivot.peso_coluna_filho) })).filter(k => k.col);
        if (!kids.length) return; const names = kids.map(k => nm(k.col.nome_coluna)), calc = col.tipo_calculo;
        if (calc === "maximo" || calc === "minimo") lines.push("# " + name + ": no Centro é o " + (calc === "maximo" ? "maior" : "menor") + " deles (recuperação)");   // a comment is a line of its own (inside a line it would be read as a name)
        lines.push(name + " = " + (calc === "media_ponderada" ? kids.map((k, i) => pct(k.w || 0) + " " + names[i]).join(" + ") : (calc === "total" ? "soma(" : "média(") + names.join(", ") + ")"));
        kids.forEach((k, i) => { if ((k.col.colunas_associadas_pai || []).length) write(k.col, names[i]); }); };
      if (final) { write(final, "Final"); if (lines.length) return { text: lines.join("\n"), from: "da fórmula do professor no Centro de Notas" }; }
    }
    // the professor's weights set in Canvas (weighted assignment groups): one line per group, its activities added up (as Canvas does)
    const cw = canvasWeightsRule(courseId);
    if (cw) { const acts = items.filter(x => x && x.name), fold = x => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(), used = new Set(acts.map(x => fold(nm(x.name)))), terms = [], extra = [];
      const gname = L => { const full = nm(cw.names[L] || "Parte " + L), first = full.split(/\s+[-–—|]\s+/)[0]; return /[a-z]/i.test(first) && first.length > 1 ? first : full; };   // "RA1 - ATIVIDADES SOMATIVAS" is "RA1"
      const groups = Object.keys(cw.parts).filter(L => acts.filter(x => cw.part[x.key] === L).length > 1).map(gname), refs = shortRefs(acts, groups), ref = x => refs.get(x.name) || nm(x.name);
      for (const [L, g] of Object.entries(cw.parts)) { const mine = acts.filter(x => cw.part[x.key] === L); if (!mine.length) continue;
        if (mine.length === 1) { terms.push(pct(g.w) + " " + ref(mine[0])); continue; }   // one activity: the group is that activity
        let name = gname(L); if (used.has(fold(name)) || [...refs.values()].some(r => fold(r) === fold(name))) name = "Grupo " + L; used.add(fold(name));   // never the name of an activity (it would point at itself)
        terms.push(pct(g.w) + " " + name); extra.push(name + " = soma(" + mine.map(ref).join(", ") + ")"); }
      if (terms.length) return { text: ["Final = " + terms.join(" + ")].concat(extra).join("\n"), from: "dos pesos que o professor pôs no Canvas" };
    }
    // the Plano de Ensino by RA, written in the rules pack (rules/<term>/*.json "plan"): after the professor's Centro formula
    // and Canvas weights (AGENTS.md §5), before the RA groups (the Plano says what each grade is worth)
    const planned = C.COURSES.find(x => x.plan && C.CANVAS[x.id] && C.CANVAS[x.id].cids.map(String).includes(String(courseId)));
    if (planned) return { text: planned.plan, from: (/soma\(/.test(planned.plan) ? "do Plano de Ensino por RA, com as notas do Canvas já em pontos da final (" : "dos pesos do Plano de Ensino, por RA (") + planned.src + ")" };
    // the assignment groups the professor named by RA in Canvas: one line per RA with its activities. When their points add up
    // to 10, the grades are already points of the final (each RA adds them up); else the RAs weigh by their points so far
    const cvR = ruleCache && ruleCache.data && ruleCache.data.courses.find(x => String(x.id) === String(courseId)), ras = cvR && Array.isArray(cvR.ras) ? cvR.ras : [];
    if (ras.length > 1) { const seen = new Map();
      const gs0 = ras.map(g => { const n = ((/^\s*(RA\s*\d+(?:\s*(?:e|,|\/|&)\s*RA\s*\d+)*)/i.exec(g.name) || [])[1] || "").match(/\d+/g).map(d => "RA" + d).join(" e "), acts = items.filter(x => String(x.group) === String(g.id)); return { name: n, acts, pts: acts.reduce((t, x) => t + Number(x.points || 0), 0) }; })
        .filter(g => g.acts.length);
      for (const g of gs0) { const o = seen.get(g.name); if (o) { o.acts = o.acts.concat(g.acts); o.pts += g.pts; } else seen.set(g.name, g); }   // "RA1 - Provas" and "RA1 - Trabalhos": one RA1
      const gs = [...seen.values()], refs = shortRefs(items, gs.map(g => g.name));   // never an activity named like a RA (it would point at itself)
      const tot = gs.reduce((t, g) => t + g.pts, 0), w2 = x => String(Math.round(x * 100) / 100).replace(".", ",");
      if (gs.length > 1 && tot > 0) { const ten = Math.abs(tot - 10) < 0.011, list = g => g.acts.map(x => refs.get(x.name) || nm(x.name)).join(", ");
        return { text: ["Final = " + gs.map(g => pct(ten ? g.pts * 10 : g.pts / tot * 100) + " " + g.name).join(" + ")].concat(gs.map(g => g.name + " = soma(" + list(g) + ")" + (ten ? " de " + w2(g.pts) : ""))).join("\n"),
          from: ten ? "dos grupos RA do Canvas: as notas já somam os 10 pontos da final" : "dos grupos RA do Canvas (o peso de cada RA saiu dos pontos lançados até agora: confira no Plano de Ensino)" }; }
    }
    const pack = C.COURSES.find(x => C.CANVAS[x.id] && C.CANVAS[x.id].cids.map(String).includes(String(courseId)));
    if (pack) {
      const map = C.CANVAS[pack.id].items || {}, extra = [];
      const refs = pack.items.map(it => { const m = map[it.id] || {}; let ref = nm(it.name.replace(/\s*·\s*/g, " "));   // an item with no Canvas activity keeps its full name (it shows as not in Canvas yet)
        if (m.one) ref = nm(m.one);
        else if (m.avg || m.sum) { ref = nm(it.name.replace(/^RA\d+\s*·\s*/, "")); extra.push(ref + " = " + (m.sum ? "soma(" : "média(") + (m.avg || m.sum).map(nm).join(", ") + ")" + (m.sum && !(m.factor && m.factor !== 1) ? " de " + String(it.inMax).replace(".", ",") : "")); }
        return ref; });
      const raOf = it => (/^RA(\d)\s*·/.exec(it.name) || [])[1], gs = [...new Set(pack.items.map(raOf))];
      if (gs.length > 1 && pack.items.every(raOf)) {   // one line per RA, as the Plano writes it: the RA's weight, then each grade's share of it
        const tot = g => pack.items.filter(i => raOf(i) === g).reduce((t, i) => t + i.max, 0);
        return { text: ["Final = " + gs.map(g => pct(tot(g) * 10) + " RA" + g).join(" + ")].concat(gs.map(g => "RA" + g + " = " + pack.items.map((it, j) => [it, j]).filter(([it]) => raOf(it) === g).map(([it, j]) => pct(it.max / tot(g) * 100) + " " + refs[j]).join(" + ")), extra).join("\n"), from: "dos pesos do Plano de Ensino que o Caderno+ tem" }; }
      return { text: ["Final = " + pack.items.map((it, j) => pct(it.max * 10) + " " + refs[j]).join(" + ")].concat(extra).join("\n"), from: "dos pesos do Plano de Ensino que o Caderno+ tem" };
    }
    const total = items.reduce((t, i) => t + Number(i.points || 0), 0);
    const refs = shortRefs(items.slice(0, 12));
    return { text: "Final = soma(" + items.slice(0, 12).map(i => refs.get(i.name) || nm(i.name)).join(", ") + ") de " + String(Math.max(10, Math.round(total * 100) / 100)).replace(".", ","), from: "da soma dos pontos do Canvas" };
  }
  const customText = r => r.status === "garantido" ? "meta garantida" : r.status === "nao-da" ? "nem com 10 no que falta" : "precisa " + up(r.need, 1) + "/10 em média no que falta";
  // the offer to read the Centro de Notas, on the dashboard and on a course page, while its permission is missing
  const centroOffer = () => { const b = el("div", "card centro-ask"), go = el("button", "primary", "Usar a fórmula do professor ↗"), no = el("button", "", "Agora não"), acts = el("div", "acts");
    b.append(el("div", "mid", "Quer o quanto falta com a fórmula exata do seu professor? O Caderno+ só lê o Centro de Notas da PUCPR."), acts); acts.append(no, go);
    go.type = no.type = "button"; go.addEventListener("click", () => chrome.runtime.sendMessage({ type: "centroAsk" }).catch(() => {}));
    no.addEventListener("click", () => { chrome.storage.local.set({ centroSnooze: Date.now() + 7 * 864e5 }).catch(() => {}); centroSnoozed = true; b.remove(); });   // asked again in a week, never on every page
    return b; };
  const centroTone = r => r.status === "garantido" ? "ok" : r.status === "nao-da" ? "bad" : r.need > 8 ? "bad" : "warn";
  // Checklists (Anotações): per Canvas user, per course id or "painel" (the dashboard's own), items { id, t, done, date? };
  // the dated ones join the week like Minhas tarefas. chrome.storage.local "checks"; 50 items of 200 chars per list.
  let myChecks = {};
  async function loadChecks(user) {
    const { checks } = await chrome.storage.local.get("checks"), mine = checks && typeof checks === "object" ? checks[user] : null, out = {};
    if (mine && typeof mine === "object") for (const k of Object.keys(mine)) if (Array.isArray(mine[k])) out[k] = mine[k].filter(x => x && x.id && typeof x.t === "string");
    myChecks = out; return out;
  }
  let checkQ = Promise.resolve();   // one write at a time (a tick in the week and one in the list)
  const editChecks = (user, key, f) => (checkQ = checkQ.catch(() => {}).then(async () => {
    const { checks } = await chrome.storage.local.get("checks"), all = checks && typeof checks === "object" ? checks : {}, mine = Object.assign({}, all[user]);
    const next = f(Array.isArray(mine[key]) ? mine[key].filter(x => x && x.id && typeof x.t === "string") : []).slice(0, 50);
    if (next.length) mine[key] = next; else delete mine[key];
    await chrome.storage.local.set({ checks: Object.assign({}, all, { [user]: mine }) }); await loadChecks(user); return next;
  }));
  // a tick from the week or a course's A seguir: checklist items change their own list, the rest go to the marks
  async function tick(user, x, on) {
    if (!x.chk) return setMark(user, x, on);
    await editChecks(user, x.chk[0], l => l.map(y => y.id === x.chk[1] ? Object.assign({}, y, { done: on }) : y));
    return myMarks(user);
  }
  // Anotações: a note and a checklist for one key (a course id, or "painel" on the dashboard), only on this computer
  // (chrome.storage.local "notes" and "checks", per Canvas user), saved as you type. onChange: a checklist edit (the week).
  function notesBlock(cache, key, hasNote, onChange) {
    const pad = el("div", "card notes"), ta = el("textarea"), saved = el("div", "muted", "");
    ta.setAttribute("aria-label", key === "painel" ? "Minhas anotações" : "Anotações desta matéria"); ta.placeholder = "Lembretes, links, o que cai na prova… (fica só neste computador)"; ta.maxLength = 5000;
    pad.append(ta, saved);
    let tm = 0, typed = 0;
    const store = async () => { try {
      const { notes } = await chrome.storage.local.get("notes"), all = notes && typeof notes === "object" ? notes : {}, mine = Object.assign({}, all[cache.user]);
      const v = String(ta.value || "").slice(0, 5000); if (v) mine[key] = v; else delete mine[key];
      await chrome.storage.local.set({ notes: Object.assign({}, all, { [cache.user]: mine }) }); saved.textContent = "Salvo neste computador";
    } catch (e) { saved.textContent = "Não salvou (a extensão foi atualizada?): copie o texto e recarregue a página."; } };   // never a silent loss
    ta.addEventListener("input", () => { typed = Date.now(); saved.textContent = ""; clearTimeout(tm); tm = setTimeout(store, 400); });
    chrome.storage.local.get("notes").then(({ notes }) => {
      const v = notes && notes[cache.user] && notes[cache.user][key];
      if (typeof v === "string" && v) { ta.value = v; if (hasNote) hasNote(); }
    });
    // the checklist: with a day, the item shows in the dashboard's 7 days (and its reminders)
    const chk = el("div", "card notes chk"), form = el("form", "add"), cin = el("input"), din = el("input"), add = el("button", "primary", "Adicionar"), ul = el("ul");
    cin.type = "text"; cin.placeholder = "Novo item (ex.: refazer a lista 3)"; cin.setAttribute("aria-label", "Novo item do checklist"); cin.maxLength = 200;
    din.type = "date"; din.setAttribute("aria-label", "Dia (opcional: aparece nos próximos 7 dias)"); din.title = "Com dia, aparece nos próximos 7 dias do painel"; add.type = "submit";
    form.append(cin, din, add); chk.append(el("h3", null, key === "painel" ? "Meu checklist" : "Checklist da matéria"), form, ul);
    const edit = async f => { await editChecks(cache.user, key, f); draw(); if (onChange) onChange(); };
    const draw = () => {
      const items = myChecks[key] || []; ul.replaceChildren();
      if (!items.length) { ul.appendChild(el("li", "muted", "Nada ainda. Com dia, o item aparece nos próximos 7 dias do painel.")); return; }
      for (const x of items.slice().sort((p, q) => (!!p.done - !!q.done) || String(p.date || "9").localeCompare(String(q.date || "9")))) {
        const li = el("li", "row" + (x.done ? " dn" : "")), end = el("span", "end"), ck = el("button", "ck", "✓"), del = el("button", "ck del", "×");
        ck.type = del.type = "button"; ck.setAttribute("aria-pressed", String(!!x.done)); ck.setAttribute("aria-label", (x.done ? "Desmarcar: " : "Marcar: ") + x.t); del.setAttribute("aria-label", "Apagar: " + x.t);
        ck.addEventListener("click", () => edit(l => l.map(y => y.id === x.id ? Object.assign({}, y, { done: !y.done }) : y)));
        del.addEventListener("click", () => edit(l => l.filter(y => y.id !== x.id)));
        end.append(ck, del); li.append(el("span", "d", x.date ? cap(dayLabel(x.date)) : "sem dia"), el("span", "n", x.t), end); ul.appendChild(li);
      }
    };
    form.addEventListener("submit", e => { e.preventDefault(); const t = String(cin.value || "").trim().slice(0, 200); if (!t) return;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(din.value || "") ? din.value : null; cin.value = ""; din.value = "";
      edit(l => l.concat(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t, done: false }, date ? { date } : {}))); });
    cin.addEventListener("input", () => { typed = Date.now(); });   // no redraw under the student's typing
    loadChecks(cache.user).then(draw);
    watchStore(ch => {   // ticked in the week, or changed in another tab
      if (gone(ul)) return false;
      if (ch.checks) loadChecks(cache.user).then(draw);
      const v = ch.notes && ch.notes.newValue && ch.notes.newValue[cache.user] && ch.notes.newValue[cache.user][key];
      if (ch.notes && Date.now() - typed > 3000 && (ta.getRootNode ? ta.getRootNode().activeElement !== ta : true)) ta.value = typeof v === "string" ? v : "";   // never under the student's typing
    });
    return { nodes: [pad, chk], ta, busy: () => Date.now() - typed < 30000 };
  }
  // Our panels' shadow roots are closed (page scripts cannot read the notes); the root stays on the host for our own code,
  // in the extension's isolated world, which the page never sees.
  const shadow = host => { const r = host.attachShadow({ mode: "closed" }); host.cpRoot = r; return r; };
  // One chrome.storage listener per page for the blocks drawn on it; a block that left the page returns false and is dropped.
  const onStore = new Set(); let storeHooked = false;
  function watchStore(f) {
    onStore.add(f);
    if (storeHooked || !chrome.storage.onChanged) return; storeHooked = true;
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local") for (const g of [...onStore]) if (g(ch) === false) onStore.delete(g); });
  }
  const gone = n => n.isConnected === false;
  async function loadTasks(user) { const { tasks } = await chrome.storage.local.get("tasks"); const l = tasks && typeof tasks === "object" ? tasks[user] : null; myTasks = Array.isArray(l) ? l.filter(t => t && t.id && t.title) : []; return myTasks; }
  // f: the change, applied to what is stored now (another tab may have added a task since this page loaded)
  async function saveTasks(user, f) {
    const { tasks } = await chrome.storage.local.get("tasks"), all = tasks && typeof tasks === "object" ? tasks : {};
    const cur = Array.isArray(all[user]) ? all[user].filter(t => t && t.id && t.title) : [];
    myTasks = f(cur).slice(0, 100); await chrome.storage.local.set({ tasks: Object.assign({}, all, { [user]: myTasks }) });
  }
  const addTask = (user, title, date) => saveTasks(user, l => l.concat([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(title).trim().slice(0, 140), date: date || null }]));
  // "estudar cap 5 sex" -> title + the next friday; also hoje, amanhã, segunda..domingo, dd/mm
  function parseWhen(text) {
    const words = String(text).trim().split(/\s+/), last = (words[words.length - 1] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const WDN = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"], wd = WDN.findIndex(w => last.startsWith(w) && last.length <= 7);
    let date = null;
    if (last === "hoje") date = addDays(0); else if (last === "amanha") date = addDays(1);
    else if (wd >= 0) { const d = (wd - new Date().getDay() + 7) % 7 || 7; date = addDays(d); }
    else { const m = /^(\d{1,2})\/(\d{1,2})$/.exec(last); if (m) { const y = new Date().getFullYear(), iso = y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"), d = new Date(iso + "T12:00:00");
      if (!isNaN(d) && C.localISO(d) === iso) date = iso < addDays(-1) ? (y + 1) + iso.slice(4) : iso; } }   // 31/02 is not a day: the words stay in the title
    return { title: (date ? words.slice(0, -1) : words).join(" "), date };
  }
  // "Desde a sua última visita": new assignments and announcements (from the reading) and new files and modules (one GET
  // each per course, at most once an hour), compared with a snapshot per Canvas user. The first look only takes the
  // snapshot. Changes pile up (7 days, 40 at most) until the student marks them as seen.
  let myChanges = { seenAt: 0, items: [] };
  async function loadChanges(user) { const { changes } = await chrome.storage.local.get("changes"); const c = changes && changes[user]; myChanges = c && Array.isArray(c.items) ? c : { seenAt: Date.now(), items: [] }; return myChanges; }
  async function saveChanges(user, c) { const { changes } = await chrome.storage.local.get("changes"); myChanges = c; await chrome.storage.local.set({ changes: Object.assign({}, changes, { [user]: c }) }); }
  async function whatChanged(cache) {
    const user = cache.user, { snap } = await chrome.storage.local.get("snap"), old = snap && snap[user], hourOld = !old || Date.now() - (old.netAt || 0) > 60 * 60 * 1000;
    const now = { at: Date.now(), netAt: hourOld ? Date.now() : old.netAt, asg: {}, ann: [], files: {}, mods: {} };
    for (const c of cache.data.courses) now.asg[c.id] = c.assignments.map(x => x.name);
    now.ann = (cache.data.announcements || []).map(x => x.url || x.title);
    await pool(cache.data.courses, 3, async c => {   // three courses at a time, both lists together, not 2 x 6 calls in a row
      if (!hourOld) { now.files[c.id] = old.files[c.id]; now.mods[c.id] = old.mods[c.id]; return; }
      await Promise.all([
        getAll("/api/v1/courses/" + c.id + "/files?sort=created_at&order=desc&per_page=15", 1).then(l => { now.files[c.id] = l.map(f => [f.id, String(f.display_name || "arquivo").slice(0, 120)]); }, () => { now.files[c.id] = old && old.files[c.id]; }),
        getAll("/api/v1/courses/" + c.id + "/modules?per_page=50", 1).then(l => { now.mods[c.id] = l.map(m => [m.id, String(m.name || "módulo").slice(0, 120)]); }, () => { now.mods[c.id] = old && old.mods[c.id]; })]);
    });
    // written only when something differs: every write wakes the service worker and reaches every open tab
    const same = old && JSON.stringify([old.netAt, old.asg, old.ann, old.files, old.mods]) === JSON.stringify([now.netAt, now.asg, now.ann, now.files, now.mods]);
    if (!same) await chrome.storage.local.set({ snap: Object.assign({}, snap, { [user]: now }) });
    if (!old) return false;
    const items = [], t = Date.now(), byName = {};
    for (const c of cache.data.courses) {
      const nm = shortName(c.name), was = old.asg[c.id];
      byName[c.id] = nm;
      if (Array.isArray(was)) for (const x of c.assignments) if (!was.includes(x.name)) items.push({ k: "t:" + c.id + ":" + x.name, kind: "tarefa", text: x.name, course: nm, url: x.url && inCanvas(x.url), at: t });
      const of = old.files[c.id], nf = now.files[c.id];
      if (Array.isArray(of) && Array.isArray(nf)) for (const [id, name] of nf) if (!of.some(f => f[0] === id)) items.push({ k: "f:" + id, kind: "arquivo", text: name, course: nm, url: location.origin + "/courses/" + c.id + "/files/" + id, at: t });
      const om = old.mods[c.id], nmods = now.mods[c.id];
      if (Array.isArray(om) && Array.isArray(nmods)) for (const [id, name] of nmods) if (!om.some(m => m[0] === id)) items.push({ k: "m:" + id, kind: "módulo", text: name, course: nm, url: location.origin + "/courses/" + c.id + "/modules#module_" + id, at: t });
    }
    for (const a of cache.data.announcements || []) if (!old.ann.includes(a.url || a.title)) items.push({ k: "a:" + (a.url || a.title), kind: "aviso", text: String(a.title || ""), course: shortName(a.course), url: a.url && inCanvas(a.url), at: t });
    if (!items.length) return false;
    const cur = await loadChanges(user), keep = cur.items.filter(x => t - x.at < 7 * 864e5 && !items.some(n => n.k === x.k));
    await saveChanges(user, { seenAt: cur.seenAt, items: items.concat(keep).slice(0, 40) });
    return true;
  }
  function changesCard(cache, rec, redraw) {
    const since = myChanges.seenAt || 0, grades = (Array.isArray(rec) ? rec : []).filter(r => r && r.at > since).length, items = myChanges.items;
    if (!items.length && !grades) return null;
    const sec = el("section", "card news changes"), h = el("h3", null, "Desde a sua última visita"), seen = el("button", "mini", "Visto ✓");
    seen.type = "button"; seen.title = "Limpar esta lista";
    seen.addEventListener("click", async () => { await saveChanges(cache.user, { seenAt: Date.now(), items: [] }); redraw(); });
    const n = items.length + grades; h.appendChild(el("span", "pill ok", n + (n === 1 ? " novidade" : " novidades"))); h.appendChild(seen); sec.appendChild(h);
    const ul = el("ul");
    if (grades) { const li = el("li", "row"); li.append(el("span", "pill nt", "nota"), mid(grades + (grades === 1 ? " nota nova" : " notas novas"), location.origin + "/grades", "veja em Notas novas"), el("span")); ul.appendChild(li); }
    for (const x of items.slice(0, 8)) { const li = el("li", "row"); li.append(el("span", "pill nt", x.kind), mid(x.text, x.url || null, x.course), el("span", "d", ago(C.localISO(new Date(x.at))))); ul.appendChild(li); }
    if (items.length > 8) ul.appendChild(el("li", "muted", "+" + (items.length - 8) + " outras"));
    sec.appendChild(ul); return sec;
  }
  // Novidades da versão (notes.js), once after an update; "Entendi" stores the version read.
  async function notesCard() {
    if (typeof CP_NOTES !== "object" || !CP_NOTES || !Array.isArray(CP_NOTES.items)) return null;
    const { notesSeen } = await chrome.storage.local.get("notesSeen");
    if (notesSeen === CP_NOTES.version) return null;
    const sec = el("section", "card news wnew"), h = el("h3", null, "Novidades da v" + CP_NOTES.version), ok = el("button", "mini", "Entendi ✓");
    ok.type = "button"; ok.addEventListener("click", async () => { await chrome.storage.local.set({ notesSeen: CP_NOTES.version }); sec.remove(); });
    h.appendChild(ok); sec.appendChild(h);
    const ul = el("ul"); for (const t of CP_NOTES.items) ul.appendChild(el("li", "row nt-i", t)); sec.appendChild(ul);
    return sec;
  }
  const courseOf = {};   // subject id -> Canvas course id, filled by analyse()
  // Our subjects are paired to Canvas courses by course id (the rules are for one turma). rules: the student is in that turma
  // and the term has not ended; only then the grade parts, our exams, the reminders for them and the icon number appear.
  // grades: Canvas first; where Canvas has none, the grade the student typed (hand, kept per Canvas user)
  function analyse(cache, hand) {
    const fc = C.fromCanvas(cache.data), canvas = fc.grades, grades = Object.assign({}, hand || {}, canvas), t = today(), byCanvasId = {};
    // the official date: an item that is a Canvas activity takes Canvas's due date over the Plano's (planDate keeps it)
    const dated = new Map(), withDates = c => { if (dated.has(c)) return dated.get(c); let ch = false;
      const items = c.items.map(it => { const d = fc.dates && fc.dates[C.key(c, it)]; if (d && d !== it.date) { ch = true; return Object.assign({}, it, { date: d, planDate: it.date, fromCanvas: true }); } return d ? Object.assign({}, it, { fromCanvas: true }) : it; });
      const out = Object.assign({}, c, { items }); dated.set(c, out); return out; };
    for (const x of cache.ids) { const c0 = C.subjectOf(x, true); if (c0) { const c = withDates(c0); byCanvasId[x.id] = c; courseOf[c.id] = String(x.id); } }
    // Our rules are for one turma. Canvas courses shared with other programs (Ética, for example) carry the same course id, so
    // a match alone is not proof: the student confirms the turma (onboarding or the question on the dashboard). Without an
    // answer, three or more matching courses count as the turma; fewer ask first.
    const matched = C.COURSES.filter(c => courseOf[c.id]).map(withDates), turma = matched.length ? C.turmaOf(matched[0]) : null;
    const confirmed = !!TURMA_PREF && matched.some(c => C.turmaOf(c) === TURMA_PREF), other = TURMA_PREF === "outro" || (!!TURMA_PREF && !confirmed);
    const askTurma = matched.length > 0 && !confirmed && !other && matched.length < 3;
    const ownRule = c => { const r = myRules[courseOf[c.id]]; return !!(r && r.own); };   // the student chose to build this course's rule
    ruleCache = cache;
    const officialId = cid => !!(centroOf(cid) || canvasWeightsRule(cid)), official = c => !!courseOf[c.id] && officialId(courseOf[c.id]);   // the professor's formula (Centro) or weights (Canvas) beat the transcribed Plano
    const mine = (confirmed ? matched.filter(c => C.turmaOf(c) === TURMA_PREF) : !other && !askTurma ? matched : []).filter(c => !ownRule(c) && !official(c)), expired = C.expired(t), rules = mine.length > 0 && !expired;
    for (const id of Object.keys(byCanvasId)) if (ownRule(byCanvasId[id]) || officialId(id)) delete byCanvasId[id];
    const state = c => C.courseState(c, grades, t, T);
    const label = st => ({ garantido: "garantido", "nao-da": "recuperação", "depende-atrasadas": "faltam notas" }[st.status] || "precisa " + up(st.fraction * 10, 1) + "/10");
    const upcoming = rules ? C.upcoming(mine, grades, t, T) : [];
    const has = rules && Object.keys(grades).length > 0;   // no matched course, term over or no grade read: no grade parts
    return { askTurma, turma, grades, canvas, hand: hand || {}, byCanvasId: rules ? byCanvasId : {}, mine, state, label, tone: C.statusTone, upcoming, has, rules, expired, term: cache.data.courses.length > 0 };
  }

  // The icon number: days to the next exam that still matters.
  // A message to the service worker wakes its whole process, so the same thing is not sent twice from a tab: the last
  // payload of each kind is remembered for the tab's session (and the day), and only a change is sent. A new tab sends
  // once again, which also covers alarms the browser dropped on a restart.
  const fresh = (kind, payload) => {
    try {
      if (typeof sessionStorage === "undefined") return true;
      let h = 5381; const str = today() + JSON.stringify(payload); for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) | 0;
      const key = "cp-sent-" + kind, v = String(h >>> 0);
      if (sessionStorage.getItem(key) === v) return false;
      sessionStorage.setItem(key, v);
    } catch (e) { /* no storage: send */ }
    return true;
  };
  function sendNext(a, cache) {
    let u = a.upcoming.find(x => x.item.exam && x.st.status !== "garantido"), msg = { type: "next", date: u ? u.item.date : null, label: u ? u.item.name : "" };
    if (!u && cache && cache.data) {   // no ready-made weights: the next Canvas activity whose name says it is an exam, by its official date
      const now = Date.now(), ex = cache.data.courses.flatMap(c => (c.assignments || []).filter(x => x && x.due && Date.parse(x.due) >= now && !x.submitted && x.score == null && /prova|avalia[cç][aã]o (somativa|final)|exame|somativa/i.test(String(x.name || ""))).map(x => x)).sort((p, q) => Date.parse(p.due) - Date.parse(q.due))[0];
      if (ex) msg = { type: "next", date: C.localISO(new Date(ex.due)), label: String(ex.name).slice(0, 80) };
    }
    if (fresh("next", msg)) chrome.runtime.sendMessage(msg).catch(() => {});
  }

  // Deadlines from the Canvas planner (every course) plus our exams that are not in Canvas, from today on. marks: what the
  // student ticked as done here (never written to Canvas); done is what Canvas says (handed in, graded).
  const shortName = name => String(name || "").split(" (")[0].split(" - ")[0];
  // The course programs (Canvas's "Resumo do curso" on each Programa page): every assignment of the term with a due date,
  // from the reading itself (no request), plus the courses' calendar events (read once per page, 10 courses a request).
  // Same keys as the planner ("assignment:<id>", "calendar_event:<id>"), so nothing shows twice.
  let progEvents = null;
  function programa(a, cache, marks, courseId) {
    const out = [], idOf = u => { const m = /\/assignments\/(\d+)/.exec(String(u || "")); return m ? m[1] : null; };
    for (const cv of (cache.data && cache.data.courses) || []) {
      if (courseId && String(cv.id) !== String(courseId)) continue;
      for (const x of cv.assignments || []) { if (!x || !x.due || Number.isNaN(Date.parse(x.due))) continue;
        const id = idOf(x.url), key = id ? "assignment:" + id : "prog:" + cv.id + ":" + x.name;
        out.push({ key, cid: cv.id, mine: !!(marks && marks[key]), title: String(x.name || ""), course: (a.byCanvasId[cv.id] && a.byCanvasId[cv.id].name) || shortName(cv.name), ours: a.byCanvasId[cv.id] || null,
          task: true, date: C.localISO(new Date(x.due)), due: x.due, url: typeof x.url === "string" && x.url.startsWith(location.origin + "/") ? x.url : null, done: !!(x.submitted || x.score != null || x.excused), late: !!x.missing, prog: true }); }
    }
    for (const e of progEvents || []) if (!courseId || String(e.cid) === String(courseId)) out.push(Object.assign({ mine: !!(marks && marks[e.key]) }, e));
    return out;
  }
  // one course (its page) or all (the calendar); kept for the tab session while the reading is the same
  async function loadProgEvents(cache, only) {
    if (progEvents) return progEvents;
    const memo = "cp-prog|" + cache.user + "|" + cache.at + "|" + (only || "all");
    try { const s = typeof sessionStorage !== "undefined" && sessionStorage.getItem(memo); if (s) { progEvents = JSON.parse(s); return progEvents; } } catch (e) { /* no session storage */ }
    const ids = ((cache.data && cache.data.courses) || []).map(c => String(c.id)).filter(x => /^\d{1,15}$/.test(x) && (!only || x === String(only))), got = [];
    for (let i = 0; i < ids.length; i += 10) {
      const q = ids.slice(i, i + 10).map(id => "context_codes[]=course_" + id).join("&");
      try { const evs = await getAll("/api/v1/calendar_events?type=event&all_events=true&per_page=100&" + q, 3);
        for (const e of Array.isArray(evs) ? evs : []) { const cid = /^course_(\d+)$/.exec(String(e.context_code || "")); if (!cid || !e.start_at || !e.id) continue;
          const cv = cache.data.courses.find(c => String(c.id) === cid[1]);
          got.push({ key: "calendar_event:" + e.id, cid: cid[1], title: String(e.title || "").slice(0, 200), course: cv ? shortName(cv.name) : "", ours: null, task: false, date: C.localISO(new Date(e.start_at)), due: e.all_day ? null : e.start_at,
            url: typeof e.html_url === "string" && e.html_url.startsWith(location.origin + "/") ? e.html_url : null, done: false, late: false, prog: true, exam: /prova|avalia[cç][aã]o|exame/i.test(String(e.title || "")) }); } }
      catch (e) { /* the events are extra: the assignments are already there */ }
    }
    progEvents = got; try { if (typeof sessionStorage !== "undefined") sessionStorage.setItem(memo, JSON.stringify(got).slice(0, 400000)); } catch (e) { /* full: next page reads again */ }
    return got;
  }
  function agenda(a, cache, marks) {
    const short = (name, id) => { const c = a.byCanvasId[id]; return c ? c.name : shortName(name); };
    const out = [];
    for (const p of cache.planner || []) {
      if (!p || !p.plannable || typeof p.plannable_date !== "string" || /^(announcement|planner_note)$/.test(p.plannable_type)) continue;
      const s = p.submissions || {};
      const url = p.html_url ? new URL(p.html_url, location.href).href : "";
      const key = p.plannable_type + ":" + p.plannable_id;
      out.push({ key, cid: p.course_id, mine: !!(marks && marks[key]), title: String(p.plannable.title || ""), course: short(p.context_name, p.course_id), ours: a.byCanvasId[p.course_id] || null,
        task: !!p.submissions, date: C.localISO(new Date(p.plannable_date)), due: p.plannable_date, url: url.startsWith(location.origin + "/") ? url : null,   // task: has a submission (events and pages do not)
        done: !!(s.submitted || s.graded || s.excused || (p.planner_override && p.planner_override.marked_complete)), late: !!s.missing });
    }
    for (const t of myTasks) if (t.date) {
      const key = "own:" + t.id, done = !!(marks && marks[key]);
      out.push({ key, own: true, mine: done, title: t.title, course: "Minha tarefa", ours: null, task: true, date: t.date, due: null, url: null, done: false, late: t.date < today() });
    }
    for (const k of Object.keys(myChecks)) for (const x of myChecks[k]) if (x.date) {
      const ci = k !== "painel" && cache.ids.find(i => String(i.id) === k), course = k === "painel" ? "Meu checklist" : (a.byCanvasId[k] && a.byCanvasId[k].name) || (ci ? shortName(ci.name) : "Checklist");
      out.push({ key: "chk:" + k + ":" + x.id, chk: [k, x.id], own: true, cid: k === "painel" ? null : k, mine: !!x.done, title: x.t, course, ours: (k !== "painel" && a.byCanvasId[k]) || null, task: true, date: x.date, due: null,
        url: k === "painel" ? null : location.origin + "/courses/" + k + "#anot", done: false, late: x.date < today() });
    }
    for (const u of a.upcoming) if (u.item.exam && !out.some(x => x.ours === u.course && x.date === u.item.date))
      out.push({ key: "qf:" + C.key(u.course, u.item), title: u.item.name, course: u.course.name, ours: u.course, date: u.item.date, due: null, url: null, done: false, late: false, exam: u });
    return out.sort((x, y) => (x.due || x.date + "T12:00:00").localeCompare(y.due || y.date + "T12:00:00"));
  }
  const fin = x => x.done || x.mine;   // handed in, or ticked as done here
  const need = u => u.req.impossible ? "nem com 10" : u.req.f <= 1e-9 ? "já garantido" : "precisa " + up(u.req.raw, u.item.inMax >= 5 ? 1 : 2) + (u.item.inMax === 10 ? "" : " de " + fmt(u.item.inMax, u.item.inMax >= 5 ? 1 : 2));

  // What the service worker should remind: work not yet handed in and exams, in the next 14 days. Without a planner reading
  // (Canvas failed) nothing is sent, so a passing error does not wipe the reminders already set.
  function sendReminders(list, prefs, cache) {
    if ((prefs.remind || prefs.summary) && !cache.planner) return;
    const t = today(), end = addDays(14);
    const items = prefs.remind || prefs.summary ? list.filter(x => (x.task || x.exam) && !fin(x) && x.date >= t && x.date <= end).slice(0, 60)
      .map(x => ({ key: x.key, title: (x.exam ? "Prova: " : x.own ? "Lembrete: " : "Entrega: ") + x.title, course: x.course, due: x.due, date: x.date, url: x.url })) : [];
    const msg = { type: "remind", items, alarms: prefs.remind };
    if (fresh("remind", msg)) chrome.runtime.sendMessage(msg).catch(() => {});   // the Monday summary reads the list too
  }

  // The deadlines and exams from today on as a calendar file (.ics) for Google Agenda, Outlook or the phone.
  function icsText(list) {
    const esc = v => String(v).replace(/[\\;,]/g, m => "\\" + m).replace(/\r?\n/g, " ");
    const utc = iso => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const day = iso => iso.replace(/-/g, ""), stamp = utc(new Date().toISOString());
    const next = iso => C.localISO(new Date(Date.parse(iso + "T12:00:00") + 864e5));
    const ev = list.filter(x => x.date >= today() && (x.task || x.exam || x.due)).slice(0, 200).map(x => ["BEGIN:VEVENT", "UID:" + esc(x.key) + "@caderno-plus", "DTSTAMP:" + stamp,
      ...(x.due ? ["DTSTART:" + utc(x.due), "DTEND:" + utc(x.due)] : ["DTSTART;VALUE=DATE:" + day(x.date), "DTEND;VALUE=DATE:" + day(next(x.date))]),
      "SUMMARY:" + esc((x.exam ? "Prova: " : "") + x.title + " · " + x.course), ...(x.url ? ["URL:" + x.url] : []), "END:VEVENT"].join("\r\n"));
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Caderno+//PUCPR//PT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Caderno+ · entregas e provas", ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n";
  }
  function saveIcs(list) {
    const a = el("a"), url = URL.createObjectURL(new Blob([icsText(list)], { type: "text/calendar" }));
    a.href = url; a.download = "caderno-entregas-e-provas.ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const COLORS = { ok: ["#e2f1e9", "#1f5c42"], warn: ["#fbefd6", "#744405"], bad: ["#fce4dd", "#912713"] };
  function pill(text, tone) {
    const s = document.createElement("span"), [bg, fg] = COLORS[tone] || COLORS.warn;
    s.textContent = text;   // no cp-host: the dark theme inverts it with the card, so it stays readable there
    s.style.cssText = "display:block;width:fit-content;margin-top:6px;padding:0 8px;border-radius:999px;font:600 11.5px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:" + bg + ";color:" + fg;
    return s;
  }

  // Dashboard: one status pill per card of the six courses. Cards render late (React), so watch the page.
  // The classic dashboard header (canvas-lms DashboardHeader.jsx: .ic-Dashboard-header__layout > Flex > [title item, actions]):
  // a greeting with the student's first name (ENV.current_user in the page), the date and what is coming, in place of
  // "Painel de controle" (still there for screen readers, CSS hides it visually).
  const firstName = () => { for (const sc of (document.scripts || [])) { const m = /"current_user":\{[^}]*?"display_name":"([^"]+)"/.exec(sc.textContent || ""); if (m) return m[1].split(/\s+/)[0]; } return ""; };
  const WD_FULL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  function greet(list) {
    const layout = document.querySelector ? document.querySelector(".ic-Dashboard-header__layout") : null;
    const first = layout && layout.firstElementChild, item = first && (first.tagName === "H1" ? (layout.querySelector(".cp-greet-box") || (() => { const b = el("div", "cp-greet-box"); layout.insertBefore(b, first); b.appendChild(first); return b; })()) : first.firstElementChild);   // a plain <h1> title: wrapped, so the rule hiding it applies
    if (!item || item.querySelector(".cp-greet")) return;
    const h = new Date().getHours(), hi = h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite", name = firstName();
    const t = today(), soon = list.filter(x => (x.task || x.exam) && !fin(x) && x.date >= t && x.date <= addDays(6)), todays = soon.filter(x => x.date === t && !x.exam).length, exam = soon.find(x => x.exam);
    const d = new Date(), date = WD_FULL[d.getDay()] + ", " + d.getDate() + " de " + MONTHS[d.getMonth()];
    const bits = [date, todays ? todays + (todays === 1 ? " entrega hoje" : " entregas hoje") : soon.length ? soon.length + (soon.length === 1 ? " coisa nesta semana" : " coisas nesta semana") : "semana livre"];
    if (exam) bits.push("prova " + dayLabel(exam.date) + " (" + exam.course.split(" ")[0] + ")");
    const g = el("div", "cp-greet"), big = el("div", null, hi + (name ? ", " + name : "") + "!"), sub = el("div", null, bits.join(" · "));
    g.style.cssText = "line-height:1.2"; big.style.cssText = "font-size:30px;font-weight:650;letter-spacing:-.02em";
    sub.style.cssText = "margin-top:6px;font-size:14px;opacity:.72"; g.append(big, sub); item.prepend(g);
    if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add("cp-greet-on");
  }
  // Course cards: the status pill on our subjects (inside Canvas's card content, under its title) and courses the student took
  // off the dashboard (popup). Canvas's own card menu (⋮, color, nickname) stays untouched. ctx: { prefs, hidden }.
  const colsFor = n => n <= 3 ? Math.max(1, n) : n === 4 ? 2 : n <= 6 ? 3 : 4;   // 2 side by side, 4 as 2+2, 5-6 as 3+3
  // the card columns from the cards shown (cpShown) and the box width (cpBoxW, kept by a ResizeObserver: reading clientWidth
  // right after drawing forced a layout of the whole page)
  // The subject picked in the dashboard chips (KPI_COURSE): only its Canvas card shows; Todas shows them all again.
  const pickCards = () => { if (typeof document === "undefined" || !document.querySelectorAll) return; const cards = [...document.querySelectorAll(".ic-DashboardCard")];
    const idOf = card => { const l = card.querySelector('a[href*="/courses/"]'), m = l && /\/courses\/(\d+)/.exec(l.getAttribute("href")); return m ? m[1] : null; };
    const pick = KPI_COURSE && cards.some(c => idOf(c) === KPI_COURSE) ? KPI_COURSE : "";
    for (const card of cards) { const id = idOf(card); card.style.display = id && (hiddenNow.includes(id) || (pick && id !== pick)) ? "none" : ""; }
    window.cpShown = cards.filter(c => c.style.display !== "none").length; setCols(); };
  const setCols = () => {
    const shown = window.cpShown || 0, root = document.documentElement, fit = window.cpBoxW ? Math.max(1, Math.floor((window.cpBoxW + 24) / 298)) : 4;
    const rows = shown ? Math.ceil(shown / Math.min(colsFor(shown), fit)) : 1, cols = shown ? Math.ceil(shown / rows) : 1;   // never one card alone on the last row
    if (root && root.style && root.style.setProperty && shown && (!root.style.getPropertyValue || root.style.getPropertyValue("--cp-cols") !== String(cols))) root.style.setProperty("--cp-cols", String(cols));
  };
  function decorateCards(a, again, ctx) {
    const prefs = ctx.prefs; let nums = null;
    if (again) for (const card of document.querySelectorAll(".ic-DashboardCard[data-qf]")) { for (const x of card.cpAdded || []) x.remove(); delete card.dataset.qf; }
    for (const card of document.querySelectorAll(".ic-DashboardCard:not([data-qf])")) {
      const link = card.querySelector('a[href*="/courses/"]'), m = link && /\/courses\/(\d+)/.exec(link.getAttribute("href"));
      card.dataset.qf = "1"; card.cpAdded = [];
      if (!m) continue;
      const id = m[1], c = a.byCanvasId[id];
      card.style.display = ctx.hidden.includes(id) || (KPI_COURSE && KPI_COURSE !== id && a.term && document.querySelector('.ic-DashboardCard a[href*="/courses/' + KPI_COURSE + '"]')) ? "none" : "";   // the subject picked in the chips
      if (ctx.hidden.includes(id) || !prefs.grades) continue;
      if (!c || !a.rules || !a.has) {   // no Plano rule in use: the dashboard's own number (Centro de Notas, Canvas weights, the student's rule, the sum)
        const u = (nums = nums || new Map(courseNumbers(a, ctx.cache).U.map(x => [x.cid, x]))).get(id); if (!u || (u.now == null && u.need == null && u.status !== "nao-da")) continue;
        const p = pill((u.now == null ? "" : dn(u.now) + "/10 · ") + u.label, u.tone === "nt" ? "warn" : u.tone), head = card.querySelector(".ic-DashboardCard__header_content") || card;
        p.title = "Caderno+ · " + ({ aluno: "sua regra", centro: "fórmula do Centro de Notas", canvas: "pesos que o professor pôs no Canvas", soma: "soma dos pontos do Canvas (confira na matéria)", plano: "pesos do Plano de Ensino" }[u.src]) + ", meta " + fmt(T, T % 1 ? 1 : 0) + (u.r && u.r.approx ? " · aproximado: parte da fórmula está escondida para o aluno" : "");
        card.cpAdded.push(p); head.appendChild(p); continue;
      }
      const st = a.state(c);   // with the ring, the pill says only what is still needed
      const p = pill(prefs.cardPct ? a.label(st) : earnedText(st) + "/10 · " + a.label(st), a.tone(st)), head = card.querySelector(".ic-DashboardCard__header_content") || card;
      p.title = st.status === "garantido" ? C.GARANTIDO_TIP : "Caderno+ · pesos do Plano de Ensino, meta " + fmt(T, T % 1 ? 1 : 0);
      card.cpAdded.push(p); head.appendChild(p);
      const top = prefs.cardPct && card.querySelector(".ic-DashboardCard__header");
      if (top) {   // what is guaranteed, as a ring on the top left of the card's picture
        const col = { ok: "#2F7D5B", warn: "#A8650F", bad: "#C2361F" }[a.tone(st)] || "#A8650F", pct = Math.floor(Math.min(10, st.earned) * 10);   // guaranteed: never rounded up
        const ring = el("div"), num = el("b", null, pct + "%");
        ring.className = "cp-card-ring"; ring.title = pct + "% garantido de 10 · " + p.title; ring.setAttribute("aria-label", pct + "% garantido");
        ring.style.cssText = "position:absolute;top:10px;left:12px;z-index:2;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(" + col + " " + pct + "%, rgba(255,255,255,.45) 0);box-shadow:0 2px 10px rgba(0,0,0,.22)";
        num.style.cssText = "display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--cp-card,#fff);color:" + col + ";font:700 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-.02em";
        ring.appendChild(num); card.cpAdded.push(ring); top.appendChild(ring);
      }
    }
    window.cpShown = [...document.querySelectorAll(".ic-DashboardCard")].filter(c => c.style.display !== "none").length;
    const box = document.getElementById("DashboardCard_Container"), RO = typeof ResizeObserver === "function";
    if (box && RO && window.cpBoxObs !== box) { window.cpBoxObs = box; new ResizeObserver(es => { const w = es[0].target.clientWidth; if (w) { window.cpBoxW = w; setCols(); } }).observe(box); }   // read after layout: free
    else if (!RO) window.cpBoxW = box ? box.clientWidth : 0;
    setCols();
    if (!RO && !window.cpColsResize && typeof window.addEventListener === "function") { window.cpColsResize = 1; let t = 0; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => window.cpCards && window.cpCards(gradeA), 200); }); }
  }


  const CSS = `
    :host { all: initial; display:block; margin:0 0 18px; --fg:var(--cp-ink,#1D2433); --muted:var(--cp-muted,#5F6675); --line:var(--cp-line,#ECE4D3); --bg:var(--cp-card,#fff); --soft:var(--cp-paper,#FBF7EF);
      --ring:var(--cp-accent,#E2482B); --coral:var(--cp-accent,#E2482B); --coral-ink:var(--cp-accent-ink,var(--cp-accent,#E2482B)); --on-coral:var(--cp-on-accent,#fff); --tile:var(--cp-ink,#1D2433); --tile-c:var(--cp-paper,#FBF7EF); --band1:color-mix(in srgb, var(--cp-accent,#E2482B) 16%, var(--cp-card,#fff)); --band2:color-mix(in srgb, var(--cp-accent,#E2482B) 6%, var(--cp-card,#fff));
      --paper:var(--cp-paper,#FBF7EF); --track:color-mix(in srgb, var(--cp-line,#ECE4D3) 75%, var(--cp-paper,#FBF7EF)); --ok:#2F7D5B; --warn:#A8650F; --bad:#C2361F; --ok-s:#CFE6D9; --warn-s:#F1DDB8; --bad-s:#F6CFC4; --lift:0 8px 20px -12px rgba(29,36,51,.35);
      --serif:"Fraunces","Iowan Old Style","New York",Georgia,"Times New Roman",serif; --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      /* one type scale and one radius scale for every panel (Refactoring UI: pick the scale first, then only use its steps) */
      --fs-xs:11px; --fs-sm:12px; --fs-md:13px; --fs-base:14px; --fs-lg:16px; --fs-xl:18px; --fs-2xl:22px; --fs-3xl:30px; --r-xs:4px; --r-sm:8px; --r-md:12px; --r-lg:14px; --r-pill:999px;
      font:14px/1.45 var(--sans); color:var(--fg); font-variant-numeric:tabular-nums; font-synthesis-weight:none; }
    /* Labs: the new look in test (prefs.labs). Off: the bar is hidden and nothing else changes.
       v2, clean (shadcn/ui, Tremor, Linear, Vercel): one sans for text and numbers, hairline borders, no shadows, color only
       where it says something (ok, warn, bad), more white space; tokens derived from the theme so dark keeps working */
    .labs-bar { display:none; }
    :host(.labs) { --serif:var(--sans); --line:color-mix(in srgb, var(--fg) 10%, var(--bg)); --track:color-mix(in srgb, var(--fg) 6%, var(--bg)); --r-md:12px; --r-lg:12px; letter-spacing:-.003em; }
    :host(.labs) .labs-bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:0 0 12px; padding:6px 6px 6px 12px; border:1px solid var(--line); border-radius:var(--r-pill); background:var(--bg); font-size:var(--fs-sm); color:var(--muted); }
    .labs-tag { display:inline-flex; align-items:center; gap:6px; font-weight:600; color:var(--fg); } .labs-tag::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--coral); }
    .labs-t { flex:1; min-width:160px; } .labs-say { color:var(--fg); font-weight:500; text-decoration:underline; text-decoration-color:var(--line); text-underline-offset:3px; } .labs-say:hover { text-decoration-color:var(--fg); }
    .labs-back { all:unset; cursor:pointer; padding:4px 12px; border-radius:var(--r-pill); background:var(--track); color:var(--fg); font-weight:500; } .labs-back:hover { background:var(--line); } .labs-back:focus-visible, .labs-say:focus-visible { outline:2px solid var(--fg); outline-offset:2px; }
    :host(.labs) .box { background:transparent; border-color:transparent; box-shadow:none; padding:8px 0 16px; }
    :host(.labs) .card { border:1px solid var(--line); border-radius:12px; box-shadow:none; background:var(--bg); }
    :host(.labs) a.card:hover { transform:none; box-shadow:none; border-color:color-mix(in srgb, var(--fg) 24%, var(--bg)); }
    :host(.labs) .box > .card, :host(.labs) .box > .kpis, :host(.labs) .box > .tiles, :host(.labs) .box > .nslot > .card { margin-bottom:12px; } :host(.labs) .kpis { gap:12px; }
    :host(.labs) .k { text-transform:none; letter-spacing:0; font-size:12.5px; font-weight:500; }
    :host(.labs) .kpi { padding:16px 18px 18px; } :host(.labs) .kpi .v, :host(.labs) .big .v { font:600 28px/1.1 var(--sans); letter-spacing:-.025em; }
    :host(.labs) .upnext { padding:16px 18px; } :host(.labs) .upnext .t, :host(.labs) .cring .t { font:600 17px/1.3 var(--sans); letter-spacing:-.012em; }
    :host(.labs) h3 { font:600 15px/1.3 var(--sans); letter-spacing:-.01em; } :host(.labs) .ht b { font:600 20px/1.25 var(--sans); letter-spacing:-.02em; }
    :host(.labs) .meter { height:6px; } :host(.labs) .ovbar { height:16px; border-radius:var(--r-pill); } :host(.labs) .ovbar > i { border-radius:var(--r-pill); }
    :host(.labs) .ih { background:transparent; border-bottom:1px solid var(--line); font-weight:500; padding:10px 18px; } :host(.labs) .ir { padding:12px 18px; }
    :host(.labs) .seg { background:var(--track); } :host(.labs) .seg button[aria-pressed="true"] { background:var(--bg); color:var(--fg); font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 0 0 1px var(--line); }
    :host(.labs) .hero { margin:0 0 12px; padding:18px; border:1px solid var(--line); border-radius:12px; background:var(--bg); }
    /* v3, beyond clean: frosted glass over the background scene, a light on the border that follows the mouse (Magic UI /
       Aceternity), a bento of the numbers, each subject as its own tile, and a short cascade when the panel comes in */
    :host(.labs) .card, :host(.labs) .hero, :host(.labs) .labs-bar { background:color-mix(in srgb, var(--bg) 74%, transparent); -webkit-backdrop-filter:blur(18px) saturate(1.35); backdrop-filter:blur(18px) saturate(1.35); border-color:color-mix(in srgb, var(--fg) 9%, transparent); }
    :host(.labs) .card { overflow:visible; } :host(.labs) .card::after { content:""; position:absolute; inset:-1px; border-radius:inherit; padding:1px; pointer-events:none; opacity:0; transition:opacity .25s ease;
      background:radial-gradient(240px circle at var(--mx, -400px) var(--my, -400px), var(--coral), transparent 65%); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask:linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); }
    :host(.labs) .card:hover::after { opacity:1; }
    :host(.labs) .kpis { grid-template-columns:1.5fr 1fr 1fr; } :host(.labs) .kpis > .kpi:first-child .v { font-size:52px; letter-spacing:-.04em; background:linear-gradient(120deg, var(--fg) 30%, var(--coral)); -webkit-background-clip:text; background-clip:text; color:transparent; }
    :host(.labs) .ov-body:has(> .ovr:not(.ovscale) > .ovbar) { grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:10px; }
    :host(.labs) .ov-body > .ovr:not(.ovscale):has(> .ovbar) { grid-template-columns:minmax(0,1fr) auto; grid-template-areas:"n p" "b b"; align-items:start; gap:12px; padding:14px; min-height:92px; border:1px solid var(--line); border-radius:14px; background:color-mix(in srgb, var(--coral) 4%, var(--bg)); }
    :host(.labs) .ov-body > .ovr:not(.ovscale):has(> .ovbar) > :nth-child(1) { grid-area:n; } :host(.labs) .ov-body > .ovr:not(.ovscale):has(> .ovbar) > :nth-child(2) { grid-area:b; align-self:end; } :host(.labs) .ov-body > .ovr:not(.ovscale):has(> .ovbar) > :nth-child(3) { grid-area:p; }
    :host(.labs) .ov-body > .ovscale { display:none; }
    :host(.labs) .ov-body > .ovr:not(.ovscale):has(> .ovbar) { min-height:118px; } :host(.labs) .ov-body > .ovr:not(.ovscale) > .ovbar { height:8px; overflow:visible; }
    :host(.labs) .ov-body > .ovr:not(.ovscale) > .ovbar .ovin, :host(.labs) .ov-body > .ovr:not(.ovscale) > .ovbar .ovin.low { display:block; left:0; top:auto; bottom:calc(100% + 10px); transform:none; font:600 30px/1 var(--sans); letter-spacing:-.03em; color:var(--fg); text-shadow:none; }   /* the subject's grade, big, over its bar */
    /* the course page in Labs: the hero washed in the course's own color (its band grows into a soft glow), the grade ring big
       beside a big number, the grade table as a list of rows that light up, the tabs as a glass pill */
    :host(.labs) .hero { overflow:hidden; } :host(.labs) .band-c { height:auto; bottom:0; opacity:.16; -webkit-mask:radial-gradient(120% 140% at 0% 0%, #000 20%, transparent 70%); mask:radial-gradient(120% 140% at 0% 0%, #000 20%, transparent 70%); }
    :host(.labs) .ht b { font-size:26px; letter-spacing:-.03em; } :host(.labs) .hero .hs { margin-top:4px; }
    :host(.labs) .cring { padding:20px 22px; gap:20px; } :host(.labs) .cring .rg { width:96px; height:96px; }
    :host(.labs) .cring .t { font:600 30px/1.1 var(--sans); letter-spacing:-.03em; }
    :host(.labs) .gt .ir:not(.ih) { transition:background .15s ease; } :host(.labs) .gt .ir:not(.ih):hover { background:color-mix(in srgb, var(--coral) 6%, transparent); }
    :host(.labs) .gt .ir .w { justify-self:start; padding:2px 8px; border-radius:var(--r-pill); background:var(--track); font-size:var(--fs-xs); font-weight:600; color:var(--muted); }
    :host(.labs) .gt .g { font-weight:600; } :host(.labs) .gt .simi { border-radius:10px; }
    :host(.labs) .ctabs { background:color-mix(in srgb, var(--bg) 70%, transparent); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); border:1px solid color-mix(in srgb, var(--fg) 9%, transparent); border-radius:var(--r-pill); padding:4px; }
    :host(.labs) .ctabs button { border-radius:var(--r-pill); } :host(.labs) .ctabs button[aria-selected="true"] { box-shadow:0 1px 2px rgba(0,0,0,.08), 0 0 0 1px var(--line); font-weight:600; }
    @media (prefers-reduced-motion:no-preference) {
      :host(.labs) .box > * { animation:labs-in .55s cubic-bezier(.22,1,.36,1) both; } :host(.labs) .box > :nth-child(2) { animation-delay:.04s; } :host(.labs) .box > :nth-child(3) { animation-delay:.08s; } :host(.labs) .box > :nth-child(4) { animation-delay:.12s; } :host(.labs) .box > :nth-child(5) { animation-delay:.16s; } :host(.labs) .box > :nth-child(n+6) { animation-delay:.2s; }
      :host(.labs) .ovbar > i { animation:labs-grow .9s cubic-bezier(.22,1,.36,1) both; transform-origin:left; }
      @keyframes labs-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } } @keyframes labs-grow { from { transform:scaleX(0); } to { transform:none; } } }
    .box { position:relative; container:cp / inline-size; overflow-x:clip; overflow-clip-margin:6px; border:1px solid var(--line); border-radius:var(--r-lg); background:var(--paper); padding:0 14px 14px; box-shadow:0 1px 2px rgba(29,36,51,.05); }
    .card { display:block; position:relative; background:var(--bg); border:1px solid var(--line); border-radius:var(--r-md); color:inherit; }
    a.card { transition:transform .18s cubic-bezier(.23,1,.32,1), box-shadow .18s, border-color .15s; } a.card:hover { text-decoration:none; transform:translateY(-1px); border-color:var(--muted); box-shadow:var(--lift); } a.card:active { transform:scale(.99); }
    .box > .card, .box > .kpis, .box > .tiles, .box > .nslot > .card { margin-bottom:10px; }   /* .nslot is display:contents */
    .k { font-size:var(--fs-xs); font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); }
    .nslot { display:contents; }
    .upnext { display:flex; align-items:center; gap:16px; padding:12px 14px; } .upnext .k { text-transform:none; letter-spacing:0; font-size:var(--fs-sm); font-weight:500; }
    .upnext .t, .cring .t { font:600 var(--fs-xl)/1.25 var(--serif); letter-spacing:-.01em; margin:2px 0; overflow:hidden; text-overflow:ellipsis; } .upnext .mid, .cring .mid { flex:1; }
    .big { flex:none; text-align:right; } .big .v { display:block; font:500 var(--fs-3xl)/1 var(--serif); letter-spacing:-.02em; } .big span { display:block; margin-top:3px; color:var(--muted); font-size:var(--fs-sm); }
    .v.t-ok { color:var(--ok); } .v.t-warn { color:var(--warn); } .v.t-bad { color:var(--bad); }
    .kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; } .seg.kpis-pick { display:flex; flex-wrap:wrap; width:fit-content; max-width:100%; margin:0 0 8px; } .kpi .c { margin-top:6px; } .kpi .c.per { white-space:normal; overflow:visible; text-overflow:clip; line-height:1.45; }
    .kpi { padding:10px 12px 12px; min-width:0; } .kpi .v { font:500 24px/1.15 var(--serif); letter-spacing:-.02em; margin:2px 0 4px; } .kpi .v.need { color:var(--warn); } .kpi .v.need.t-ok { color:var(--ok); }
    .meter { position:relative; height:6px; margin-top:6px; border-radius:var(--r-pill); background:var(--track); }
    .meter i { position:absolute; left:0; top:0; bottom:0; border-radius:var(--r-pill); background:var(--fg); } .meter b { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; border-radius:2px; background:var(--coral); }
    .trk { display:flex; gap:2px; margin-top:7px; } .trk i { position:relative; flex:1; min-width:2px; height:8px; border-radius:2px; background:var(--track); } .trk i.ok { background:var(--ok); } .trk i.late { background:var(--warn); } .trk i.sent { background:color-mix(in srgb, var(--ok) 45%, var(--track)); }
    .trk i:hover { outline:1.5px solid var(--fg); outline-offset:1px; }
    [data-tip]::after { content:attr(data-tip); position:absolute; z-index:6; left:50%; bottom:calc(100% + 8px); width:max-content; max-width:240px; padding:6px 9px; border-radius:var(--r-sm); background:var(--fg); color:var(--bg);
      font:500 var(--fs-sm)/1.35 var(--sans); box-shadow:0 10px 24px -10px rgba(29,36,51,.5); opacity:0; visibility:hidden; pointer-events:none; transform:translate(-50%,3px); transition:opacity .12s, transform .12s, visibility 0s .12s; }
    [data-tip]:hover::after { opacity:1; visibility:visible; transform:translate(-50%,0); transition-delay:0s; }
    .trk i:nth-child(-n+5)::after { left:0; transform:translateY(3px); } .trk i:nth-last-child(-n+5)::after { left:auto; right:0; transform:translateY(3px); }
    .trk i:nth-child(-n+5):hover::after, .trk i:nth-last-child(-n+5):hover::after { transform:none; }
    .tiles { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
    .tile { display:grid; grid-template-columns:46px minmax(0,1fr); gap:10px; align-items:center; padding:9px 10px; }
    .tile .nm { display:block; font-weight:600; font-size:var(--fs-md); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .tile .c { display:block; margin:1px 0 4px; } .tile .pill { display:inline-block; }
    .ring { position:relative; flex:none; width:46px; height:46px; border-radius:50%; }
    .ring::after { content:""; position:absolute; inset:5px; border-radius:50%; background:var(--bg); }
    .ring b { position:absolute; inset:0; z-index:1; display:grid; place-items:center; font:600 var(--fs-md)/1 var(--serif); }
    .ring i { position:absolute; inset:0; z-index:1; } .ring i::before { content:""; position:absolute; left:50%; top:-2px; width:2px; height:9px; margin-left:-1px; border-radius:1px; background:var(--fg); }
    .ring.big { width:64px; height:64px; } .ring.big::after { inset:6px; } .ring.big b { font-size:var(--fs-xl); } .ring.big i::before { height:11px; }
    .cring { display:flex; align-items:center; gap:14px; padding:12px 14px; } .cring .mid .c { white-space:normal; overflow:visible; line-height:1.35; }
    .items { overflow:hidden; } .ir { display:grid; grid-template-columns:minmax(0,1fr) 56px 140px; gap:10px; align-items:center; padding:8px 12px; border-top:1px solid var(--line); }
    .rule .ir.off .n { color:var(--muted); text-decoration:line-through; } .rule label.n { display:flex; gap:8px; align-items:center; cursor:pointer; } .rule label.n input { accent-color:var(--coral); flex:none; }
    .own-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; } .own-row .own-b { flex:none; }
    .c.scale { white-space:normal; overflow:visible; text-overflow:clip; line-height:1.4; } details.scale summary { cursor:pointer; list-style:none; } details.scale summary::-webkit-details-marker { display:none; } details.scale summary::after { content:" ▾"; } details.scale[open] summary::after { content:" ▴"; }
    .scale-l { margin:4px 0 0; padding-left:16px; } .scale-l li { margin:1px 0; }
    .card.ov { padding:12px 14px; }
    .ovh { display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; margin-bottom:8px; } .ovh h3 { margin:0; } .seg.ov-mode { display:flex; flex-wrap:wrap; max-width:100%; }
    .ov-body { display:grid; gap:6px; } .ovr { display:grid; grid-template-columns:minmax(90px,170px) minmax(0,1fr) 84px; gap:10px; align-items:center; min-height:30px; } .ovr > :nth-child(3) { justify-self:end; }   /* one width for the last column: every bar the same length, the meta line straight */
    .ovn { display:grid; min-width:0; color:inherit; text-decoration:none; } .ovn:hover .n { text-decoration:underline; } .ovn .n { font-size:var(--fs-md); font-weight:600; } .ovn .c { font-size:var(--fs-xs); }
    .ovbar { position:relative; height:14px; border-radius:var(--r-xs); background:var(--track); } .ovbar > i { position:absolute; left:0; top:0; bottom:0; border-radius:var(--r-xs); min-width:2px; background:var(--fg); }
    .ovbar > i.ok { background:var(--ok); } .ovbar > i.warn { background:var(--warn); } .ovbar > i.bad { background:var(--bad); } .ovbar > i.nt { background:var(--muted); }
    .ovbar > i.hatch { background:repeating-linear-gradient(45deg, var(--bad) 0 5px, color-mix(in srgb, var(--bad) 35%, transparent) 5px 9px); }
    .ovbar > b { position:absolute; top:-4px; bottom:-4px; width:2px; margin-left:-1px; border-radius:2px; background:var(--coral); box-shadow:0 0 0 2px var(--bg); }
    .ovin { position:absolute; left:6px; top:50%; transform:translateY(-50%); font-size:var(--fs-xs); font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.35); pointer-events:none; } .ovin.low { display:none; }
    .ovv { min-width:38px; text-align:center; } .ovscale { min-height:0; margin-top:-2px; } .ovbar.ovax { display:flex; justify-content:space-between; height:12px; background:none; } .ovax span { font-size:var(--fs-xs); color:var(--muted); } .ovax { position:relative; } .ovax .ovmeta { position:absolute; top:0; transform:translateX(-50%); color:var(--coral-ink); font-weight:700; white-space:nowrap; } .ovin.out { color:var(--muted); text-shadow:none; }
    .ovtrk { margin-top:0; } .ovtrk i { height:12px; } .trk i.late { display:block; margin:0; }   /* not the overdue row's .late */
    .ovrings { display:grid; grid-template-columns:repeat(auto-fill, minmax(104px, 1fr)); gap:10px; } .ovring { display:grid; justify-items:center; gap:2px; padding:8px 4px; border-radius:var(--r-md); color:inherit; text-decoration:none; text-align:center; }
    .ovring:hover { background:var(--soft); } .ovring .n { font-size:var(--fs-sm); font-weight:600; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .ovring .c { font-size:var(--fs-xs); }
    .rg { --c:var(--muted); width:64px; height:64px; border-radius:50%; display:grid; place-items:center; background:conic-gradient(var(--c) var(--p), var(--track) 0); position:relative; }
    .rg[data-t=ok] { --c:var(--ok); } .rg[data-t=warn] { --c:var(--warn); } .rg[data-t=bad] { --c:var(--bad); } .rg::after { content:""; position:absolute; inset:-3px; border-radius:50%; background:conic-gradient(transparent calc(var(--m) - .8%), var(--coral) 0 calc(var(--m) + .8%), transparent 0); -webkit-mask:radial-gradient(circle, transparent 22px, #000 23px); mask:radial-gradient(circle, transparent 22px, #000 23px); }   /* the meta: a tick across the ring */
    .rg > b { display:grid; place-items:center; width:48px; height:48px; border-radius:50%; background:var(--bg); font:700 var(--fs-base)/1 var(--sans); }
    .ovdet { display:grid; gap:10px; margin-top:6px; padding-top:10px; border-top:1px solid var(--line); } .ovstats { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; }
    .ovst { display:grid; gap:2px; padding:8px 10px; border-radius:var(--r-md); background:var(--soft); } .ovst b { font:600 var(--fs-xl)/1.1 var(--serif); } .ovdet > .k { font-size:var(--fs-xs); font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
    .ovacts { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:6px 18px; } .ovact { display:grid; grid-template-columns:minmax(0,1fr) 90px 64px; gap:8px; align-items:center; font-size:var(--fs-sm); }
    .ovact .n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:inherit; } .ovact a.n:hover { text-decoration:underline; } .ovact .c { text-align:right; font-size:var(--fs-sm); } .ovbar.sm { height:8px; } .ovact.more { grid-template-columns:1fr; }
    .ovcap { margin-top:8px; } @media (max-width:560px) { .ovr { grid-template-columns:minmax(70px,110px) minmax(0,1fr) 72px; } } .ov h3 { margin:0 0 6px; } .ov .row .mid .c { white-space:normal; overflow:visible; line-height:1.35; }
    .centro-ask { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; padding:10px 14px; margin-bottom:10px; } .centro-ask .mid { flex:1 1 260px; font-size:var(--fs-md); } .centro-ask .acts { display:flex; gap:8px; flex-wrap:wrap; }
    .formula { padding:12px 14px; } .formula .acts { justify-content:flex-start; } .formula .from { opacity:.8; } .formula .res { font-weight:600; color:var(--fg); margin-top:8px; }
    .formula .lbl { margin-top:10px; } .formula .chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; } .formula .chip { padding:3px 9px; border:1px solid var(--line); border-radius:var(--r-pill); background:var(--bg); color:var(--fg); font:12px/1.3 var(--sans); cursor:pointer; } .formula .chip:hover { border-color:var(--coral); }
    .formula .back { margin-top:12px; } .formula .found-d { margin-top:10px; font-size:var(--fs-md); } .formula .found-d summary { cursor:pointer; color:var(--muted); } .formula p.c, .formula .found li { white-space:normal; overflow:visible; text-overflow:clip; } .formula textarea { box-sizing:border-box; width:100%; margin:8px 0; padding:10px; border:1px solid var(--line); border-radius:var(--r-md); background:var(--bg); color:var(--fg); font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; resize:vertical; }
    .formula .acts { display:flex; gap:8px; align-items:center; } .formula .dirty { font-size:var(--fs-sm); color:var(--warn); }
    .rb { margin:10px 0 12px; } .rb-h { display:flex; align-items:center; gap:10px; flex-wrap:wrap; } .rb-h .seg { margin:0; } .rb-n button { min-width:30px; font-weight:600; }
    .rb-md { display:inline-flex; width:auto; align-self:flex-start; margin:2px 0 6px; } .rb-i.pts { grid-template-columns:minmax(0,1fr) auto 26px; } .rb-pt { text-align:right; white-space:nowrap; } .rb-p .rb-sum { white-space:normal; overflow:visible; text-overflow:clip; }
    .rb-cur { white-space:pre-wrap; font:12px/1.5 ui-monospace,monospace; background:var(--soft, rgba(0,0,0,.04)); padding:8px; border-radius:8px; margin:4px 0 8px; }
    .rb-sum { margin-top:8px; color:var(--ok); } .rb-sum.warn { color:var(--warn); }
    .rb-g { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px; margin-top:10px; }
    .rb-p { border:1px solid var(--line); border-radius:var(--r-md); padding:10px; background:var(--bg); display:flex; flex-direction:column; gap:6px; min-width:0; }
    .rb-ph { display:flex; align-items:center; gap:6px; padding-bottom:6px; border-bottom:1px solid var(--line); } .rb-ph .rb-name { flex:1; font-weight:600; }
    .rb-i { display:grid; grid-template-columns:minmax(0,1fr) 56px auto 26px; align-items:center; gap:4px 6px; } .rb-i .rb-st { grid-column:1 / -1; font-size:var(--fs-sm); color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .rb-st.okc { color:var(--ok); } .rb-st.warn { color:var(--warn); }
    .rb input { box-sizing:border-box; min-width:0; width:100%; padding:5px 8px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--fg); font:13px/1.3 var(--sans); } .rb input:focus { outline:2px solid var(--coral); outline-offset:-1px; }
    .rb-ph .rb-w, .rb-i .rb-w { width:56px; text-align:right; } .rb-ph .rb-w { flex:none; } .rb .u { font-size:var(--fs-sm); color:var(--muted); white-space:nowrap; }
    .rb-x { width:26px; height:26px; padding:0; border:1px solid var(--line); border-radius:8px; background:none; color:var(--muted); cursor:pointer; } .rb-x:hover { color:var(--bad); border-color:var(--bad); }
    .rb-p > .mini { align-self:flex-start; margin-top:2px; }
    .rb-m { margin-top:12px; } .rb-mr { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; border-top:1px solid var(--line); } .rb-mr .n { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:var(--fs-md); } .rb-mr .seg { margin:0; flex:none; } .rb-ml { margin:0 0 6px; white-space:normal; } .rb-mr .seg button[aria-pressed="true"] { background:var(--fg); color:var(--bg); }
    .rb-txt { margin-top:12px; } .formula .err { color:var(--bad); } .formula .found { margin:10px 0 0; padding-left:18px; font-size:var(--fs-md); } .formula .found .miss { color:var(--warn); } .formula > .mini { margin-top:10px; }
    .rule select.part { margin-left:auto; padding:2px 4px; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--fg); font:inherit; font-size:var(--fs-sm); } .rule .parts .pk { font-weight:600; margin-left:6px; } .rule .parts input { width:56px; }
    .rule .tot { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:10px 12px; border-top:1px solid var(--line); } .rule .tot input { width:72px; padding:4px 8px; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--fg); font:inherit; } .rule > .mini { margin:0 12px 12px; }
    .ih { border-top:0; background:var(--track); font-size:var(--fs-xs); font-weight:600; color:var(--muted); padding:7px 12px; }
    .ir .n { display:flex; align-items:center; gap:8px; min-width:0; } .ir .n .pill { font-size:var(--fs-xs); line-height:18px; } .ir .dt { color:var(--muted); font-size:var(--fs-sm); }
    .ir .w { color:var(--muted); font-size:var(--fs-sm); } .ir .g { font:600 var(--fs-lg)/1.2 var(--serif); } .ir .g small { font:500 var(--fs-xs) var(--sans); color:var(--muted); } .ir .g.e { font:400 var(--fs-sm)/1.3 var(--sans); color:var(--muted); }
    .card.week, .card.news { padding:12px 14px; }
    @container cp (max-width:700px) { .tiles { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @container cp (max-width:560px) { .kpis { grid-template-columns:minmax(0,1fr); } .upnext .t { font-size:var(--fs-lg); } .big .v { font-size:var(--fs-2xl); } .ir { grid-template-columns:minmax(0,1fr) 40px 104px; } }
    @container cp (max-width:420px) { .tiles { grid-template-columns:minmax(0,1fr); } .cring .ring { display:none; } }
    .hd { display:flex; align-items:center; gap:8px; margin:0 -14px 12px; padding:10px 14px; border-bottom:1px solid var(--line); }
    .hd b { font:600 var(--fs-lg)/1 var(--serif); letter-spacing:-.01em; } .hd b i { font-style:normal; color:var(--coral-ink); }
    .brand { margin-left:auto; font-size:var(--fs-sm); font-weight:600; color:var(--muted); }
    .mk { position:relative; flex:none; width:18px; height:18px; border-radius:var(--r-xs); background:var(--tile); }
    .mk::before { content:"C"; position:absolute; left:2.5px; top:0; font:600 var(--fs-base)/18px var(--serif); color:var(--tile-c); }
    .mk::after { content:""; position:absolute; right:2px; top:3px; width:5px; height:5px;
      background:linear-gradient(var(--coral),var(--coral)) center/100% 1.6px no-repeat, linear-gradient(var(--coral),var(--coral)) center/1.6px 100% no-repeat; }
    .muted { color:var(--muted); font-size:var(--fs-sm); } .muted.read { margin:10px 2px 0; font-size:var(--fs-sm); text-align:right; } .muted.src { margin:-2px 0 10px; font-size:var(--fs-sm); } .acts + .muted.src, .items + .muted.src { margin-top:8px; } .muted.why { margin:0 0 10px; }
    h3 { margin:0 0 6px; font:600 var(--fs-xl)/1.3 var(--serif); letter-spacing:-.01em; display:flex; gap:8px; align-items:center; }
    .lbl { margin:12px 0 2px; font-size:var(--fs-xs); font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
    .pill { flex:none; padding:0 8px; border-radius:var(--r-pill); font:600 var(--fs-sm)/20px var(--sans); white-space:nowrap; }
    .ok { background:#E2F1E9; color:#1F5C42; } .warn { background:#FBEFD6; color:#744405; } .bad { background:#FCE4DD; color:#912713; } .nt { background:var(--soft); color:var(--fg); }
    ul { list-style:none; margin:0; padding:0; }
    .day + .day { margin-top:4px; }
    .dh { padding:4px 0 1px; font-size:var(--fs-sm); font-weight:600; color:var(--muted); }
    .row { display:grid; grid-template-columns:44px minmax(0,1fr) auto; gap:10px; align-items:center; padding:3px 0; }
    .news .row { grid-template-columns:8px minmax(0,1fr) auto; }
    .d { color:var(--muted); font-size:var(--fs-sm); white-space:nowrap; }
    .mid { min-width:0; } .n { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .c { color:var(--muted); font-size:var(--fs-sm); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .unread .n { font-weight:600; } .dot { width:6px; height:6px; border-radius:50%; background:var(--coral); overflow:hidden; color:transparent; font-size:0; }
    .acts { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:10px; }
    button { font:inherit; font-size:var(--fs-md); font-weight:600; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:var(--r-sm); padding:6px 12px; cursor:pointer; transition:background-color .15s, border-color .15s, box-shadow .15s, transform .15s cubic-bezier(.23,1,.32,1); }
    button:hover:not(:disabled) { background:var(--soft); border-color:var(--muted); transform:translateY(-1px); } button:active:not(:disabled) { transform:scale(.97); }
    button.primary { background:var(--fg); color:var(--bg); border-color:var(--fg); } button.primary:hover:not(:disabled) { background:var(--fg); border-color:var(--fg); box-shadow:0 2px 0 var(--coral); }
    button:disabled { opacity:.5; cursor:default; }
    a { color:inherit; text-decoration:none; } a:hover { text-decoration:underline; text-decoration-color:var(--coral); text-underline-offset:3px; }
    :is(a, button, input, textarea, select):focus-visible { outline:2px solid var(--ring); outline-offset:2px; border-radius:var(--r-sm); }   /* fields too: some reset everything with all:unset */
    .grid { display:grid; gap:10px; }
    @container cp (min-width:760px) { .news > ul { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); column-gap:32px; } }
    @container cp (min-width:1240px) { .news > ul { grid-template-columns:repeat(3, minmax(0,1fr)); column-gap:24px; } }   /* wide screens: the date stays near its line */
    .news .row { margin:0 -8px; padding:5px 8px; border-radius:var(--r-md); transition:background-color .15s; } .news .row:hover { background:var(--soft); }
    .empty { padding:14px 12px; border:1px dashed var(--line); border-radius:var(--r-md); color:var(--muted); font:italic 14px/1.4 var(--serif); text-align:center; }
    .late { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:4px 0 12px; }
    .late .ev { max-width:240px; } .late .evw { flex:none; }
    .tl { position:relative; margin-top:6px; }
    .heads, .lanes, .rules { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
    .heads .dh { padding:0 6px 6px; font-size:var(--fs-sm); font-weight:600; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .heads .we { color:var(--muted); font-weight:500; } .heads .today { color:var(--coral-ink); }
    .rules { position:absolute; left:0; right:0; top:24px; bottom:0; border-top:1px solid var(--line); }
    .rules > span { border-left:1px solid var(--line); } .rules > span:last-of-type { border-right:1px solid var(--line); }
    .rules > span.today { background:color-mix(in srgb, var(--coral) 5%, transparent); }
    .band { position:absolute; top:0; bottom:0; background:var(--band2); border-left:2px solid var(--band1); border-right:2px solid var(--band1); }
    .band b { position:absolute; left:7px; bottom:5px; font:700 var(--fs-xs)/1 var(--sans); letter-spacing:.07em; text-transform:uppercase; color:var(--coral-ink); white-space:nowrap; }
    .now { position:absolute; top:-3px; bottom:0; width:2px; margin-left:-1px; background:var(--coral); border-radius:2px; }
    .now::before { content:""; position:absolute; top:-3px; left:-3px; width:8px; height:8px; border-radius:50%; background:var(--coral); }
    .lanes { position:relative; padding:10px 0 12px; } .banded .lanes { padding-bottom:26px; }
    .col { display:flex; flex-direction:column; gap:5px; min-width:0; padding:0 4px; }
    .ev { position:relative; display:flex; align-items:center; min-width:0; height:26px; padding:0 8px; border-radius:var(--r-sm); border:1px solid transparent; font:600 var(--fs-sm)/1 var(--sans);
      white-space:nowrap; cursor:pointer; outline-offset:2px; transition:transform .15s cubic-bezier(.23,1,.32,1), box-shadow .15s; }
    .ev .t { overflow:hidden; text-overflow:ellipsis; }
    .col .ev { display:block; height:auto; padding:5px 7px 6px; white-space:normal; }
    .col .ev .t { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-height:1.2; overflow-wrap:anywhere; }
    .col .ev .s { display:block; margin-top:2px; font-weight:500; font-size:var(--fs-xs); line-height:1.2; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .col .ev.more { padding:4px 7px; text-align:center; background:var(--soft); color:var(--fg); border-color:var(--line); }
    .ev:hover, .ev:focus-visible { z-index:4; transform:translateY(-1px); box-shadow:0 6px 14px -6px rgba(29,36,51,.45); text-decoration:none; } .ev:active { transform:scale(.98); } .ev:focus-visible { outline:2px solid var(--ring); border-radius:var(--r-sm); }
    .ev.ok { background:#E2F1E9; color:#1F5C42; border-color:#BFE0CC; } .ev.wa { background:#FBEFD6; color:#744405; border-color:#F0D9A8; }
    .ev.ex { background:color-mix(in srgb, var(--coral) 82%, #000); color:var(--on-coral); } .ev.ex .s { opacity:1; } .ev.in { background:var(--bg); color:var(--fg); border-color:var(--line); border-left:3px solid var(--fg); } .ev.bd { background:#FCE4DD; color:#912713; border-color:#F6C3B5; }
    .tip { position:absolute; left:0; bottom:calc(100% + 7px); z-index:5; display:grid; gap:1px; width:max-content; max-width:260px; padding:7px 10px; border-radius:var(--r-sm);
      background:var(--fg); color:var(--bg); font:500 var(--fs-sm)/1.4 var(--sans); white-space:normal; text-align:left; box-shadow:0 10px 24px -10px rgba(29,36,51,.5);
      opacity:0; visibility:hidden; transform:translateY(3px); pointer-events:none; transition:opacity .12s, transform .12s, visibility 0s .12s; }
    .tip b { font-weight:600; } .tip span { opacity:.78; }
    .ev.r .tip { left:auto; right:0; }
    .ev:hover .tip, .ev:focus-visible .tip { opacity:1; visibility:visible; transform:none; transition-delay:0s; }
    .evw { position:relative; min-width:0; }
    .ck { position:absolute; top:-7px; right:-5px; z-index:3; width:20px; height:20px; padding:0; border-radius:50%; font:700 var(--fs-xs)/18px var(--sans); text-align:center; color:var(--muted); background:var(--bg); border:1px solid var(--line);
      opacity:0; transition:opacity .12s, background-color .15s, color .15s; }
    .ck { opacity:.45; } .evw:hover .ck, .ck:focus-visible, .ck[aria-pressed="true"], .row .ck { opacity:1; } .ck[aria-pressed="true"] { background:var(--ok); border-color:var(--ok); color:var(--bg); }
    .row .ck { position:static; margin-right:6px; } .mc-i .ck { position:static; opacity:1; } .end { display:flex; align-items:center; } .row.dn .n { color:var(--muted); text-decoration:line-through; }
    .ev.dn { opacity:.55; } .ev.dn .t { text-decoration:line-through; } .ev.dn:hover, .ev.dn:focus-visible { opacity:1; }
    .prog { display:inline-flex; align-items:center; gap:6px; margin-left:auto; font:500 var(--fs-sm)/1 var(--sans); color:var(--muted); }
    .prog i { position:relative; width:18px; height:18px; border-radius:50%; } .prog i::after { content:""; position:absolute; inset:4px; border-radius:50%; background:var(--bg); }
    .mini { margin-left:auto; padding:2px 8px; font-size:var(--fs-sm); color:var(--muted); } .prog + .mini, .mini + .mini { margin-left:8px; } a.mini { border:1px solid var(--line); border-radius:var(--r-sm); text-decoration:none; }
    .seg { display:inline-flex; margin-left:12px; padding:2px; border-radius:var(--r-pill); background:var(--track); }
    .seg button { padding:3px 10px; border:0; border-radius:var(--r-pill); background:none; font-size:var(--fs-sm); color:var(--muted); } .seg button:hover:not(:disabled) { transform:none; background:var(--bg); }
    .seg button[aria-checked="true"] { background:var(--bg); color:var(--fg); box-shadow:0 1px 2px rgba(29,36,51,.12); }
    .focus .row { padding:7px 0; border-top:1px solid var(--line); } .focus .row:first-child { border-top:0; } .focus .row { grid-template-columns:112px minmax(0,1fr) auto; }
    .natv + .find, .find + .natv { margin-left:8px; } .find { margin-left:auto; padding:4px 10px; font-size:var(--fs-sm); color:var(--muted); } .find + .brand { margin-left:12px; }
    .pal-back { position:fixed; inset:0; background:rgba(29,36,51,.38); }
    .pal { position:fixed; left:50%; top:12vh; width:min(620px, calc(100vw - 32px)); transform:translateX(-50%); background:var(--paper); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:0 24px 60px -20px rgba(29,36,51,.55); overflow:hidden; }
    .pal-q { all:unset; box-sizing:border-box; display:block; width:100%; padding:14px 16px; font:500 16px/1.3 var(--sans); color:var(--fg); border-bottom:1px solid var(--line); }
    .pal-r { max-height:min(420px, 60vh); overflow:auto; padding:6px; }
    .pal-i { display:grid; grid-template-columns:76px minmax(0,1fr); gap:10px; align-items:center; padding:7px 10px; border-radius:var(--r-sm); cursor:pointer; } .pal-i.on { background:var(--bg); box-shadow:inset 0 0 0 1px var(--line); }
    .pal-k { font-size:var(--fs-xs); font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--coral-ink); } .pal-e { padding:14px 10px; color:var(--muted); font:italic 14px/1.4 var(--serif); }
    .wnew .nt-i { display:block; padding-left:16px; position:relative; } .wnew .nt-i::before { content:""; position:absolute; left:2px; top:50%; width:6px; height:6px; margin-top:-3px; border-radius:50%; background:var(--coral); }
    .changes .row { grid-template-columns:72px minmax(0,1fr) auto; } .changes .pill.nt { justify-self:start; text-transform:uppercase; font-size:var(--fs-xs); letter-spacing:.05em; }
    .pal-s { padding:8px 16px; border-top:1px solid var(--line); font-size:var(--fs-sm); color:var(--muted); }
    .sc { font:600 var(--fs-lg)/1.2 var(--serif); white-space:nowrap; } .sc small { font:500 var(--fs-xs) var(--sans); color:var(--muted); }
    h3[role=button] { cursor:pointer; user-select:none; } h3[role=button]::before { content:"▾"; font:12px/1 var(--sans); color:var(--muted); transition:transform .15s; }
    .folded > h3[role=button]::before { transform:rotate(-90deg); } .folded > :not(h3) { display:none !important; } .folded > h3 { margin-bottom:0; }
    .simi { all:unset; box-sizing:border-box; width:100%; max-width:180px; padding:4px 8px; border:1px dashed var(--coral); border-radius:var(--r-sm); background:var(--bg); font:600 var(--fs-md)/1.2 var(--sans); color:var(--fg); }
    .simi::placeholder { font-weight:400; font-style:italic; color:var(--muted); } .simi:focus { border-style:solid; } .cring.simulating { border-color:var(--coral); border-style:dashed; }
    .notes { margin-top:10px; padding:10px 12px; } .notes[hidden] { display:none; } .notes textarea { all:unset; box-sizing:border-box; display:block; width:100%; min-height:90px; font:14px/1.5 var(--sans); color:var(--fg); white-space:pre-wrap; }
    .add { display:grid; grid-template-columns:minmax(0,1fr) 140px auto; gap:6px; margin:4px 0 8px; }
    .side { padding:12px; } .side-h { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font:600 var(--fs-lg)/1.2 var(--serif); } .side .notes:first-of-type { margin-top:0; }
    .chk h3 { margin:0 0 6px; } .chk .add { grid-template-columns:minmax(0,1fr) 140px auto; } .side .chk .add { grid-template-columns:1fr auto; } .side .chk .add input[type=text] { grid-column:1 / -1; } .side .chk .row { grid-template-columns:64px minmax(0,1fr) auto; } .chk ul { list-style:none; margin:0; padding:0; } .chk .row { grid-template-columns:76px minmax(0,1fr) auto; border-top:1px solid var(--line); padding:5px 0; } .chk .row:first-child { border-top:0; }
    .add input { all:unset; box-sizing:border-box; padding:6px 10px; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); font:13px/1.3 var(--sans); color:var(--fg); }
    .add input:focus { border-color:var(--coral); } .tasks .row { grid-template-columns:76px minmax(0,1fr) auto; } .tasks .row.sub { padding-top:2px; padding-bottom:2px; border-top:0; font-size:.94em; } .tasks .row.sub .add { grid-column:2 / -1; margin:0; grid-template-columns:minmax(0,1fr) auto; } .ck.del { margin-left:2px; }
    @container cp (max-width:520px) { .add { grid-template-columns:1fr 1fr; } .add button { grid-column:1 / -1; } }
    .meta { display:inline-flex; align-items:center; gap:4px; margin-left:auto; font-size:var(--fs-sm); color:var(--muted); } .meta b { min-width:22px; text-align:center; font:600 var(--fs-base)/1 var(--serif); color:var(--fg); }
    .meta button { width:22px; height:22px; padding:0; border-radius:50%; font-size:var(--fs-md); line-height:20px; } .keep { display:inline-flex; align-items:center; gap:4px; } .keep[hidden] { display:none; }
    .calnav { display:inline-flex; align-items:center; gap:6px; margin-left:14px; } .calnav button { padding:3px 10px; } .calt { min-width:150px; text-align:center; font:600 16px/1 var(--serif); text-transform:capitalize; }
    .cal { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:1px; padding:0; overflow:hidden; background:var(--line); }
    .cwd { padding:8px 10px; background:var(--soft); font-size:var(--fs-xs); font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
    .cday { min-height:118px; padding:6px; background:var(--bg); display:flex; flex-direction:column; gap:4px; min-width:0; } .cday.off { background:var(--soft); } .cday.we { background:color-mix(in srgb, var(--soft) 55%, var(--bg)); }
    .cday .cn { display:inline-grid; place-items:center; height:24px; font:600 var(--fs-md)/1 var(--serif); color:var(--muted); } .cday.today .cn { display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--coral); color:var(--on-coral); }
    .cday .ev { height:auto; padding:3px 6px; font-size:var(--fs-xs); border-radius:var(--r-sm); } .cday .ev .t { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cday .ev.more { background:var(--soft); color:var(--fg); border-color:var(--line); justify-content:center; }
    .av { display:inline-grid; place-items:center; flex:none; border-radius:50%; overflow:hidden; background:var(--soft); color:var(--muted); font:600 var(--fs-xs)/1 var(--sans); border:1px solid var(--line); }
    .av img { width:100%; height:100%; object-fit:cover; display:block; }
    :host-context(html.cp-dark) :is(img, .band-c) { filter:invert(1) hue-rotate(180deg); }   /* the panel darkens with the page (same inversion); photos and the course color stay true */
    .news .row { grid-template-columns:auto minmax(0,1fr) auto; } .news .row > .d:first-child { min-width:96px; } .d.lt { color:var(--bad); font-weight:600; } .who { position:relative; display:inline-flex; } .who .dot { position:absolute; right:-1px; top:-1px; border:2px solid var(--bg); width:9px; height:9px; }
    .teachers { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
    .teacher { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--line); border-radius:var(--r-md); background:var(--bg); }
    .ask-b { margin-left:0 !important; color:var(--coral-ink) !important; border-color:color-mix(in srgb, var(--coral) 40%, var(--line)) !important; font-weight:600; }
    .hero { position:relative; display:flex; align-items:center; gap:14px; margin:0 -14px 12px; padding:16px 14px 14px; border-bottom:1px solid var(--line); border-radius:var(--r-md) 13px 0 0; overflow:hidden; }   /* the color band follows the box corners */
    .gt .gtn { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .gcard { display:grid; gap:10px; margin-bottom:12px; } .gcard > div > .card { margin:0; }
    .gt-top { display:flex; align-items:center; flex-wrap:wrap; gap:6px 12px; padding:10px 12px; border-bottom:1px solid var(--line); } .gt-top .seg { margin:0; } .gt-help { font-size:var(--fs-sm); }
    .seg button[aria-pressed="true"] { background:var(--bg); color:var(--fg); box-shadow:0 1px 2px rgba(29,36,51,.12); font-weight:600; }
    .gt .simi.mine { border-style:solid; border-color:var(--ok); color:var(--ok); } .gt .simi[aria-invalid="true"] { border-color:var(--bad); color:var(--bad); } .gt .ir .n .dt { flex:none; } .gt .g small { color:var(--muted); font-weight:400; } .gt .simi { max-width:72px; text-align:center; }
    .gt-f { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-top:1px solid var(--line); } .gt-f .t { font-size:var(--fs-base); white-space:normal; } .gt-f .t-ok { color:var(--ok); } .gt-f .t-warn { color:var(--warn); } .gt-f .t-bad { color:var(--bad); }
    .fdet { margin:0 0 12px; } .fdet > summary { cursor:pointer; padding:6px 2px; color:var(--muted); font-size:var(--fs-md); } .fdet[open] > summary { margin-bottom:8px; }
    .centro-sim { display:grid; gap:8px; } .sim-h { display:flex; justify-content:space-between; align-items:center; } .sim-rows { display:grid; gap:4px; }
    .sim-r { display:grid; grid-template-columns:minmax(0,1fr) auto 70px; gap:10px; align-items:center; padding:4px 0; border-top:1px solid var(--line); } .sim-r .n { font-size:var(--fs-md); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .sim-r input { width:70px; padding:5px 8px; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); color:var(--fg); font:600 var(--fs-base) var(--sans); text-align:center; } .sim-r input:focus { outline:2px solid var(--coral); outline-offset:1px; } .centro-sim label { display:flex; align-items:center; gap:10px; } .centro-sim input[type=range] { flex:1; accent-color:var(--coral); }
    .band-c { position:absolute; left:0; right:0; top:0; height:4px; background:var(--coral); } .htxt { flex:1; min-width:0; }
    .ht { display:flex; align-items:center; gap:8px; } .ht b { font:600 var(--fs-2xl)/1.2 var(--serif); letter-spacing:-.01em; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow-wrap:anywhere; }   /* a long course name: two lines, not cut at "Banco de D..." */
    .hs { margin-top:3px; color:var(--muted); font-size:var(--fs-sm); } .hteach { display:flex; align-items:center; gap:10px; flex:none; } .hteach .mid { max-width:180px; }
    .ctabs { display:flex; gap:4px; margin:12px 0 10px; padding:3px; border-radius:var(--r-md); background:var(--track); width:fit-content; max-width:100%; overflow-x:auto; }
    .ctabs button { border:0; background:none; padding:6px 14px; border-radius:var(--r-sm); font-size:var(--fs-md); color:var(--muted); white-space:nowrap; } .ctabs button:hover:not(:disabled) { transform:none; background:var(--bg); }
    .ctabs button[aria-selected="true"] { background:var(--bg); color:var(--fg); box-shadow:0 1px 2px rgba(29,36,51,.12); }
    .cpane[hidden] { display:none; } .cpane > * + * { margin-top:10px; }
    .mq { all:unset; box-sizing:border-box; display:block; width:100%; margin:4px 0 10px; padding:7px 10px; border:1px solid var(--line); border-radius:var(--r-sm); background:var(--bg); font:13px/1.3 var(--sans); color:var(--fg); }
    .mod + .mod { margin-top:10px; } .mh { padding:4px 0; font-size:var(--fs-sm); font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
    .mi { display:grid; grid-template-columns:76px minmax(0,1fr); gap:10px; align-items:center; padding:6px 4px; border-top:1px solid var(--line); }
    .mcal { display:grid; grid-template-columns:260px minmax(0,1fr); gap:20px; padding:14px; }
    .mc-h { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; } .mc-h b { font:600 var(--fs-base)/1 var(--serif); text-transform:capitalize; }
    .mc-h button { width:26px; height:26px; padding:0; border-radius:var(--r-sm); font-size:var(--fs-base); }
    .mc-g { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; } .mc-w { text-align:center; font-size:var(--fs-xs); font-weight:600; color:var(--muted); padding:2px 0 4px; }
    .mc-day { position:relative; display:grid; place-items:center; height:34px; padding:0; border:0; border-radius:var(--r-sm); background:none; font:500 var(--fs-sm)/1 var(--sans); color:var(--fg); }
    .mc-day:hover:not(:disabled) { background:var(--soft); transform:none; } .mc-day.has { font-weight:700; } .mc-day.on { background:var(--fg); color:var(--bg); }
    .mc-day.today > span:first-child { display:grid; place-items:center; width:24px; height:24px; border-radius:50%; box-shadow:inset 0 0 0 1.5px var(--coral); }
    .mc-dots { position:absolute; bottom:3px; left:0; right:0; display:flex; justify-content:center; gap:2px; } .mc-dots i, .mc-i > i { width:5px; height:5px; border-radius:50%; background:var(--warn); }
    .mc-dots i.ex, .mc-i.ex > i { background:var(--coral); } .mc-dots i.ok, .mc-i.ok > i { background:var(--ok); }
    .mc-k { display:flex; justify-content:space-between; align-items:center; font-size:var(--fs-xs); font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:4px 0 8px; }
    .mc-i { display:grid; grid-template-columns:8px 78px minmax(0,1fr) 20px; gap:8px; align-items:center; padding:7px 0; border-top:1px solid var(--line); } .mc-i:first-of-type { border-top:0; }
    .mc-i.ok .n { color:var(--muted); text-decoration:line-through; } .mc-d { font-size:var(--fs-sm); color:var(--muted); white-space:nowrap; } .mc-d.lt { color:var(--bad); font-weight:600; }
    @container cp (max-width:620px) { .mcal { grid-template-columns:minmax(0,1fr); } }
    :host(.cp-headhost) { display:inline-block; margin:0 8px 0 0; vertical-align:middle; }
    .box.head { container-type:normal; border:0; background:none; box-shadow:none; padding:0; }
    .box.head .hd { margin:0; gap:0; height:42px; box-sizing:border-box; padding:4px 4px 4px 12px; border:1px solid var(--line); border-radius:var(--r-lg); background:var(--bg); box-shadow:0 1px 2px rgba(29,36,51,.06); }
    .box.head .hd b { margin-left:8px; }
    .box.head .seg { margin:0 10px 0 14px; } .box.head .seg button { padding:5px 12px; font-size:var(--fs-sm); }
    .box.head .meta { margin:0; padding:0 10px; height:22px; border-left:1px solid var(--line); }
    .box.head .pfold { margin:0; height:32px; padding:0 12px; border:0; border-left:1px solid var(--line); border-radius:0 10px 10px 0; background:none; font-size:var(--fs-sm); } .box.head .pfold:hover { background:var(--soft); color:var(--fg); transform:none; }
    .box.nohd { padding-top:14px; }
    /* phones (Canvas in a mobile browser, with the bookmarklet or a mobile extension): nothing wider than the screen */
    @media (max-width:1024px) {   /* the bar next to the greeting overflowed the window between 600 and 1024px */
      :host(.cp-headhost) { display:block; max-width:100%; margin:8px 0 0; }
      .box.head .hd { flex-wrap:wrap; height:auto; row-gap:6px; padding:6px 6px 6px 10px; } .box.head .seg { margin:0 6px; } .box.head .meta, .box.head .pfold { border-left:0; }
      h3 { flex-wrap:wrap; row-gap:4px; }
      .hero { flex-wrap:wrap; } .hero .htxt { flex:1 1 100%; } .hteach { flex:1 1 100%; }
    }
    .pfold { margin-left:10px; padding:4px 10px; font-size:var(--fs-sm); color:var(--muted); }
    .box.pfolded { padding-bottom:0; } .box.pfolded > :not(.hd) { display:none !important; } .box.pfolded > .hd { margin-bottom:0; border-bottom:0; } .box.pfolded .seg, .box.pfolded .meta { display:none; } .box.pfolded .pfold:not(.pnotes) { margin-left:auto; } .box.pfolded .pnotes { display:none; } .box.head .pnotes { border-radius:0; } .pnotes[aria-pressed="true"] { color:var(--coral-ink); }
    .wl { display:none; }
    @container cp (max-width:760px) { .tl { display:none; } .wl { display:block; } }
    @media (prefers-reduced-motion:reduce) { button, .ev, .tip, a.card, [data-tip]::after { transition:none; } a.card:hover, a.card:active { transform:none; } button:hover:not(:disabled), button:active:not(:disabled), .ev:hover, .ev:focus-visible, .ev:active { transform:none; } }
    `;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // a row of radio buttons: one Tab stop, the arrows move and choose (as the popup's own groups and the course tabs)
  // id: a group the click redraws (the mode switch): the new one takes the focus back (radioFocus)
  let radioAgain = null;
  const radioOn = x => (x.getAttribute ? x.getAttribute("aria-checked") : x["aria-checked"]) === "true";
  const radioKeys = (list, id) => {
    if (id && radioAgain === id) { radioAgain = null; const c = list.find(radioOn); if (c && c.focus) setTimeout(() => c.focus(), 0); }
    list.forEach((b, i) => {
      b.tabIndex = radioOn(b) || (i === 0 && !list.some(radioOn)) ? 0 : -1;
      b.addEventListener("focus", () => list.forEach(x => { x.tabIndex = x === b ? 0 : -1; }));   // a click focuses the button: the Tab stop follows it
      b.addEventListener("keydown", e => { const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0; if (!d) return;
        e.preventDefault(); const nx = list[(i + d + list.length) % list.length]; list.forEach(x => { x.tabIndex = x === nx ? 0 : -1; }); if (nx.focus) nx.focus(); if (id) radioAgain = id; if (nx.click) nx.click(); });
    });
  };
  const mark = () => { const m = el("span", "mk"); m.setAttribute("aria-hidden", "true"); return m; };   // the logo tile, drawn in CSS
  const wordmark = () => { const b = el("b", null, "Caderno"); b.appendChild(el("i", null, "+")); b.setAttribute("aria-label", "Caderno+"); return b; };

  // A panel in a shadow root at the top of the page content; null when it is already there or the page has no content area.
  // the Caderno+ bar in the classic dashboard header (title item, actions): in front of Canvas's buttons, its switch to the
  // new view hidden (the ⋮ menu stays)
  function headBar(hd) {
    const layout = document.querySelector ? document.querySelector(".ic-Dashboard-header__layout") : null, row = layout && layout.firstElementChild;
    const acts = row && row.tagName !== "H1" && row.children && row.children.length > 1 ? row.lastElementChild : null;
    if (!acts) return false;
    const old = document.getElementById("cp-head"); if (old) old.remove();   // a redraw builds a new panel: one bar, the live one
    let at = acts;   // next to the buttons themselves, so the ⋮ stays on the same line
    for (const b of acts.querySelectorAll("button")) if (/nova visualiza/i.test(b.textContent || "") || /switch-to-new/.test(b.getAttribute("data-testid") || "")) { b.classList.add("cp-off"); at = b.parentNode || acts; }
    const host = el("div", "cp-host cp-headhost"); host.id = "cp-head";
    // a phone or a narrow window (up to 1024px): Canvas keeps the greeting and its buttons on one row; the bar goes under the greeting instead of past the screen
    if (typeof matchMedia === "function" && matchMedia("(max-width:1024px)").matches && row.style && acts.style) { row.style.flexWrap = "wrap"; acts.style.flex = "1 1 100%"; acts.style.maxWidth = "100%"; acts.style.minWidth = "0"; }
    const root = shadow(host), wrap = el("div", "box head");
    styleRoot(root); wrap.appendChild(hd); root.append(wrap); at.prepend(host);
    return true;
  }
  // Our CSS parsed once and shared by every panel (constructable stylesheet); a <style> per root where that is missing.
  let sheet = null;
  const styleRoot = root => {
    try { if (!sheet && typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in root) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); } } catch (e) { sheet = null; }
    try { if (sheet) { root.adoptedStyleSheets = [sheet]; return; } } catch (e) { sheet = null; }
    const st = el("style"); st.textContent = CSS; root.append(st);
  };
  // Labs: the new look being tested, for the students who turn it on (popup, aba Mais); a bar says so, with the way back
  let labsOn = false;
  const LABS_ISSUE = "https://github.com/Bossmann007/Campus/issues/new?title=" + encodeURIComponent("Labs: o que achei do visual novo") + "&body=" + encodeURIComponent("Versão " + chrome.runtime.getManifest().version + "\n\nO que ficou melhor:\n\nO que piorou ou ficou estranho:\n\n(página pública: não ponha notas nem dados pessoais)");
  const labsBar = () => { const b = el("div", "labs-bar"), say = el("a", "labs-say", "Dar opinião ↗"), back = el("button", "labs-back", "Voltar ao visual normal");
    say.href = LABS_ISSUE; say.target = "_blank"; say.rel = "noopener noreferrer"; back.type = "button";
    back.addEventListener("click", async () => { const { prefs: p } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, p, { labs: false }) }); });
    b.append(el("span", "labs-tag", "Labs"), el("span", "labs-t", "Você está testando o visual novo do Caderno+"), say, back); return b; };
  const setLabs = on => { labsOn = !!on; for (const h of document.querySelectorAll ? document.querySelectorAll(".cp-host") : []) if (h.classList) h.classList.toggle("labs", labsOn); };
  function panelHost(id) {
    const anchor = document.getElementById("content");
    if (document.getElementById(id) || !anchor) return null;
    const host = el("div", "cp-host" + (labsOn ? " labs" : "")); host.id = id;
    const root = shadow(host), box = el("div", "box");
    styleRoot(root); box.appendChild(labsBar()); root.append(box); anchor.prepend(host);
    root.addEventListener("pointermove", e => { if (!labsOn || !e.target || !e.target.closest) return; const c = e.target.closest(".card"); if (!c || !c.getBoundingClientRect) return; const r = c.getBoundingClientRect(); c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px"); }, { passive: true });   // Labs: the border light follows the mouse
    return box;
  }
  // Placement: on the classic dashboard, right above its course cards (#DashboardCard_Container, outside its React root);
  // on the widget dashboard, at the top of #content (never inside its React grid). The watcher re-applies the Notas do curso
  // badges when React redraws that widget.
  let dashWatch = null, widgets = null;
  // the widget dashboard is on screen: its ENV flag, and not the classic dashboard (whose cards container is in the page
  // HTML; the flag stays true after the student switches back to the old view)
  const widgetDash = () => widgets != null ? widgets : (widgets = !document.getElementById("DashboardCard_Container") && [...(document.scripts || [])].some(sc => /"widget_dashboard":true/.test(sc.textContent || "")));
  let cardsFirst = false;   // prefs.cardsFirst: Canvas's course cards above our panel
  function placeDash() {
    const host = document.getElementById("cp-dash"), q = sel => document.querySelector ? document.querySelector(sel) : null;
    const cols = q("#DashboardCard_Container");   // the classic dashboard: next to its cards (outside its React root); the widget dashboard keeps ours at the top of #content
    if (!host || !cols || !cols.parentNode) return;
    host.style.marginTop = cardsFirst ? "8px" : "";
    if (cardsFirst) { if (cols.nextSibling !== host) cols.parentNode.insertBefore(host, cols.nextSibling); }
    else if (host.nextSibling !== cols) cols.parentNode.insertBefore(host, cols);
    fitNotes();
  }
  // The Anotações column floats at the top right, beside our panel: the panel keeps at least the column's height, so
  // Canvas's cards always start below it at full width (a short panel, as in Foco, used to let the cards wrap around it).
  // Cards first: the column is beside the cards and the panel, below them, needs no room.
  function fitNotes() {
    const n = document.getElementById("cp-notes"), d = document.getElementById("cp-dash");
    if (d && d.style) d.style.minHeight = n && !cardsFirst ? ((n.offsetHeight || 420) + 44) + "px" : "";
  }
  // Its "Notas do curso" widget shows Canvas's current score (only what is graded, without the Plano de Ensino weights, so
  // 92% halfway through the term). On our subjects the card keeps its picture and gets our numbers instead: points
  // guaranteed of 10, the share of the term secured and what is still needed. Canvas's figure is hidden by a stylesheet
  // of ours (not React's), and the badge comes back if React redraws the card.
  let gradeA = null, hiddenIds = [];
  function hideGradeCards(ids) {
    hiddenIds = ids || hiddenIds;
    let st = document.getElementById("cp-hidden");
    if (!st) { st = el("style"); st.id = "cp-hidden"; (document.head || document.body).appendChild(st); }
    st.textContent = hiddenIds.length ? hiddenIds.map(id => '[data-testid="course-grade-card-' + id + '"]').join(",") + " { display:none !important; }" : "";
  }
  function enhanceGradeCards() {
    const a = gradeA;
    if (!a || !document.querySelectorAll) return;
    const hide = [];
    for (const card of document.querySelectorAll('[data-testid^="course-grade-card-"]')) {
      const id = (card.getAttribute("data-testid") || "").slice("course-grade-card-".length), c = a.byCanvasId[id];
      if (!c || !a.has) continue;
      hide.push('[data-testid="course-' + id + '-grade"]');
      if (card.querySelector('[data-cp-grade]')) continue;
      const st = a.state(c), name = card.querySelector('[data-testid="course-' + id + '-name"]'), b = el("div");
      b.setAttribute("data-cp-grade", "1"); b.title = "Caderno+: pesos do Plano de Ensino, meta " + fmt(T, T % 1 ? 1 : 0) + ". O Canvas mostra só a média do que já foi lançado.";
      const tn = C.statusTone(st), col = { ok: "#2F7D5B", warn: "#A8650F", bad: "#C2361F" }[tn] || "#A8650F", pct = Math.round(Math.min(10, st.earned) * 10);
      b.style.cssText = "display:flex;align-items:center;gap:10px;margin:8px 0 2px;font:500 12.5px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#5F6675";
      const big = el("b", null, earnedText(st)); big.style.cssText = "font:600 22px/1 'Iowan Old Style','New York',Georgia,serif;color:" + col;
      const of = el("span", null, "de 10"), txt = el("span", null, pct + "% garantido"), lab = el("b", null, a.label(st));
      lab.style.cssText = "display:block;font-weight:600;color:" + col;
      const bar = el("i"); bar.style.cssText = "display:block;height:5px;margin-top:4px;border-radius:9px;background:linear-gradient(90deg," + col + " " + pct + "%,#EEE9DE " + pct + "%)";
      const right = el("span"); right.style.cssText = "flex:1;min-width:0"; right.append(lab, txt, bar);
      b.append(big, of, right);
      if (name && name.parentNode) name.parentNode.insertBefore(b, name.nextSibling); else card.appendChild(b);
    }
    let st = document.getElementById("cp-grades");
    if (!st) { st = el("style"); st.id = "cp-grades"; (document.head || document.body).appendChild(st); }
    const css = hide.length ? hide.join(",") + " { display:none !important; }" : ""; if (st.textContent !== css) st.textContent = css;   // a rewrite restyles the whole page
  }
  function watchDash() {
    const root = document.getElementById("content");
    if (!root || dashWatch || typeof MutationObserver === "undefined") return;
    let t = 0;
    const ours = n => n && n.nodeType === 1 && (/^cp-|^qf-/.test(n.id || "") || (n.classList && n.classList.contains("cp-host")));
    dashWatch = new MutationObserver(recs => {   // our own panels moving in and out do not count
      if (recs.every(r => ours(r.target) || [...r.addedNodes, ...r.removedNodes].every(ours))) return;
      clearTimeout(t); t = setTimeout(() => { placeDash(); enhanceGradeCards(); if (window.cpHeadRetry) window.cpHeadRetry(); if (window.cpGreet) window.cpGreet(); }, 120); });
    dashWatch.observe(root, { childList: true, subtree: true });
    placeDash(); enhanceGradeCards();
  }
  const link = (text, url) => { const x = el(url ? "a" : "span", "n", text); if (url) x.href = url; x.title = text; return x; };
  const mid = (title, url, sub) => { const m = el("span", "mid"); m.append(link(title, url), el("div", "c", sub)); return m; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // A dashboard card folds to its title with a click on it (kept per card in chrome.storage.local "fold").
  let folds = {};
  function foldable(sec, h, key) {
    const set = on => { sec.className = sec.className.replace(/ folded$/, "") + (on ? " folded" : ""); h.setAttribute("aria-expanded", String(!on)); };
    h.tabIndex = 0; h.setAttribute("role", "button"); h.title = "Clique para recolher ou abrir";
    const flip = async e => {
      if (e && e.target && e.target !== h && e.target.tagName === "BUTTON") return;
      folds = Object.assign({}, folds, { [key]: !folds[key] }); set(folds[key]); await chrome.storage.local.set({ fold: folds });
    };
    h.addEventListener("click", flip); h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
    set(!!folds[key]);
  }
  const ago = iso => { const d = -days(iso); return d <= 0 ? "hoje" : d === 1 ? "ontem" : d < 7 ? "há " + d + " dias" : dmy(iso); };
  const needTone = u => u.req.impossible ? "bad" : u.req.f <= 1e-9 ? "ok" : "warn";

  // The next 7 days as a timeline (today + 6): a column per day, each item a chip in its due day (lanes so none overlap), the
  // exam days banded, a marker at the current time; overdue work in a row above. Narrow panels show the same days as a list
  // (both are built; a container query picks one). Every link goes through the same origin check as before.
  // onMark(x, on): tick work as done here (not exams, not what Canvas already counts as handed in); done work is greyed.
  function weekView(list, prefs, onMark) {
    const t = today(), cols = [0, 1, 2, 3, 4, 5, 6].map(addDays);
    const overdue = list.filter(x => x.late && !x.done && x.date < t), late = overdue.filter(x => !x.mine), next = list.filter(x => x.date >= t && x.date <= cols[6]);
    const status = x => x.done ? "entregue" : x.mine ? "feito" : x.late ? "atrasada" : x.exam ? (prefs.grades ? need(x.exam) : "prova") : x.task ? "a entregar" : "evento";
    const name = x => (x.exam && !/prova/i.test(x.title) ? "Prova: " : "") + x.title;   // core names already say "Prova do RA2"
    const kind = x => x.late && !fin(x) ? "bd" : fin(x) ? "ok dn" : x.exam ? "ex" : x.task ? "wa" : "in";
    const check = x => {
      if (x.exam || x.done || !onMark) return null;
      const b = el("button", "ck", "✓"); b.type = "button";
      b.setAttribute("aria-pressed", String(x.mine)); b.setAttribute("aria-label", (x.mine ? "Desmarcar: " : "Marcar como feito: ") + name(x));
      b.title = x.mine ? "Desmarcar" : "Marcar como feito (só aqui, o Canvas não muda)";
      b.addEventListener("click", e => { e.preventDefault(); onMark(x, !x.mine); });
      return b;
    };
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
    const sec = el("section", "card week"), h = el("h3", null, "Próximos 7 dias"), open = next.filter(x => (x.task || x.exam) && !fin(x)).length;
    h.appendChild(el("span", "pill " + (late.length ? "bad" : open ? "warn" : "ok"), late.length ? late.length + (late.length === 1 ? " atrasada" : " atrasadas") : open ? open + " pela frente" : "tudo entregue"));
    const work = next.filter(x => !x.exam), got = work.filter(fin).length;   // the week's progress: work done of all work
    if (work.length) {
      const pr = el("span", "prog"), r = el("i"), pct = got / work.length * 100;
      r.style.background = "conic-gradient(var(--ok) 0 " + pct + "%, var(--track) " + pct + "% 100%)";
      pr.append(r, el("span", null, got + " de " + work.length + " feitas"));
      pr.setAttribute("aria-label", got + " de " + work.length + " feitas nesta semana"); h.appendChild(pr);
    }
    foldable(sec, h, "week");
    const sem = el("a", "mini", "Semestre →"); sem.href = "/calendar"; sem.title = "O calendário do semestre inteiro"; h.appendChild(sem);
    const ics = el("button", "mini", "↓ .ics"); ics.type = "button"; ics.title = "Exportar entregas e provas para a sua agenda (Google, Outlook, celular)";
    ics.addEventListener("click", () => saveIcs(list)); h.appendChild(ics);
    sec.appendChild(h);
    if (overdue.length) {   // ticked overdue work stays here greyed (so it can be unticked) until it leaves the planner window
      const row = el("div", "late");   // the title's pill already counts them
      overdue.slice(0, 6).forEach(x => { const w = el("div", "evw"), ck = check(x); w.appendChild(chip(x, x.title + " · " + dmy(x.date))); if (ck) w.appendChild(ck); row.appendChild(w); });
      if (overdue.length > 6) row.appendChild(el("span", "muted", "+" + (overdue.length - 6)));
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
      for (const x of shown) {
        const w = el("div", "evw"), ck = check(x);
        w.appendChild(chip(x, name(x), col >= 4, x.done ? "✓ entregue" : x.mine ? "✓ feito" : x.exam ? (prefs.grades ? need(x.exam) : "prova") : x.due ? hhmm(x.due) : "dia todo"));
        if (ck) w.appendChild(ck);
        day.appendChild(w);
      }
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

    // the narrow fallback, grouped by day: built only when it is shown (on a wide panel it stays an empty, hidden list:
    // a third of the panel's elements were this list, never seen)
    const wl = el("ul", "wl"); let filled = false;
    const fill = () => {
      if (filled) return; filled = true;
      let group = null, rows = null;
      for (const x of next) {
        const g = cap(dayLabel(x.date));
        if (g !== group) { group = g; const day = el("li", "day"); rows = el("ul"); day.append(el("div", "dh", g), rows); wl.appendChild(day); }
        const right = el("span", "end"), ck = check(x);
        if (ck) right.appendChild(ck);
        right.appendChild(x.done ? el("span", "pill ok", "entregue") : x.mine ? el("span", "pill ok", "feito") : x.exam ? el("span", "pill " + (prefs.grades ? needTone(x.exam) : "nt"), prefs.grades ? need(x.exam) : "prova") : el("span"));
        const li = el("li", "row" + (fin(x) ? " dn" : ""));
        li.append(el("span", "d", x.due ? hhmm(x.due) : "–"), mid(name(x), x.url, x.course), right);
        rows.appendChild(li);
      }
    };
    if (typeof ResizeObserver === "function" && typeof getComputedStyle === "function") {
      const ro = new ResizeObserver(() => { if (getComputedStyle(wl).display !== "none") { fill(); ro.disconnect(); } });   // after layout, and again when the panel narrows
      ro.observe(sec);
    } else fill();
    sec.append(tl, wl);
    return sec;
  }

  // The calculator's components, drawn from the shared core: ring, next card, KPI row and subject tiles. A subject opens its
  // Canvas course page, where the course panel has the grades, the simulator and the notes.
  const toCampus = (tag, cls, id) => { const x = el(courseOf[id] ? "a" : tag, cls); if (courseOf[id]) x.href = "/courses/" + courseOf[id]; return x; };   // a subject opens its Canvas course (the panel there has everything)
  const earnedText = st => st.earned >= 10 ? "10" : fmt(Math.floor(st.earned * 10) / 10, 1);
  function ring(st, big) {
    const r = el("span", "ring" + (big ? " big" : "")), rp = C.ringParts(st), tn = C.statusTone(st), e = rp.earned * 100, f = (rp.earned + rp.future) * 100;
    r.style.background = "conic-gradient(var(--" + tn + ") 0 " + e + "%, var(--" + tn + "-s) " + e + "% " + f + "%, var(--track) " + f + "% 100%)";
    const goal = el("i"); goal.style.transform = "rotate(" + Math.min(T, 9.9) * 36 + "deg)"; r.title = "o tracinho é a sua meta (" + fmt(T, T % 1 ? 1 : 0) + ")";   // the goal mark on the ring
    r.append(goal, el("b", null, earnedText(st))); r.setAttribute("aria-hidden", "true");
    return r;
  }
  // the same hero for every source: a Centro or own-rule result {status, now, need} as a course state for ring/needBig
  const stOfResult = r => ({ status: r.status, earned: Math.max(0, r.now || 0), futureMax: Math.max(0, 10 - (r.now || 0)), fraction: r.status === "nao-da" ? 2 : r.need != null ? r.need / 10 : 0 });
  const gapText = r => r.status === "garantido" ? "meta " + fmt(T, T % 1 ? 1 : 0) + " garantida" : r.status === "nao-da" ? "nem com 10 no que falta: recuperação" : "faltam " + up(Math.max(0, T - r.now), 1) + " pontos pra meta " + fmt(T, T % 1 ? 1 : 0);
  // Big needed grade on 0-10 and its caption, as the calculator's hero card shows it.
  function needBig(st) {
    const nd = C.courseNeed(st), box = el("div", "big");
    const v = st.status === "garantido" ? "✓" : nd.impossible ? "nem com 10" : (nd.approx ? "≈ " : "") + up(nd.of10, 1);
    const cap = st.status === "garantido" ? "garantido" : st.status === "depende-atrasadas" ? "faltam notas antigas" : nd.impossible ? "nem com nota cheia" : "média que falta tirar (de 10)";
    box.append(el("b", "v t-" + (st.status === "depende-atrasadas" ? "warn" : nd.tone), v), el("span", null, cap));
    if (st.status === "garantido") box.title = C.GARANTIDO_TIP;
    return box;
  }
  // The dashboard's numbers, for any turma, each course from its best source: the student's own rule, the professor's
  // formula in the Centro de Notas, the professor's weights in Canvas, the Plano de Ensino weights transcribed by
  // Caderno+ (only where nothing official exists), else the sum of the Canvas points. The next delivery and what was
  // handed in come from Canvas. The chips pick every course or one (prefs.kpiCourse).
  const SRC = { aluno: "sua regra", centro: "fórmula do professor no Centro de Notas", canvas: "pesos que o professor pôs no Canvas", plano: "pesos do Plano de Ensino (transcritos pelo Caderno+)", soma: "soma dos pontos: confira na matéria" };
  // A course name short enough for a chip or a chart row, for any turma: "Resolução de Problemas de Natureza Discreta" → RPND.
  const nick = name => { const t = shortName(name).trim(); if (t.length <= 22) return t;
    const w = t.split(/\s+/).filter(x => x.length > 2 && !/^(das?|dos?|em|para|com|and|of)$/i.test(x)); return w.length >= 2 ? w.map(x => x[0].toUpperCase()).join("") : t.slice(0, 20) + "…"; };
  // Every course of the term with its number from its best source (AGENTS.md §5); the dashboard, its chips and the Canvas cards use this.
  function courseNumbers(a, cache) {
    const t = today(), nowMs = Date.now(); ruleCache = cache;
    const courses = cache.data.courses.filter(c => !hiddenNow.includes(String(c.id))), sem = a.rules ? C.semester(a.mine, a.grades, t, T) : null, U = [];
    for (const cv of courses) {
      const cid = String(cv.id), pack = a.byCanvasId[cid], acts = (cv.assignments || []).filter(x => x && Number(x.points) > 0 && !x.excused);
      if (pack && sem && a.has && sem.states[pack.id]) { const st = sem.states[pack.id];   // as the course page: the Plano only once a grade was read
        U.push({ cid, name: C.SHORT[pack.id] || nick(cv.name), full: shortName(cv.name), src: "plano", now: Math.min(10, st.earned), need: st.status === "precisa" ? st.fraction * 10 : null, status: st.status === "depende-atrasadas" ? "faltam" : st.status,
          items: sem.items.filter(x => x.course === pack).map(x => ({ s: x.s, date: x.item.date, tip: (C.SHORT[pack.id] || "") + " · " + x.item.name + " · " + dmy(x.item.date) })) }); continue; }
      const ownR = !!(myRules[cid] && (myRules[cid].own || myRules[cid].formula)), cr = ownR ? null : centroOf(cid);
      if (!cr && (a.expired || !acts.length)) continue;   // a Centro formula counts even with no Canvas activity
      const r = cr || customOf(cid), src = cr ? "centro" : r && r.mine ? "aluno" : r && r.canvasWeights ? "canvas" : "soma";   // the student's own rule first
      // now: a Centro formula with a hidden part keeps its value, marked ≈ (approx); a plain sum to check gets no number
      const guess = r && (r.unsure || (r.approx && r.status !== "precisa")), sure = r && !["erro", "acima", "vazio"].includes(r.status) && !guess && r.now != null;   // AGENTS.md §5: no "garantido" from a guess
      U.push({ cid, name: nick(cv.name), full: shortName(cv.name), src, now: sure ? r.now : r && r.approx && !r.unsure && r.now != null && r.status !== "erro" ? r.now : null, approx: !!(r && r.approx && !r.unsure), need: sure && r.status === "precisa" ? r.need : null, scaled: r && r.scaled ? r.total : 0, status: !r ? "sem" : r.status === "erro" ? "erro" : r.status === "acima" ? "acima" : guess ? "confira" : r.status, r,
        items: acts.map(x => { const d = x.due ? C.localISO(new Date(x.due)) : "9999-12-31"; return { s: x.score != null ? "ok" : x.submitted ? "sent" : x.missing || (x.due && Date.parse(x.due) < nowMs) ? "late" : "next", date: d, tip: shortName(cv.name) + " · " + x.name + (x.due ? " · " + dmy(d) : "") }; }) });
    }
    for (const u of U) { u.tone = u.need != null ? (u.need > 8 ? "bad" : "warn") : u.status === "garantido" ? "ok" : u.status === "nao-da" ? "bad" : "nt";
      u.label = u.status === "garantido" ? "garantido" : u.status === "nao-da" ? "recuperação" : u.need != null ? "precisa " + up(u.need, 1) + "/10" : u.status === "faltam" ? "faltam notas" : u.status === "erro" ? "fórmula com erro" : "confira"; }
    return { U, courses };
  }
  function gradesOverview(a, cache, clean, prefs = {}) {
    const out = [], nowMs = Date.now(); ruleCache = cache; let redrawOv = () => {};
    const { U, courses } = courseNumbers(a, cache);
    const shownU = () => { const one = U.filter(u => u.cid === KPI_COURSE); return one.length ? one : U; };   // a subject picked in the chips: only it
    if (!U.length) return out;
    const byCid = new Map(U.map(u => [u.cid, u]));
    // the next delivery: Canvas's own, by its official date
    const nextSlot = el("div", "nslot"), nextCard = () => { nextSlot.replaceChildren(); const only = shownU().length === 1 && U.length > 1 ? shownU()[0].cid : "";   // the picked subject's own next delivery
    const nx = courses.filter(c => !only || String(c.id) === only).flatMap(c => (c.assignments || []).filter(x => x && Number(x.points) > 0 && !x.excused && x.due && Date.parse(x.due) >= nowMs && !x.submitted && x.score == null).map(x => ({ c, x }))).sort((p, q) => Date.parse(p.x.due) - Date.parse(q.x.due))[0];
    if (nx) { const card = el("a", "card upnext"), left = el("div", "mid"), dd = C.localISO(new Date(nx.x.due)), d = days(dd), u = byCid.get(String(nx.c.id)), big = el("div", "big");
      if (typeof nx.x.url === "string" && nx.x.url.startsWith(location.origin + "/")) card.href = nx.x.url;
      left.append(el("div", "k", "Próxima entrega"), el("div", "t", nx.x.name), el("div", "c", (u ? u.name : shortName(nx.c.name)) + " · " + dmy(dd) + " " + hhmm(nx.x.due) + ", " + (d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias") + " · " + fmt(nx.x.points, 2) + " pts"));
      if (u && u.need != null) big.append(el("span", null, "precisa"), el("b", "v t-" + (u.need > 8 ? "bad" : "warn"), up(u.need, 1)), el("span", null, "de média no que falta (de 10)")); else if (u && u.status === "garantido") big.append(el("b", "v t-ok", "✓"), el("span", null, "meta garantida"));
      card.append(left, big); nextSlot.appendChild(card); } };
    nextCard(); out.push(nextSlot);
    const kpis = el("div", "kpis"), kpi = (k, v, cls, subEl) => { const d = el("div", "card kpi"); d.append(el("div", "k", k), el("div", "v" + (cls ? " " + cls : ""), v)); if (subEl) d.appendChild(subEl); kpis.appendChild(d); };
    const meterOf = x => { const m = el("div", "meter"), f = el("i"), g = el("b"); m.setAttribute("aria-hidden", "true"); f.style.width = Math.min(100, x * 10) + "%"; g.style.left = Math.min(99.5, T * 10) + "%"; m.append(f, g); return m; };
    const trackOf = items => { const trk = el("div", "trk"), its = items.slice().sort((p, q) => p.date.localeCompare(q.date)), n = k => its.filter(x => x.s === k).length;
      trk.setAttribute("aria-label", n("ok") + " com nota, " + n("sent") + " entregues esperando nota, " + n("late") + " sem nota e com prazo vencido, " + n("next") + " pela frente");
      trk.title = "verde: com nota · verde claro: entregue, esperando nota · laranja: vencida · cinza: pela frente";
      for (const x of its) { const b = el("i", x.s); b.dataset.tip = x.tip + " · " + (x.s === "ok" ? "com nota" : x.s === "sent" ? "entregue, esperando a nota" : x.s === "late" ? "prazo vencido, sem nota" : "pela frente"); trk.appendChild(b); }
      return { trk, done: n("ok") + n("sent"), total: its.length }; };
    const fill = cid => {
      kpis.replaceChildren(); const one = cid && byCid.get(cid), list = one ? [one] : U, num = list.filter(u => u.now != null && !u.approx);
      if (num.length) { const mean = num.reduce((s, u) => s + u.now, 0) / num.length, w = el("div"); w.append(meterOf(mean), el("div", "c", one ? one.name + " · " + SRC[one.src] : num.length === 1 ? "1 matéria com nota calculada" : "média das " + num.length + " matérias" + (num.some(u => u.status === "garantido") ? " · " + num.filter(u => u.status === "garantido").length + " já na meta" : "")));
        kpi("Garantido até agora", dn(mean), null, w); }
      else kpi("Garantido até agora", "—", null, el("div", "c", one ? (one.status === "erro" ? "a fórmula tem um erro: abra a matéria" : "sem número: confira a regra na matéria") : "nenhuma matéria com nota calculada"));
      const tight = list.filter(u => u.need != null).sort((p, q) => q.need - p.need)[0], rec = list.some(u => u.status === "nao-da"), anyFaltam = list.some(u => u.status === "faltam" || u.status === "confira" || u.status === "acima");
      if (tight) kpi("Precisa tirar", up(tight.need, 1), "need", el("div", "c", "média no que falta · " + (one ? one.name : tight.name + ", a mais apertada")));
      else if (rec) kpi("Precisa tirar", "—", "need", el("div", "c", one ? one.name + ", recuperação" : "recuperação em alguma matéria"));
      else if (num.length && !anyFaltam) kpi("Precisa tirar", "0", "need t-ok", el("div", "c", one ? one.name + ", garantido" : "tudo garantido"));
      else kpi("Precisa tirar", "?", "need", el("div", "c", one ? one.name + ", " + (one.status === "faltam" ? "faltam notas antigas" : "confira a regra na matéria") : "faltam notas ou regras: veja abaixo"));
      const tr = trackOf(list.flatMap(u => u.items)), w2 = el("div"); w2.append(tr.trk, el("div", "c per", one ? one.name : U.map(u => { const k = trackOf(u.items); return u.name + " " + k.done + "/" + k.total; }).join(" · ")));
      kpi("Entregues", tr.done + " de " + tr.total, null, w2);
    };
    const pickId = U.some(u => u.cid === KPI_COURSE) ? KPI_COURSE : "", pick = el("div", "seg kpis-pick"), chips = [];
    pick.setAttribute("role", "radiogroup"); pick.setAttribute("aria-label", "Matéria dos números");
    for (const [id, name] of [["", "Todas"]].concat(U.map(u => [u.cid, u.name]))) {
      const b = el("button", null, name); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(id === pickId)); b.dataset.id = id;
      if (id) { b.title = "Clique duas vezes para abrir a matéria"; b.addEventListener("dblclick", () => location.assign("/courses/" + id)); }
      b.addEventListener("click", async () => { KPI_COURSE = id; fill(id); redrawOv(); nextCard(); pickCards(); for (const x of chips) x.setAttribute("aria-checked", String(x === b));
        const { prefs: sp } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, sp, { kpiCourse: id }) }); });
      chips.push(b); pick.appendChild(b);
    }
    radioKeys(chips); fill(pickId);
    if (!clean) { if (U.length > 1) out.push(pick); out.push(kpis); }   // limpo: no KPI row, the list stays
    // each course with its number and where it comes from, as a chart (five views, the choice saved) or the plain list
    const SRCS = { aluno: "sua regra", centro: "Centro de Notas", canvas: "pesos do Canvas", plano: "Plano de Ensino", soma: "soma dos pontos" };
    const sec = el("section", "card centro ov"), head = el("div", "ovh"), seg = el("div", "seg ov-mode"), body = el("div", "ov-body"), modeBtns = [];
    const tipOf = u => u.full + " · " + (u.now == null ? "sem nota calculada" : dn(u.now) + " de 10 agora") + " · " + u.label + " · " + SRCS[u.src] + (u.scaled ? " (" + fmt(u.scaled, 0) + " pontos levados a 10)" : "");
    const nameCell = u => { const n = el("a", "ovn"); n.href = "/courses/" + u.cid; n.append(el("span", "n", u.name), el("span", "c", SRCS[u.src])); n.title = u.full; return n; };
    const gap = u => u.now == null ? null : Math.max(0, T - u.now);   // points still missing to the student's meta (BD: 7 − 6,5 = 0,5)
    const valCell = u => { const g = gap(u), v = el("span", "ovv pill " + u.tone, u.status === "confira" ? "confira" : u.status === "garantido" || g === 0 ? "✓" : u.status === "erro" ? "erro" : g == null ? "?" : "+" + up(g, 1) + " pts");
      v.title = u.status === "confira" ? "estimativa: confira na matéria" : u.status === "garantido" || g === 0 ? "meta garantida" : g == null ? "sem nota calculada" : "faltam " + up(g, 1) + " pontos para a meta " + fmt(T, T % 1 ? 1 : 0) + (u.need != null ? " (média de " + up(u.need, 1) + " no que falta)" : u.status === "nao-da" ? " · nem com 10 no que falta" : ""); return v; };
    const scale = () => { const r = el("div", "ovr ovscale"), ax = el("div", "ovbar ovax"); for (const v of ["0", "5", "10"]) ax.appendChild(el("span", null, v)); const mk = el("span", "ovmeta", "meta " + fmt(T, T % 1 ? 1 : 0)); mk.style.left = Math.min(99.5, T * 10) + "%"; ax.appendChild(mk); r.setAttribute("aria-hidden", "true"); r.append(el("span"), ax, el("span", "ovv")); return r; };
    const VIEWS = {
      barras: ["Barras", "nota garantida em cada matéria, de 0 a 10; a linha vermelha é a meta; cinza: faltam notas antigas", () => { const rows = shownU().map(u => { const r = el("div", "ovr"), bar = el("div", "ovbar"), f = el("i", u.tone), m = el("b");
          f.style.width = (u.now == null ? 0 : Math.min(100, u.now * 10)) + "%"; m.style.left = Math.min(99.5, T * 10) + "%"; bar.append(f, m); bar.dataset.tip = tipOf(u); bar.setAttribute("aria-label", tipOf(u));
          if (u.now != null) bar.appendChild(el("span", "ovin" + (u.now < 1.2 ? " low" : ""), (u.approx ? "≈ " : "") + dn(u.now)));   // inside the bar only when it fits (Labs: above it, always)
          else { const o = el("span", "ovin out", u.now != null ? dn(u.now) : u.status === "confira" ? "confira" : u.status === "erro" || u.status === "acima" ? "veja na matéria" : "sem nota"); o.style.left = "calc(" + (u.now == null ? 0 : Math.min(100, u.now * 10)) + "% + 6px)"; bar.appendChild(o); }   // and just after it when it does not
          bar.setAttribute("role", "img");
          r.append(nameCell(u), bar, valCell(u)); return r; }); return rows.concat(scale()); }],
      falta: ["Falta", "pontos que faltam até a meta em cada matéria, de quem falta mais para quem falta menos", () => shownU().slice().sort((p, q) => (gap(q) == null ? -1 : gap(q)) - (gap(p) == null ? -1 : gap(p))).map(u => { const r = el("div", "ovr"), bar = el("div", "ovbar"), f = el("i", u.tone);
          f.style.width = (gap(u) == null ? 0 : Math.min(100, gap(u) * 10)) + "%"; if (u.status === "nao-da") f.className = "bad hatch"; bar.append(f); bar.dataset.tip = tipOf(u); bar.setAttribute("aria-label", tipOf(u)); bar.setAttribute("role", "img");
          r.append(nameCell(u), bar, valCell(u)); return r; }).concat(scale())],
      aneis: ["Anéis", "quanto de 10 já está garantido; no meio, os pontos que faltam até a meta", () => { const g = el("div", "ovrings"); for (const u of shownU()) { const c = el("a", "ovring"), ring = el("div", "rg"), mid = el("b", null, u.status === "garantido" || gap(u) === 0 ? "✓" : gap(u) == null ? "?" : "+" + up(gap(u), 1));
          const pct = u.now == null ? 0 : Math.min(100, u.now * 10); ring.dataset.t = u.tone; ring.style.cssText = "--p:" + pct + "%;--m:" + Math.min(100, T * 10) + "%"; ring.appendChild(mid);
          c.href = "/courses/" + u.cid; c.dataset.tip = tipOf(u); c.setAttribute("aria-label", tipOf(u)); c.append(ring, el("span", "n", u.name), el("span", "c", (u.now == null ? "—" : dn(u.now)) + " garantido"));
          g.appendChild(c); } return [g]; }],
      entregas: ["Entregas", "cada quadradinho é uma atividade: verde com nota, verde claro entregue, laranja vencida, cinza pela frente", () => shownU().map(u => { const r = el("div", "ovr"), tr = trackOf(u.items); tr.trk.classList ? tr.trk.classList.add("ovtrk") : (tr.trk.className += " ovtrk");
          r.append(nameCell(u), tr.trk, el("span", "ovv pill nt", tr.done + "/" + tr.total)); return r; })],
      lista: ["Lista", "o mesmo em texto", () => { const ul = el("ul"); for (const u of shownU()) { const li = el("li", "row"), txt = u.status === "erro" ? "a fórmula tem um erro: abra a matéria" : u.status === "acima" ? "os pontos passam do total: ajuste na matéria" : u.status === "confira" ? "confira a regra na matéria antes de contar com isso"
          : u.status === "faltam" ? "faltam notas antigas" : u.status === "garantido" ? "meta garantida" : u.status === "nao-da" ? "nem com 10 no que falta" : u.need != null ? "precisa " + up(u.need, 1) + "/10 em média no que falta" : "sem número ainda";
          li.append(el("span", "d", u.now == null ? "—" : dn(u.now)), mid(u.full, "/courses/" + u.cid, txt + " · " + SRC[u.src] + (u.scaled ? " (" + fmt(u.scaled, u.scaled % 1 ? 1 : 0) + " pontos levados a 10)" : "")), valCell(u)); ul.appendChild(li); } return [ul]; }],
    };
    let curMode = "barras"; redrawOv = () => show(curMode);
    // one subject picked: under the chart, its numbers and each Canvas activity with its grade (what fills the box)
    const detail = u => { const cv = courses.find(c => String(c.id) === u.cid), w = el("div", "ovdet"), stats = el("div", "ovstats"), ul = el("ul", "ovacts"), g = gap(u);
      const stat = (k, v, cls) => { const d = el("div", "ovst"); d.append(el("span", "c", k), el("b", cls || null, v)); stats.appendChild(d); };
      stat("Garantido", u.now == null ? "—" : dn(u.now)); stat("Até a meta " + fmt(T, T % 1 ? 1 : 0), u.status === "garantido" || g === 0 ? "✓" : g == null ? "?" : "+" + up(g, 1), "t-" + (u.tone === "nt" ? "warn" : u.tone));
      stat("Média no que falta", u.need != null ? up(u.need, 1) : u.status === "garantido" ? "—" : u.status === "nao-da" ? "rec." : "?"); const tr = trackOf(u.items); stat("Entregues", tr.done + " de " + tr.total); stat("Fonte", SRCS[u.src]);
      const acts = ((cv && cv.assignments) || []).filter(x => x && Number(x.points) > 0 && !x.excused).sort((p, q) => (p.due ? Date.parse(p.due) : 9e15) - (q.due ? Date.parse(q.due) : 9e15));
      for (const x of acts.slice(0, 14)) { const li = el("li", "ovact"), nmEl = el(typeof x.url === "string" && x.url.startsWith(location.origin + "/") ? "a" : "span", "n", x.name), bar = el("div", "ovbar sm"), f = el("i");
        if (nmEl.tag === "a" || nmEl.tagName === "A") nmEl.href = x.url; nmEl.title = x.name;
        const late = !x.submitted && x.score == null && x.due && Date.parse(x.due) < nowMs, st = x.score != null ? fmt(Number(x.score), 1) + "/" + fmt(Number(x.points), Number(x.points) % 1 ? 1 : 0) : x.submitted ? "entregue" : late ? "vencida" : x.due ? "até " + dmy(C.localISO(new Date(x.due))) : "sem data";
        f.className = x.score != null ? (Number(x.score) / Number(x.points) >= T / 10 ? "ok" : "warn") : x.submitted ? "nt" : late ? "bad hatch" : "nt"; f.style.width = (x.score != null ? Math.min(100, Number(x.score) / Number(x.points) * 100) : x.submitted || late ? 100 : 0) + "%";
        if (x.submitted && x.score == null) f.style.opacity = ".45"; bar.appendChild(f); bar.dataset.tip = x.name + " · " + st;
        li.append(nmEl, bar, el("span", "c", st)); ul.appendChild(li); }
      if (acts.length > 14) { const li = el("li", "ovact more"), l = el("a", "n", "ver as " + acts.length + " atividades na matéria →"); l.href = "/courses/" + u.cid; li.appendChild(l); ul.appendChild(li); }
      w.append(stats); if (acts.length) w.append(el("div", "k", "Atividades no Canvas"), ul); return w; };
    const cap = el("p", "c scale ovcap"), show = m => { curMode = m; const one = shownU().length === 1 && U.length > 1 ? shownU()[0] : null; body.replaceChildren(...VIEWS[m][2](), ...(one ? [detail(one)] : [])); body.dataset.mode = m; cap.textContent = VIEWS[m][1] + ". Meta " + fmt(T, T % 1 ? 1 : 0) + ". Passe o mouse para ver de onde vem cada número; na página da matéria você monta ou muda a sua regra.";
      for (const b of modeBtns) b.setAttribute("aria-checked", String(b.dataset.m === m)); };
    seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Como mostrar o quanto falta");
    const mode0 = VIEWS[prefs.ovMode] ? prefs.ovMode : "barras";
    for (const [m, v] of Object.entries(VIEWS)) { const b = el("button", null, v[0]); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.m = m; modeBtns.push(b); seg.appendChild(b);
      b.addEventListener("click", async () => { show(m); const { prefs: sp } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, sp, { ovMode: m }) }); }); }
    radioKeys(modeBtns);
    head.append(el("h3", null, "Quanto falta"), seg); sec.append(head, body, cap); show(mode0);
    out.push(sec);
    return out;
  }
  // The turma(s) whose rule pack gave these numbers (rules/<term>/<turma>.json).
  const source = cs => "Pesos do Plano de Ensino " + TERM + " · não oficial, confira no Canvas";
  // Instead of the grade parts: why they are not there (term over, or another turma); null when there is nothing to say.
  const noRules = a => a.expired ? C.EXPIRED_NOTE
    : a.term && !a.rules ? "O Quanto falta ainda não tem as regras da sua turma." : null;
  // Dashboard: the next assessment, the KPI row and the subject tiles (grades), the next 7 days of every course (week)
  // and the latest announcements (news); each part follows its switch in the popup.
  // Modes: completo (everything), limpo (only what matters: next assessment, subjects, the week, what is new) and foco
  // (one list: what to do now, nothing else). The page side (Canvas clutter hidden) is theme.js.
  const MODES = [["completo", "Completo"], ["limpo", "Limpo"], ["foco", "Foco"]];
  function focusView(list) {
    const t = today(), end = addDays(6), now = list.filter(x => (x.task || x.exam) && !fin(x) && (x.late ? x.date >= addDays(-7) : x.date >= t) && x.date <= end).slice(0, 7);
    const sec = el("section", "card week focus"), h = el("h3", null, "Agora");
    h.appendChild(el("span", "pill " + (now.some(x => x.late) ? "bad" : now.length ? "warn" : "ok"), now.length ? now.length + (now.length === 1 ? " coisa" : " coisas") : "nada pendente"));
    sec.appendChild(h);
    if (!now.length) { sec.appendChild(el("div", "empty", "Tudo em dia. Aproveita.")); return sec; }
    const ul = el("ul");
    for (const x of now) {
      const li = el("li", "row");
      li.append(el("span", "d" + (x.late ? " lt" : ""), x.late ? dmy(x.date) : cap(dayLabel(x.date)) + (x.due ? " " + hhmm(x.due) : "")), mid((x.exam && !/prova/i.test(x.title) ? "Prova: " : "") + x.title, x.url, x.course),
        x.exam ? el("span", "pill " + needTone(x.exam), need(x.exam)) : el("span", "pill " + (x.late ? "bad" : "warn"), x.late ? "atrasada" : "a entregar"));
      ul.appendChild(li);
    }
    sec.appendChild(ul); return sec;
  }
  function tasksCard(cache, marks, redraw) {
    const sec = el("section", "card news tasks"), h = el("h3", null, "Minhas tarefas"), open = myTasks.filter(t => !marks["own:" + t.id]);
    if (open.length) h.appendChild(el("span", "pill nt", open.length + (open.length === 1 ? " a fazer" : " a fazer")));
    sec.appendChild(h);
    const form = el("form", "add"), ti = el("input"), di = el("input"), ok = el("button", "primary", "Adicionar");
    ti.type = "text"; ti.placeholder = "Nova tarefa (ex.: revisar slides 5 sex)"; ti.setAttribute("aria-label", "Nova tarefa"); ti.maxLength = 140;
    di.type = "date"; di.setAttribute("aria-label", "Dia (opcional)"); ok.type = "submit";
    form.addEventListener("submit", async e => {
      e.preventDefault(); const pw = parseWhen(ti.value || ""), date = di.value || pw.date;
      if (!pw.title) return; await addTask(cache.user, pw.title, date); redraw();
    });
    form.append(ti, di, ok); sec.appendChild(form);
    const list = myTasks.slice().sort((x, y) => (!!marks["own:" + x.id] - !!marks["own:" + y.id]) || String(x.date || "9").localeCompare(String(y.date || "9")));
    const ul = el("ul");
    for (const t of list) {
      const done = !!marks["own:" + t.id], li = el("li", "row" + (done ? " dn" : "")), end = el("span", "end");
      const ck = el("button", "ck", "✓"); ck.type = "button"; ck.setAttribute("aria-pressed", String(done)); ck.setAttribute("aria-label", (done ? "Desmarcar: " : "Marcar como feito: ") + t.title);
      ck.addEventListener("click", async () => { await setMark(cache.user, { key: "own:" + t.id, date: t.date || addDays(0) }, !done); redraw(); });
      const del = el("button", "ck del", "×"); del.type = "button"; del.setAttribute("aria-label", "Apagar: " + t.title);
      del.addEventListener("click", async () => { await saveTasks(cache.user, l => l.filter(x => x.id !== t.id)); redraw(); });
      // steps of a task: { t, d } each, ten at most, kept inside the task
      const subs = Array.isArray(t.subs) ? t.subs.filter(s => s && s.t) : [], left = subs.filter(s => !s.d).length;
      const change = f => saveTasks(cache.user, l => l.map(x => x.id === t.id ? Object.assign({}, x, { subs: f(Array.isArray(x.subs) ? x.subs.filter(s => s && s.t) : []).slice(0, 10) }) : x)).then(redraw);
      const at = (l, i, s) => l[i] && l[i].t === s.t ? i : l.findIndex(x => x.t === s.t);   // another tab may have moved the steps: the same text, not just the same place
      const plus = el("button", "ck", "+"); plus.type = "button"; plus.setAttribute("aria-label", "Adicionar passo em: " + t.title);
      end.append(plus, ck, del);
      li.append(el("span", "d", t.date ? cap(dayLabel(t.date)) : "sem dia"), mid(t.title, null, (done ? "feita" : t.date && t.date < today() ? "atrasada" : "minha tarefa") + (subs.length ? " · " + (subs.length - left) + " de " + subs.length + " passos" : "")), end);
      ul.appendChild(li); let tail = li;
      subs.forEach((s, i) => {
        const sl = el("li", "row sub" + (s.d ? " dn" : "")), se = el("span", "end");
        const sk = el("button", "ck", "✓"); sk.type = "button"; sk.setAttribute("aria-pressed", String(!!s.d)); sk.setAttribute("aria-label", (s.d ? "Desmarcar passo: " : "Marcar passo como feito: ") + s.t);
        sk.addEventListener("click", () => change(l => { const k = at(l, i, s); return l.map((x, j) => j === k ? { t: x.t, d: !s.d } : x); }));
        const sd = el("button", "ck del", "×"); sd.type = "button"; sd.setAttribute("aria-label", "Apagar passo: " + s.t);
        sd.addEventListener("click", () => change(l => { const k = at(l, i, s); return l.filter((x, j) => j !== k); }));
        se.append(sk, sd); sl.append(el("span", "d", ""), mid(s.t), se); ul.appendChild(sl); tail = sl;
      });
      plus.addEventListener("click", () => {
        if (li.cpStep || subs.length >= 10) return; li.cpStep = true;
        const fl = el("li", "row sub"), f = el("form", "add step"), si = el("input"), sb = el("button", "primary", "Adicionar passo");
        si.type = "text"; si.placeholder = "Passo (ex.: ler o capítulo 3)"; si.setAttribute("aria-label", "Novo passo de: " + t.title); si.maxLength = 100; sb.type = "submit";
        f.addEventListener("submit", e => { e.preventDefault(); const v = String(si.value || "").trim().slice(0, 100); if (v) change(l => l.concat([{ t: v, d: false }])); });
        f.append(si, sb); fl.appendChild(f); tail.after ? tail.after(fl) : ul.appendChild(fl); if (si.focus) si.focus();
      });
    }
    if (list.length) sec.appendChild(ul); else sec.appendChild(el("div", "muted", "Coisas que não estão no Canvas: estudar, imprimir, levar material. Com dia, entram na semana e nos lembretes."));
    foldable(sec, h, "tasks"); return sec;
  }
  // Anotações on the dashboard: a column beside Canvas's course cards (the right sidebar our panel hides), opened from the
  // bar's Anotações button or Alt+N, kept open ("notesOpen"). Built once per page: a redraw of the panel keeps what is typed.
  function notesSide(cache, show) {
    let host = document.getElementById("cp-notes");
    const fit = () => { const r = document.documentElement; if (r && r.classList) r.classList.toggle("cp-notes-open", !!show); if (window.cpCards && gradeA) window.cpCards(gradeA); };   // the cards' columns follow the narrower box
    if (!show) { if (host) host.remove(); fit(); fitNotes(); return; }
    if (host) { fitNotes(); return; }
    const cols = document.querySelector ? document.querySelector("#DashboardCard_Container") : null;   // as placeDash finds it
    host = el("div", "cp-host cp-noteshost"); host.id = "cp-notes";
    const root = shadow(host), box = el("div", "box side"), h = el("div", "side-h"), close = el("button", "mini", "Fechar ×");
    close.type = "button"; close.setAttribute("aria-label", "Fechar as anotações"); close.addEventListener("click", () => toggleNotes(false));
    h.append(el("b", null, "Anotações"), close);
    const nb = notesBlock(cache, "painel", null, () => window.cpRedraw && window.cpRedraw());
    box.append(h, ...nb.nodes); styleRoot(root); root.append(box);
    host.cpBusy = nb.busy; host.cpFocus = () => nb.ta.focus && nb.ta.focus();
    if (cols && cols.parentNode) {   // always before our panel when it sits above the cards (never between the panel and the cards)
      const dash = document.getElementById("cp-dash"), ref = !cardsFirst && dash && (dash.parentNode || dash.parent) === cols.parentNode ? dash : cols;
      host.style.cssText = "float:right;width:300px;max-width:32%;margin:28px 0 12px 18px;position:relative;z-index:1"; cols.parentNode.insertBefore(host, ref);
      if (typeof ResizeObserver === "function") new ResizeObserver(() => { if (gone(host)) return; fitNotes(); }).observe(host);   // the checklist grows: the panel follows
    }
    else { const c = document.getElementById("content"); if (!c) return; c.prepend(host); }
    fit(); fitNotes();
  }
  let notesCache = null;
  async function toggleNotes(on) {
    const open = on != null ? on : !document.getElementById("cp-notes");
    if (notesCache) notesSide(notesCache, open);   // the page first, so a second quick click sees the new state
    const b = window.cpNotesBtn; if (b) b.setAttribute("aria-pressed", String(open));
    const h = document.getElementById("cp-notes"); if (open && on == null && h && h.cpFocus) h.cpFocus();
    await chrome.storage.local.set({ notesOpen: open });
  }
  let hiddenNow = [];
  function dashPanel(a, cache, prefs, marks, rec, onMode) {
    const mode = prefs.mode, clean = mode === "limpo";
    const grades = prefs.grades && a.has, why = prefs.grades && noRules(a), week = prefs.week && cache.planner, news = prefs.news && Array.isArray(cache.data.announcements);
    if (!prefs.dash && !a.askTurma) return;   // the student switched the Caderno+ panel off in the popup (the cards keep their grades); the turma question still shows
    if (!grades && !why && !week && !news && !(prefs.newgrades && rec && rec.length) && mode !== "foco") return;
    const box = panelHost("cp-dash");
    if (!box) return;
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add("cp-has-panel");   // Foco hides Canvas's cards only when ours are there
      // Canvas's own deadlines (its side column, its work widget) go away only when ours are really on screen: with the
      // week switched off, or the planner unread, the student would see no deadlines at all
      document.documentElement.classList.toggle("cp-has-week", !!cache.planner && (!!prefs.week || mode === "foco"));
    }
    // a panel the student is typing in (a new task) is not rebuilt under the cursor by a reading that lands
    { const hostEl = document.getElementById("cp-dash"); if (hostEl) hostEl.cpBusy = () => { const ae = hostEl.cpRoot && hostEl.cpRoot.activeElement; return !!ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName || "") && !!ae.value; }; }
    const grid = el("div", "grid");
    const hd = el("div", "hd"); hd.append(mark(), wordmark());
    const seg = el("div", "seg"), segBs = []; seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Modo do painel");
    for (const [k, label] of MODES) {
      const b = el("button", null, label); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(mode === k));
      b.title = { completo: "Tudo do Caderno+", limpo: "Só o que importa, sem a bagunça do Canvas", foco: "Só o que fazer agora" }[k];
      if (onMode) b.addEventListener("click", () => { if (mode !== k) onMode(k); }); seg.appendChild(b); segBs.push(b);
    }
    radioKeys(segBs, "mode");
    hd.appendChild(seg);
    // fold: the panel shrinks to this bar (kept in chrome.storage.local "panelFold") and opens again
    const foldB = el("button", "pfold"); foldB.type = "button";
    const setFold = async (on, save) => { box.classList ? box.classList.toggle("pfolded", on) : (box.className = box.className.replace(/ pfolded/, "") + (on ? " pfolded" : ""));
      if (/nohd/.test(box.className) && box.getRootNode && box.getRootNode().host) box.getRootNode().host.style.display = on ? "none" : "";
      foldB.textContent = on ? "Mostrar ▾" : "Esconder ▴"; foldB.setAttribute("aria-expanded", String(!on)); foldB.title = on ? "Abrir o painel do Caderno+" : "Recolher o painel do Caderno+";
      if (save) await chrome.storage.local.set({ panelFold: on }); };
    foldB.addEventListener("click", () => setFold(!/pfolded/.test(box.className), true));
    chrome.storage.local.get("panelFold").then(({ panelFold }) => setFold(panelFold === true, false));
    // Anotações beside the cards (Alt+N)
    const notesB = el("button", "pfold pnotes", "Anotações"); notesB.type = "button"; notesB.title = "Suas anotações e checklist, ao lado dos cards (Alt+N)"; notesB.setAttribute("aria-pressed", "false");
    notesB.addEventListener("click", () => toggleNotes()); window.cpNotesBtn = notesB; notesCache = cache;
    if (EXT) chrome.storage.local.get("notesOpen").then(({ notesOpen }) => { notesB.setAttribute("aria-pressed", String(notesOpen === true)); notesSide(cache, notesOpen === true); });
    // the meta (goal) every number is computed against
    const meta = el("span", "meta"), dn = el("button", null, "−"), upb = el("button", null, "+"), mv = el("b", null, fmt(T, T % 1 ? 1 : 0));
    dn.type = upb.type = "button"; dn.setAttribute("aria-label", "Meta menor"); upb.setAttribute("aria-label", "Meta maior"); meta.title = "A nota que você quer em cada matéria";
    const step = d => { if (onMode) onMode(mode, Math.min(10, Math.max(5, T + d))); };   // onMode sets T before any wait, so quick clicks add up
    dn.addEventListener("click", () => step(-0.5)); upb.addEventListener("click", () => step(0.5));
    meta.append(el("span", null, "Meta"), dn, mv, upb); hd.append(meta); if (EXT) hd.appendChild(notesB); hd.appendChild(foldB);
    // on the classic dashboard the bar sits in Canvas's header, next to the greeting, where "Alternar para a nova
    // visualização" was; folding then hides the whole panel. Elsewhere (widget dashboard) it stays on top of the panel.
    // Canvas's header may render after us (we run at document end): the bar waits in the panel and moves up when it appears
    if (!headBar(hd)) { box.append(hd); window.cpHeadRetry = () => { if (!gone(hd) && headBar(hd)) { box.classList.add("nohd"); window.cpHeadRetry = null; } }; } else { box.classList.add("nohd"); window.cpHeadRetry = null; }
    if (a.askTurma) {   // a shared course matched: ask before using another turma's weights
      const q = el("section", "card news ask-turma"), yes = el("button", "primary", "Sim, são as minhas"), no = el("button", null, "Não, são outras");
      const subs = C.COURSES.filter(c => C.turmaOf(c) === a.turma).map(c => C.SHORT[c.id]).join(", ");
      q.append(el("h3", null, "Estas são as suas matérias? " + subs), el("div", "muted", "O Caderno+ tem os pesos do Plano de Ensino delas. Se não são as suas, o quanto falta usa o Centro de Notas e as regras que você montar."));
      const acts = el("div", "acts"); acts.append(yes, no); q.appendChild(acts); box.appendChild(q);
      const answer = async v => { const { prefs: sp } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, sp, { turma: v }) }); location.reload(); };
      yes.type = no.type = "button"; yes.addEventListener("click", () => answer(a.turma)); no.addEventListener("click", () => answer("outro"));
    }
    if (!prefs.dash) return;   // panel switched off: only the turma question
    if (centroOff && !centroSnoozed && prefs.grades && EXT) box.appendChild(centroOffer());
    if (mode === "foco") { box.appendChild(focusView(agenda(a, cache, marks))); return; }
    // Canvas's course cards (either dashboard) carry our numbers: no subject tiles of ours next to them
    if (prefs.grades) { const ov = gradesOverview(a, cache, clean, prefs); if (ov.length) box.append(...ov); else if (why) box.append(el("div", "muted why", why)); }
    box.appendChild(grid);
    { // when Canvas was read, at the foot of the panel (the course page says it in its header)
      const d = C.localISO(new Date(cache.at)), when = (d === today() ? "hoje" : ago(d)) + " às " + hhmm(new Date(cache.at).toISOString());
      box.appendChild(el("div", "muted read", "Lido do Canvas " + when + " · o botão Atualizar da extensão lê de novo")); }
    if (prefs.week && !cache.planner) grid.appendChild(el("div", "muted why", "Não consegui ler os prazos do Canvas agora. A lista de tarefas do próprio Canvas continua ao lado; tento de novo na próxima leitura."));
    if (week) {
      let sec = null;
      const draw = () => { const nx = weekView(agenda(a, cache, marks), prefs, mark); if (sec) { grid.insertBefore(nx, sec); sec.remove(); } else grid.appendChild(nx); sec = nx; };
      const mark = async (x, on) => { marks = await tick(cache.user, x, on); draw(); sendReminders(agenda(a, cache, marks), prefs, cache); };
      draw();
    }
    if (prefs.changes) { const ch = changesCard(cache, rec, () => onMode && onMode(mode)); if (ch) grid.prepend(ch); }
    notesCard().then(nc => { if (nc) grid.prepend(nc); });
    if (!prefs.native && widgetDash() && !clean) {   // with Canvas's widgets hidden, every course stays one click away (extension courses too)
      const sec = el("section", "card news courses"), h = el("h3", null, "Todas as matérias"), ul = el("ul");
      for (const x of cache.ids) { const li = el("li", "row"); li.append(el("span"), mid(shortName(x.name), location.origin + "/courses/" + x.id, String(x.name).slice(0, 120)), el("span")); ul.appendChild(li); }
      sec.append(h, ul); foldable(sec, h, "courses"); grid.appendChild(sec);
    }
    const recent = prefs.newgrades && Array.isArray(rec) ? rec.filter(r => r && Date.now() - r.at < (clean ? 3 : 30) * 864e5).slice(0, 5) : [];
    if (recent.length) {   // the latest grades, newest first; "nova" for the last 3 days
      const sec = el("section", "card news grades-new"), h = el("h3", null, "Notas novas"), fresh = recent.filter(r => Date.now() - r.at < 3 * 864e5).length;
      if (fresh) h.appendChild(el("span", "pill ok", fresh + (fresh === 1 ? " nova" : " novas")));
      const ul = el("ul");
      for (const r of recent) {
        const li = el("li", "row"), sc = el("span", "sc", pts(r.score)); sc.appendChild(el("small", null, " de " + pts(r.points)));
        li.append(Date.now() - r.at < 3 * 864e5 ? el("span", "dot", "nova") : el("span"), mid(r.name, r.url || null, r.course + " · " + ago(C.localISO(new Date(r.at)))), sc);
        ul.appendChild(li);
      }
      sec.append(h, ul); foldable(sec, h, "grades-new"); grid.appendChild(sec);
    }
    if (prefs.inbox && Array.isArray(cache.inbox) && cache.inbox.length) {   // the unread Canvas messages, a click opens the inbox
      const sec = el("section", "card news inbox"), h = el("h3", null, "Caixa de entrada"), n = cache.inbox.length;
      h.appendChild(el("span", "pill nt", (n >= 5 ? "5+" : n) + (n === 1 ? " não lida" : " não lidas"))); sec.appendChild(h);
      const ul = el("ul");
      for (const m of cache.inbox) { const li = el("li", "row unread"); li.append(el("span", "dot", "não lida"), mid(m.subject, location.origin + "/conversations", m.from), el("span", "d", m.at ? ago(C.localISO(new Date(m.at))) : "")); ul.appendChild(li); }
      sec.appendChild(ul); foldable(sec, h, "inbox"); grid.appendChild(sec);
    }
    if (news && !(prefs.native && widgetDash()) && !(clean && !cache.data.announcements.some(x => x.unread))) {   // inside Canvas's dashboard its own Avisos widget shows them
      const all = cache.data.announcements.slice().filter(x => !clean || x.unread).sort((x, y) => String(y.at).localeCompare(String(x.at))), unread = all.filter(x => x.unread).length;
      const sec = el("section", "card news"), h = el("h3", null, "Avisos");
      if (unread) h.appendChild(el("span", "pill nt", unread + (unread === 1 ? " não lido" : " não lidos")));
      sec.appendChild(h);
      const ul = el("ul");
      for (const x of all.slice(0, 6)) {
        const li = el("li", "row" + (x.unread ? " unread" : ""));
        const who = el("span", "who"); who.appendChild(avatar(x.avatar, x.author || x.course, 32)); if (x.unread) who.appendChild(el("span", "dot", "não lido"));
        li.append(who, mid(x.title, x.url && x.url.startsWith(location.origin + "/") ? x.url : null, (x.author ? x.author + " · " : "") + shortName(x.course)),
          el("span", "d", x.at ? ago(C.localISO(new Date(x.at))) : ""));
        ul.appendChild(li);
      }
      sec.appendChild(all.length ? ul : el("div", "muted", a.term ? "Nenhum aviso nos últimos 60 dias." : "Nenhuma matéria de " + TERM + " no seu Canvas."));
      foldable(sec, h, "news"); grid.appendChild(sec);
    }
    if (prefs.tasks) grid.appendChild(tasksCard(cache, marks, () => onMode && onMode(mode)));
    if (prefs.news && mode !== "foco") {   // next to the announcements: the teachers, to ask them something (loaded in the background)
      const holder = el("div"); grid.appendChild(holder);
      teachersOf(cache).then(list => { grid.insertBefore(askCard(list), holder); holder.remove(); }, () => holder.remove());
    }
  }

  // Course pages: the ring card (earned, what is left, the needed grade), every assessment of the subject with its weight
  // and grade or what it needs, and the actions (files download, open Caderno+ on this subject).
  function coursePanel(courseId, a, cache, prefs) {
    const c = prefs.grades && a.has ? a.byCanvasId[courseId] : null, cv = cache.ids.find(x => String(x.id) === courseId);
    const own = !!(myRules[courseId] && myRules[courseId].own);   // the student builds this course's rule (over the ready-made one or the Centro's)
    const cr = !c && !own && !(myRules[courseId] && myRules[courseId].formula) && prefs.grades ? centroOf(courseId) : null;   // a formula the student wrote is theirs, even made before the Centro came   // no rules of ours: the professor's formula from the Centro de Notas
    ruleCache = cache;
    const mr = !c && !cr && prefs.grades && !a.expired && ruleItems(courseId).length ? customOf(courseId) || { status: "vazio" } : null;   // neither (or chosen): the student's own rule
    const ownBtn = () => { const b = el("button", "mini own-b", "Montar minha própria regra"); b.type = "button"; b.title = "Usar os pontos do Canvas desta matéria, com o que você tira da conta e os pesos que você puser, no lugar desta regra";
      b.addEventListener("click", async () => { const had = myRules[courseId] && myRules[courseId].formula;   // starts with the professor's or the Plano's formula, saved, so the card and the editor agree
        await saveRule(cache.user, courseId, Object.assign({ merge: true, own: true }, had ? {} : { formula: startFormula(courseId, ruleItems(courseId)).text })); location.reload(); }); return b; };
    if (!c && !cr && !mr && !prefs.files) return;
    const box = panelHost("qf-panel");
    if (!box) return;
    // the course hero: its Canvas color, its name, the teacher (photo, Perguntar) and when Canvas was read
    const hero = el("div", "hero"), band = el("div", "band-c"), title = el("div", "ht"), heroSub = el("div", "hs"), teach = el("div", "hteach");
    title.append(mark(), el("b", null, shortName(cv ? cv.name : document.title)));
    heroSub.textContent = (c ? "meta " + fmt(T, T % 1 ? 1 : 0) + " · " : "") + "lido do Canvas " + ago(C.localISO(new Date(cache.at)));
    const official = c && prefs.grades ? centroOf(courseId) : null;   // with our rules too: the Centro de Notas number beside them, to compare
    if (official) heroSub.textContent += " · Centro de Notas: " + dn(official.now) + " agora" + (official.status === "precisa" ? ", precisa " + up(official.need, 1) + (official.approx ? " (aprox.)" : "") : official.approx ? ", confira (aprox.)" : official.status === "garantido" ? ", garantido" : official.status === "nao-da" ? ", recuperação" : "");
    const htxt = el("div", "htxt"); htxt.append(title, heroSub); hero.append(band, htxt, teach); box.appendChild(hero);
    if (centroOff && !centroSnoozed && prefs.grades && EXT) box.appendChild(centroOffer());
    if (prefs.grades) watchStore(ch => { if (gone(box)) return false;   // the Centro de Notas landed: draw this course again (a fresh analyse: its formula may now beat the Plano)
      if (ch.centro) loadCentro(cache.user).then(() => { if (JSON.stringify(own ? null : centroOf(courseId)) !== JSON.stringify(cr)) { const h = document.getElementById("qf-panel"); if (h) h.remove(); coursePanel(courseId, analyse(cache, a.hand), cache, prefs); } }); });
    // The grade card, the same for every source (Plano de Ensino, Centro de Notas, Canvas weights, the student's rule):
    // the hero (ring, what is guaranteed, the mean still needed) redrawn live, two modes and the table of assessments.
    // - Simular: grades typed where Canvas has none change the hero and the result; nothing is saved (centroSim keeps the
    //   boxes for this course), the dashboard does not change.
    // - Minhas notas: the same boxes are the student's own grades (a grade the professor gave but Canvas does not show);
    //   saved on this computer per user and counted everywhere: this page, the dashboard, the cards.
    // src: { rows: [{ id, name, date, max, got (Canvas, on max), w (share of the final, 0-1) | null, missing, tag }],
    //        saved: { id: 0-10 }, calc(g { id: 0-10 }) → { status, need (0-10 mean in what is left), final (0-10) },
    //        hero(g, simulating) → element, save(g) → Promise, hint(row, r) → placeholder (optional), id: storage key }
    const gradeCard = src => {
      const wrap = el("div", "gcard"), heroBox = el("div"), tbl = el("div", "card items gt"), out = el("b", "t muted"), boxes = [], dd = r => r.max >= 5 ? 1 : 2;
      const saved = Object.assign({}, src.saved), sim = {}; let mode = gtMode === "mine" ? "mine" : "sim";
      const segB = el("div", "seg gt-mode"), bSim = el("button", null, "Simular"), bMine = el("button", null, "Minhas notas"), help = el("span", "muted gt-help");
      segB.setAttribute("role", "group"); segB.setAttribute("aria-label", "O que as caixas fazem"); bSim.type = bMine.type = "button";
      const g = () => Object.assign({}, saved, mode === "sim" ? sim : {});
      const of10 = (b, t) => { const v = String(t).trim().replace(",", "."), n = Number(v); return v !== "" && Number.isFinite(n) && n >= 0 && n <= b.r.max + 1e-9 ? n * 10 / b.r.max : null; };   // above what it is worth: not taken
      const paint = () => { const cur = g(), r = src.calc(cur), simu = mode === "sim" && Object.keys(sim).length > 0;
        heroBox.replaceChildren(src.hero(cur, simu));
        for (const b of boxes) { const v = mode === "sim" ? (b.r.id in sim ? sim[b.r.id] : saved[b.r.id]) : saved[b.r.id];
          if (document.activeElement !== b.inp && (!wrap.getRootNode || wrap.getRootNode().activeElement !== b.inp)) b.inp.value = v != null ? fmt(v * b.r.max / 10, dd(b.r)) : "";
          b.inp.className = "simi" + (mode === "mine" || (!(b.r.id in sim) && saved[b.r.id] != null) ? " mine" : "");
          b.inp.placeholder = src.hint ? src.hint(b.r, r) : r.status === "precisa" && r.need != null ? up(r.need * b.r.max / 10, dd(b.r)) : r.status === "nao-da" ? fmt(b.r.max, dd(b.r)) : "e se?"; }
        const n = boxes.filter(b => cur[b.r.id] != null).length;
        if (!boxes.length) { out.textContent = ""; }
        else if (!n) { out.className = "t muted"; out.textContent = mode === "sim" ? "Digite uma nota nas caixas para ver com quanto você fica. Nada fica salvo." : "Digite as notas que você já tirou e o Canvas ainda não mostra: elas contam no painel."; }
        else { out.className = "t " + (r.status === "garantido" ? "t-ok" : r.status === "nao-da" ? "t-bad" : "t-warn");
          out.textContent = (mode === "mine" ? "Com as suas notas" : "Com essas notas") + (n >= boxes.length && r.final != null && !r.notYet && !src.rows.some(x => x.missing) ? " você fica com " + dn(r.final) + (r.final >= T - 1e-9 ? " ✓ meta " + fmt(T, T % 1 ? 1 : 0) : ": faltam " + up(T - r.final, 1) + " para a meta")
            : r.status === "garantido" ? " a meta já fica garantida ✓" : r.status === "nao-da" ? " não dá para chegar à meta, nem com 10 no resto" : r.status === "depende-atrasadas" ? ", ainda faltam notas de atividades atrasadas" : ", precisa " + up(r.need, 1) + "/10 em média no resto"); }
        bSim.setAttribute("aria-pressed", String(mode === "sim")); bMine.setAttribute("aria-pressed", String(mode === "mine"));
        help.textContent = mode === "sim" ? "não fica salvo e não muda o painel" : "fica salvo neste computador e conta no painel";
        clear.hidden = !(mode === "sim" ? Object.keys(sim).length : Object.keys(saved).length); };
      const keepSim = () => chrome.storage.local.get("centroSim").then(({ centroSim = {} }) => { const mine = Object.assign({}, centroSim[cache.user]); if (Object.keys(sim).length) mine[src.id] = Object.assign({}, sim); else delete mine[src.id]; return chrome.storage.local.set({ centroSim: Object.assign({}, centroSim, { [cache.user]: mine }) }); }).catch(() => {});
      let saving = Promise.resolve();
      const commit = () => { const snap = Object.assign({}, saved); saving = saving.then(() => src.save(snap)).catch(() => {}); };
      const setMode = m => { mode = m; gtMode = m; chrome.storage.local.set({ gtMode: m }).catch(() => {}); paint(); };
      bSim.addEventListener("click", () => setMode("sim")); bMine.addEventListener("click", () => setMode("mine"));
      segB.append(bSim, bMine);
      const th = el("div", "ir ih"); th.append(el("span", null, "Avaliação"), el("span", null, "Peso"), el("span", null, "Nota"));
      const top = el("div", "gt-top"); top.append(segB, help); tbl.append(top, th);
      for (const r of src.rows) { const row = el("div", "ir"), name = el("span", "n"); name.appendChild(el("span", "gtn", r.name)); name.title = r.name; let gc;
        if (r.date) name.appendChild(el("span", "dt", dmy(r.date)));
        if (r.tag) name.appendChild(el("span", "dt unv", r.tag));
        if (r.got != null) { gc = el("span", "g", fmt(r.got, dd(r))); gc.appendChild(el("small", null, " de " + fmt(r.max, r.max % 1 ? dd(r) : 0))); }
        else if (r.missing) gc = el("span", "g e", "ainda não está no Canvas");
        else { gc = el("span", "g e"); const inp = el("input", "simi"), b = { r, inp }; inp.type = "text"; inp.inputMode = "decimal";
          inp.setAttribute("aria-label", "Nota de " + r.name + " (de " + fmt(r.max, dd(r)) + ")");
          inp.addEventListener("input", () => { const v = of10(b, inp.value); inp.setAttribute("aria-invalid", String(v == null && String(inp.value).trim() !== ""));
            if (mode === "sim") { if (v == null) delete sim[r.id]; else sim[r.id] = v; keepSim(); }
            else { if (v == null) delete saved[r.id]; else saved[r.id] = v; commit(); }
            paint(); });
          gc.appendChild(inp); gc.appendChild(el("small", null, " de " + fmt(r.max, r.max % 1 ? dd(r) : 0))); boxes.push(b); }
        row.append(name, el("span", "w", r.w == null ? "—" : (v => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace(".", ",")) + "%")(r.w * 100)), gc); tbl.appendChild(row); }
      const clear = el("button", "mini", "Limpar"); clear.type = "button";
      clear.addEventListener("click", () => { if (mode === "sim") { for (const k of Object.keys(sim)) delete sim[k]; keepSim(); } else { for (const k of Object.keys(saved)) delete saved[k]; commit(); } paint(); });
      if (boxes.length) { const ft = el("div", "gt-f"); ft.append(out, clear); tbl.appendChild(ft); }
      else { top.hidden = true; }
      wrap.append(heroBox, tbl);
      chrome.storage.local.get("centroSim").then(({ centroSim }) => { const k = centroSim && centroSim[cache.user] && centroSim[cache.user][src.id]; if (k && typeof k === "object") for (const [id, v] of Object.entries(k)) if (boxes.some(b => String(b.r.id) === id) && Number.isFinite(Number(v))) sim[boxes.find(b => String(b.r.id) === id).r.id] = Number(v); paint(); }).catch(() => paint());
      paint(); return wrap; };
    if (cr) {   // quanto falta from the Centro de Notas: now, what is needed in what is left, and which items are left
      const cu = myCentro[courseId], names = new Map();
      for (const g of Array.isArray(cu.grupos) ? cu.grupos : []) for (const gc of g && Array.isArray(g.grupo_colunas) ? g.grupo_colunas : []) if (gc && gc.coluna) names.set(gc.coluna.id_coluna, gc.coluna.nome_coluna);
      const calcC = g => C.centro(cu, T, Object.keys(g).length ? { grades: g, rest: 0 } : undefined);
      const heroC = (g, simu) => { const r = calcC(g), card = el("div", "card cring" + (simu ? " simulating" : "")), m = el("div", "mid"), est = r.approx && r.status !== "precisa";
        m.append(el("div", "t", (r.approx ? "≈ " + dn(r.now) + " de 10 agora" : earnedText(stOfResult(r)) + " garantidos de 10") + (simu ? " (simulação)" : "")),
          el("div", "c", (est ? "confira no Centro de Notas" : gapText(r)) + (r.approx ? " (aproximado: parte da fórmula está escondida para o aluno e pode contar outras atividades)" : "")),
          el("div", "c", "Falta: " + (r.left.map(id => names.get(id)).filter(Boolean).slice(0, 8).join(", ") || "nada em aberto") + " · fórmula do Centro de Notas"));
        if (r.status === "nao-da" && r.rec) { const rn = r.rec.left.map(id => names.get(id)).filter(Boolean).slice(0, 3).join(", ") || "recuperação";   // below the meta: what the recovery exam needs
          m.appendChild(el("div", "c rec-l", r.rec.need != null ? "Recuperação: precisa " + up(r.rec.need, 1) + " na " + rn + (r.left.length ? " (com 10 no que falta)" : "") : "Nem com 10 na " + rn + " chega à meta")); }
        if (!["garantido", "precisa", "nao-da"].includes(r.status)) { card.appendChild(m); return card; }
        if (est) { card.append(ring(stOfResult(Object.assign({}, r, { status: "depende-atrasadas", need: null })), true), m); return card; }
        const nb = needBig(stOfResult(r)), v0 = (nb.children || nb.kids || [])[0]; if (r.approx && v0) v0.textContent = "≈ " + v0.textContent;   // part of the formula is hidden from the student
        card.append(ring(stOfResult(r), true), m, nb); return card; };
      // each Centro column that counts: its weight in the final grade, its grade or a box
      const r00 = C.centro(cu, T), leaves = [], seen = new Set(), open = new Set(r00.left), recIds = new Set((r00.rec && r00.rec.left) || []);   // recovery exams: a box too (simulate it, or type the grade)
      for (const g of Array.isArray(cu.grupos) ? cu.grupos : []) for (const gc of g && Array.isArray(g.grupo_colunas) ? g.grupo_colunas : []) { const col = gc && gc.coluna;
        if (col && col.tipo_coluna === "padrao" && !seen.has(col.id_coluna) && !(col.atividade && col.atividade.omitir_nota_final)) { seen.add(col.id_coluna); leaves.push(col); } }
      const wOf = id => { const cl = JSON.parse(JSON.stringify(cu)), cols = (cl.colunas || []).concat(...(cl.grupos || []).map(g => (g && g.grupo_colunas || []).map(gc => gc && gc.coluna).filter(Boolean)));
        for (const x of cols) if (x && (x.id_coluna === id || x.tipo_coluna === "final")) x.notas = [];   // as if still open: what 10 in it adds to the final
        const hi = C.centro(cl, T, { grades: { [id]: 10 }, rest: 0 }).projected, lo = C.centro(cl, T, { grades: { [id]: 0 }, rest: 0 }).projected; return hi != null && lo != null ? Math.max(0, hi - lo) / 10 : null; };
      const rows = [];
      for (const col of leaves.slice(0, 40)) { const pmax = col.atividade && Number(col.atividade.pontos_possiveis) > 0 ? Number(col.atividade.pontos_possiveis) : 10, v = col.notas && col.notas[0] ? parseFloat(String(col.notas[0].nota).replace(",", ".")) : NaN, w = wOf(col.id_coluna);
        const rec = recIds.has(col.id_coluna);
        if (!rec && !open.has(col.id_coluna) && !(w > 0.0004)) continue;   // outside the final grade (or a recovery that does not count now)
        if (!rec && !Number.isFinite(v) && !open.has(col.id_coluna)) continue;
        rows.push({ id: col.id_coluna, name: col.nome_coluna || "Atividade", max: pmax, got: Number.isFinite(v) ? v : null, w: rec ? null : w, tag: rec ? "recuperação" : "" }); }
      box.appendChild(gradeCard({ id: courseId, rows, saved: gradesOf(courseId), hero: heroC,
        calc: g => { const r = calcC(g); return { status: r.status, need: r.need, final: r.now }; },
        save: async g => { await setGrades(cache.user, courseId, g); } }));
      if (!a.expired && ruleItems(courseId).length) { const r0 = el("div", "muted src own-row"); r0.append(el("span", null, "Pela fórmula do Centro de Notas."), ownBtn()); box.appendChild(r0); }
    }
    if (mr) {   // the student's rule: the Canvas items that count (untick what is not graded) and how far the grade goes
      const items = ruleItems(courseId), rule = myRules[courseId] || { off: [], total: 10 }, off = new Set(rule.off || []);
      const heroR = (r, simu) => {
        const card = el("div", "card cring" + (simu ? " simulating" : "")), m = el("div", "mid");
        m.append(el("div", "t", r.status === "erro" ? "A fórmula tem um erro: veja abaixo" : r.status === "vazio" ? (r.parts ? "Ponha as atividades nas partes" : "Nada conta na nota ainda") : r.status === "acima" ? (r.part ? "A parte " + r.part + " passou dos pontos dela" : "Os pontos somam " + fmt(r.planned, 1) + ", mais que " + fmt(r.total, 0)) : (r.unsure ? dn(r.now) + " de 10 pela soma (confira)" : !r.canvasWeights && !myRules[courseId] ? dn(r.now) + " de 10 pela soma dos pontos" : earnedText(stOfResult(r)) + " garantidos de 10")),
          el("div", "c", r.status === "vazio" ? (r.parts ? (r.emptyPart ? "A parte " + r.emptyPart + " ainda não tem atividade: escolha a parte de cada atividade na lista (ou diga quantos pontos ela vale)." : "Escolha a parte de cada atividade na lista abaixo.") : "Marque o que vale nota na lista abaixo.")
            : r.status === "acima" ? (r.part ? "A parte " + r.part + " soma " + fmt(r.planned, 1) + " pontos, mais que os " + fmt(r.total, 1) + " dela: tire o que não vale nota ou aumente os pontos da parte " + r.part + "." : "Então a soma não é a nota: tire da conta o que não vale nota, ou diga até quanto a nota vai (o Plano de Ensino diz).") : r.unsure ? "Pela soma dos pontos daria " + (r.status === "garantido" ? "meta garantida" : "recuperação") + ", mas confira: o Plano de Ensino pode ter provas que ainda não estão no Canvas. Ajuste abaixo." : gapText(r) + (r.notYet > 0.001 && !rule.formula ? " · " + fmt(r.notYet, 2) + " pontos ainda não estão no Canvas e contam como o que falta" : "")),
          el("div", "c", r.canvasWeights ? "Pelos pesos que o professor pôs no Canvas: " + (r.parts || []).map(pp => { const cw = canvasWeightsRule(courseId); return (cw && cw.names[pp.id] || "parte " + pp.id) + " " + fmt(pp.w, 0) + "% (" + dn(pp.now) + "/10)"; }).join(" · ") : rule.formula ? "Pela sua fórmula" + (r.notYet ? " · " + r.notYet + (r.notYet === 1 ? " parte ainda não está" : " partes ainda não estão") + " no Canvas (contam como o que falta)" : "") : r.parts && r.parts.length ? "Sua regra: " + r.parts.map(p => "parte " + p.id + " (" + fmt(p.w, 0) + "%) " + dn(p.now) + "/10").join(" · ") + (r.emptyPart ? " · a parte " + r.emptyPart + " não tem atividade" : "")
            : (rule && myRules[courseId] ? "Sua regra" : "Soma dos pontos do Canvas") + ": tire da conta o que não vale nota e diga até quanto a nota vai."));
        if (r.status !== "vazio" && r.status !== "acima" && r.status !== "erro" && !r.unsure) card.append(ring(stOfResult(r), true), m, needBig(stOfResult(r))); else card.appendChild(m);
        { const t0 = (m.children || m.kids || [])[0]; if (simu && t0) t0.textContent += " (simulação)"; }
        return card;
      };
      const bad = mr.status === "vazio" || mr.status === "acima" || mr.status === "erro", rl = myRules[courseId] || canvasWeightsRule(courseId);
      // the activities with Canvas's grades only; the student's own grades (Minhas notas) and the simulation come in as g
      const base = items.map(x => Object.assign({}, x, { score: x.canvasScore }));
      const ruleR = g => { const extra = Object.entries(g).filter(([k, v]) => k[0] === "-" && v != null && !base.some(x => x.key === k)).map(([k, v]) => ({ key: k, name: k.slice(1), points: 10, score: v }));   // a grade typed for a part not in Canvas
        const r = C.custom(base.map(x => x.score == null && g[x.key] != null ? Object.assign({}, x, { score: g[x.key] * Number(x.points) / 10 }) : x).concat(extra), rl, T), mine = !!myRules[courseId], cw = !mine && !!canvasWeightsRule(courseId);
        return Object.assign(r, { mine, canvasWeights: cw, unsure: !mine && !cw && (r.status === "garantido" || r.status === "nao-da") }); };
      if (bad) box.appendChild(heroR(mr, false));
      else {   // the table: each activity that counts, its weight in the final grade, its grade or a box
        const at = (it, sc) => base.map(x => x.key === it.key ? Object.assign({}, x, { score: sc }) : x), nowOf = list => { const r = C.custom(list, rl, T); return r.now; };
        const rows = [];
        for (const it of base.slice(0, 40)) { const hi = nowOf(at(it, it.points)), lo = nowOf(at(it, 0)), w = hi != null && lo != null ? Math.max(0, hi - lo) / 10 : null;
          if (!(w > 0.0004)) continue;   // not in the rule (unticked, or a name no line uses)
          rows.push({ id: it.key, name: it.name, date: it.due ? C.localISO(new Date(it.due)) : null, max: Number(it.points), got: it.score == null || !Number.isFinite(Number(it.score)) ? null : Number(it.score), w, tag: it.typed ? "ainda não está no Canvas" : "" }); }
        for (const l of mr.leaves || []) if (l.missing) rows.push({ id: "-" + l.name, name: l.name, max: 10, got: null, w: null, tag: "ainda não está no Canvas" });   // a box too: a grade the student already knows (a paper exam) goes in Minhas notas
        box.appendChild(gradeCard({ id: courseId, rows, saved: gradesOf(courseId), hero: (g, simu) => heroR(ruleR(g), simu),
          calc: g => { const r = ruleR(g); return { status: r.status, need: r.need, final: r.now, notYet: r.notYet }; },
          save: async g => { await setGrades(cache.user, courseId, g); } }));
      }
      // the editor: the formula as the Plano de Ensino writes it; it starts from the professor's (Centro de Notas) or the
      // Plano's weights, shows the result while typing, and offers the course's activities as short names to insert
      const redraw = () => { const h = document.getElementById("qf-panel"); if (h) h.remove(); coursePanel(courseId, a, cache, prefs); };
      const ed = el("div", "card rule formula"), ta = { value: "" }, acts = el("div", "acts"), apply = el("button", "primary", "Aplicar"), restart = el("button", "mini", "Recomeçar"), dirtyNote = el("span", "muted dirty");
      const shortRef = shortName2;
      const start = startFormula(courseId, items, shortRef);
      ta.value = rule.formula || start.text;   // the formula the builder writes; Aplicar saves it
      apply.type = restart.type = "button"; restart.title = "Voltar à fórmula inicial (" + start.from + ")";
      const pv = el("div", "pv"), found = el("div");
      const preview = () => {   // the result of what is typed now (nothing saved until Aplicar)
        const r = C.custom(items, { formula: ta.value }, T); pv.replaceChildren(); found.replaceChildren(); ed.dataset.formula = String(ta.value);
        dirtyNote.textContent = String(ta.value).trim() !== String(rule.formula || "").trim() ? "mudou: clique em Aplicar para valer no painel" : "";
        if (r.status === "erro") { for (const e of r.errors || []) pv.appendChild(el("p", "c err", e)); return; }
        pv.appendChild(el("p", "c res", "Com esta fórmula: " + (r.now == null ? "—" : dn(r.now)) + " agora · " + (r.status === "garantido" ? "meta " + fmt(T, T % 1 ? 1 : 0) + " garantida" : r.status === "nao-da" ? "nem com 10 no que falta" : "precisa " + up(r.need, 1) + " em média no que falta")
          + (r.weights && r.weights.length ? " · os pesos de " + r.weights.join(", ") + " não somam 100% (ajustados)" : "")));
        for (const e of r.errors || []) pv.appendChild(el("p", "c err", e));
        if (r.leaves && r.leaves.length) {   // what each name found: open by itself only when a name found nothing
          const miss = r.leaves.filter(l => l.missing).length, det = el("details", "found-d"), ul = el("ul", "found");
          det.appendChild(el("summary", null, "O que cada nome achou no Canvas (" + r.leaves.length + ")" + (miss ? " · " + miss + " sem atividade" : ""))); if (miss) det.open = true;
          for (const l of r.leaves) { const li = el("li", l.missing ? "miss" : null); li.append(el("b", null, l.name), el("span", null, l.excused ? " → dispensada no Canvas (fica fora da conta)" : l.missing ? " → não achei no Canvas (conta como o que falta)" : " → " + l.items.join("; "))); ul.appendChild(li); }
          det.appendChild(ul); found.appendChild(det); }
      };
      // The builder, over the same text: how many RAs and what each is worth, then which grade goes in which RA and what it
      // is worth there. One Canvas activity may go in several RAs (a TDE graded once for the 3 RAs). A grade not in Canvas
      // yet is a name typed by hand: it counts as what is left until an activity with that name shows up.
      // Only the two-level shape (Final = w% RA…, RA = w% nota…) is drawn; anything else stays in the text below.
      const NONE = "ainda não saiu", bName = x => String(x == null ? "" : x).replace(/[=+%;#,()\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
      const wTxt = x => String(Math.round((Number(x) || 0) * 100) / 100).replace(".", ","), pctB = x => wTxt(x) + "%";
      const raPts = (w, sumW) => sumW > 0 ? Math.round((Number(w) || 0) / sumW * 1000) / 100 : 0;   // what a RA is worth in points of the final (0-10)
      const ptsOf = ref => actsOf(ref).reduce((t, a) => t + Number(a.points || 0), 0);
      const numIn = v => { const n = Number(String(v).replace("%", "").trim().replace(",", ".")); return String(v).trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };
      const actsOf = ref => { const k = foldRef(ref); if (!k) return []; const ex = items.filter(a => foldRef(a.name) === k); return ex.length ? ex : items.filter(a => (" " + foldRef(a.name) + " ").includes(" " + k + " ")); };   // as the formula finds a name
      const bParse = text => { const { lines, errors } = C.formulaParse(text); if (errors.length || !lines.length) return null;
        const by = new Map(lines.map(l => [foldRef(l.name), l])), used = new Set(lines.flatMap(l => l.terms.map(t => foldRef(t.ref))));
        const top = lines.find(l => /^(nota |media )?final$/.test(foldRef(l.name))) || lines.find(l => !used.has(foldRef(l.name))) || lines[0];
        const ptsItems = l => l.terms.filter(x => foldRef(x.ref) !== foldRef(NONE)).map(x => ({ ref: x.ref, w: 0 }));
        if (top.op !== "w" || top.terms.length > 8) return null; const parts = [], reached = new Set([top]);
        for (const t of top.terms) { const l = by.get(foldRef(t.ref));
          if (!l) { parts.push({ name: t.ref, w: t.w, items: [{ ref: t.ref, w: 100 }] }); continue; }   // a grade straight in the final: a part of its own
          if (l.terms.some(x => by.has(foldRef(x.ref)))) return null; reached.add(l);
          if (l.op === "sum") {   // soma(A, B) of activities all in Canvas = each one weighted by its points; with "de N" (points still to come) it is not
            const pts = l.terms.map(x => actsOf(x.ref).reduce((s, a) => s + Number(a.points), 0)), tot = pts.reduce((s, v) => s + v, 0);
            if (l.top) { parts.push({ name: l.name, w: t.w, mode: "pts", top: l.top, items: ptsItems(l) }); continue; }   // top: the points written, kept until the RA's weight changes   // "de N": the Canvas grades are already points of the final
            if (pts.some(v => !(v > 0))) return null;
            parts.push({ name: l.name, w: t.w, items: l.terms.map((x, i) => ({ ref: x.ref, w: Math.round(pts[i] / tot * 10000) / 100 })) }); continue; }
          parts.push({ name: l.name, w: t.w, items: l.terms.filter(x => foldRef(x.ref) !== foldRef(NONE)).map(x => ({ ref: x.ref, w: l.op === "avg" ? Math.round(10000 / l.terms.length) / 100 : x.w })) }); }
        return lines.every(l => reached.has(l)) ? { parts } : null; };
      const bText = m => { const seen = new Set(), refs = new Set(m.parts.flatMap(p => p.items.map(x => foldRef(bName(x.ref)))));
        const ps = m.parts.map((p, i) => { let name = bName(p.name) || "RA" + (i + 1); const solo1 = p.items.length === 1 && foldRef(bName(p.items[0].ref)) === foldRef(name);
          if (seen.has(foldRef(name)) || /^(nota |media )?final$/.test(foldRef(name)) || (!solo1 && refs.has(foldRef(name)))) name = "Parte " + (i + 1); seen.add(foldRef(name));   // never the name of a grade used elsewhere (it would point at itself)
          return { name, w: Number(p.w) || 0, items: p.items.map(x => ({ ref: bName(x.ref), w: Number(x.w) || 0 })).filter(x => x.ref) }; });
        m.parts.forEach((p, i) => { ps[i].mode = p.mode; ps[i].top = p.top; }); const sumW = ps.reduce((t, p) => t + p.w, 0);
        const solo = p => p.mode !== "pts" && p.items.length === 1 && foldRef(p.items[0].ref) === foldRef(p.name);
        return ["Final = " + ps.map(p => pctB(p.w) + " " + p.name).join(" + ")].concat(ps.filter(p => !solo(p)).map(p => p.name + " = " + (p.mode === "pts" ? "soma(" + (p.items.length ? p.items.map(x => x.ref).join(", ") : NONE) + ") de " + wTxt(p.top > 0 ? p.top : raPts(p.w, sumW))
          : p.items.length ? p.items.map(x => pctB(x.w) + " " + x.ref).join(" + ") : "100% " + NONE))).join("\n"); };
      const crefs = shortRefs(items);
      let model = bParse(ta.value);
      const bWrap = el("div", "rb"), keyed = new Map();
      const addItem = (p, ref) => { const n = p.items.length, even = !n || p.items.every(x => Math.abs(Number(x.w) - Number(p.items[0].w)) < 0.01);
        if (even) { const w = Math.round(10000 / (n + 1)) / 100; for (const x of p.items) x.w = w; p.items.push({ ref, w }); }
        else { const left = 100 - p.items.reduce((t, x) => t + (Number(x.w) || 0), 0); p.items.push({ ref, w: left > 0 ? Math.round(left * 100) / 100 : 10 }); } };
      const dropped = [];   // RAs taken off by the count, back with their grades if the count goes up again
      const setCount = n => { if (model && model.parts.length === n) return false; const parts = model ? model.parts : [], even = parts.every(p => Math.abs(Number(p.w) - Number(parts[0].w)) < 0.01);
        while (parts.length > n) dropped.push(parts.pop());
        while (parts.length < n) { const back = dropped.pop(); if (back) { parts.push(back); continue; } let k = parts.length + 1; while (parts.some(p => foldRef(p.name) === "ra" + k)) k++;
          const left = 100 - parts.reduce((t, p) => t + (Number(p.w) || 0), 0); parts.push({ name: "RA" + k, w: even ? 0 : Math.max(0, Math.round(left * 100) / 100), items: [] }); }
        if (even) for (const p of parts) p.w = Math.round(10000 / n) / 100;   // weights still split evenly (or a fresh start): split again; set by hand: kept
        model = { parts }; return true; };
      const raw = new Map();   // what is being typed in a field ("12," on the way to 12,5; empty before a new number): kept over the redraw
      const sync = (k, pos) => { if (!k) raw.clear(); ta.value = bText(model); preview(); bDraw();
        const f = k && keyed.get(k); if (f && f.focus) { f.focus(); if (pos != null && f.setSelectionRange) try { f.setSelectionRange(pos, pos); } catch (e) {} } };
      const field = (cls, k, value, label, onIn) => { const i = el("input", cls); i.type = "text"; i.value = raw.has(k) ? raw.get(k) : value; i.setAttribute("aria-label", label); i.dataset.k = k; keyed.set(k, i);
        i.addEventListener("input", () => { raw.clear(); raw.set(k, i.value); onIn(i.value); sync(k, typeof i.selectionStart === "number" ? i.selectionStart : null); }); return i; };
      function bDraw() {
        bWrap.replaceChildren(); keyed.clear();
        const head = el("div", "rb-h"), seg = el("div", "seg rb-n"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Quantos RAs a matéria tem");
        for (let n = 1; n <= 4; n++) { const b = el("button", null, String(n)); b.type = "button"; b.setAttribute("aria-pressed", String(!!model && model.parts.length === n));
          b.addEventListener("click", () => { if (setCount(n)) sync(); }); seg.appendChild(b); }
        head.append(el("b", null, "Quantos RAs?"), seg); bWrap.appendChild(head);
        if (!model) { bWrap.appendChild(el("p", "c", "Escolha quantos RAs a matéria tem para pôr cada atividade no RA dela."));
          if (String(ta.value).trim()) bWrap.append(el("p", "c muted", "A fórmula de agora (o montador não desenha esta forma; escolher quantos RAs começa uma nova, que só vale depois de Aplicar):"), el("pre", "rb-cur", String(ta.value))); }
        const hit = ref => { const as = actsOf(bName(ref)); return as.length ? { items: as.map(a => a.name) } : null; };   // what a name finds, as the formula finds it (also while the formula has an error)
        if (items.length) {   // each Canvas activity and the RAs it is in: a click puts it in (or takes it out of) that RA
          const mx = el("div", "rb-m"); const cItems = items.filter(x => !x.typed); mx.append(el("b", null, "Atividades desta matéria (" + cItems.length + ")"), el("p", "c rb-ml", model ? "Clique no RA em que cada uma entra. Pode ser mais de um: uma TDE lançada uma vez para os 3 RAs entra nos 3." : "Lidas agora do Canvas."));
          for (const a of cItems.slice(0, 40)) { const ref = crefs.get(a.name) || shortRef(a.name), row = el("div", "rb-mr"), lab = el("span", "n", a.name), btns = el("span", "seg");
            lab.title = a.name + " · " + fmt(a.points, 2) + " pts"; btns.setAttribute("role", "group"); btns.setAttribute("aria-label", "RAs de " + a.name);
            for (const p of model ? model.parts : []) { const has = p.items.find(x => { const l = hit(x.ref); return l && l.items.includes(a.name); }), b = el("button", null, bName(p.name) || "RA");
              b.type = "button"; b.setAttribute("aria-pressed", String(!!has)); b.title = (has ? "Tirar de " : "Pôr em ") + bName(p.name);
              b.addEventListener("click", () => { if (has) p.items.splice(p.items.indexOf(has), 1); else {
                for (const q of model.parts) if (q !== p && (p.mode === "pts" || q.mode === "pts")) q.items = q.items.filter(x => { const l = hit(x.ref); return !(l && l.items.includes(a.name)); });   // points add up: one activity in two RAs would count twice
                const ph = slotFor(p, a); if (ph) ph.ref = ref; else addItem(p, ref); } sync(); }); btns.appendChild(b); }
            row.append(lab, btns); mx.appendChild(row); }
          bWrap.appendChild(mx); }
        if (!model) return;
        const sumP = model.parts.reduce((t, p) => t + (Number(p.w) || 0), 0), offP = Math.abs(sumP - 100) > 0.5;
        bWrap.appendChild(el("div", "c rb-sum" + (offP ? " warn" : ""), offP ? "Os RAs somam " + pctB(sumP) + ": no Plano de Ensino somam 100% (a conta divide pelo total)" : "Os RAs somam 100% ✓"));
        const grid = el("div", "rb-g");
        model.parts.forEach((p, pi) => { const card = el("div", "rb-p"), ph = el("div", "rb-ph"), sumI = p.items.reduce((t, x) => t + (Number(x.w) || 0), 0), pts = p.mode === "pts", top = p.top > 0 ? p.top : raPts(p.w, sumP);
          const known = p.items.reduce((t, x) => t + (hit(x.ref) ? ptsOf(x.ref) : 0), 0);
          ph.append(field("rb-name", "p" + pi, p.name, "Nome da parte " + (pi + 1), v => { p.name = v; }),
            field("rb-w", "pw" + pi, wTxt(p.w), "Quanto " + bName(p.name) + " vale na nota final (%)", v => { const n = numIn(v); if (n != null) { p.w = n; delete p.top; } }), el("span", "u", "% da final" + (pts ? " = " + wTxt(top) + " pts" : "")));
          card.appendChild(ph);
          const md = el("div", "seg rb-md"); md.setAttribute("role", "group"); md.setAttribute("aria-label", "Como o professor lança as notas de " + bName(p.name));
          for (const [v, t, tip] of [["", "% do RA", "Cada nota vale um % do RA (como no Plano de Ensino)"], ["pts", "pontos da final", "A nota do Canvas já é o ponto da final: o RA soma os pontos"]]) { const b = el("button", null, t); b.type = "button"; b.title = tip; b.setAttribute("aria-pressed", String((p.mode || "") === v));
            b.addEventListener("click", () => { if ((p.mode || "") === v) return; p.mode = v || undefined;
              if (!v) { const ps = p.items.map(x => ptsOf(x.ref)), t = ps.reduce((s, n) => s + n, 0); p.items.forEach((x, i) => { x.w = t > 0 && ps.every(n => n > 0) ? Math.round(ps[i] / t * 10000) / 100 : Math.round(10000 / p.items.length) / 100; }); }   // back to %: the Canvas points give the weights
              sync(); }); md.appendChild(b); }
          card.append(el("small", "muted rb-ml", "As notas de " + (bName(p.name) || "este RA") + " no Canvas são:"), md);
          p.items.forEach((x, xi) => { const row = el("div", "rb-i" + (pts ? " pts" : "")), l = hit(x.ref), share = sumP > 0 && sumI > 0 ? (Number(p.w) || 0) / sumP * (Number(x.w) || 0) / sumI * 100 : 0, del = el("button", "rb-x", "×");
            const ref = field("rb-ref", "i" + pi + "-" + xi, x.ref, "Nota de " + bName(p.name), v => { x.ref = v; }); ref.placeholder = "nome da nota (ex.: Prova " + bName(p.name) + ")";
            del.type = "button"; del.title = "Tirar de " + bName(p.name); del.setAttribute("aria-label", "Tirar " + (bName(x.ref) || "esta nota") + " de " + bName(p.name));
            del.addEventListener("click", () => { p.items.splice(xi, 1); sync(); });
            const fnd = l ? "✓ " + l.items[0] + (l.items.length > 1 ? " +" + (l.items.length - 1) : "") : bName(x.ref) ? NONE + ": conta como o que falta" : "digite o nome";
            if (pts) row.append(ref, el("span", "u rb-pt", l ? fmt(ptsOf(x.ref), 2) + " pts" : "— pts"), del, el("small", "rb-st" + (l ? " okc" : bName(x.ref) ? " warn" : ""), (l ? "vale " + fmt(ptsOf(x.ref), 2) + " pts na final (do Canvas) · " : "") + fnd));
            else row.append(ref, field("rb-w", "iw" + pi + "-" + xi, wTxt(x.w), "Quanto " + (bName(x.ref) || "esta nota") + " vale em " + bName(p.name) + " (%)", v => { const n = numIn(v); if (n != null) x.w = n; }), el("span", "u", "%"), del,
              el("small", "rb-st" + (l ? " okc" : bName(x.ref) ? " warn" : ""), "= " + pctB(Math.round(share * 10) / 10) + " da final · " + fnd));
            card.appendChild(row); });
          if (pts) card.appendChild(known > top + 0.011 ? el("div", "c rb-sum warn", "As atividades do Canvas aqui somam " + fmt(known, 2) + " pts, mais que os " + fmt(top, 2) + " pts que " + bName(p.name) + " vale: o professor lança em pontos da final? Se não, escolha % do RA")
            : el("div", "c rb-sum", Math.abs(known - top) < 0.011 ? "As notas do Canvas fecham os " + fmt(top, 2) + " pts de " + bName(p.name) + " ✓" : "No Canvas: " + fmt(known, 2) + " de " + fmt(top, 2) + " pts · os outros " + fmt(top - known, 2) + " pts ainda não saíram (contam como o que falta)"));
          else if (p.items.length && p.items.every(x => hit(x.ref)) && known > 0 && Math.abs(known - top) < 0.011) card.appendChild(el("div", "c rb-sum", "As notas do Canvas aqui somam " + fmt(known, 2) + " pts, o que " + bName(p.name) + " vale na final: se o professor lança em pontos da final, escolha pontos da final"));
          if (!pts && p.items.length && Math.abs(sumI - 100) > 0.5) card.appendChild(el("div", "c rb-sum warn", "As notas de " + bName(p.name) + " somam " + pctB(sumI) + " (a conta divide pelo total)"));
          if (!p.items.length) card.appendChild(el("div", "c muted", "Nenhuma nota ainda: conta como o que falta."));
          if (pts && model.parts.some(q => q !== p && q.items.some(x => { const l = hit(x.ref); return l && p.items.some(y => { const m = hit(y.ref); return m && m.items.some(n => l.items.includes(n)); }); }))) card.appendChild(el("div", "c rb-sum warn", "Uma atividade daqui também está em outro RA: em pontos ela contaria duas vezes (uma Entrega TDE dos 3 RAs fica em % do RA)"));
          const add = el("button", "mini", "+ nota que ainda não saiu"); add.type = "button";
          add.addEventListener("click", () => { addItem(p, ""); sync("i" + pi + "-" + (p.items.length - 1)); }); card.appendChild(add);
          grid.appendChild(card); });
        bWrap.appendChild(grid);
        // a grade of this RA not in Canvas yet that shares a word with the activity ("RA1 TDE" and "Entrega TDE"): the activity takes its place and weight
        const words = x => new Set(foldRef(x).split(" ").filter(w => w.length > 2 && !/^ra\d$/.test(w)));
        const slotFor = (p, a) => { const aw = words(a.name); return p.items.find(x => bName(x.ref) && !hit(x.ref) && [...words(x.ref)].some(w => aw.has(w))); };
      }
      apply.addEventListener("click", async () => { await saveRule(cache.user, courseId, { merge: true, formula: String(ta.value).slice(0, 4000), own: own || undefined }); redraw(); });
      restart.addEventListener("click", () => { ta.value = start.text; model = bParse(ta.value); raw.clear(); dropped.length = 0; preview(); bDraw(); });
      acts.append(apply, restart, dirtyNote);
      ed.append(el("h3", null, "Sua fórmula"), el("p", "c", "Escolha quantos RAs e quanto vale cada um. Conforme as notas saem, ponha cada uma no RA dela e diga quanto vale lá, ou, se o professor já lança a nota em pontos da final, escolha pontos da final e o RA soma o que está no Canvas."),
        el("p", "c from", "Começou " + start.from + "."), bWrap, acts, pv, found);
      preview(); bDraw();
      if (myRules[courseId]) { const rs = el("button", "mini back", own ? "Voltar à regra pronta" : "Voltar ao padrão"); rs.type = "button"; rs.addEventListener("click", async () => { const { myRules: all } = await chrome.storage.local.get("myRules"), base = Object.assign({}, all), mine = Object.assign({}, base[cache.user]); delete mine[courseId]; base[cache.user] = mine; myRules = mine; await chrome.storage.local.set({ myRules: base }); if (own) location.reload(); else redraw(); }); ed.appendChild(rs); }
      const fd = el("details", "fdet"); fd.appendChild(el("summary", null, "Como a nota é calculada · editar a fórmula por RA")); fd.appendChild(ed); if (bad) fd.open = true;
      box.appendChild(fd);
    }
    courseColor(cache, courseId).then(col => { if (col) band.style.background = col; }, () => {});
    teachersOf(cache).then(list => { const t = list.find(x => String(x.course) === courseId); if (!t) return;
      const go = el("a", "mini ask-b", "Perguntar"); go.href = location.origin + "/conversations?user_id=" + encodeURIComponent(t.id) + "&user_name=" + encodeURIComponent(t.name) + "&context_id=course_" + encodeURIComponent(t.course);
      go.title = "Abrir uma mensagem para " + t.name + " na caixa de entrada do Canvas"; teach.append(avatar(t.avatar, t.name, 34), mid(t.name, null, "professor(a)"), go); }, () => {});
    // the Plano de Ensino course: the same grade card; "Minhas notas" is the hand grades (hand[user][key], on the item's scale)
    const simOn = false, parts = { notas: [] };
    if (c) {
      const st0 = a.state(c), nx = C.nextItem(st0), total = C.weightSum(c), byKey = new Map(c.items.map(it => [C.key(c, it), it]));
      const headCard = (st, simu) => {
        const head = el("div", "card cring" + (simu ? " simulating" : "")), mid = el("div", "mid");
        mid.append(el("div", "t", earnedText(st) + " garantidos de 10" + (simu ? " (simulação)" : "")),
          el("div", "c", (st.status === "garantido" ? "meta " + fmt(T, T % 1 ? 1 : 0) + " garantida" + (simu ? " com essas notas" : " pelas notas lançadas") : "faltam " + up(st.need, 1) + " pontos pra meta " + fmt(T, T % 1 ? 1 : 0)) + (nx ? " · próxima " + dmy(nx.date) : "")));
        // the Canvas sum and ours differ when an item is graded on another scale than what it is worth (PjBL II of BD:
        // Canvas 0-2, worth 1,5 of the final): said, item by item, so the two numbers are not a mystery
        { let raw = 0; const scaled = [], used = new Set();   // the grades in Canvas only, on Canvas's own points (a simulation does not change this line)
          const cvA = ((cache.data && Array.isArray(cache.data.courses) ? cache.data.courses : []).find(x => String(x.id) === String(courseId)) || {}).assignments || [], map = (C.CANVAS[c.id] || {}).items || {};
          for (const it of c.items) { const g = C.parseNum(a.canvas[C.key(c, it)]); if (g == null || Number.isNaN(g)) continue;
            const r = map[it.id], one = r && r.one ? cvA.filter(x => x && String(x.name).includes(r.one)) : [], hit = one.length === 1 ? one[0] : null;
            const cp = hit && Number(hit.points) > 0 ? Number(hit.points) : r && r.pts > 0 ? r.pts : it.inMax;   // the points Canvas grades it on
            if (hit && used.has(hit)) { scaled.push(it.name.replace(/^RA\d · /, "") + ": a mesma atividade do Canvas (" + hit.name + ")"); continue; } if (hit) used.add(hit);   // one Canvas grade for two items (BD's Entrega TDE): counted once
            raw += hit && hit.score != null && Number.isFinite(Number(hit.score)) ? Number(hit.score) : g * cp / it.inMax;
            if (Math.abs(cp - it.max) > 0.01) scaled.push(it.name.replace(/^RA\d · /, "") + ": o Canvas lança de 0 a " + fmt(cp, 2) + ", vale " + fmt(it.max, 2)); }
          const e0 = C.courseState(c, a.canvas, today(), T).earned;
          if (Math.abs(raw - e0) >= 0.05) { const line = "No Canvas as notas somam " + fmt(raw, 2) + "; pelos pesos do Plano de Ensino valem " + fmt(e0, 2);
            if (!scaled.length) mid.appendChild(el("div", "c scale", line));
            else { const d = el("details", "c scale"), ul = el("ul", "scale-l"); d.appendChild(el("summary", null, line + " · por quê?")); for (const t of scaled.slice(0, 6)) ul.appendChild(el("li", null, t)); d.appendChild(ul); mid.appendChild(d); } } }
        head.append(ring(st, true), mid, needBig(st)); return head;
      };
      const open = it => { const p = C.itemPoints(it, a.canvas[C.key(c, it)]); return p === null || Number.isNaN(p); };
      const stOf = g => C.courseState(c, Object.assign({}, a.canvas, Object.fromEntries(Object.entries(g).filter(([k]) => byKey.has(k)).map(([k, v]) => [k, String(Math.round(v * byKey.get(k).inMax / 10 * 100) / 100)]))), today(), T);
      const rows = c.items.map(it => { const k = C.key(c, it), p = C.itemPoints(it, a.canvas[k]);
        return { id: k, name: it.name, date: st0.future.includes(it) || nx === it ? it.date : null, max: it.inMax, got: p !== null && !Number.isNaN(p) ? C.parseNum(a.canvas[k]) : null, w: total ? it.max / total : null,
          tag: Number.isNaN(p) ? "nota inválida no Canvas" : !it.fromCanvas && it.unv ? "data a confirmar" : "" }; });
      const saved = {}; for (const it of c.items) { const k = C.key(c, it), v = C.parseNum(a.hand[k]); if (open(it) && v != null && !Number.isNaN(v)) saved[k] = Math.min(10, v * 10 / it.inMax); }
      parts.notas.push(gradeCard({ id: courseId, rows, saved, hero: (g, simu) => headCard(stOf(g), simu),
        calc: g => { const st = stOf(g); return { status: st.status, need: st.fraction != null ? st.fraction * 10 : null, final: st.earned, st }; },
        hint: (row, r) => { const it = byKey.get(row.id), st = r.st; return st.late.includes(it) ? "atrasada" : st.status === "depende-atrasadas" ? "—" : need({ req: C.requiredFor(st, it), item: it }).replace(/^precisa /, "").replace(/ de [\d,]+$/, "").replace(/^já garantido$/, "ok").replace(/^nem com 10$/, "—"); },   // short: the box is narrow and "de X" is beside it
        save: async g => { const ch = {}; for (const it of c.items) { const k = C.key(c, it); if (open(it)) ch[k] = g[k] != null ? String(Math.round(g[k] * it.inMax / 10 * 100) / 100) : null; }
          a.hand = await setHand(cache.user, ch); a.grades = Object.assign({}, a.hand, a.canvas); } }));
      const srcRow = el("div", "muted src own-row"); srcRow.append(el("span", null, source([c])));
      if (!a.expired && ruleItems(courseId).length) srcRow.appendChild(ownBtn());   // the ready-made weights do not match? build your own
      parts.notas.push(srcRow);
    }
    const acts = el("div", "acts"), status = el("span", "muted");
    if (prefs.files) {
      const files = el("button", "primary", "Baixar arquivos da matéria");
      files.addEventListener("click", () => listFiles(courseId, cv ? cv.name : document.title, acts, files, status));
      acts.appendChild(files);
    }
    const resend = async () => sendReminders(agenda(a, cache, await myMarks(cache.user)), prefs, cache);   // a tick or a dated item here changes the reminders
    const nb = notesBlock(cache, courseId, () => { if (btns.anot) btns.anot.textContent = "Anotações ✓"; }, resend);
    const host = document.getElementById("qf-panel"); if (host) host.cpBusy = () => simOn || nb.busy() || (!!host.cpRoot && !!host.cpRoot.activeElement && /^(INPUT)$/.test(host.cpRoot.activeElement.tagName || ""));   // typing the rule's top: not redrawn under the cursor
    acts.appendChild(status);
    // tabs: Visão geral, Materiais (modules, files), Avisos, Anotações; the last one opened is kept (the grades are above them)
    const tabs = [["geral", "Visão geral"], ["materiais", "Materiais"], ["avisos", "Avisos"]].concat(EXT ? [["anot", "Anotações"]] : []);
    const bar = el("div", "ctabs"), panes = {}, btns = {}; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Seções da matéria");
    bar.addEventListener("keydown", e => {
      const keys = tabs.map(([k]) => k), cur = keys.findIndex(k => btns[k].getAttribute ? btns[k].getAttribute("aria-selected") === "true" : btns[k]["aria-selected"] === "true");
      const nx = e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowLeft" ? cur - 1 : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : null;
      if (nx === null) return; e.preventDefault(); const k = keys[(nx + keys.length) % keys.length]; show(k, true); if (btns[k].focus) btns[k].focus();
    });
    const show = async (k, byClick) => {
      for (const [key] of tabs) { panes[key].hidden = key !== k; btns[key].setAttribute("aria-selected", String(key === k)); btns[key].tabIndex = key === k ? 0 : -1; }
      if (k === "materiais" && !panes.materiais.cpLoaded) { panes.materiais.cpLoaded = 1; materials(courseId, panes.materiais); }
      if (k === "anot" && byClick && nb.ta.focus) nb.ta.focus();   // only when the student opens it (never on page load)
      if (byClick) await chrome.storage.local.set({ ctab: k });   // the student's choice, not every page load
    };
    for (const [k, label] of tabs) {
      const b = el("button", null, label); b.type = "button"; b.dataset.k = k; b.setAttribute("role", "tab"); b.addEventListener("click", () => show(k, true)); bar.appendChild(b); btns[k] = b;
      panes[k] = el("div", "cpane"); panes[k].setAttribute("role", "tabpanel"); panes[k].hidden = k !== "geral";   // no flash of every tab before the kept one is read
    }
    panes.geral.append(...overview(courseId, c, a, cache, prefs));
    panes.materiais.appendChild(acts);
    panes.avisos.appendChild(courseNews(cache, courseId));
    if (EXT) panes.anot.append(...nb.nodes);
    box.append(...parts.notas, bar, ...tabs.map(([k]) => panes[k]));
    if (EXT && host) host.cpOpenNotes = () => { show("anot", true); if (nb.ta.scrollIntoView) nb.ta.scrollIntoView({ block: "center" }); };
    if (EXT && location.hash === "#anot") show("anot"); else chrome.storage.local.get("ctab").then(({ ctab }) => show(tabs.some(([k]) => k === ctab) ? ctab : "geral"));

  }

  // The course's color in Canvas (the user's custom colors, GET /users/self/colors), read once a day per user.
  async function courseColor(cache, id) {
    const { ccolors } = await chrome.storage.local.get("ccolors");
    let map = ccolors && ccolors.user === cache.user && Date.now() - ccolors.at < 864e5 ? ccolors.map : null;
    if (!map) { try { const r = await getAll("/api/v1/users/self/colors", 1); map = r && r.custom_colors && typeof r.custom_colors === "object" ? r.custom_colors : {}; } catch (e) { map = {}; }
      await chrome.storage.local.set({ ccolors: { user: cache.user, at: Date.now(), map } }); }
    const col = map["course_" + id];
    return typeof col === "string" && /^#[0-9a-f]{3,8}$/i.test(col) ? col : null;
  }
  // Visão geral: what comes next in this course, its latest announcement and the shortcuts to Canvas's own pages.
  // Visão geral: a mini calendar of the month (a dot on each day with something: coral for exams, amber for work, green when
  // done; today ringed); clicking a day lists it on the right, which otherwise shows what comes next. Canvas deadlines of
  // this course plus every assessment of the Plano de Ensino.
  function miniCal(courseId, c, a, cache, prefs) {
    const t = today();
    let marks = {}, items = [];
    const build = () => {
      const seen = new Set(); items = [];
      const rule = c ? c.items.filter(it => it.date).map(it => { const key = "qf:" + C.key(c, it); return { key, mine: !!marks[key], title: it.name, date: it.date, exam: it.exam, task: !it.exam, url: null, rule: true }; }) : [];
      for (const x of agenda(a, cache, marks).filter(x => String(x.cid) === courseId || (c && x.ours === c)).concat(programa(a, cache, marks, courseId), rule)) {
        const k = x.date + "|" + fold(x.title).slice(0, 24); if (seen.has(k)) continue; seen.add(k); items.push(x);
      }
    };
    build();
    if (!progEvents) loadProgEvents(cache, courseId).then(() => { build(); if (typeof draw === "function") draw(); }, () => {});   // this course's calendar events only
    const sec = el("section", "card mcal"), left = el("div", "mc-l"), right = el("div", "mc-r"), head = el("div", "mc-h"), prev = el("button", null, "‹"), next = el("button", null, "›"), title = el("b");
    prev.type = next.type = "button"; prev.setAttribute("aria-label", "Mês anterior"); next.setAttribute("aria-label", "Próximo mês");
    head.append(prev, title, next); const grid = el("div", "mc-g"); left.append(head, grid); sec.append(left, right);
    let cur = t.slice(0, 7), pick = null;
    const tone = x => fin(x) ? "ok" : x.exam ? "ex" : "wa";
    const listOf = (list, label) => {
      const k = el("div", "mc-k"); k.append(el("span", null, label), el("span", null, "Feito")); right.replaceChildren(k);
      if (!list.length) { right.appendChild(el("div", "muted", pick ? "Nada neste dia." : "Nada pela frente nesta matéria.")); return; }
      for (const x of list.slice(0, 5)) { const r = el("div", "mc-i " + tone(x)), when = el("span", "mc-d" + (x.late && !fin(x) && x.date < t ? " lt" : ""), x.date === t ? "hoje" : dmy(x.date) + (x.due ? " " + hhmm(x.due) : ""));
        const name = (x.exam && !/prova/i.test(x.title) ? "Prova: " : "") + x.title;
        let ck = el("span");   // exams and work Canvas already counts as handed in get no tick
        if (!x.exam && !x.done && cache.user) {
          ck = el("button", "ck", "✓"); ck.type = "button"; ck.setAttribute("aria-pressed", String(!!x.mine));
          ck.setAttribute("aria-label", (x.mine ? "Desmarcar: " : "Marcar como feito: ") + name); ck.title = x.mine ? "Desmarcar" : "Marcar como feito (só aqui, o Canvas não muda)";
          ck.addEventListener("click", async () => { marks = await tick(cache.user, x, !x.mine); build(); draw(); if (prefs) sendReminders(agenda(a, cache, marks), prefs, cache); });
        }
        r.append(el("i"), when, link(name, x.url), ck); right.appendChild(r); }
    };
    const draw = () => {
      const [y, m] = cur.split("-").map(Number), pad = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
      title.textContent = MONTHS[m - 1] + " " + y; grid.replaceChildren();
      for (const w of ["D", "S", "T", "Q", "Q", "S", "S"]) grid.appendChild(el("span", "mc-w", w));
      for (let i = 0; i < pad; i++) grid.appendChild(el("span"));
      for (let d = 1; d <= days; d++) {
        const iso = cur + "-" + String(d).padStart(2, "0"), its = items.filter(x => x.date === iso), b = el("button", "mc-day" + (iso === t ? " today" : "") + (iso === pick ? " on" : "") + (its.length ? " has" : ""));
        b.type = "button"; b.appendChild(el("span", null, String(d)));
        if (its.length) { const dots = el("span", "mc-dots"); for (const x of its.slice(0, 3)) dots.appendChild(el("i", tone(x))); b.appendChild(dots); b.title = its.map(x => x.title).join("\n"); }
        b.addEventListener("click", () => { pick = pick === iso ? null : iso; draw(); });
        grid.appendChild(b);
      }
      if (pick) listOf(items.filter(x => x.date === pick), cap(dayLabel(pick)));
      else listOf(items.filter(x => !x.done && (x.date >= t || (x.late && !fin(x) && x.date >= addDays(-7)))).sort((p, q) => p.date.localeCompare(q.date)), "A seguir");   // ticked here stays (greyed) so it can be unticked
    };
    const shift = n => { const [y, m] = cur.split("-").map(Number), d = new Date(y, m - 1 + n, 1); cur = C.localISO(d).slice(0, 7); pick = null; draw(); };
    prev.addEventListener("click", () => shift(-1)); next.addEventListener("click", () => shift(1));
    draw(); if (cache.user) myMarks(cache.user).then(m => { marks = m; build(); draw(); });
    watchStore(ch => { if (gone(sec)) return false; if (ch.checks) loadChecks(cache.user).then(() => { build(); draw(); }); });   // a dated item added in Anotações shows here at once
    return sec;
  }
  function overview(courseId, c, a, cache, prefs) {
    const out = [miniCal(courseId, c, a, cache, prefs)];
    const last = (cache.data.announcements || []).filter(x => String(x.courseId) === courseId).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
    if (last) { const s2 = el("section", "card news"), li = el("div", "row"), who = el("span", "who"); who.appendChild(avatar(last.avatar, last.author || "", 32)); if (last.unread) who.appendChild(el("span", "dot", "não lido"));
      li.append(who, mid(last.title, last.url && inCanvas(last.url), (last.author ? last.author + " · " : "") + (last.at ? ago(C.localISO(new Date(last.at))) : "")), el("span"));
      s2.append(el("h3", null, "Último aviso"), li); out.push(s2); }
    return out;
  }
  // Materiais: every module and its items (one GET when the tab opens), with a filter box; the files download stays above.
  async function materials(courseId, pane) {
    const box = el("section", "card news mats"), q = el("input", "mq"), list = el("div"); q.type = "text"; q.placeholder = "Filtrar materiais (ex.: slides, lista 4)"; q.setAttribute("aria-label", "Filtrar materiais");
    box.append(el("h3", null, "Módulos"), q, list); pane.appendChild(box); list.appendChild(el("div", "muted", "Lendo os módulos…"));
    let mods = [];
    try { mods = await getAll("/api/v1/courses/" + courseId + "/modules?include[]=items&per_page=100"); } catch (e) { list.replaceChildren(el("div", "muted", "Esta matéria não mostra os módulos.")); return; }
    await pool(mods.filter(m => !m.items && m.items_count), 3, async m => { try { m.items = await getAll("/api/v1/courses/" + courseId + "/modules/" + m.id + "/items?per_page=100"); } catch (e) { m.items = []; } });   // big modules come without their items: three at a time
    const draw = () => {
      const w = fold(q.value || "").trim(); let shown = 0; list.replaceChildren();
      for (const m of mods) {
        const items = (m.items || []).filter(it => it && it.title && it.type !== "SubHeader" && (!w || fold(it.title + " " + m.name).includes(w)));
        if (!items.length) continue;
        const g = el("div", "mod"); g.appendChild(el("div", "mh", String(m.name || "Módulo")));
        for (const it of items) { const r = el("div", "mi"); r.append(el("span", "pal-k", KIND[it.type] || "item"), link(String(it.title), it.html_url && inCanvas(it.html_url))); g.appendChild(r); }
        list.appendChild(g); shown++;
      }
      if (!shown) list.appendChild(el("div", "muted", w ? "Nada com esse nome." : "Sem módulos publicados."));
    };
    q.addEventListener("input", draw); draw();
  }
  // Avisos: every announcement of this course (last 60 days), with the author's photo.
  function courseNews(cache, courseId) {
    const sec = el("section", "card news"), all = (cache.data.announcements || []).filter(x => String(x.courseId) === courseId).sort((x, y) => String(y.at).localeCompare(String(x.at)));
    sec.appendChild(el("h3", null, "Avisos da matéria"));
    if (!all.length) { sec.appendChild(el("div", "muted", "Nenhum aviso nos últimos 60 dias.")); return sec; }
    const ul = el("ul");
    for (const x of all) { const li = el("li", "row" + (x.unread ? " unread" : "")), who = el("span", "who"); who.appendChild(avatar(x.avatar, x.author || "", 32)); if (x.unread) who.appendChild(el("span", "dot", "não lido"));
      li.append(who, mid(x.title, x.url && inCanvas(x.url), x.author || ""), el("span", "d", x.at ? ago(C.localISO(new Date(x.at))) : "")); ul.appendChild(li); }
    sec.appendChild(ul); return sec;
  }
  async function courseFiles(id) {
    try { return await getAll("/api/v1/courses/" + id + "/files?sort=created_at&order=desc&per_page=100"); }
    catch (e) {   // Files tab hidden by the professor: the files linked in modules
      const ids = [], seen = new Set();
      for (const m of await getAll("/api/v1/courses/" + id + "/modules?include[]=items&per_page=100"))
        for (const it of m.items || []) if (it.type === "File" && it.content_id && !seen.has(it.content_id)) { seen.add(it.content_id); ids.push(it.content_id); }
      const out = new Array(ids.length);   // three at a time, in module order
      await pool(ids.map((cid, i) => [cid, i]), 3, async ([cid, i]) => { try { out[i] = await getAll("/api/v1/courses/" + id + "/files/" + cid); } catch (err) { /* locked file */ } });
      return out.filter(Boolean);
    }
  }
  async function listFiles(id, canvasName, acts, btn, status) {
    btn.disabled = true; status.textContent = "Listando arquivos…";
    try {
      const root = cpFolder(cpPrefs((await chrome.storage.local.get("prefs")).prefs).dlFolder);   // the student's folder inside Downloads
      const all = (await courseFiles(id)).filter(f => f && f.url && !f.locked_for_user)
        .map(f => ({ id: f.id, url: new URL(f.url, location.href).href, filename: F.target(canvasName, f, C.COURSES, C.CANVAS, id, root) })).filter(f => f.filename);
      const { dl } = await chrome.storage.local.get("dl"), have = new Set(Array.isArray(dl) ? dl : []);
      const fresh = all.filter(f => !have.has(f.id));
      btn.remove();
      status.textContent = all.length + (all.length === 1 ? " arquivo" : " arquivos") + ", " + fresh.length + (fresh.length === 1 ? " novo" : " novos") + " · vão para Downloads/" + root;
      const btns = [];
      const save = async items => {
        const now = cpFolder(cpPrefs((await chrome.storage.local.get("prefs")).prefs).dlFolder);   // the folder may have changed since the list was made
        if (now !== root) items = items.map(f => Object.assign({}, f, { filename: now + f.filename.slice(root.length) }));
        btns.forEach(b => { b.disabled = true; }); status.textContent = "Baixando " + items.length + "…";
        let started = 0;
        try {
          for (let i = 0; i < items.length; i += 300) {   // the service worker takes up to 300 per message
            const res = await chrome.runtime.sendMessage({ type: "download", items: items.slice(i, i + 300) });
            started += res && Array.isArray(res.done) ? res.done.length : 0;
          }
          status.textContent = started + " de " + items.length + " enviados para Downloads/" + now;
        } catch (e) { status.textContent = "Não deu para baixar agora (" + started + " de " + items.length + " enviados). Recarregue a página e tente de novo."; }   // the extension was updated under this tab, or the worker failed
        finally { btns.forEach(b => { b.disabled = false; }); }
      };
      if (fresh.length) { const b = el("button", "primary", "Baixar " + fresh.length + (fresh.length === 1 ? " novo" : " novos")); b.addEventListener("click", () => save(fresh)); acts.prepend(b); btns.push(b); }
      if (all.length) { const b = el("button", null, "Baixar todos"); b.addEventListener("click", () => save(all)); acts.insertBefore(b, status); btns.push(b); }
    } catch (e) { status.textContent = "Não consegui listar: " + (e && e.message || e); btn.disabled = false; }
  }

  // Ctrl+K (⌘K on a Mac): search the term's courses, assignments and module items, and open one. Courses and assignments
  // come from the last reading; the modules are read on the first search (one GET per course) and kept for 6 hours.
  const SEARCH_TTL = 6 * 3600 * 1000;
  const KEYS = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform || "") ? "⌘K" : "Ctrl+K";
  const fold = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const inCanvas = u => { try { const h = new URL(u, location.href).href; return h.startsWith(location.origin + "/") ? h : null; } catch (e) { return null; } };
  const KIND = { Assignment: "tarefa", Quiz: "quiz", Page: "página", File: "arquivo", Discussion: "fórum", ExternalUrl: "link", ExternalTool: "ferramenta" };
  function baseIndex(a, cache) {
    const out = [];
    for (const c of cache.data.courses) {
      const nm = shortName(c.name);
      out.push({ t: nm, c: "Matéria", u: "/courses/" + c.id, k: "matéria" });
      for (const x of c.assignments) if (x.url) out.push({ t: x.name, c: nm, u: x.url, k: "tarefa" });
    }
    for (const c of cache.data.courses) { const p = a.byCanvasId[String(c.id)]; out.push({ t: (p ? C.SHORT[p.id] : nick(c.name)) + ": quanto falta", c: "Caderno+", u: "/courses/" + c.id, k: "campus" }); }   // every course, any turma
    return out;
  }
  async function moduleIndex(cache) {
    const { search } = await chrome.storage.local.get("search");
    if (search && search.user === cache.user && Date.now() - search.at < SEARCH_TTL && Array.isArray(search.items)) return search.items;
    let read = 0;   // three courses at a time, kept in the course order
    const per = await pool(cache.data.courses, 3, async c => {
      try {
        const out = [];
        for (const m of await getAll("/api/v1/courses/" + c.id + "/modules?include[]=items&per_page=100"))
          for (const it of m.items || []) if (it && it.title && it.html_url && it.type !== "SubHeader") out.push({ t: String(it.title), c: shortName(c.name) + " · " + String(m.name || ""), u: it.html_url, k: KIND[it.type] || "item" });
        read++; return out;
      } catch (e) { return []; }   // modules hidden in this course
    });
    const items = [].concat(...per);
    if (read) await chrome.storage.local.set({ search: { user: cache.user, at: Date.now(), items } });
    return items;
  }
  // Every word must appear in the title or the course; titles that start with the first word come first. Empty: the courses.
  function find(items, q) {
    const ws = fold(q).split(/\s+/).filter(Boolean), seen = new Set();
    const ranked = ws.length ? items.map(x => {
      const t = fold(x.t);
      if (!ws.every(w => (t + " " + fold(x.c)).includes(w))) return null;
      return [t.startsWith(ws[0]) ? 0 : (" " + t).includes(" " + ws[0]) ? 1 : t.includes(ws[0]) ? 2 : 3, x];
    }).filter(Boolean).sort((p, r) => p[0] - r[0] || p[1].t.length - r[1].t.length).map(p => p[1]) : items.filter(x => x.k === "matéria" || x.k === "campus");
    return ranked.filter(x => { const id = fold(x.t) + "|" + x.u; if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 30);
  }
  function openSearch(a, cache) {
    const cur = document.getElementById("cp-search");
    if (cur) { cur.remove(); return; }   // the shortcut again closes it
    const host = el("div", "cp-host"); host.id = "cp-search";
    host.style.cssText = "position:fixed;inset:0;z-index:10000;margin:0";
    const root = shadow(host), back = el("div", "pal-back"), dlg = el("div", "pal");
    styleRoot(root);
    dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-label", "Buscar no Canvas");
    const q = el("input", "pal-q"); q.type = "text"; q.autocomplete = "off"; q.placeholder = "Buscar tarefas, módulos e matérias…"; q.setAttribute("aria-label", "Buscar");
    const ul = el("ul", "pal-r"), note = el("div", "pal-s", "Lendo os módulos das matérias…");
    ul.setAttribute("role", "listbox"); ul.id = "pal-r"; q.setAttribute("aria-controls", "pal-r");
    let items = inCanvasOnly(baseIndex(a, cache)), hits = [], sel = 0;
    const close = () => host.remove();
    const go = async x => {
      close();
      if (x.pw) { await loadTasks(cache.user); await addTask(cache.user, x.pw.title, x.pw.date); if (window.cpRedraw) window.cpRedraw(); return; }
      location.assign(inCanvas(x.u));
    };
    const draw = () => {
      const plus = /^\+\s*(.+)/.exec(String(q.value || ""));
      if (plus) { const pw = parseWhen(plus[1]); hits = pw.title ? [{ t: "Criar tarefa: " + pw.title, c: pw.date ? cap(dayLabel(pw.date)) : "sem dia", u: "#task", k: "nova", pw }] : []; }
      else hits = find(items, q.value); sel = Math.min(sel, Math.max(0, hits.length - 1)); ul.replaceChildren();
      hits.forEach((x, i) => {
        const li = el("li", "pal-i" + (i === sel ? " on" : "")); li.setAttribute("role", "option"); li.setAttribute("aria-selected", String(i === sel));
        li.append(el("span", "pal-k", x.k), mid(x.t, null, x.c)); li.addEventListener("click", () => go(x)); ul.appendChild(li);
      });
      if (!hits.length) ul.appendChild(el("li", "pal-e", q.value ? "Nada encontrado." : "Digite para buscar, ou + para criar uma tarefa (ex.: + revisar slides sex)."));
      const on = ul.querySelector ? ul.querySelector(".on") : null; if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });   // the arrows keep the choice in view
    };
    dlg.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); close(); } });   // Esc closes from anywhere in the dialog, not only from the field
    q.addEventListener("input", () => { sel = 0; draw(); });
    q.addEventListener("keydown", e => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); draw(); }
      else if (e.key === "Enter" && hits[sel]) { e.preventDefault(); go(hits[sel]); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    back.addEventListener("click", close);
    dlg.append(q, ul, note); root.append(back, dlg); document.body.appendChild(host);
    if (q.focus) q.focus();
    draw();
    moduleIndex(cache).then(mods => { items = items.concat(inCanvasOnly(mods)); note.textContent = KEYS + " abre e fecha · ↑↓ escolhe · Enter abre"; draw(); },
      () => { note.textContent = "Não consegui ler os módulos agora; busca só nas tarefas e matérias."; });
  }
  const inCanvasOnly = list => list.filter(x => inCanvas(x.u));

  // The left-menu trays (Cursos, Grupos, Histórico, Ajuda: canvas-lms navigation_header/react/trays, all in #nav-tray-portal):
  // the look is page CSS; here the Cursos tray gets our pill on our subjects and leaves out the courses taken off the dashboard.
  let trayWatch = null;
  let trayCache = null;   // the reading the tray numbers come from (set with watchTray)
  function enhanceTray(a, hidden) {
    const portal = document.getElementById("nav-tray-portal"); let nums = null;
    if (!portal || !portal.querySelectorAll) return;
    for (const link of portal.querySelectorAll('a[href^="/courses/"]')) {
      const m = /^\/courses\/(\d+)$/.exec(link.getAttribute("href") || ""); if (!m) continue;
      const item = link.closest ? link.closest("li") : null;
      if (item) item.style.display = hidden().includes(m[1]) ? "none" : "";
      if (!item) continue;
      const c = a.byCanvasId[m[1]]; let txt = null, tone = "warn";
      if (c && a.has && a.rules) { const st = a.state(c); txt = earnedText(st) + "/10 · " + a.label(st); tone = a.tone(st); }
      else if (trayCache) { const u = (nums = nums || new Map(courseNumbers(a, trayCache).U.map(x => [x.cid, x]))).get(m[1]);   // any course, any turma: the dashboard's number
        if (u && (u.now != null || u.status === "nao-da")) { txt = (u.now == null ? "" : dn(u.now) + "/10 · ") + u.label; tone = u.tone === "nt" ? "warn" : u.tone; } }
      const old = item.querySelector("[data-cp-tray]");
      if (old && old.textContent === txt) continue;   // unchanged: no write (the watcher would see it)
      if (old) old.remove();
      if (txt) { const p = pill(txt, tone); p.setAttribute("data-cp-tray", "1"); item.appendChild(p); }
    }
  }
  let trayA = null, trayHidden = null;   // the latest reading and hidden list: the watcher is set once, its data is not
  function watchTray(a, hidden) {
    trayA = a; trayHidden = hidden;
    if (trayWatch || typeof MutationObserver === "undefined" || !document.body) { if (trayWatch) enhanceTray(trayA, trayHidden); return; }
    let t = 0;
    // only the tray portal (Cursos, Grupos...), not every change on the page; the whole page only until the portal exists
    let onPortal = false;
    const aim = () => { const p = document.getElementById("nav-tray-portal"); onPortal = !!p; trayWatch.disconnect(); trayWatch.observe(p || document.body, { childList: true, subtree: true }); };
    trayWatch = new MutationObserver(() => { if (!onPortal && document.getElementById("nav-tray-portal")) aim(); clearTimeout(t); t = setTimeout(() => enhanceTray(trayA, trayHidden), 150); });
    aim();
    enhanceTray(a, hidden);
  }
  // /courses (Todos os cursos): our pill per subject and, on every course, "Tirar do painel" / "Mostrar no painel".
  function coursesPage(a, hidden, setHidden) {
    for (const row of document.querySelectorAll("#my_courses_table tbody tr")) {
      const link = row.querySelector('a[href*="/courses/"]'), m = link && /\/courses\/(\d+)/.exec(link.getAttribute("href") || "");
      if (!m || row.querySelector("[data-cp-row]")) continue;
      const id = m[1], c = a.byCanvasId[id], cell = link.parentNode, box = el("span"); box.setAttribute("data-cp-row", "1");
      box.style.cssText = "display:inline-flex;gap:8px;align-items:center;margin-left:10px;vertical-align:middle";
      if (c && a.has) { const st = a.state(c), p = pill(earnedText(st) + "/10 · " + a.label(st), a.tone(st)); p.style.marginTop = "0"; box.appendChild(p); }
      const off = hidden().includes(id), b = el("button", null, off ? "Mostrar no painel" : "Tirar do painel"); b.type = "button";
      b.style.cssText = "font:500 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:5px 10px;border-radius:8px;border:1px solid #ECE4D3;background:#fff;color:#5F6675;cursor:pointer";
      b.addEventListener("click", async () => { const now = hidden(), next = now.includes(id) ? now.filter(x => x !== id) : now.concat([id]); await setHidden(next); b.textContent = next.includes(id) ? "Mostrar no painel" : "Tirar do painel"; });
      box.appendChild(b); cell.appendChild(box);
    }
  }

  // A round photo (Canvas avatar URL, https only) or the initials.
  function avatar(url, name, size) {
    const box = el("span", "av"); box.style.width = box.style.height = (size || 28) + "px";
    if (url && /^https:\/\//.test(url) && !/avatar-50\.png$/.test(url)) { const img = el("img"); img.src = url; img.alt = ""; img.loading = "lazy"; box.appendChild(img); }
    else box.textContent = String(name || "?").split(" (")[0].split(" - ")[0].split(/\s+/).filter(w => /^\p{L}/u.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
    return box;
  }
  // The teachers of the term's courses (name and photo), read once a day per Canvas user: GET /courses/:id/users for teachers.
  async function teachersOf(cache) {
    const { teachers } = await chrome.storage.local.get("teachers");
    if (teachers && teachers.user === cache.user && Date.now() - teachers.at < 864e5 && Array.isArray(teachers.list)) return teachers.list;
    let failed = false;
    const list = [], got = await pool(cache.data.courses, 3, c => getAll("/api/v1/courses/" + c.id + "/users?enrollment_type[]=teacher&include[]=avatar_url&per_page=20", 1).catch(() => { failed = true; return []; }));   // three at a time; a course that hides its people gives none
    cache.data.courses.forEach((c, i) => {
      for (const u of Array.isArray(got[i]) ? got[i] : [])
        if (u && u.id && u.name && !list.some(t => t.id === u.id && t.course === c.id)) list.push({ id: u.id, name: String(u.name).slice(0, 80), avatar: typeof u.avatar_url === "string" ? u.avatar_url : null, course: c.id, courseName: shortName(c.name) });
    });
    await chrome.storage.local.set({ teachers: { user: cache.user, at: failed ? Date.now() - 864e5 + 3600e3 : Date.now(), list } });   // a failed course is tried again in an hour, not tomorrow
    return list;
  }
  // "Pergunte ao professor": each teacher with photo; the button opens Canvas's own compose, addressed (the inbox reads
  // user_id, user_name and context_id from the address). Nothing is sent by Caderno+.
  function askCard(list) {
    const sec = el("section", "card news ask"), h = el("h3", null, "Pergunte ao professor"), ul = el("ul", "teachers");
    sec.appendChild(h);
    for (const t of list.slice(0, 12)) {
      const li = el("li", "teacher"), go = el("a", "mini ask-b", "Perguntar");
      go.href = location.origin + "/conversations?user_id=" + encodeURIComponent(t.id) + "&user_name=" + encodeURIComponent(t.name) + "&context_id=course_" + encodeURIComponent(t.course);
      go.title = "Abrir uma mensagem para " + t.name + " na caixa de entrada do Canvas";
      li.append(avatar(t.avatar, t.name, 36), mid(t.name, null, t.courseName), go); ul.appendChild(li);
    }
    sec.appendChild(list.length ? ul : el("div", "muted", "Não consegui ler os professores das matérias agora."));
    if (!("ask" in folds)) folds = Object.assign({}, folds, { ask: true });   // folded until the student opens it (the course page has the teacher too)
    foldable(sec, h, "ask"); return sec;
  }

  // The course menu (#section-tabs, server-rendered): items the professor enabled can be hidden one by one, per course
  // (chrome.storage.local "navHide": { <course id>: [<tab class>] }). "Editar menu" shows every item with an eye to toggle.
  // the eye button (show / hide) used by the course menu and the modules editors
  const EYE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round'><path d='M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z'/><circle cx='8' cy='8' r='2'/></svg>")`, EYE_OFF = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round'><path d='M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z'/><path d='M2.5 13.5l11-11'/></svg>")`;
  const eyeCss = pfx => `${pfx} .cp-eye { margin-left:auto; flex:none; width:22px; height:22px; padding:0; border:0; border-radius:6px; cursor:pointer; background:currentColor; opacity:.65; -webkit-mask:${EYE} no-repeat center / 16px; mask:${EYE} no-repeat center / 16px; }
${pfx} .cp-eye.off { -webkit-mask-image:${EYE_OFF}; mask-image:${EYE_OFF}; opacity:.6; } ${pfx} .cp-eye:hover { opacity:1; }`;
  const FOLD_CSS = `#cp-navfold { display:flex; align-items:center; gap:6px; margin:0 0 10px 6px; padding:5px 10px 5px 6px; border:1px solid currentColor; border-radius:999px; background:none; color:inherit; opacity:.55; cursor:pointer; font:600 11.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; letter-spacing:.02em; transition:opacity .15s; }
#cp-navfold:hover, #cp-navfold:focus-visible { opacity:1; }
#cp-navfold i, #cp-navopen i { display:block; width:14px; height:14px; background:currentColor; -webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M10 3.5 5.5 8l4.5 4.5'/></svg>") no-repeat center / contain; mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M10 3.5 5.5 8l4.5 4.5'/></svg>") no-repeat center / contain; }
#cp-navopen { position:fixed; top:96px; left:var(--cp-navleft, 84px); z-index:999; display:grid; place-items:center; width:20px; height:52px; padding:0; border:0; border-radius:0 12px 12px 0; background:var(--ic-brand-primary, #E2482B); color:var(--cp-on-accent, #fff); cursor:pointer; box-shadow:3px 2px 12px -6px rgba(0,0,0,.5); transition:width .15s; }
#cp-navopen:hover, #cp-navopen:focus-visible { width:26px; }
#cp-navopen i { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M6 3.5 10.5 8 6 12.5'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M6 3.5 10.5 8 6 12.5'/></svg>"); }`;
  const tabKey = a => [...(a.classList || [])].find(c => c !== "active") || (a.className || "").split(" ").find(c => c && c !== "active") || "";
  async function courseNav(courseId) {
    const nav = document.getElementById("section-tabs");
    if (!nav || document.getElementById("cp-navedit")) return;
    const { navHide } = await chrome.storage.local.get("navHide"), all = navHide && typeof navHide === "object" ? navHide : {};
    let hidden = Array.isArray(all[courseId]) ? all[courseId].filter(k => /^[a-z0-9_-]{1,60}$/.test(k)) : [], editing = false;
    let st = document.getElementById("cp-navhide"); if (!st) { st = el("style"); st.id = "cp-navhide"; (document.head || document.body).appendChild(st); }
    const links = [...nav.querySelectorAll("li > a")];
    const paint = () => {
      st.textContent = (editing ? hidden.map(k => '#section-tabs li > a.' + k + ' { opacity:.4; text-decoration:line-through; }') : hidden.map(k => '#section-tabs li:has(> a.' + k + ') { display:none !important; }')).join("\n")
        + '\n' + eyeCss("#section-tabs") + '\n' + FOLD_CSS;
      for (const a of links) { let b = a.parentNode.querySelector(".cp-eye"); const k = tabKey(a);
        if (!editing || !k || k === "home") { if (b) b.remove(); continue; }
        if (!b) { b = el("button", "cp-eye"); b.type = "button"; b.addEventListener("click", async e => { e.preventDefault(); e.stopPropagation();
          hidden = hidden.includes(k) ? hidden.filter(x => x !== k) : hidden.concat([k]);
          const { navHide: cur } = await chrome.storage.local.get("navHide"); await chrome.storage.local.set({ navHide: Object.assign({}, cur, { [courseId]: hidden }) }); paint(); });
          a.style.display = "flex"; a.appendChild(b); }
        const off = hidden.includes(k); b.className = "cp-eye" + (off ? " off" : ""); b.title = off ? "Mostrar no menu" : "Esconder do menu"; b.setAttribute("aria-label", (off ? "Mostrar " : "Esconder ") + a.textContent.trim());
      }
      edit.textContent = editing ? "Pronto" : "Editar menu" + (hidden.length ? " (" + hidden.length + " escondido" + (hidden.length > 1 ? "s" : "") + ")" : "");
    };
    // the arrow: fold the course menu away (Canvas's own course-menu-expanded body class, so its layout follows) and back
    const { navFold } = await chrome.storage.local.get("navFold");
    const tab = el("button"), fold = el("button"); tab.type = fold.type = "button"; tab.id = "cp-navopen";
    fold.id = "cp-navfold"; fold.title = "Recolher o menu da matéria"; fold.setAttribute("aria-label", fold.title); fold.appendChild(el("i")); fold.appendChild(el("span", null, "Recolher"));
    tab.title = "Mostrar o menu da matéria"; tab.setAttribute("aria-label", tab.title); tab.appendChild(el("i"));
    const header = document.querySelector ? document.querySelector(".ic-app-header") : null;
    if (header && header.getBoundingClientRect && document.documentElement.style) document.documentElement.style.setProperty("--cp-navleft", Math.round(header.getBoundingClientRect().right) + "px");
    const setFold = async (on, save = true) => { if (document.body.classList) document.body.classList.toggle("course-menu-expanded", !on); tab.style.display = on ? "" : "none"; if (save) await chrome.storage.local.set({ navFold: on }); };
    fold.addEventListener("click", () => setFold(true)); tab.addEventListener("click", () => setFold(false));
    if (nav.parentNode) nav.parentNode.insertBefore(fold, nav); document.body.appendChild(tab);
    tab.style.display = "none";
    const { prefs: pp } = await chrome.storage.local.get("prefs");
    if (navFold === true) setFold(true, false); else if (navFold !== false && cpPrefs(pp).mode === "foco") setFold(true, false);   // Foco folds it without saving   // Foco folds the course menu unless the student opened it
    const li = el("li", "section"), edit = el("button"); li.id = "cp-navedit"; edit.type = "button";
    edit.style.cssText = "margin:10px 0 0 6px;padding:5px 10px;border-radius:9px;border:1px dashed currentColor;background:none;color:inherit;opacity:.7;font:500 12px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;cursor:pointer";
    edit.addEventListener("click", () => { editing = !editing; paint(); });
    li.appendChild(edit); nav.appendChild(li); paint();
  }

  // Modules (#context_modules, canvas-lms context_modules/_context_module_next and _module_item_next: div#context_module_<id>,
  // li#context_module_item_<id>): whole modules or single items hidden one by one, per course ("modHide"), edited with eyes.
  async function courseModules(courseId) {
    const root = document.getElementById("context_modules");
    if (!root || document.getElementById("cp-modedit")) return;
    const { modHide } = await chrome.storage.local.get("modHide"), all = modHide && typeof modHide === "object" ? modHide : {};
    let hidden = Array.isArray(all[courseId]) ? all[courseId].filter(k => /^context_module(_item)?_\d{1,20}$/.test(k)) : [], editing = false;
    let st = document.getElementById("cp-modhide"); if (!st) { st = el("style"); st.id = "cp-modhide"; (document.head || document.body).appendChild(st); }
    const bar = el("div"), edit = el("button"), hint = el("span"); bar.id = "cp-modedit"; edit.type = "button";
    bar.style.cssText = "display:flex;align-items:center;gap:10px;margin:0 0 12px";
    edit.style.cssText = "padding:6px 12px;border-radius:9px;border:1px dashed currentColor;background:none;color:inherit;opacity:.75;font:500 12.5px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;cursor:pointer";
    hint.style.cssText = "font:12px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;opacity:.65";
    const save = async () => { const { modHide: cur } = await chrome.storage.local.get("modHide"); await chrome.storage.local.set({ modHide: Object.assign({}, cur, { [courseId]: hidden }) }); };
    const paint = () => {
      st.textContent = hidden.map(k => "#" + k + (editing ? " { opacity:.45; }" : " { display:none !important; }")).join("\n") + "\n" + eyeCss("#context_modules")
        + "\n#context_modules .ig-header .cp-eye, #context_modules .ig-row .cp-eye { margin-left:8px; align-self:center; }";
      const targets = [...root.querySelectorAll(".context_module")].map(m => [m, m.querySelector(".ig-header")]).concat([...root.querySelectorAll("li.context_module_item")].map(i => [i, i.querySelector(".ig-row")]));
      for (const [node, host] of targets) {
        const k = node.id; if (!host || !/^context_module(_item)?_\d+$/.test(k || "")) continue;
        let b = host.querySelector(":scope > .cp-eye");
        if (!editing) { if (b) b.remove(); continue; }
        if (!b) { b = el("button", "cp-eye"); b.type = "button"; b.addEventListener("click", async e => { e.preventDefault(); e.stopPropagation();
          hidden = hidden.includes(k) ? hidden.filter(x => x !== k) : hidden.concat([k]); await save(); paint(); }); host.appendChild(b); }
        const off = hidden.includes(k), what = node.classList && node.classList.contains("context_module") ? "o módulo" : "o item";
        b.className = "cp-eye" + (off ? " off" : ""); b.title = (off ? "Mostrar " : "Esconder ") + what; b.setAttribute("aria-label", b.title);
      }
      edit.textContent = editing ? "Pronto" : "Editar módulos" + (hidden.length ? " (" + hidden.length + " escondido" + (hidden.length > 1 ? "s" : "") + ")" : "");
      hint.textContent = editing ? "Clique no olho para esconder um módulo inteiro ou um item." : "";
    };
    edit.addEventListener("click", () => { editing = !editing; paint(); });
    // on the line of Canvas's "Recolher tudo / Exportar" bar (.header-bar, a flex row) when there is one, else above the modules
    const hb = root.parentNode.querySelector ? root.parentNode.querySelector(".header-bar") : null;
    bar.append(edit, hint);
    if (hb) { bar.style.margin = "0 auto 0 0"; hb.prepend(bar); } else root.parentNode.insertBefore(bar, root);
    paint();
  }

  // /calendar: the Caderno+ semester calendar in place of Canvas's (a month at a time, every month of the term): Canvas
  // deadlines (the planner, read a month at a time when outside the last reading), our exams and the student's own tasks.
  // "Calendário do Canvas" brings the original back (prefs.nativeCal).
  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  function calendarPage(a, cache, prefs, marks) {
    const box = panelHost("cp-cal");
    if (!box) return;
    if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add("cp-has-cal");
    const months = [], first = C.TERM_END.slice(0, 4) === today().slice(0, 4) ? today().slice(0, 4) : String(Number(C.TERM_END.slice(0, 4)) - 1);
    for (let d = new Date(Number(first), 7, 1); C.localISO(d) <= C.TERM_END; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(C.localISO(d).slice(0, 7));
    let cur = months.includes(today().slice(0, 7)) ? today().slice(0, 7) : months[0];
    { const home = cur, hostEl = document.getElementById("cp-cal"); if (hostEl) hostEl.cpBusy = () => cur !== home; }   // a new reading redraws the calendar, but not under a student looking at another month
    const extra = {}; let base = agenda(a, cache, marks).concat(programa(a, cache, marks));   // the planner and every course program
    const ruleItems = (a.rules ? a.mine : []).flatMap(c => c.items.filter(it => it.date).map(it => ({ key: "qf:" + C.key(c, it), title: it.name, course: C.SHORT[c.id] || c.name, date: it.date, exam: it.exam, task: !it.exam, url: courseOf[c.id] ? location.origin + "/courses/" + courseOf[c.id] : null, rule: true })));
    const hd = el("div", "hd"); hd.append(mark(), wordmark());
    const nav = el("span", "calnav"), prev = el("button", null, "‹"), next = el("button", null, "›"), now = el("button", null, "Hoje"), title = el("b", "calt");
    prev.type = next.type = now.type = "button"; prev.setAttribute("aria-label", "Mês anterior"); next.setAttribute("aria-label", "Próximo mês");
    nav.append(prev, title, next, now); hd.appendChild(nav);
    const natB = el("button", "find natv", prefs.nativeCal ? "Só o do Caderno+" : "Calendário do Canvas"); natB.type = "button";
    natB.addEventListener("click", async () => { const { prefs: sp } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, sp, { nativeCal: !prefs.nativeCal }) }); prefs = cpPrefs(Object.assign({}, prefs, { nativeCal: !prefs.nativeCal })); natB.textContent = prefs.nativeCal ? "Só o do Caderno+" : "Calendário do Canvas"; setTimeout(() => window.dispatchEvent && window.dispatchEvent(new Event("resize")), 60); });   // Canvas's calendar measures itself when shown
    hd.appendChild(natB);
    const grid = el("div", "card cal"), legend = el("div", "muted src", "O programa de cada matéria (as atividades e os eventos do Canvas), as provas do Plano de Ensino e as suas tarefas · clique para abrir");
    box.append(hd, grid, legend);
    const itemsOf = ym => {
      const seen = new Set(), out = [];
      for (const x of base.concat(extra[ym] || [], ruleItems)) {
        if (!x.date || x.date.slice(0, 7) !== ym) continue;
        const k = (x.rule ? x.course + x.date : x.key);
        if (x.rule && base.some(y => y.exam && y.date === x.date && y.ours && (C.SHORT[y.ours.id] || "") === x.course)) continue;
        // a Plano item that the program already has on that day ("RA2 · AS 07 (grupo)" and Canvas's "AS 07"): once
        if (x.rule) { const n = fold(String(x.title).replace(/^RA\d+\s*·\s*/, "").replace(/\(.*?\)/g, "")).trim();
          if (n && base.some(y => !y.rule && y.date === x.date && ((y.ours && (C.SHORT[y.ours.id] || "") === x.course) || y.course === x.course) && (fold(y.title).includes(n) || n.includes(fold(y.title).trim())))) continue; }
        if (seen.has(k)) continue; seen.add(k); out.push(x);
      }
      return out.sort((p, q) => (p.due || p.date).localeCompare(q.due || q.date));
    };
    const draw = () => {
      const [y, m] = cur.split("-").map(Number), start = new Date(y, m - 1, 1), pad = start.getDay(), days = new Date(y, m, 0).getDate(), items = itemsOf(cur);
      title.textContent = MONTHS[m - 1] + " " + y; prev.disabled = cur === months[0]; next.disabled = cur === months[months.length - 1];
      grid.replaceChildren();
      for (const w of WD) grid.appendChild(el("span", "cwd", w));
      for (let i = 0; i < pad; i++) grid.appendChild(el("span", "cday off"));
      for (let d = 1; d <= days; d++) {
        const iso = cur + "-" + String(d).padStart(2, "0"), cell = el("div", "cday" + (iso === today() ? " today" : "") + (new Date(iso + "T12:00:00").getDay() % 6 === 0 ? " we" : ""));
        cell.appendChild(el("span", "cn", String(d)));
        const its = items.filter(x => x.date === iso);
        for (const x of its.slice(0, 3)) {
          const c = el(x.url ? "a" : "span", "ev " + (fin(x) ? "ok dn" : x.exam ? "ex" : x.own ? "in" : x.late ? "bd" : "wa"));
          if (x.url) c.href = x.url;
          c.title = (x.exam && !/prova/i.test(x.title) ? "Prova: " : "") + x.title + " · " + x.course + (x.due ? " · " + hhmm(x.due) : "");
          c.appendChild(el("span", "t", (x.exam && !/prova/i.test(x.title) ? "Prova: " : "") + x.title)); cell.appendChild(c);
        }
        if (its.length > 3) { const more = el("span", "ev more", "+" + (its.length - 3)); more.title = its.slice(3).map(x => x.title).join("\n"); cell.appendChild(more); }
        grid.appendChild(cell);
      }
      for (let i = (pad + days) % 7; i && i < 7; i++) grid.appendChild(el("span", "cday off"));   // the rest of the last week
    };
    const load = async ym => {   // a month outside the last reading: its planner items, read once
      if (extra[ym] || (base.some(x => x.date && x.date.slice(0, 7) === ym) && ym === today().slice(0, 7))) return;
      const [y, m] = ym.split("-").map(Number), last = new Date(y, m, 0).getDate();
      try {
        const got = await getAll("/api/v1/planner/items?start_date=" + ym + "-01&end_date=" + ym + "-" + String(last).padStart(2, "0") + "&per_page=100");
        extra[ym] = agenda(a, Object.assign({}, cache, { planner: got }), marks).filter(x => !x.exam);
      } catch (e) { extra[ym] = []; }
      if (ym === cur) draw();
    };
    prev.addEventListener("click", () => { const i = months.indexOf(cur); if (i > 0) { cur = months[i - 1]; draw(); load(cur); } });
    next.addEventListener("click", () => { const i = months.indexOf(cur); if (i < months.length - 1) { cur = months[i + 1]; draw(); load(cur); } });
    now.addEventListener("click", () => { cur = months.includes(today().slice(0, 7)) ? today().slice(0, 7) : cur; draw(); });
    draw(); load(cur);
    loadProgEvents(cache).then(() => { base = agenda(a, cache, marks).concat(programa(a, cache, marks)); draw(); }, () => {});   // the courses' calendar events, when they arrive
  }

  // Canvas login and logout pages (the content script runs on every pucpr.instructure.com page): the next student may be
  // someone else, so the user and the last reading are forgotten.
  const SIGN = /^\/(login|logout)(\/|$)|^\/users\/sign_out(\/|$)/;
  const signedOut = () => forget();   // the calculator page reads the cache too: nothing of the previous student may stay

  // ↑ and ↓ on long pages (more than 2.5 screens): to the top or the end in one click.
  function scrollButtons() {
    const de = document.documentElement;
    if (document.getElementById("cp-scroll") || !de || typeof window.innerHeight !== "number" || !window.scrollTo) return;
    const host = el("div", "cp-host"); host.id = "cp-scroll";
    host.style.cssText = "position:fixed;right:18px;bottom:76px;z-index:9998;margin:0;display:none";
    const root = shadow(host), style = el("style");
    style.textContent = `button { display:block; width:34px; height:34px; margin-top:6px; border-radius:50%; border:1px solid #ECE4D3; background:#FBF7EF; color:#1D2433; font:600 15px/1 -apple-system,BlinkMacSystemFont,sans-serif;
      cursor:pointer; box-shadow:0 6px 16px -8px rgba(29,36,51,.5); opacity:.85; } button:hover { opacity:1; } button:focus-visible { outline:2px solid #E2482B; outline-offset:2px; }`;
    const go = (txt, label, top) => { const b = el("button", null, txt); b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
      b.addEventListener("click", () => window.scrollTo({ top: top(), behavior: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })); return b; };
    root.append(style, go("↑", "Voltar ao topo", () => 0), go("↓", "Ir para o fim", () => de.scrollHeight));
    let busy = false;
    const check = () => { busy = false; host.style.display = de.scrollHeight > window.innerHeight * 2.5 ? "block" : "none"; };
    window.addEventListener("scroll", () => { if (!busy) { busy = true; setTimeout(check, 200); } }, { passive: true });
    document.body.appendChild(host); check();
  }

  // Errors are never silent: the last one is kept (what failed and the message, no data) for the popup and for a bug report,
  // and a dashboard with nothing to show says why and that it tries again.
  function oops(where, e) {
    const msg = e && e.name === "SyntaxError" ? "resposta inválida do Canvas" : String(e && e.message || e).replace(/[^\p{L}\p{N} .,:()/-]/gu, "").slice(0, 120);   // never a piece of an answer
    try { console.warn("Caderno+: erro ao " + where + ":", e); } catch (x) { /* no console */ }
    try { chrome.storage.local.set({ lastError: { at: Date.now(), where, msg, v: VERSION, page: location.pathname.replace(/\d+/g, ":id").slice(0, 60) } }).catch(() => {}); } catch (x) { /* the extension was updated under this tab */ }
  }
  function troubleBanner(e) {
    if (!/^\/(dashboard)?\/?$/.test(location.pathname)) return;
    const box = panelHost("cp-dash"); if (!box) return;
    const card = el("section", "card trouble"), msg = String(e && e.message || "erro desconhecido");
    card.append(el("h3", null, "Caderno+ não conseguiu ler o Canvas agora"), el("p", "c", msg + ". Tenta de novo sozinho quando você recarregar a página; o botão Atualizar da extensão força uma leitura nova."));
    box.appendChild(card);
  }
  async function run() {
    if (SIGN.test(location.pathname)) { await signedOut(); return; }
    const first = await chrome.storage.local.get(["prefs", "cache", "refreshing"]); let prefs = cpPrefs(first.prefs); labsOn = !!prefs.labs;
    if (prefs.scroll) scrollButtons();
    let cache;
    let queue = Promise.resolve();   // one drawing at a time, in order: the newer reading never loses to the older one
    livePrefs = prefs;   // the panel changes the mode and the meta: a later redraw (a new reading, the Centro de Notas) uses those, not the ones of the page load
    const paintAll = (c, again) => (queue = queue.then(() => draw(c, livePrefs, again)).catch(e => oops("desenhar o painel", e)));
    try { cache = await load(fresh => { if (fresh.at === cache.at) return;
      const same = JSON.stringify([fresh.data, fresh.planner, fresh.inbox]) === JSON.stringify([cache.data, cache.planner, cache.inbox]);   // ~1 ms for a term
      cache = fresh; if (same) { for (const id of ["cp-dash"]) { const h = document.getElementById(id), r = h && h.cpRoot, rd = r && r.querySelector && r.querySelector(".read"); if (rd) rd.textContent = "Lido do Canvas hoje às " + hhmm(new Date(fresh.at).toISOString()) + " · o botão Atualizar da extensão lê de novo"; } return; }
      paintAll(fresh, true); }, first); }
    catch (e) { oops("ler o Canvas", e); if (!/ 401$/.test(String(e && e.message))) troubleBanner(e); return; }   // logged out: quiet (Canvas asks to log in)
    if (ownerSwapped) { prefs = cpPrefs((await chrome.storage.local.get("prefs")).prefs); livePrefs = prefs; }   // another student: their turma, not the previous one's
    window.cpRepaint = () => paintAll(cache, true);   // the latest reading drawn again (the Centro de Notas landed)
    await paintAll(cache, false);
    const cp = /^\/courses\/(\d+)(\/(modules|files|assignments|grades|announcements))?\/?$/.exec(location.pathname);
    if (cp && Date.now() - cache.at > 60000) freshCourse(cp[1]).then(c => { if (c) { cache = c; paintAll(c, true); } }, () => {});   // this course's activities read again
  }
  // Everything drawn from one reading; again: a newer reading replaces what the older one drew.
  let cardWatch = null, livePrefs = null;
  async function draw(cache, prefs, again) {
    T = Math.min(10, Math.max(5, Number(String(prefs.meta).replace(",", ".")) || 7)); TURMA_PREF = prefs.turma || null; KPI_COURSE = typeof prefs.kpiCourse === "string" ? prefs.kpiCourse : "";
    const [hand, marks] = await Promise.all([myHand(cache.user), myMarks(cache.user), loadTasks(cache.user), loadChanges(cache.user), loadChecks(cache.user), loadCentro(cache.user), loadGrades(cache.user), loadRules(cache.user)]);   // side by side, not one after another
    let a = analyse(cache, hand);
    let keepCourse = false;   // a course panel in use (simulating, or a note typed in the last 30 s) is not swapped under the student
    if (again) for (const id of ["cp-dash", "qf-panel", "cp-cal"]) { const old = document.getElementById(id); if (!old) continue; if (old.cpBusy && old.cpBusy()) keepCourse = true; else old.remove(); }
    sendNext(a, cache);
    sendReminders(agenda(a, cache, marks), prefs, cache);
    if (prefs.search) window.cpSearch = () => openSearch(a, cache);   // opens the latest reading
    // one listener per page (the bookmarklet can run again): Ctrl+K the search; Alt+N the course's Anotações tab, or the
    // dashboard's column
    if (!window.cpKeys) { window.cpKeys = 1; addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) { if (window.cpSearch) { e.preventDefault(); e.stopPropagation(); window.cpSearch(); } return; }
      if (!EXT || !e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyN") return;
      let tg = e.composedPath ? e.composedPath()[0] : e.target;
      if (tg && tg.cpRoot && tg.cpRoot.activeElement) tg = tg.cpRoot.activeElement;   // a field inside one of our closed panels
      if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || "") || tg.isContentEditable)) return;   // typing (Option+N is the tilde on a Mac): never ours
      const cp = document.getElementById("qf-panel");
      if (cp && cp.cpOpenNotes) { e.preventDefault(); cp.cpOpenNotes(); }
      else if (notesCache && /^\/(dashboard)?\/?$/.test(location.pathname)) { e.preventDefault(); toggleNotes(); }
    }, true); }
    if (/^\/calendar\/?$/.test(location.pathname) && prefs.calendar) calendarPage(a, cache, prefs, marks);
    { // trays (every page) and the course list use the courses taken off the dashboard
      const { hidden } = await chrome.storage.local.get("hidden");
      let off = Array.isArray(hidden) ? hidden.map(String) : [];
      const getOff = () => off, setOff = async list => { off = list.map(String); await chrome.storage.local.set({ hidden: off }); };
      trayCache = cache; watchTray(a, getOff);
      if (/^\/courses\/?$/.test(location.pathname)) coursesPage(a, getOff, setOff);
    }
    const anyCourse = /^\/courses\/(\d+)(\/|$)/.exec(location.pathname);
    if (anyCourse) { courseNav(anyCourse[1]); courseModules(anyCourse[1]); }
    if (anyCourse && /\/(assignments|pages|discussion_topics|announcements)\/[^/]+\/?$/.test(location.pathname)) { copyButton(); setTimeout(copyButton, 1500); setTimeout(copyButton, 4000); }   // the text may render late (React pages)
    const m = /^\/courses\/(\d+)(\/(modules|files|assignments|grades|announcements))?\/?$/.exec(location.pathname);
    if (m && !keepCourse) coursePanel(m[1], a, cache, prefs);
    if (location.pathname === "/" || location.pathname === "/dashboard") {
      const { recent, fold } = await chrome.storage.local.get(["recent", "fold"]);
      folds = fold && typeof fold === "object" ? fold : {};
      const onMode = async (k, meta, native) => {   // switch from the panel (mode, meta, native dashboard, or a change of tasks): saved, redrawn at once
        if (meta != null) T = meta;
        const { prefs: saved } = await chrome.storage.local.get("prefs"), was = cpPrefs(saved);
        if (was.mode !== k || (meta != null && Number(was.meta) !== meta) || (native != null && was.native !== native)) {
          const next = Object.assign({}, saved, { mode: k }, meta != null ? { meta: String(meta) } : {}, native != null ? { native } : {}); await chrome.storage.local.set({ prefs: next }); prefs = cpPrefs(next); livePrefs = prefs;
        }
        if (meta != null) { a = analyse(cache, await myHand(cache.user)); if (window.cpCards) window.cpCards(a); gradeA = a; for (const b of (document.querySelectorAll ? document.querySelectorAll("[data-cp-grade]") : [])) b.remove(); enhanceGradeCards(); }
        const [m2] = await Promise.all([myMarks(cache.user), loadTasks(cache.user), loadChanges(cache.user), loadChecks(cache.user)]);
        const old = document.getElementById("cp-dash"); if (old) old.remove();
        dashPanel(a, cache, prefs, m2, recent && typeof recent === "object" ? recent[cache.user] : null, onMode); placeDash();
        sendReminders(agenda(a, cache, m2), prefs, cache);
      };
      window.cpRedraw = () => onMode(prefs.mode);
      // the popup changes the mode, the meta or the native dashboard: the panel follows at once (one listener per page)
      window.cpPrefsChanged = async next => {
        const p2 = cpPrefs(next); setLabs(p2.labs);   // Labs on or off: at once, every panel
        if (!!p2.cardsFirst !== cardsFirst) { cardsFirst = !!p2.cardsFirst; placeDash(); }
        // the switches in the popup that shape the panel: redrawn at once, not only on the next page
        const PANEL = ["mode", "meta", "native", "grades", "week", "news", "tasks", "changes", "inbox", "newgrades", "dash", "cardPct", "remind"];   // cardImg is theme CSS only
        if (PANEL.every(k => p2[k] === prefs[k])) return;
        const metaN = Math.min(10, Math.max(5, Number(String(p2.meta).replace(",", ".")) || 7));
        prefs = p2; livePrefs = p2; T = metaN; try { ctx.prefs = p2; } catch (e) { /* before the cards were first drawn */ } a = analyse(cache, await myHand(cache.user)); gradeA = a; if (window.cpCards) window.cpCards(a);
        onMode(p2.mode);
      };
      window.cpHiddenChanged = list => { ctx.hidden = (Array.isArray(list) ? list : []).map(String); decorateCards(a, true, ctx); hideGradeCards(ctx.hidden); };   // unticked in the popup: off at once
      if (!window.cpPrefsListen && chrome.storage.onChanged) { window.cpPrefsListen = 1; chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== "local") return;
        if (ch.prefs && window.cpPrefsChanged) window.cpPrefsChanged(ch.prefs.newValue);
        if (ch.hidden && window.cpHiddenChanged) window.cpHiddenChanged(ch.hidden.newValue);
      }); }
      if (prefs.changes) whatChanged(cache).then(got => { const h = document.getElementById("cp-dash"); if (got && !(h && document.activeElement === h)) onMode(prefs.mode); }, () => {});   // in the background, never while the student types in the panel
      const { hidden } = await chrome.storage.local.get("hidden");
      const ctx = { prefs, cache, hidden: Array.isArray(hidden) ? hidden.map(String) : [] }; hiddenNow = ctx.hidden;
      dashPanel(a, cache, prefs, marks, recent && typeof recent === "object" ? recent[cache.user] : null, onMode);
      cardsFirst = !!prefs.cardsFirst; gradeA = a; watchDash(); placeDash(); enhanceGradeCards();
      decorateCards(a, again, ctx); hideGradeCards(ctx.hidden); greet(agenda(a, cache, marks));
      // again when Canvas's header renders late (the page watcher calls it): a few tries, and nothing once the greeting is there
      let greetTries = 0;
      window.cpGreet = () => { if (++greetTries > 12 || (document.querySelector && document.querySelector(".cp-greet"))) { window.cpGreet = null; return; } greet(agenda(a, cache, marks)); };
      window.cpCards = a2 => decorateCards(a2, true, ctx);   // a new meta repaints the card pills
      if (!window.cpCentroWatch) { window.cpCentroWatch = 1; watchStore(ch => { if (ch.centroOff && !ch.centroOff.newValue) { centroOff = false; for (const h of ["cp-dash", "qf-panel"]) { const x = document.getElementById(h), r = x && x.cpRoot; for (const o of r && r.querySelectorAll ? r.querySelectorAll(".centro-ask") : []) o.remove(); } }   // allowed: the offer goes at once
        if ((ch.myGrades || ch.hand) && !document.getElementById("qf-panel") && window.cpRepaint) window.cpRepaint();   // grades entered in another tab ("Minhas notas"): this dashboard redrawn with them
        if (ch.centro) loadCentro(cache.user).then(() => { if (window.cpRepaint) window.cpRepaint(); const a2 = analyse(cache, gradeA && gradeA.hand); if (window.cpCards) window.cpCards(a2); if (trayA) { trayA = a2; enhanceTray(trayA, trayHidden); } }); }); }   // both: the cards were drawn before the Centro landed   // the Centro de Notas landed: the panel and the cards again
      // the cards render late (React): watch the page for 20 seconds, then stop
      if (cardWatch) cardWatch.disconnect();
      let t = 0;
      const watch = cardWatch = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { decorateCards(a, false, ctx); greet(agenda(a, cache, marks)); }, 250); });
      watch.observe(document.getElementById("DashboardCard_Container") || document.getElementById("content") || document.body, { childList: true, subtree: true });   // the cards, not the whole page
      setTimeout(() => watch.disconnect(), 20000);
    }
  }
  run();
})();
