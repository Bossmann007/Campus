// Runs on pucpr.instructure.com pages (after collect.js, core.js and files.js): "Quanto falta" inside Canvas.
// Dashboard cards get the course status; course pages get the next assessments, what each needs, and a files download.
// Same-origin read-only GETs with the student's session; grades stay in chrome.storage.local on this computer.
(() => {
  if (window.top !== window) return;
  const C = NotasCore, F = QFFiles, T = 7, TTL = 10 * 60 * 1000;
  const SITE = "https://falta-quanto.vercel.app/app", VERSION = chrome.runtime.getManifest().version;
  const fmt = (n, d) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const up = (n, d) => fmt(Math.ceil(n * 10 ** d - 1e-9) / 10 ** d, d);   // round up: never shows less than needed
  const dmy = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
  const today = () => C.localISO(new Date());
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
    const fresh = { v: VERSION, user, at: Date.now(), data, ids };
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

  const COLORS = { ok: ["#e9f6e9", "#2a7e3b"], warn: ["#fff7c2", "#ab6400"], bad: ["#feebe7", "#d13415"] };
  function pill(text, tone) {
    const s = document.createElement("span"), [bg, fg] = COLORS[tone] || COLORS.warn;
    s.textContent = text;
    s.style.cssText = "display:inline-block;margin-top:6px;padding:2px 9px;border-radius:999px;font:600 12px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:" + bg + ";color:" + fg;
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
      p.title = "Quanto falta (notas do Canvas, meta 7)";
      (card.querySelector(".ic-DashboardCard__header_content") || card).appendChild(p);
    }
  }

  function b64url(s) {
    const bytes = new TextEncoder().encode(s); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  const CSS = `
    :host { all: initial; display:block; margin:0 0 18px; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#202020; }
    .box { border:1px solid #e8e8e8; border-radius:12px; background:#fff; padding:14px 16px; }
    .top { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    .top b { font-size:15px; } .muted { color:#646464; font-size:12.5px; }
    .pill { padding:2px 9px; border-radius:999px; font-weight:600; font-size:12px; }
    .ok { background:#e9f6e9; color:#2a7e3b; } .warn { background:#fff7c2; color:#ab6400; } .bad { background:#feebe7; color:#d13415; }
    ul { list-style:none; margin:10px 0 0; padding:0; display:grid; gap:6px; }
    li { display:grid; grid-template-columns:52px minmax(0,1fr) auto; gap:10px; align-items:baseline; }
    li .d { color:#646464; font-variant-numeric:tabular-nums; } li .n { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } li .q { font-weight:600; }
    .acts { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; align-items:center; }
    button { font:inherit; font-size:13px; font-weight:500; color:#202020; background:#fff; border:1px solid #d9d9d9; border-radius:999px; padding:6px 14px; cursor:pointer; }
    button.primary { background:#202020; color:#fff; border-color:#202020; }
    button:disabled { opacity:.55; cursor:default; }
    @media (prefers-color-scheme:dark) { :host { color:#eee; } .box { background:#222; border-color:#313131; } .muted, li .d { color:#b4b4b4; }
      button { background:#2a2a2a; color:#eee; border-color:#484848; } button.primary { background:#eee; color:#191919; border-color:#eee; } }`;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // Course pages: the next assessments of this course and the files download.
  function coursePanel(courseId, a, cache) {
    if (document.getElementById("qf-panel")) return;
    const anchor = document.getElementById("content");
    if (!anchor) return;
    const host = el("div"); host.id = "qf-panel";
    const root = host.attachShadow({ mode: "open" }), box = el("div", "box");
    const style = el("style"); style.textContent = CSS; root.append(style, box);
    const c = a.byCanvasId[courseId], cv = cache.ids.find(x => String(x.id) === courseId);
    const top = el("div", "top"); top.appendChild(el("b", null, "Quanto falta"));
    if (c) { const st = a.state(c); top.appendChild(el("span", "pill " + a.tone(st), a.label(st))); top.appendChild(el("span", "muted", "pelas notas do Canvas, meta 7")); }
    box.appendChild(top);
    if (c) {
      const list = el("ul"), next = a.upcoming.filter(u => u.course.id === c.id).slice(0, 4);
      for (const u of next) {
        const li = el("li"), d = days(u.item.date), inMax = u.item.inMax;
        li.title = d === 0 ? "hoje" : d === 1 ? "amanhã" : "em " + d + " dias";
        li.append(el("span", "d", dmy(u.item.date)), el("span", "n", u.item.name),
          el("span", "q", u.req.impossible ? "não dá" : u.req.f <= 1e-9 ? "já garantido" : "precisa " + up(u.req.raw, inMax >= 5 ? 1 : 2) + (inMax === 10 ? "" : " de " + fmt(inMax, inMax >= 5 ? 1 : 2))));
        list.appendChild(li);
      }
      if (next.length) box.appendChild(list); else box.appendChild(el("div", "muted", "Nada pela frente nesta matéria."));
    }
    const acts = el("div", "acts");
    const files = el("button", "primary", "Baixar arquivos da matéria"), status = el("span", "muted");
    acts.appendChild(files);
    if (c) { const open = el("button", null, "Abrir no Quanto falta"); open.addEventListener("click", () => window.open(SITE + "#canvas=" + b64url(JSON.stringify(Object.assign({ ext: VERSION }, cache.data))), "_blank", "noopener")); acts.appendChild(open); }
    acts.appendChild(status); box.appendChild(acts);
    files.addEventListener("click", () => listFiles(courseId, cv ? cv.name : document.title, acts, files, status));
    anchor.prepend(host);
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
    let cache;
    try { cache = await load(false); } catch (e) { return; }   // logged out or Canvas down: stay quiet
    const a = analyse(cache);
    sendNext(a);
    const m = /^\/courses\/(\d+)(\/(modules|files|assignments|grades|announcements))?\/?$/.exec(location.pathname);
    if (m) coursePanel(m[1], a, cache);
    if (location.pathname === "/" || location.pathname === "/dashboard") {
      decorateCards(a);
      let t = 0;
      new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => decorateCards(a), 250); }).observe(document.body, { childList: true, subtree: true });
    }
  }
  run();
})();
