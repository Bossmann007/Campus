// Reads the student's own Canvas data on the Canvas page (content script, or the bookmarklet): same-origin, read-only GETs.
// Returns { v:1, courses:[{ name, assignments:[{ name, points, score, due, missing, submitted, online, stats }] }], announcements } for 2026/2 courses, or { error } (never rejects).
async function collectCanvasGrades() {
  const get = async url => {
    const out = [];
    while (url) {
      const r = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error("o Canvas respondeu " + r.status);
      out.push(...JSON.parse((await r.text()).replace(/^while\(1\);/, "")));
      const m = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get("Link") || "");
      url = m ? m[1] : null;
      if (url && new URL(url, location.href).origin !== location.origin) throw new Error("o Canvas indicou uma página fora do Canvas");
    }
    return out;
  };
  try {
  const cs = (await get("/api/v1/courses?enrollment_state=active&per_page=100")).filter(c => c && typeof c.name === "string" && /2026 \/ 2/.test(c.name));
  const courses = [];
  for (const c of cs) {
    const as = await get("/api/v1/courses/" + c.id + "/assignments?include[]=submission&include[]=score_statistics&per_page=100");
    courses.push({ name: c.name, assignments: as.map(a => ({ name: a.name, points: a.points_possible,
      score: a.submission && typeof a.submission.score === "number" ? a.submission.score : null,
      due: a.due_at || null, missing: !!(a.submission && a.submission.missing),
      submitted: !!(a.submission && (a.submission.submitted_at || /^(submitted|graded|pending_review)$/.test(a.submission.workflow_state))),
      online: !Array.isArray(a.submission_types) || a.submission_types.some(t => !/^(on_paper|none|not_graded)$/.test(t)),
      stats: a.score_statistics && typeof a.score_statistics.mean === "number"
        ? { mean: a.score_statistics.mean, min: a.score_statistics.min, max: a.score_statistics.max } : null })) });
  }
  // Professors' announcements from the last 60 days; optional, a failure here never blocks the grades.
  let announcements = null;
  try {
    const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), until = new Date(Date.now() + 864e5).toISOString().slice(0, 10);   // Canvas caps the window when end_date is left out
    const an = cs.length ? await get("/api/v1/announcements?" + cs.map(c => "context_codes[]=course_" + c.id).join("&") + "&start_date=" + since + "&end_date=" + until + "&per_page=50") : [];
    const names = Object.fromEntries(cs.map(c => ["course_" + c.id, c.name]));
    announcements = an.slice(0, 50).map(a => ({ course: names[a.context_code] || "", title: a.title, at: a.posted_at || null, unread: a.read_state === "unread", url: a.html_url || null }));
  } catch (e) { announcements = null; }
  return { v: 1, courses, announcements };
  } catch (e) { return { error: String(e && e.message || e) }; }
}
