// Runs inside the student's Canvas tab (injected with chrome.scripting on click): same-origin, read-only GETs.
// Returns { v:1, courses:[{ name, assignments:[{ name, points, score, due, missing, submitted, online }] }] } for 2026/2 courses, or { error } (never rejects).
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
    const as = await get("/api/v1/courses/" + c.id + "/assignments?include[]=submission&per_page=100");
    courses.push({ name: c.name, assignments: as.map(a => ({ name: a.name, points: a.points_possible,
      score: a.submission && typeof a.submission.score === "number" ? a.submission.score : null,
      due: a.due_at || null, missing: !!(a.submission && a.submission.missing),
      submitted: !!(a.submission && (a.submission.submitted_at || /^(submitted|graded|pending_review)$/.test(a.submission.workflow_state))),
      online: !Array.isArray(a.submission_types) || a.submission_types.some(t => !/^(on_paper|none|not_graded)$/.test(t)) })) });
  }
  return { v: 1, courses };
  } catch (e) { return { error: String(e && e.message || e) }; }
}
