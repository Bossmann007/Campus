// Reads the student's own Canvas data on the Canvas page (content script, or the bookmarklet): same-origin, read-only GETs.
// Returns { v:1, courses:[{ id, name, assignments:[{ name, points, url, score, due, missing, submitted, online, stats }] }], announcements } for the
// courses of the term (NotasCore.TERM), or { error } (never rejects). seen.courses gets every active course ({ id, name }), so the caller
// does not fetch the list again.
async function collectCanvasGrades(seen) {
  // one GET: 20 s for the whole answer; a throttle (429, 403 with no quota left) or a gateway error is tried twice more
  const once = async url => {
    for (let i = 0; ; i++) {
      const ctl = typeof AbortController === "function" ? new AbortController() : null, t = ctl ? setTimeout(() => ctl.abort(), 20000) : 0;
      try {
        const r = await fetch(url, Object.assign({ credentials: "same-origin", headers: { Accept: "application/json" } }, ctl ? { signal: ctl.signal } : {}));
        const left = r.headers && r.headers.get ? parseFloat(r.headers.get("X-Rate-Limit-Remaining")) : NaN;
        if ((r.status === 429 || [502, 503, 504].includes(r.status) || (r.status === 403 && left <= 0)) && i < 2) { if (r.body && r.body.cancel) r.body.cancel().catch(() => {}); await new Promise(res => setTimeout(res, 1200 * (i + 1))); continue; }
        return { ok: r.ok, status: r.status, link: r.headers && r.headers.get ? r.headers.get("Link") : null, body: await r.text() };
      } catch (e) { if (i < 2) { await new Promise(res => setTimeout(res, 800 * (i + 1))); continue; } throw new Error(e && e.name === "AbortError" ? "o Canvas demorou demais" : "sem conexão com o Canvas"); }
      finally { clearTimeout(t); }
    }
  };
  const get = async url => {
    const out = [];
    while (url) {
      const r = await once(url);
      if (!r.ok) throw new Error("o Canvas respondeu " + r.status);
      out.push(...JSON.parse(r.body.replace(/^while\(1\);/, "")));
      const m = /<([^>]+)>;\s*rel="next"/.exec(r.link || "");
      url = m ? m[1] : null;
      if (url && new URL(url, location.href).origin !== location.origin) throw new Error("o Canvas indicou uma página fora do Canvas");
    }
    return out;
  };
  try {
  const active = (await get("/api/v1/courses?enrollment_state=active&per_page=100")).filter(c => c && typeof c.name === "string");
  if (seen) seen.courses = active.map(c => ({ id: c.id, name: c.name }));
  const cs = active.filter(c => c.name.includes(NotasCore.TERM));
  // Professors' announcements from the last 60 days, read alongside the assignments; optional, a failure never blocks the grades.
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), until = new Date(Date.now() + 864e5).toISOString().slice(0, 10);   // Canvas caps the window when end_date is left out
  const anP = cs.length ? get("/api/v1/announcements?" + cs.map(c => "context_codes[]=course_" + c.id).join("&") + "&start_date=" + since + "&end_date=" + until + "&per_page=50").catch(() => null) : Promise.resolve([]);
  // every course at once (the order of the list is kept)
  const courses = await Promise.all(cs.map(async c => {
    const as = await get("/api/v1/courses/" + c.id + "/assignments?include[]=submission&include[]=score_statistics&per_page=100");
    return ({ id: c.id, name: c.name, assignments: as.map(a => ({ name: a.name, points: a.points_possible, url: typeof a.html_url === "string" ? a.html_url : null,
      score: a.submission && typeof a.submission.score === "number" ? a.submission.score : null,
      due: a.due_at || null, missing: !!(a.submission && a.submission.missing),
      submitted: !!(a.submission && (a.submission.submitted_at || /^(submitted|graded|pending_review)$/.test(a.submission.workflow_state))),
      online: !Array.isArray(a.submission_types) || a.submission_types.some(t => !/^(on_paper|none|not_graded)$/.test(t)),
      stats: a.score_statistics && typeof a.score_statistics.mean === "number"
        ? { mean: a.score_statistics.mean, min: a.score_statistics.min, max: a.score_statistics.max } : null })) });
  }));
  let announcements = null;
  try {
    const an = await anP; if (!Array.isArray(an)) throw new Error("sem avisos");
    const byCode = Object.fromEntries(cs.map(c => ["course_" + c.id, c]));
    announcements = an.slice(0, 50).map(a => ({ course: byCode[a.context_code] ? byCode[a.context_code].name : "", courseId: byCode[a.context_code] ? byCode[a.context_code].id : null, title: a.title, at: a.posted_at || null, unread: a.read_state === "unread", url: a.html_url || null,
      author: a.author && typeof a.author.display_name === "string" ? a.author.display_name.slice(0, 80) : null, avatar: a.author && typeof a.author.avatar_image_url === "string" && /^https:\/\//.test(a.author.avatar_image_url) ? a.author.avatar_image_url : null }));
  } catch (e) { announcements = null; }
  return { v: 1, courses, announcements };
  } catch (e) { return { error: String(e && e.message || e) }; }
}
