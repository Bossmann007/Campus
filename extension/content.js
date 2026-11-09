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
  let TURMA_PREF = null;   // prefs.turma: the turma the student confirmed, "outro" for another program, null when not asked yet
  const fmt = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const up = (n, d) => fmt(Math.ceil(n * 10 ** d - 1e-9) / 10 ** d, d);   // round up: never shows less than needed
  const dmy = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const today = () => C.localISO(new Date());
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const dayLabel = iso => { const d = days(iso); return d === 0 ? "hoje" : d === 1 ? "amanhã" : d === -1 ? "ontem" : WD[new Date(iso + "T12:00:00").getDay()] + " " + dmy(iso); };
  const hhmm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const addDays = n => C.localISO(new Date(Date.now() + n * 864e5));
  const days = iso => Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 864e5);

  async function getAll(url, pages = Infinity) {   // pages: stop after that many (the inbox reads only the first)
    const out = [];
    while (url && pages-- > 0) {
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
    return id;
  }
  // Forgetting a student also drops what the service worker holds for them: reminders, the week list, the exam on the icon.
  const forget = async () => {
    await chrome.storage.local.remove(["cache", "search", "teachers", "ccolors"]);
    chrome.runtime.sendMessage({ type: "remind", items: [], alarms: false }).catch(() => {});
    chrome.runtime.sendMessage({ type: "next", date: null, label: "" }).catch(() => {});
  };
  // Canvas export + course ids, cached for 10 minutes so moving between pages does not re-read everything. One tab reads at a
  // time: while another tab is reading (lock under a minute old), this one uses the last reading. An older reading of the same
  // user is shown at once and the new one is handed to onFresh when it lands (the page does not wait for Canvas).
  async function load(onFresh, pre) {   // pre: { cache, refreshing } read with the prefs (the reading, often large, is read once)
    const got = pre || await chrome.storage.local.get(["cache", "refreshing"]), user = await whoAmI(got.cache);
    const cache = got.cache && got.cache.user === user ? got.cache : null, refreshing = got.refreshing;
    const mine = cache && cache.v === VERSION && cache.user === user;
    if (mine && Date.now() - cache.at < TTL) return cache;
    if (mine && refreshing && Date.now() - refreshing < LOCK) return cache;
    if (mine && onFresh) { refresh(user).then(onFresh, () => {}); return cache; }
    return refresh(user);
  }
  async function refresh(user) {
    await chrome.storage.local.set({ refreshing: Date.now() });
    try {
      const inbox = getAll("/api/v1/conversations?scope=unread&per_page=5", 1).then(list => list.slice(0, 5).map(m => ({ subject: String(m.subject || "(sem assunto)").slice(0, 140),
        from: (Array.isArray(m.participants) ? m.participants : []).filter(x => x && x.name && x.id !== user).map(x => x.name).slice(0, 2).join(", ").slice(0, 80), at: m.last_message_at || null })), () => null);   // unread messages (subject and who), read alongside
      const plan = getAll("/api/v1/planner/items?start_date=" + addDays(-7) + "&end_date=" + addDays(15) + "&per_page=100").catch(() => null);   // the week and the reminders, read alongside the grades
      const got = {}, data = await collectCanvasGrades(got);
      if (data.error) { if (/ 401$/.test(data.error)) await forget(); throw new Error(data.error); }
      const ids = (got.courses || []).map(c => ({ id: c.id, name: c.name }));
      const planner = await plan;
      await newGrades(user, data);
      const fresh = { v: VERSION, user, at: Date.now(), data, ids, planner: Array.isArray(planner) ? planner : null, inbox: await inbox };
      await chrome.storage.local.set({ cache: fresh });
      return fresh;
    } finally { await chrome.storage.local.remove("refreshing"); }
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
  async function newGrades(user, data) {
    const { cache: old, recent, prefs } = await chrome.storage.local.get(["cache", "recent", "prefs"]);
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
  async function loadTasks(user) { const { tasks } = await chrome.storage.local.get("tasks"); const l = tasks && typeof tasks === "object" ? tasks[user] : null; myTasks = Array.isArray(l) ? l.filter(t => t && t.id && t.title) : []; return myTasks; }
  async function saveTasks(user, list) {
    const { tasks } = await chrome.storage.local.get("tasks"), all = tasks && typeof tasks === "object" ? tasks : {};
    myTasks = list.slice(0, 100); await chrome.storage.local.set({ tasks: Object.assign({}, all, { [user]: myTasks }) });
  }
  const addTask = (user, title, date) => saveTasks(user, myTasks.concat([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(title).trim().slice(0, 140), date: date || null }]));
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
    for (const c of cache.data.courses) {
      if (!hourOld) { now.files[c.id] = old.files[c.id]; now.mods[c.id] = old.mods[c.id]; continue; }
      try { now.files[c.id] = (await getAll("/api/v1/courses/" + c.id + "/files?sort=created_at&order=desc&per_page=15", 1)).map(f => [f.id, String(f.display_name || "arquivo").slice(0, 120)]); } catch (e) { now.files[c.id] = old && old.files[c.id]; }
      try { now.mods[c.id] = (await getAll("/api/v1/courses/" + c.id + "/modules?per_page=50", 1)).map(m => [m.id, String(m.name || "módulo").slice(0, 120)]); } catch (e) { now.mods[c.id] = old && old.mods[c.id]; }
    }
    await chrome.storage.local.set({ snap: Object.assign({}, snap, { [user]: now }) });
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
    const canvas = C.fromCanvas(cache.data).grades, grades = Object.assign({}, hand || {}, canvas), t = today(), byCanvasId = {};
    for (const x of cache.ids) { const c = C.subjectOf(x, true); if (c) { byCanvasId[x.id] = c; courseOf[c.id] = String(x.id); } }
    // Our rules are for one turma. Canvas courses shared with other programs (Ética, for example) carry the same course id, so
    // a match alone is not proof: the student confirms the turma (onboarding or the question on the dashboard). Without an
    // answer, three or more matching courses count as the turma; fewer ask first.
    const matched = C.COURSES.filter(c => courseOf[c.id]), turma = matched.length ? C.turmaOf(matched[0]) : null;
    const confirmed = !!TURMA_PREF && matched.some(c => C.turmaOf(c) === TURMA_PREF), other = TURMA_PREF === "outro" || (!!TURMA_PREF && !confirmed);
    const askTurma = matched.length > 0 && !confirmed && !other && matched.length < 3;
    const mine = confirmed ? matched.filter(c => C.turmaOf(c) === TURMA_PREF) : !other && !askTurma ? matched : [], expired = C.expired(t), rules = mine.length > 0 && !expired;
    const state = c => C.courseState(c, grades, t, T);
    const label = st => ({ garantido: "garantido", "nao-da": "recuperação", "depende-atrasadas": "faltam notas" }[st.status] || "precisa " + up(st.fraction * 10, 1) + "/10");
    const upcoming = rules ? C.upcoming(mine, grades, t, T) : [];
    const has = rules && Object.keys(grades).length > 0;   // no matched course, term over or no grade read: no grade parts
    return { askTurma, turma, grades, canvas, hand: hand || {}, byCanvasId: rules ? byCanvasId : {}, mine, state, label, tone: C.statusTone, upcoming, has, rules, expired, term: cache.data.courses.length > 0 };
  }

  // The icon number: days to the next exam that still matters.
  function sendNext(a) {
    const u = a.upcoming.find(x => x.item.exam && x.st.status !== "garantido");
    chrome.runtime.sendMessage({ type: "next", date: u ? u.item.date : null, label: u ? u.item.name : "" }).catch(() => {});
  }

  // Deadlines from the Canvas planner (every course) plus our exams that are not in Canvas, from today on. marks: what the
  // student ticked as done here (never written to Canvas); done is what Canvas says (handed in, graded).
  const shortName = name => String(name || "").split(" (")[0].split(" - ")[0];
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
      .map(x => ({ key: x.key, title: (x.exam ? "Prova: " : "Entrega: ") + x.title, course: x.course, due: x.due, date: x.date, url: x.url })) : [];
    chrome.runtime.sendMessage({ type: "remind", items, alarms: prefs.remind }).catch(() => {});   // the Monday summary reads the list too
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
  function decorateCards(a, again, ctx) {
    const prefs = ctx.prefs;
    if (again) for (const card of document.querySelectorAll(".ic-DashboardCard[data-qf]")) { for (const x of card.cpAdded || []) x.remove(); delete card.dataset.qf; }
    for (const card of document.querySelectorAll(".ic-DashboardCard:not([data-qf])")) {
      const link = card.querySelector('a[href*="/courses/"]'), m = link && /\/courses\/(\d+)/.exec(link.getAttribute("href"));
      card.dataset.qf = "1"; card.cpAdded = [];
      if (!m) continue;
      const id = m[1], c = a.byCanvasId[id];
      card.style.display = ctx.hidden.includes(id) ? "none" : "";
      if (ctx.hidden.includes(id) || !c || !prefs.grades || !a.rules) continue;
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
    const shown = [...document.querySelectorAll(".ic-DashboardCard")].filter(c => c.style.display !== "none").length, root = document.documentElement;
    const box = document.getElementById("DashboardCard_Container"), fit = box && box.clientWidth ? Math.max(1, Math.floor((box.clientWidth + 24) / 298)) : 4;
    const rows = shown ? Math.ceil(shown / Math.min(colsFor(shown), fit)) : 1, cols = shown ? Math.ceil(shown / rows) : 1;   // never one card alone on the last row
    if (root && root.style && root.style.setProperty && shown) root.style.setProperty("--cp-cols", String(cols));
    if (!window.cpColsResize && typeof window.addEventListener === "function") { window.cpColsResize = 1; let t = 0; window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => window.cpCards && window.cpCards(gradeA), 200); }); }
  }


  const CSS = `
    :host { all: initial; display:block; margin:0 0 18px; --fg:var(--cp-ink,#1D2433); --muted:var(--cp-muted,#5F6675); --line:var(--cp-line,#ECE4D3); --bg:var(--cp-card,#fff); --soft:var(--cp-paper,#FBF7EF);
      --ring:var(--cp-accent,#E2482B); --coral:var(--cp-accent,#E2482B); --tile:var(--cp-ink,#1D2433); --tile-c:var(--cp-paper,#FBF7EF); --band1:color-mix(in srgb, var(--cp-accent,#E2482B) 16%, var(--cp-card,#fff)); --band2:color-mix(in srgb, var(--cp-accent,#E2482B) 6%, var(--cp-card,#fff));
      --paper:var(--cp-paper,#FBF7EF); --track:color-mix(in srgb, var(--cp-line,#ECE4D3) 75%, var(--cp-paper,#FBF7EF)); --ok:#2F7D5B; --warn:#A8650F; --bad:#C2361F; --ok-s:#CFE6D9; --warn-s:#F1DDB8; --bad-s:#F6CFC4; --lift:0 8px 20px -12px rgba(29,36,51,.35);
      --serif:"Iowan Old Style","New York",Georgia,"Times New Roman",serif; --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      font:14px/1.45 var(--sans); color:var(--fg); font-variant-numeric:tabular-nums; }
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
    .muted { color:var(--muted); font-size:12.5px; } .muted.src { margin:-2px 0 10px; font-size:11.5px; } .acts + .muted.src, .items + .muted.src { margin-top:8px; } .muted.why { margin:0 0 10px; }
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
    .late .ev { max-width:240px; } .late .evw { flex:none; }
    .tl { position:relative; margin-top:6px; }
    .heads, .lanes, .rules { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
    .heads .dh { padding:0 6px 6px; font-size:11.5px; font-weight:600; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .heads .we { color:var(--muted); font-weight:500; } .heads .today { color:var(--coral); }
    .rules { position:absolute; left:0; right:0; top:24px; bottom:0; border-top:1px solid var(--line); }
    .rules > span { border-left:1px solid var(--line); } .rules > span:last-of-type { border-right:1px solid var(--line); }
    .rules > span.today { background:color-mix(in srgb, var(--coral) 5%, transparent); }
    .band { position:absolute; top:0; bottom:0; background:var(--band2); border-left:2px solid var(--band1); border-right:2px solid var(--band1); }
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
    .ev.ex { background:var(--coral); color:#fff; } .ev.in { background:var(--bg); color:var(--fg); border-color:var(--line); border-left:3px solid var(--fg); } .ev.bd { background:#FCE4DD; color:#912713; border-color:#F6C3B5; }
    .tip { position:absolute; left:0; bottom:calc(100% + 7px); z-index:5; display:grid; gap:1px; width:max-content; max-width:260px; padding:7px 10px; border-radius:8px;
      background:var(--fg); color:var(--bg); font:500 12px/1.4 var(--sans); white-space:normal; text-align:left; box-shadow:0 10px 24px -10px rgba(29,36,51,.5);
      opacity:0; visibility:hidden; transform:translateY(3px); pointer-events:none; transition:opacity .12s, transform .12s, visibility 0s .12s; }
    .tip b { font-weight:650; } .tip span { opacity:.78; }
    .ev.r .tip { left:auto; right:0; }
    .ev:hover .tip, .ev:focus-visible .tip { opacity:1; visibility:visible; transform:none; transition-delay:0s; }
    .evw { position:relative; min-width:0; }
    .ck { position:absolute; top:-7px; right:-5px; z-index:3; width:20px; height:20px; padding:0; border-radius:50%; font:700 11px/18px var(--sans); text-align:center; color:var(--muted); background:var(--bg); border:1px solid var(--line);
      opacity:0; transition:opacity .12s, background-color .15s, color .15s; }
    .evw:hover .ck, .ck:focus-visible, .ck[aria-pressed="true"], .row .ck { opacity:1; } .ck[aria-pressed="true"] { background:var(--ok); border-color:var(--ok); color:var(--bg); }
    .row .ck { position:static; margin-right:6px; } .mc-i .ck { position:static; opacity:1; } .end { display:flex; align-items:center; } .row.dn .n { color:var(--muted); text-decoration:line-through; }
    .ev.dn { opacity:.55; } .ev.dn .t { text-decoration:line-through; } .ev.dn:hover, .ev.dn:focus-visible { opacity:1; }
    .prog { display:inline-flex; align-items:center; gap:6px; margin-left:auto; font:500 12px/1 var(--sans); color:var(--muted); }
    .prog i { position:relative; width:18px; height:18px; border-radius:50%; } .prog i::after { content:""; position:absolute; inset:4px; border-radius:50%; background:var(--bg); }
    .mini { margin-left:auto; padding:2px 8px; font-size:11.5px; color:var(--muted); } .prog + .mini, .mini + .mini { margin-left:8px; } a.mini { border:1px solid var(--line); border-radius:9px; text-decoration:none; }
    .seg { display:inline-flex; margin-left:12px; padding:2px; border-radius:999px; background:var(--track); }
    .seg button { padding:3px 10px; border:0; border-radius:999px; background:none; font-size:12px; color:var(--muted); } .seg button:hover:not(:disabled) { transform:none; background:var(--bg); }
    .seg button[aria-checked="true"] { background:var(--bg); color:var(--fg); box-shadow:0 1px 2px rgba(29,36,51,.12); }
    .focus .row { padding:7px 0; border-top:1px solid var(--line); } .focus .row:first-child { border-top:0; } .focus .row { grid-template-columns:112px minmax(0,1fr) auto; }
    .natv + .find, .find + .natv { margin-left:8px; } .find { margin-left:auto; padding:4px 10px; font-size:12px; color:var(--muted); } .find + .brand { margin-left:12px; }
    .pal-back { position:fixed; inset:0; background:rgba(29,36,51,.38); }
    .pal { position:fixed; left:50%; top:12vh; width:min(620px, calc(100vw - 32px)); transform:translateX(-50%); background:var(--paper); border:1px solid var(--line); border-radius:14px; box-shadow:0 24px 60px -20px rgba(29,36,51,.55); overflow:hidden; }
    .pal-q { all:unset; box-sizing:border-box; display:block; width:100%; padding:14px 16px; font:500 16px/1.3 var(--sans); color:var(--fg); border-bottom:1px solid var(--line); }
    .pal-r { max-height:min(420px, 60vh); overflow:auto; padding:6px; }
    .pal-i { display:grid; grid-template-columns:76px minmax(0,1fr); gap:10px; align-items:center; padding:7px 10px; border-radius:9px; cursor:pointer; } .pal-i.on { background:var(--bg); box-shadow:inset 0 0 0 1px var(--line); }
    .pal-k { font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--coral); } .pal-e { padding:14px 10px; color:var(--muted); font:italic 14px/1.4 var(--serif); }
    .wnew .nt-i { display:block; padding-left:16px; position:relative; } .wnew .nt-i::before { content:""; position:absolute; left:2px; top:50%; width:6px; height:6px; margin-top:-3px; border-radius:50%; background:var(--coral); }
    .changes .row { grid-template-columns:72px minmax(0,1fr) auto; } .changes .pill.nt { justify-self:start; text-transform:uppercase; font-size:10px; letter-spacing:.05em; }
    .pal-s { padding:8px 16px; border-top:1px solid var(--line); font-size:11.5px; color:var(--muted); }
    .sc { font:600 15px/1.2 var(--serif); white-space:nowrap; } .sc small { font:500 11px var(--sans); color:var(--muted); }
    h3[role=button] { cursor:pointer; user-select:none; } h3[role=button]::before { content:"▾"; font:12px/1 var(--sans); color:var(--muted); transition:transform .15s; }
    .folded > h3[role=button]::before { transform:rotate(-90deg); } .folded > :not(h3) { display:none !important; } .folded > h3 { margin-bottom:0; }
    .simi { all:unset; box-sizing:border-box; width:100%; max-width:180px; padding:4px 8px; border:1px dashed var(--coral); border-radius:7px; background:var(--bg); font:600 13px/1.2 var(--sans); color:var(--fg); }
    .simi::placeholder { font-weight:400; color:var(--muted); } .simi:focus { border-style:solid; } .cring.simulating { border-color:var(--coral); border-style:dashed; }
    .notes { margin-top:10px; padding:10px 12px; } .notes[hidden] { display:none; } .notes textarea { all:unset; box-sizing:border-box; display:block; width:100%; min-height:90px; font:14px/1.5 var(--sans); color:var(--fg); white-space:pre-wrap; }
    .add { display:grid; grid-template-columns:minmax(0,1fr) 140px auto; gap:6px; margin:4px 0 8px; }
    .chk h3 { margin:0 0 6px; } .chk .add { grid-template-columns:minmax(0,1fr) auto; } .chk ul { list-style:none; margin:0; padding:0; } .chk .row { grid-template-columns:minmax(0,1fr) auto; border-top:1px solid var(--line); padding:5px 0; } .chk .row:first-child { border-top:0; }
    .add input { all:unset; box-sizing:border-box; padding:6px 10px; border:1px solid var(--line); border-radius:9px; background:var(--bg); font:13px/1.3 var(--sans); color:var(--fg); }
    .add input:focus { border-color:var(--coral); } .tasks .row { grid-template-columns:76px minmax(0,1fr) auto; } .ck.del { margin-left:2px; }
    @container cp (max-width:520px) { .add { grid-template-columns:1fr 1fr; } .add button { grid-column:1 / -1; } }
    .meta { display:inline-flex; align-items:center; gap:4px; margin-left:auto; font-size:12px; color:var(--muted); } .meta b { min-width:22px; text-align:center; font:600 14px/1 var(--serif); color:var(--fg); }
    .meta button { width:22px; height:22px; padding:0; border-radius:50%; font-size:13px; line-height:20px; } .keep { display:inline-flex; align-items:center; gap:4px; } .keep[hidden] { display:none; }
    .calnav { display:inline-flex; align-items:center; gap:6px; margin-left:14px; } .calnav button { padding:3px 10px; } .calt { min-width:150px; text-align:center; font:600 16px/1 var(--serif); text-transform:capitalize; }
    .cal { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:1px; padding:0; overflow:hidden; background:var(--line); }
    .cwd { padding:8px 10px; background:var(--soft); font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
    .cday { min-height:118px; padding:6px; background:var(--bg); display:flex; flex-direction:column; gap:4px; min-width:0; } .cday.off { background:var(--soft); } .cday.we { background:color-mix(in srgb, var(--soft) 55%, var(--bg)); }
    .cday .cn { display:inline-grid; place-items:center; height:24px; font:600 13px/1 var(--serif); color:var(--muted); } .cday.today .cn { display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; background:var(--coral); color:#fff; }
    .cday .ev { height:auto; padding:3px 6px; font-size:11px; border-radius:6px; } .cday .ev .t { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cday .ev.more { background:var(--soft); color:var(--fg); border-color:var(--line); justify-content:center; }
    .av { display:inline-grid; place-items:center; flex:none; border-radius:50%; overflow:hidden; background:var(--soft); color:var(--muted); font:600 11px/1 var(--sans); border:1px solid var(--line); }
    .av img { width:100%; height:100%; object-fit:cover; display:block; }
    :host-context(html.cp-dark) :is(img, .band-c) { filter:invert(1) hue-rotate(180deg); }   /* the panel darkens with the page (same inversion); photos and the course color stay true */
    .news .row { grid-template-columns:auto minmax(0,1fr) auto; } .news .row > .d:first-child { min-width:96px; } .d.lt { color:var(--bad); font-weight:600; } .who { position:relative; display:inline-flex; } .who .dot { position:absolute; right:-1px; top:-1px; border:2px solid var(--bg); width:9px; height:9px; }
    .teachers { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
    .teacher { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:10px; align-items:center; padding:8px 10px; border:1px solid var(--line); border-radius:12px; background:var(--bg); }
    .ask-b { margin-left:0 !important; color:var(--coral) !important; border-color:color-mix(in srgb, var(--coral) 40%, var(--line)) !important; font-weight:600; }
    .hero { position:relative; display:flex; align-items:center; gap:14px; margin:0 -14px 12px; padding:16px 14px 14px; border-bottom:1px solid var(--line); border-radius:13px 13px 0 0; overflow:hidden; }   /* the color band follows the box corners */
    .band-c { position:absolute; left:0; right:0; top:0; height:4px; background:var(--coral); } .htxt { flex:1; min-width:0; }
    .ht { display:flex; align-items:center; gap:8px; } .ht b { font:600 21px/1.2 var(--serif); letter-spacing:-.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .hs { margin-top:3px; color:var(--muted); font-size:12.5px; } .hteach { display:flex; align-items:center; gap:10px; flex:none; } .hteach .mid { max-width:180px; }
    .ctabs { display:flex; gap:4px; margin:12px 0 10px; padding:3px; border-radius:12px; background:var(--track); width:fit-content; max-width:100%; overflow-x:auto; }
    .ctabs button { border:0; background:none; padding:6px 14px; border-radius:9px; font-size:13px; color:var(--muted); white-space:nowrap; } .ctabs button:hover:not(:disabled) { transform:none; background:var(--bg); }
    .ctabs button[aria-selected="true"] { background:var(--bg); color:var(--fg); box-shadow:0 1px 2px rgba(29,36,51,.12); }
    .cpane[hidden] { display:none; } .cpane > * + * { margin-top:10px; } .qlinks { display:flex; flex-wrap:wrap; align-items:center; gap:6px; } .qlinks .mini { margin:0; padding:5px 12px; font-size:12.5px; color:var(--fg); }
    .mq { all:unset; box-sizing:border-box; display:block; width:100%; margin:4px 0 10px; padding:7px 10px; border:1px solid var(--line); border-radius:9px; background:var(--bg); font:13px/1.3 var(--sans); color:var(--fg); }
    .mod + .mod { margin-top:10px; } .mh { padding:4px 0; font-size:11.5px; font-weight:650; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
    .mi { display:grid; grid-template-columns:76px minmax(0,1fr); gap:10px; align-items:center; padding:6px 4px; border-top:1px solid var(--line); }
    .mcal { display:grid; grid-template-columns:260px minmax(0,1fr); gap:20px; padding:14px; }
    .mc-h { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; } .mc-h b { font:600 14px/1 var(--serif); text-transform:capitalize; }
    .mc-h button { width:26px; height:26px; padding:0; border-radius:8px; font-size:14px; }
    .mc-g { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; } .mc-w { text-align:center; font-size:10.5px; font-weight:600; color:var(--muted); padding:2px 0 4px; }
    .mc-day { position:relative; display:grid; place-items:center; height:34px; padding:0; border:0; border-radius:8px; background:none; font:500 12.5px/1 var(--sans); color:var(--fg); }
    .mc-day:hover:not(:disabled) { background:var(--soft); transform:none; } .mc-day.has { font-weight:700; } .mc-day.on { background:var(--fg); color:var(--bg); }
    .mc-day.today > span:first-child { display:grid; place-items:center; width:24px; height:24px; border-radius:50%; box-shadow:inset 0 0 0 1.5px var(--coral); }
    .mc-dots { position:absolute; bottom:3px; left:0; right:0; display:flex; justify-content:center; gap:2px; } .mc-dots i, .mc-i > i { width:5px; height:5px; border-radius:50%; background:var(--warn); }
    .mc-dots i.ex, .mc-i.ex > i { background:var(--coral); } .mc-dots i.ok, .mc-i.ok > i { background:var(--ok); }
    .mc-k { display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin:4px 0 8px; }
    .mc-i { display:grid; grid-template-columns:8px 78px minmax(0,1fr) 20px; gap:8px; align-items:center; padding:7px 0; border-top:1px solid var(--line); } .mc-i:first-of-type { border-top:0; }
    .mc-i.ok .n { color:var(--muted); text-decoration:line-through; } .mc-d { font-size:12px; color:var(--muted); white-space:nowrap; } .mc-d.lt { color:var(--bad); font-weight:600; }
    @container cp (max-width:620px) { .mcal { grid-template-columns:minmax(0,1fr); } }
    :host(.cp-headhost) { display:inline-block; margin:0 8px 0 0; vertical-align:middle; }
    .box.head { container-type:normal; border:0; background:none; box-shadow:none; padding:0; }
    .box.head .hd { margin:0; gap:0; height:42px; box-sizing:border-box; padding:4px 4px 4px 12px; border:1px solid var(--line); border-radius:14px; background:var(--bg); box-shadow:0 1px 2px rgba(29,36,51,.06); }
    .box.head .hd b { margin-left:8px; }
    .box.head .seg { margin:0 10px 0 14px; } .box.head .seg button { padding:5px 12px; font-size:12.5px; }
    .box.head .meta { margin:0; padding:0 10px; height:22px; border-left:1px solid var(--line); }
    .box.head .pfold { margin:0; height:32px; padding:0 12px; border:0; border-left:1px solid var(--line); border-radius:0 10px 10px 0; background:none; font-size:12.5px; } .box.head .pfold:hover { background:var(--soft); color:var(--fg); transform:none; }
    .box.nohd { padding-top:14px; }
    .pfold { margin-left:10px; padding:4px 10px; font-size:12px; color:var(--muted); }
    .box.pfolded { padding-bottom:0; } .box.pfolded > :not(.hd) { display:none !important; } .box.pfolded > .hd { margin-bottom:0; border-bottom:0; } .box.pfolded .seg, .box.pfolded .meta { display:none; } .box.pfolded .pfold { margin-left:auto; }
    .wl { display:none; }
    @container cp (max-width:760px) { .tl { display:none; } .wl { display:block; } }
    @media (prefers-reduced-motion:reduce) { button, .ev, .tip, a.card, [data-tip]::after { transition:none; } a.card:hover, a.card:active { transform:none; } button:hover:not(:disabled), button:active:not(:disabled), .ev:hover, .ev:focus-visible, .ev:active { transform:none; } }
    `;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
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
    const root = host.attachShadow({ mode: "open" }), wrap = el("div", "box head");
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
  function panelHost(id) {
    const anchor = document.getElementById("content");
    if (document.getElementById(id) || !anchor) return null;
    const host = el("div", "cp-host"); host.id = id;
    const root = host.attachShadow({ mode: "open" }), box = el("div", "box");
    styleRoot(root); root.append(box); anchor.prepend(host);
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
    st.textContent = hide.length ? hide.join(",") + " { display:none !important; }" : "";
  }
  function watchDash() {
    const root = document.getElementById("content");
    if (!root || dashWatch || typeof MutationObserver === "undefined") return;
    let t = 0;
    const ours = n => n && n.nodeType === 1 && (/^cp-|^qf-/.test(n.id || "") || (n.classList && n.classList.contains("cp-host")));
    dashWatch = new MutationObserver(recs => {   // our own panels moving in and out do not count
      if (recs.every(r => ours(r.target) || [...r.addedNodes, ...r.removedNodes].every(ours))) return;
      clearTimeout(t); t = setTimeout(() => { placeDash(); enhanceGradeCards(); }, 120); });
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

    const wl = el("ul", "wl");   // the narrow fallback: grouped by day
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
  // Big needed grade on 0-10 and its caption, as the calculator's hero card shows it.
  function needBig(st) {
    const nd = C.courseNeed(st), box = el("div", "big");
    const v = st.status === "garantido" ? "✓" : nd.impossible ? "nem com 10" : (nd.approx ? "≈ " : "") + up(nd.of10, 1);
    const cap = st.status === "garantido" ? "garantido" : st.status === "depende-atrasadas" ? "faltam notas antigas" : nd.impossible ? "nem com nota cheia" : "precisa, em 10";
    box.append(el("b", "v t-" + (st.status === "depende-atrasadas" ? "warn" : nd.tone), v), el("span", null, cap));
    if (st.status === "garantido") box.title = C.GARANTIDO_TIP;
    return box;
  }
  function gradesView(a) {
    const t = today(), out = [], list = C.stillCounts(a.mine, a.grades, t, T);
    if (list.length) {
      const u = list[0], d = days(u.item.date), card = toCampus("div", "card upnext", u.course.id), left = el("div", "mid");
      left.append(el("div", "k", "Próxima avaliação que conta"), el("div", "t", u.item.name), el("div", "c", C.SHORT[u.course.id] + " · " + dmy(u.item.date) + ", " + (d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias")));
      card.append(left, needBig(u.st)); out.push(card);
    }
    const sem = C.semester(a.mine, a.grades, t, T), kpis = el("div", "kpis");
    const kpi = (k, v, cls, sub) => { const d = el("div", "card kpi"); d.append(el("div", "k", k), el("div", "v" + (cls ? " " + cls : ""), v)); if (sub) d.appendChild(sub); kpis.appendChild(d); return d; };
    const meter = el("div", "meter"), fill = el("i"), goal = el("b"); meter.setAttribute("aria-hidden", "true");
    fill.style.width = Math.min(100, sem.mean * 10) + "%"; goal.style.left = Math.min(99.5, T * 10) + "%"; meter.append(fill, goal);
    kpi("Garantido até agora", fmt(Math.floor(sem.mean * 10) / 10, 1), null, meter).title = "pontos garantidos de 10, média das " + a.mine.length + " matérias · meta " + fmt(T, 1);
    const cnt = s => sem.counts[s] || 0;
    // the tightest subject, but not the one the "Próxima avaliação" card already shows (no 9,0 twice)
    const heroId = list.length ? list[0].course.id : null, open2 = a.mine.filter(c => c.id !== heroId && sem.states[c.id].status === "precisa").sort((x, y) => sem.states[y.id].fraction - sem.states[x.id].fraction)[0];
    const tight = sem.tight && sem.tight.id !== heroId ? sem.tight : open2 || sem.tight;
    if (tight) kpi(tight === sem.tight ? "Quanto falta" : "Depois dessa", up(sem.states[tight.id].fraction * 10, 1), "need", el("div", "c", C.SHORT[tight.id] + (tight === sem.tight ? ", a mais apertada" : ", a próxima mais apertada")));
    else if (cnt("depende-atrasadas")) kpi("Quanto falta", "?", "need", el("div", "c", "faltam notas antigas"));
    else if (cnt("nao-da")) kpi("Quanto falta", "—", "need", el("div", "c", cnt("nao-da") + (cnt("nao-da") === 1 ? " matéria na recuperação" : " matérias na recuperação")));
    else kpi("Quanto falta", "0", "need t-ok", el("div", "c", "tudo garantido"));
    const trk = el("div", "trk"); trk.setAttribute("aria-label", sem.done + " lançadas, " + sem.late + " sem nota, " + (sem.items.length - sem.done - sem.late) + " pela frente");
    for (const x of sem.items) { const b = el("i", x.s); b.dataset.tip = C.SHORT[x.course.id] + " · " + x.item.name + " · " + dmy(x.item.date) + " · " + (x.s === "ok" ? "lançada" : x.s === "late" ? "sem nota" : "pela frente"); trk.appendChild(b); }
    kpi("Entregues", sem.done + " de " + sem.items.length, null, trk);
    out.push(kpis);
    const tiles = el("div", "tiles");
    for (const c of a.mine) {
      const st = sem.states[c.id], nx = C.nextItem(st), tile = toCampus("div", "card tile", c.id), txt = el("span", "mid");
      txt.append(el("span", "nm", C.SHORT[c.id]), el("span", "c", nx ? "próxima " + dmy(nx.date) : "nada pela frente"), el("span", "pill " + C.statusTone(st), a.label(st)));
      tile.setAttribute("aria-label", c.name + ": " + fmt(st.earned, 2) + " garantidos de 10; " + a.label(st));
      if (st.status === "garantido") tile.title = C.GARANTIDO_TIP;
      tile.append(ring(st), txt); tiles.appendChild(tile);
    }
    out.push(tiles, el("div", "muted src", source(a.mine)));
    return out;
  }

  // The turma(s) whose rule pack gave these numbers (rules/<term>/<turma>.json).
  const source = cs => "Pesos do Plano de Ensino " + TERM + " · " + [...new Set(cs.map(C.turmaOf))].join(" / ") + " · não oficial, confira no Canvas";
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
      del.addEventListener("click", async () => { await saveTasks(cache.user, myTasks.filter(x => x.id !== t.id)); redraw(); });
      end.append(ck, del);
      li.append(el("span", "d", t.date ? cap(dayLabel(t.date)) : "sem dia"), mid(t.title, null, done ? "feita" : t.date && t.date < today() ? "atrasada" : "minha tarefa"), end);
      ul.appendChild(li);
    }
    if (list.length) sec.appendChild(ul); else sec.appendChild(el("div", "muted", "Coisas que não estão no Canvas: estudar, imprimir, levar material. Com dia, entram na semana e nos lembretes."));
    foldable(sec, h, "tasks"); return sec;
  }
  function dashPanel(a, cache, prefs, marks, rec, onMode) {
    const mode = prefs.mode, clean = mode === "limpo";
    const grades = prefs.grades && a.has, why = prefs.grades && noRules(a), week = prefs.week && cache.planner, news = prefs.news && Array.isArray(cache.data.announcements);
    if (!prefs.dash && !a.askTurma) return;   // the student switched the Caderno+ panel off in the popup (the cards keep their grades); the turma question still shows
    if (!grades && !why && !week && !news && !(prefs.newgrades && rec && rec.length) && mode !== "foco") return;
    const box = panelHost("cp-dash");
    if (!box) return;
    if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add("cp-has-panel");   // Foco hides Canvas's cards only when ours are there
    const grid = el("div", "grid");
    const hd = el("div", "hd"); hd.append(mark(), wordmark());
    const seg = el("div", "seg"); seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Modo do painel");
    for (const [k, label] of MODES) {
      const b = el("button", null, label); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(mode === k));
      b.title = { completo: "Tudo do Caderno+", limpo: "Só o que importa, sem a bagunça do Canvas", foco: "Só o que fazer agora" }[k];
      if (onMode) b.addEventListener("click", () => { if (mode !== k) onMode(k); }); seg.appendChild(b);
    }
    hd.appendChild(seg);
    // fold: the panel shrinks to this bar (kept in chrome.storage.local "panelFold") and opens again
    const foldB = el("button", "pfold"); foldB.type = "button";
    const setFold = async (on, save) => { box.classList ? box.classList.toggle("pfolded", on) : (box.className = box.className.replace(/ pfolded/, "") + (on ? " pfolded" : ""));
      if (/nohd/.test(box.className) && box.getRootNode && box.getRootNode().host) box.getRootNode().host.style.display = on ? "none" : "";
      foldB.textContent = on ? "Mostrar ▾" : "Esconder ▴"; foldB.setAttribute("aria-expanded", String(!on)); foldB.title = on ? "Abrir o painel do Caderno+" : "Recolher o painel do Caderno+";
      if (save) await chrome.storage.local.set({ panelFold: on }); };
    foldB.addEventListener("click", () => setFold(!/pfolded/.test(box.className), true));
    chrome.storage.local.get("panelFold").then(({ panelFold }) => setFold(panelFold === true, false));
    // the meta (goal) every number is computed against
    const meta = el("span", "meta"), dn = el("button", null, "−"), upb = el("button", null, "+"), mv = el("b", null, fmt(T, T % 1 ? 1 : 0));
    dn.type = upb.type = "button"; dn.setAttribute("aria-label", "Meta menor"); upb.setAttribute("aria-label", "Meta maior"); meta.title = "A nota que você quer em cada matéria";
    const step = d => { if (onMode) onMode(mode, Math.min(10, Math.max(5, T + d))); };   // onMode sets T before any wait, so quick clicks add up
    dn.addEventListener("click", () => step(-0.5)); upb.addEventListener("click", () => step(0.5));
    meta.append(el("span", null, "Meta"), dn, mv, upb); hd.append(meta, foldB);
    // on the classic dashboard the bar sits in Canvas's header, next to the greeting, where "Alternar para a nova
    // visualização" was; folding then hides the whole panel. Elsewhere (widget dashboard) it stays on top of the panel.
    if (!headBar(hd)) box.append(hd); else box.classList.add("nohd");
    if (a.askTurma) {   // a shared course matched: ask before using another turma's weights
      const q = el("section", "card news ask-turma"), yes = el("button", "primary", "Sim, sou dessa turma"), no = el("button", null, "Não, sou de outro curso");
      q.append(el("h3", null, "Você é da turma " + a.turma + "?"), el("div", "muted", "O Caderno+ tem os pesos do Plano de Ensino dessa turma. Se você é de outro curso, ele mostra a semana, os avisos e os arquivos, sem calcular notas."));
      const acts = el("div", "acts"); acts.append(yes, no); q.appendChild(acts); box.appendChild(q);
      const answer = async v => { const { prefs: sp } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, sp, { turma: v }) }); location.reload(); };
      yes.type = no.type = "button"; yes.addEventListener("click", () => answer(a.turma)); no.addEventListener("click", () => answer("outro"));
    }
    if (!prefs.dash) return;   // panel switched off: only the turma question
    if (mode === "foco") { box.appendChild(focusView(agenda(a, cache, marks))); return; }
    // Canvas's course cards (either dashboard) carry our numbers: no subject tiles of ours next to them
    if (grades) { const inside = prefs.native, g = gradesView(a); box.append(...g.filter(x => !(clean && /kpis|src/.test(x.className)) && !(inside && /tiles/.test(x.className)))); }
    else if (why) box.append(el("div", "muted why", why));
    box.appendChild(grid);
    if (week) {
      let sec = null;
      const draw = () => { const nx = weekView(agenda(a, cache, marks), prefs, mark); if (sec) { grid.insertBefore(nx, sec); sec.remove(); } else grid.appendChild(nx); sec = nx; };
      const mark = async (x, on) => { marks = await setMark(cache.user, x, on); draw(); sendReminders(agenda(a, cache, marks), prefs, cache); };
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
    if (!c && !prefs.files) return;
    const box = panelHost("qf-panel");
    if (!box) return;
    // the course hero: its Canvas color, its name, the teacher (photo, Perguntar) and when Canvas was read
    const hero = el("div", "hero"), band = el("div", "band-c"), title = el("div", "ht"), heroSub = el("div", "hs"), teach = el("div", "hteach");
    title.append(mark(), el("b", null, shortName(cv ? cv.name : document.title)));
    heroSub.textContent = (c ? "meta " + fmt(T, T % 1 ? 1 : 0) + " · " : "") + "lido do Canvas " + ago(C.localISO(new Date(cache.at)));
    const htxt = el("div", "htxt"); htxt.append(title, heroSub); hero.append(band, htxt, teach); box.appendChild(hero);
    courseColor(cache, courseId).then(col => { if (col) band.style.background = col; }, () => {});
    teachersOf(cache).then(list => { const t = list.find(x => String(x.course) === courseId); if (!t) return;
      const go = el("a", "mini ask-b", "Perguntar"); go.href = location.origin + "/conversations?user_id=" + encodeURIComponent(t.id) + "&user_name=" + encodeURIComponent(t.name) + "&context_id=course_" + encodeURIComponent(t.course);
      go.title = "Abrir uma mensagem para " + t.name + " na caixa de entrada do Canvas"; teach.append(avatar(t.avatar, t.name, 34), mid(t.name, null, "professor(a)"), go); }, () => {});
    // Simular: type a grade in the items without one and see the ring, the need and the other items change (nothing is saved).
    const sim = {}; let simOn = false, paint = () => {};
    const parts = { notas: [] }, simActs = el("div", "acts");
    if (c) {
      const headBox = el("div"), st0 = a.state(c), nx = C.nextItem(st0);
      const headCard = st => {
        const head = el("div", "card cring" + (simOn ? " simulating" : "")), mid = el("div", "mid");
        mid.append(el("div", "t", earnedText(st) + " garantidos de 10" + (simOn ? " (simulação)" : "")),
          el("div", "c", (st.status === "garantido" ? "meta " + fmt(T, 0) + " garantida" + (simOn ? " com essas notas" : " pelas notas lançadas") : "faltam " + up(st.need, 1) + " pontos pra meta " + fmt(T, 0)) + (nx ? " · próxima " + dmy(nx.date) : "")));
        head.append(ring(st, true), mid, needBig(st)); return head;
      };
      box.appendChild(headBox);
      const tbl = el("div", "card items"), th = el("div", "ir ih"); th.append(el("span", null, "Avaliação"), el("span", null, "Peso"), el("span", null, "Nota"));
      tbl.appendChild(th);
      const total = C.weightSum(c), d2 = it => it.inMax >= 5 ? 1 : 2, open = [];
      for (const it of c.items) {
        const row = el("div", "ir"), k = C.key(c, it), p = C.itemPoints(it, a.canvas[k]), name = el("span", "n", it.name);
        if (nx === it) name.appendChild(el("span", "pill ok", dmy(it.date))); else if (st0.future.includes(it)) name.appendChild(el("span", "dt", dmy(it.date)));
        let g;
        if (Number.isNaN(p)) g = el("span", "g e", "nota inválida");
        else if (p !== null) { g = el("span", "g", fmt(C.parseNum(a.canvas[k]), d2(it))); if (it.inMax !== 10) g.appendChild(el("small", null, " de " + fmt(it.inMax, d2(it)))); }
        else { g = el("span", "g e"); open.push({ it, k, g }); }
        row.append(name, el("span", "w", Math.round(it.max / total * 100) + "%"), g); tbl.appendChild(row);
      }
      const hint = it => st => st.late.includes(it) && !(C.key(c, it) in sim) ? "falta a nota" : st.status === "depende-atrasadas" ? "—" : need({ req: C.requiredFor(st, it), item: it });
      paint = () => {
        const g = Object.assign({}, a.canvas, simOn ? {} : a.hand, sim), st = C.courseState(c, g, today(), T);
        headBox.replaceChildren(headCard(st));
        for (const o of open) {
          const txt = (o.k in sim) ? "" : hint(o.it)(st), mineV = a.hand[o.k];
          if (!simOn) {
            o.g.replaceChildren(); o.mounted = false;
            if (mineV != null && !Number.isNaN(C.itemPoints(o.it, mineV)) && C.itemPoints(o.it, mineV) !== null) { o.g.className = "g"; o.g.textContent = fmt(C.parseNum(mineV), d2(o.it)); o.g.appendChild(el("small", null, " sua nota")); }
            else { o.g.className = "g e"; o.g.textContent = txt; }
            continue;
          }
          o.g.className = "g e";
          if (!o.input) {
            o.input = el("input", "simi"); o.input.type = "text"; o.input.inputMode = "decimal"; o.input.setAttribute("aria-label", "Simular a nota de " + o.it.name + " (de " + fmt(o.it.inMax, d2(o.it)) + ")");
            o.input.addEventListener("input", () => { const v = String(o.input.value || "").trim(), pp = v && C.itemPoints(o.it, v);
              if (typeof pp === "number" && !Number.isNaN(pp)) sim[o.k] = v; else delete sim[o.k]; paint(); });
          }
          if (!o.mounted) { o.g.textContent = ""; o.g.replaceChildren(o.input); o.mounted = true; o.input.value = sim[o.k] || ""; }
          o.input.placeholder = txt || "e se?";
        }
      };
      paint();
      parts.notas.push(tbl, el("div", "muted src", source([c])));
    }
    const acts = el("div", "acts"), status = el("span", "muted");
    if (prefs.files) {
      const files = el("button", "primary", "Baixar arquivos da matéria");
      files.addEventListener("click", () => listFiles(courseId, cv ? cv.name : document.title, acts, files, status));
      acts.appendChild(files);
    }
    // Simular (nothing saved) or, with "Guardar como minhas notas", the grades typed where Canvas has none (kept per user)
    if (c && c.items.some(it => C.itemPoints(it, a.canvas[C.key(c, it)]) === null)) {
      const sb = el("button", null, "Simular ou lançar notas"), note = el("label", "muted keep"), keep = el("input"), save = el("button", "primary", "Guardar");
      keep.type = "checkbox"; note.append(keep, el("span", null, " guardar como minhas notas")); note.hidden = true; save.hidden = true;
      const ownOpen = () => c.items.filter(it => C.itemPoints(it, a.canvas[C.key(c, it)]) === null).map(it => C.key(c, it));
      sb.addEventListener("click", () => {
        simOn = !simOn; for (const k of Object.keys(sim)) delete sim[k];
        if (simOn) for (const k of ownOpen()) if (a.hand[k] != null) sim[k] = a.hand[k];   // start from the grades already typed
        sb.textContent = simOn ? "Sair sem guardar" : "Simular ou lançar notas"; note.hidden = save.hidden = !simOn; keep.checked = false;
        paint();
      });
      save.addEventListener("click", async () => {
        if (!keep.checked) { note.textContent = ""; note.append(keep, el("span", null, " marque para guardar (senão é só simulação)")); return; }
        const ch = {}; for (const k of ownOpen()) ch[k] = k in sim ? sim[k] : null;
        a.hand = await setHand(cache.user, ch); a.grades = Object.assign({}, a.hand, a.canvas);
        simOn = false; for (const k of Object.keys(sim)) delete sim[k]; sb.textContent = "Simular ou lançar notas"; note.hidden = save.hidden = true; status.textContent = "Notas guardadas neste computador";
        paint();
      });
      simActs.append(sb, note, save);
    }
    // Anotações: a note per course, only on this computer (chrome.storage.local "notes", per Canvas user), saved as you type.
    const pad = el("div", "card notes"), ta = el("textarea"), saved = el("div", "muted", "");
    ta.setAttribute("aria-label", "Anotações desta matéria"); ta.placeholder = "Lembretes, links, o que cai na prova… (fica só neste computador)"; ta.maxLength = 5000;
    pad.append(ta, saved);
    let tm = 0;
    const store = async () => {
      const { notes } = await chrome.storage.local.get("notes"), all = notes && typeof notes === "object" ? notes : {}, mine = Object.assign({}, all[cache.user]);
      const v = String(ta.value || "").slice(0, 5000); if (v) mine[courseId] = v; else delete mine[courseId];
      await chrome.storage.local.set({ notes: Object.assign({}, all, { [cache.user]: mine }) }); saved.textContent = "Salvo neste computador";
    };
    let typed = 0;
    ta.addEventListener("input", () => { typed = Date.now(); saved.textContent = ""; clearTimeout(tm); tm = setTimeout(store, 400); });
    const host = document.getElementById("qf-panel"); if (host) host.cpBusy = () => simOn || Date.now() - typed < 30000;
    chrome.storage.local.get("notes").then(({ notes }) => {
      const v = notes && notes[cache.user] && notes[cache.user][courseId];
      if (typeof v === "string" && v) { ta.value = v; if (btns.anot) btns.anot.textContent = "Anotações ✓"; }
    });
    // Checklist: the student's own list for this course, below the note (chrome.storage.local "checks", per Canvas user and
    // course; up to 50 items of 200 chars; only on this computer).
    const chk = el("div", "card notes chk"), cform = el("form", "add"), cin = el("input"), cadd = el("button", "primary", "Adicionar"), cul = el("ul");
    cin.type = "text"; cin.placeholder = "Novo item (ex.: refazer a lista 3)"; cin.setAttribute("aria-label", "Novo item do checklist"); cin.maxLength = 200; cadd.type = "submit";
    cform.append(cin, cadd); chk.append(el("h3", null, "Meu checklist"), cform, cul);
    let items = [];
    const readChecks = async () => { const { checks } = await chrome.storage.local.get("checks"), all = checks && typeof checks === "object" ? checks : {}, mine = all[cache.user];
      return { all, list: mine && Array.isArray(mine[courseId]) ? mine[courseId].filter(x => x && typeof x.t === "string" && x.id) : [] }; };
    const editChecks = async f => {   // read, change, write: another tab's edits are kept
      const { all, list } = await readChecks(), next = f(list).slice(0, 50), mine = Object.assign({}, all[cache.user]);
      if (next.length) mine[courseId] = next; else delete mine[courseId];
      await chrome.storage.local.set({ checks: Object.assign({}, all, { [cache.user]: mine }) }); items = next; drawChecks();
    };
    const drawChecks = () => {
      cul.replaceChildren();
      if (!items.length) { cul.appendChild(el("li", "muted", "Nada ainda: o que você quer conferir nesta matéria.")); return; }
      for (const x of items.slice().sort((p, q) => !!p.done - !!q.done)) {
        const li = el("li", "row" + (x.done ? " dn" : "")), end = el("span", "end"), ck = el("button", "ck", "✓"), del = el("button", "ck del", "×");
        ck.type = del.type = "button"; ck.setAttribute("aria-pressed", String(!!x.done)); ck.setAttribute("aria-label", (x.done ? "Desmarcar: " : "Marcar: ") + x.t); del.setAttribute("aria-label", "Apagar: " + x.t);
        ck.addEventListener("click", () => editChecks(l => l.map(y => y.id === x.id ? Object.assign({}, y, { done: !y.done }) : y)));
        del.addEventListener("click", () => editChecks(l => l.filter(y => y.id !== x.id)));
        end.append(ck, del); li.append(el("span", "n", x.t), end); cul.appendChild(li);
      }
    };
    cform.addEventListener("submit", e => { e.preventDefault(); const t = String(cin.value || "").trim().slice(0, 200); if (!t) return; cin.value = "";
      editChecks(l => l.concat({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t, done: false })); });
    cin.addEventListener("input", () => { typed = Date.now(); });   // no redraw under the student's typing
    readChecks().then(r => { items = r.list; drawChecks(); });
    acts.appendChild(status);
    // tabs: Visão geral, Notas (table and simulator), Materiais (modules, files), Avisos, Anotações; the last one opened is kept
    const tabs = [["geral", "Visão geral"]].concat(c ? [["notas", "Notas"]] : [], [["materiais", "Materiais"], ["avisos", "Avisos"]], EXT ? [["anot", "Anotações"]] : []);
    const bar = el("div", "ctabs"), panes = {}, btns = {}; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Seções da matéria");
    bar.addEventListener("keydown", e => {
      const keys = tabs.map(([k]) => k), cur = keys.findIndex(k => btns[k].getAttribute ? btns[k].getAttribute("aria-selected") === "true" : btns[k]["aria-selected"] === "true");
      const nx = e.key === "ArrowRight" ? cur + 1 : e.key === "ArrowLeft" ? cur - 1 : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : null;
      if (nx === null) return; e.preventDefault(); const k = keys[(nx + keys.length) % keys.length]; show(k, true); if (btns[k].focus) btns[k].focus();
    });
    const show = async (k, byClick) => {
      for (const [key] of tabs) { panes[key].hidden = key !== k; btns[key].setAttribute("aria-selected", String(key === k)); btns[key].tabIndex = key === k ? 0 : -1; }
      if (k === "materiais" && !panes.materiais.cpLoaded) { panes.materiais.cpLoaded = 1; materials(courseId, panes.materiais); }
      if (k === "anot" && byClick && ta.focus) ta.focus();   // only when the student opens it (never on page load)
      await chrome.storage.local.set({ ctab: k });
    };
    for (const [k, label] of tabs) {
      const b = el("button", null, label); b.type = "button"; b.dataset.k = k; b.setAttribute("role", "tab"); b.addEventListener("click", () => show(k, true)); bar.appendChild(b); btns[k] = b;
      panes[k] = el("div", "cpane"); panes[k].setAttribute("role", "tabpanel"); panes[k].hidden = k !== "geral";   // no flash of every tab before the kept one is read
    }
    panes.geral.append(...overview(courseId, c, a, cache, prefs));
    if (c) panes.notas.append(...parts.notas, simActs);
    panes.materiais.appendChild(acts);
    panes.avisos.appendChild(courseNews(cache, courseId));
    if (EXT) panes.anot.append(pad, chk);
    box.append(bar, ...tabs.map(([k]) => panes[k]));
    chrome.storage.local.get("ctab").then(({ ctab }) => show(tabs.some(([k]) => k === ctab) ? ctab : "geral"));
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
  function miniCal(courseId, c, a, cache) {
    const t = today();
    let marks = {}, items = [];
    const build = () => {
      const seen = new Set(); items = [];
      const rule = c ? c.items.filter(it => it.date).map(it => { const key = "qf:" + C.key(c, it); return { key, mine: !!marks[key], title: it.name, date: it.date, exam: it.exam, task: !it.exam, url: null, rule: true }; }) : [];
      for (const x of agenda(a, cache, marks).filter(x => String(x.cid) === courseId || (c && x.ours === c)).concat(rule)) {
        const k = x.date + "|" + fold(x.title).slice(0, 24); if (seen.has(k)) continue; seen.add(k); items.push(x);
      }
    };
    build();
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
          ck.addEventListener("click", async () => { marks = await setMark(cache.user, x, !x.mine); build(); draw(); });
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
    return sec;
  }
  function overview(courseId, c, a, cache, prefs) {
    const out = [miniCal(courseId, c, a, cache)];
    const last = (cache.data.announcements || []).filter(x => String(x.courseId) === courseId).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0];
    if (last) { const s2 = el("section", "card news"), li = el("div", "row"), who = el("span", "who"); who.appendChild(avatar(last.avatar, last.author || "", 32)); if (last.unread) who.appendChild(el("span", "dot", "não lido"));
      li.append(who, mid(last.title, last.url && inCanvas(last.url), (last.author ? last.author + " · " : "") + (last.at ? ago(C.localISO(new Date(last.at))) : "")), el("span"));
      s2.append(el("h3", null, "Último aviso"), li); out.push(s2); }
    const links = el("div", "qlinks"); links.appendChild(el("span", "muted", "Abrir no Canvas:"));
    for (const [label, path] of [["Módulos", "/modules"], ["Tarefas", "/assignments"], ["Arquivos", "/files"], ["Notas", "/grades"]]) { const l = el("a", "mini", label); l.href = "/courses/" + courseId + path; links.appendChild(l); }
    out.push(links);
    return out;
  }
  // Materiais: every module and its items (one GET when the tab opens), with a filter box; the files download stays above.
  async function materials(courseId, pane) {
    const box = el("section", "card news mats"), q = el("input", "mq"), list = el("div"); q.type = "text"; q.placeholder = "Filtrar materiais (ex.: slides, lista 4)"; q.setAttribute("aria-label", "Filtrar materiais");
    box.append(el("h3", null, "Módulos"), q, list); pane.appendChild(box); list.appendChild(el("div", "muted", "Lendo os módulos…"));
    let mods = [];
    try { mods = await getAll("/api/v1/courses/" + courseId + "/modules?include[]=items&per_page=100"); } catch (e) { list.replaceChildren(el("div", "muted", "Esta matéria não mostra os módulos.")); return; }
    for (const m of mods) if (!m.items && m.items_count) { try { m.items = await getAll("/api/v1/courses/" + courseId + "/modules/" + m.id + "/items?per_page=100"); } catch (e) { m.items = []; } }   // big modules come without their items
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
        for (let i = 0; i < items.length; i += 300) {   // the service worker takes up to 300 per message
          const res = await chrome.runtime.sendMessage({ type: "download", items: items.slice(i, i + 300) });
          started += res && Array.isArray(res.done) ? res.done.length : 0;
        }
        status.textContent = started + " de " + items.length + " enviados para Downloads/" + root;
        btns.forEach(b => { b.disabled = false; });
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
    for (const c of a.mine) out.push({ t: C.SHORT[c.id] + ": quanto falta", c: "Caderno+", u: "/courses/" + courseOf[c.id], k: "campus" });
    return out;
  }
  async function moduleIndex(cache) {
    const { search } = await chrome.storage.local.get("search");
    if (search && search.user === cache.user && Date.now() - search.at < SEARCH_TTL && Array.isArray(search.items)) return search.items;
    const items = []; let read = 0;
    for (const c of cache.data.courses) {
      try {
        for (const m of await getAll("/api/v1/courses/" + c.id + "/modules?include[]=items&per_page=100"))
          for (const it of m.items || []) if (it && it.title && it.html_url && it.type !== "SubHeader") items.push({ t: String(it.title), c: shortName(c.name) + " · " + String(m.name || ""), u: it.html_url, k: KIND[it.type] || "item" });
        read++;
      } catch (e) { /* modules hidden in this course */ }
    }
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
    const root = host.attachShadow({ mode: "open" }), back = el("div", "pal-back"), dlg = el("div", "pal");
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
    };
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
  function enhanceTray(a, hidden) {
    const portal = document.getElementById("nav-tray-portal");
    if (!portal || !portal.querySelectorAll) return;
    for (const link of portal.querySelectorAll('a[href^="/courses/"]')) {
      const m = /^\/courses\/(\d+)$/.exec(link.getAttribute("href") || ""); if (!m) continue;
      const item = link.closest ? link.closest("li") : null;
      if (item) item.style.display = hidden().includes(m[1]) ? "none" : "";
      const c = a.byCanvasId[m[1]];
      if (!c || !a.has || !item || item.querySelector("[data-cp-tray]")) continue;
      const st = a.state(c), p = pill(earnedText(st) + "/10 · " + a.label(st), a.tone(st)); p.setAttribute("data-cp-tray", "1"); item.appendChild(p);
    }
  }
  function watchTray(a, hidden) {
    if (trayWatch || typeof MutationObserver === "undefined" || !document.body) return;
    let t = 0;
    // only the tray portal (Cursos, Grupos...), not every change on the page; the whole page only until the portal exists
    let onPortal = false;
    const aim = () => { const p = document.getElementById("nav-tray-portal"); onPortal = !!p; trayWatch.disconnect(); trayWatch.observe(p || document.body, { childList: true, subtree: true }); };
    trayWatch = new MutationObserver(() => { if (!onPortal && document.getElementById("nav-tray-portal")) aim(); clearTimeout(t); t = setTimeout(() => enhanceTray(a, hidden), 150); });
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
    const list = [];
    for (const c of cache.data.courses) {
      try {
        for (const u of await getAll("/api/v1/courses/" + c.id + "/users?enrollment_type[]=teacher&include[]=avatar_url&per_page=20", 1))
          if (u && u.id && u.name && !list.some(t => t.id === u.id && t.course === c.id)) list.push({ id: u.id, name: String(u.name).slice(0, 80), avatar: typeof u.avatar_url === "string" ? u.avatar_url : null, course: c.id, courseName: shortName(c.name) });
      } catch (e) { /* the course hides its people */ }
    }
    await chrome.storage.local.set({ teachers: { user: cache.user, at: Date.now(), list } });
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
#cp-navopen { position:fixed; top:96px; left:var(--cp-navleft, 84px); z-index:999; display:grid; place-items:center; width:20px; height:52px; padding:0; border:0; border-radius:0 12px 12px 0; background:var(--ic-brand-primary, #E2482B); color:#fff; cursor:pointer; box-shadow:3px 2px 12px -6px rgba(0,0,0,.5); transition:width .15s; }
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
    const extra = {}, base = agenda(a, cache, marks);
    const ruleItems = (a.rules ? a.mine : []).flatMap(c => c.items.filter(it => it.date).map(it => ({ key: "qf:" + C.key(c, it), title: it.name, course: C.SHORT[c.id] || c.name, date: it.date, exam: it.exam, task: !it.exam, url: courseOf[c.id] ? location.origin + "/courses/" + courseOf[c.id] : null, rule: true })));
    const hd = el("div", "hd"); hd.append(mark(), wordmark());
    const nav = el("span", "calnav"), prev = el("button", null, "‹"), next = el("button", null, "›"), now = el("button", null, "Hoje"), title = el("b", "calt");
    prev.type = next.type = now.type = "button"; prev.setAttribute("aria-label", "Mês anterior"); next.setAttribute("aria-label", "Próximo mês");
    nav.append(prev, title, next, now); hd.appendChild(nav);
    const natB = el("button", "find natv", prefs.nativeCal ? "Só o do Caderno+" : "Calendário do Canvas"); natB.type = "button";
    natB.addEventListener("click", async () => { const { prefs: sp } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, sp, { nativeCal: !prefs.nativeCal }) }); prefs = cpPrefs(Object.assign({}, prefs, { nativeCal: !prefs.nativeCal })); natB.textContent = prefs.nativeCal ? "Só o do Caderno+" : "Calendário do Canvas"; setTimeout(() => window.dispatchEvent && window.dispatchEvent(new Event("resize")), 60); });   // Canvas's calendar measures itself when shown
    hd.appendChild(natB);
    const grid = el("div", "card cal"), legend = el("div", "muted src", "Prazos do Canvas, provas do Plano de Ensino e as suas tarefas · clique para abrir");
    box.append(hd, grid, legend);
    const itemsOf = ym => {
      const seen = new Set(), out = [];
      for (const x of base.concat(extra[ym] || [], ruleItems)) {
        if (!x.date || x.date.slice(0, 7) !== ym) continue;
        const k = (x.rule ? x.course + x.date : x.key);
        if (x.rule && base.some(y => y.exam && y.date === x.date && y.ours && (C.SHORT[y.ours.id] || "") === x.course)) continue;
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
    const root = host.attachShadow({ mode: "open" }), style = el("style");
    style.textContent = `button { display:block; width:34px; height:34px; margin-top:6px; border-radius:50%; border:1px solid #ECE4D3; background:#FBF7EF; color:#1D2433; font:600 15px/1 -apple-system,BlinkMacSystemFont,sans-serif;
      cursor:pointer; box-shadow:0 6px 16px -8px rgba(29,36,51,.5); opacity:.85; } button:hover { opacity:1; } button:focus-visible { outline:2px solid #E2482B; outline-offset:2px; }`;
    const go = (txt, label, top) => { const b = el("button", null, txt); b.type = "button"; b.setAttribute("aria-label", label); b.title = label;
      b.addEventListener("click", () => window.scrollTo({ top: top(), behavior: "smooth" })); return b; };
    root.append(style, go("↑", "Voltar ao topo", () => 0), go("↓", "Ir para o fim", () => de.scrollHeight));
    let busy = false;
    const check = () => { busy = false; host.style.display = de.scrollHeight > window.innerHeight * 2.5 ? "block" : "none"; };
    window.addEventListener("scroll", () => { if (!busy) { busy = true; setTimeout(check, 200); } }, { passive: true });
    document.body.appendChild(host); check();
  }

  async function run() {
    if (SIGN.test(location.pathname)) { await signedOut(); return; }
    const first = await chrome.storage.local.get(["prefs", "cache", "refreshing"]), prefs = cpPrefs(first.prefs);
    if (prefs.scroll) scrollButtons();
    let cache;
    let queue = Promise.resolve();   // one drawing at a time, in order: the newer reading never loses to the older one
    const paintAll = (c, again) => (queue = queue.then(() => draw(c, prefs, again)).catch(() => {}));
    try { cache = await load(fresh => { if (fresh.at !== cache.at) paintAll(fresh, true); }, first); } catch (e) { return; }   // logged out or Canvas down: stay quiet
    await paintAll(cache, false);
  }
  // Everything drawn from one reading; again: a newer reading replaces what the older one drew.
  let cardWatch = null;
  async function draw(cache, prefs, again) {
    T = Math.min(10, Math.max(5, Number(String(prefs.meta).replace(",", ".")) || 7)); TURMA_PREF = prefs.turma || null;
    const [hand, marks] = await Promise.all([myHand(cache.user), myMarks(cache.user), loadTasks(cache.user), loadChanges(cache.user)]);   // side by side, not one after another
    let a = analyse(cache, hand);
    let keepCourse = false;   // a course panel in use (simulating, or a note typed in the last 30 s) is not swapped under the student
    if (again) for (const id of ["cp-dash", "qf-panel"]) { const old = document.getElementById(id); if (!old) continue; if (old.cpBusy && old.cpBusy()) keepCourse = true; else old.remove(); }
    sendNext(a);
    sendReminders(agenda(a, cache, marks), prefs, cache);
    if (prefs.search) {   // the bookmarklet can run again on the same page: one listener, opening the latest reading
      const first = !window.cpSearch;
      window.cpSearch = () => openSearch(a, cache);
      if (first) addEventListener("keydown", e => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); e.stopPropagation(); window.cpSearch(); }
      }, true);
    }
    if (/^\/calendar\/?$/.test(location.pathname) && prefs.calendar) calendarPage(a, cache, prefs, marks);
    { // trays (every page) and the course list use the courses taken off the dashboard
      const { hidden } = await chrome.storage.local.get("hidden");
      let off = Array.isArray(hidden) ? hidden.map(String) : [];
      const getOff = () => off, setOff = async list => { off = list.map(String); await chrome.storage.local.set({ hidden: off }); };
      watchTray(a, getOff);
      if (/^\/courses\/?$/.test(location.pathname)) coursesPage(a, getOff, setOff);
    }
    const anyCourse = /^\/courses\/(\d+)(\/|$)/.exec(location.pathname);
    if (anyCourse) { courseNav(anyCourse[1]); courseModules(anyCourse[1]); }
    const m = /^\/courses\/(\d+)(\/(modules|files|assignments|grades|announcements))?\/?$/.exec(location.pathname);
    if (m && !keepCourse) coursePanel(m[1], a, cache, prefs);
    if (location.pathname === "/" || location.pathname === "/dashboard") {
      const { recent, fold } = await chrome.storage.local.get(["recent", "fold"]);
      folds = fold && typeof fold === "object" ? fold : {};
      const onMode = async (k, meta, native) => {   // switch from the panel (mode, meta, native dashboard, or a change of tasks): saved, redrawn at once
        if (meta != null) T = meta;
        const { prefs: saved } = await chrome.storage.local.get("prefs"), was = cpPrefs(saved);
        if (was.mode !== k || (meta != null && Number(was.meta) !== meta) || (native != null && was.native !== native)) {
          const next = Object.assign({}, saved, { mode: k }, meta != null ? { meta: String(meta) } : {}, native != null ? { native } : {}); await chrome.storage.local.set({ prefs: next }); prefs = cpPrefs(next);
        }
        if (meta != null) { a = analyse(cache, await myHand(cache.user)); if (window.cpCards) window.cpCards(a); gradeA = a; for (const b of (document.querySelectorAll ? document.querySelectorAll("[data-cp-grade]") : [])) b.remove(); enhanceGradeCards(); }
        const m2 = await myMarks(cache.user); await loadTasks(cache.user); await loadChanges(cache.user);
        const old = document.getElementById("cp-dash"); if (old) old.remove();
        dashPanel(a, cache, prefs, m2, recent && typeof recent === "object" ? recent[cache.user] : null, onMode); placeDash();
        sendReminders(agenda(a, cache, m2), prefs, cache);
      };
      window.cpRedraw = () => onMode(prefs.mode);
      // the popup changes the mode, the meta or the native dashboard: the panel follows at once (one listener per page)
      window.cpPrefsChanged = async next => {
        const p2 = cpPrefs(next);
        if (!!p2.cardsFirst !== cardsFirst) { cardsFirst = !!p2.cardsFirst; placeDash(); }
        if (p2.mode === prefs.mode && p2.meta === prefs.meta && p2.native === prefs.native) return;
        const metaN = Math.min(10, Math.max(5, Number(String(p2.meta).replace(",", ".")) || 7));
        prefs = p2; T = metaN; a = analyse(cache, await myHand(cache.user)); gradeA = a; if (window.cpCards) window.cpCards(a);
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
      const ctx = { prefs, hidden: Array.isArray(hidden) ? hidden.map(String) : [] };
      dashPanel(a, cache, prefs, marks, recent && typeof recent === "object" ? recent[cache.user] : null, onMode);
      cardsFirst = !!prefs.cardsFirst; gradeA = a; watchDash(); placeDash(); enhanceGradeCards();
      decorateCards(a, again, ctx); hideGradeCards(ctx.hidden); greet(agenda(a, cache, marks));
      window.cpCards = a2 => decorateCards(a2, true, ctx);   // a new meta repaints the card pills
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
