// Runs inside the student's Canvas tab (injected with chrome.scripting on click): same-origin, read-only GETs.
// Returns { v:1, courses:[{ name, assignments:[{ name, points, score }] }] } for 2026/2 courses.
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
  const cs = (await get("/api/v1/courses?enrollment_state=active&per_page=100")).filter(c => c && typeof c.name === "string" && /2026 \/ 2/.test(c.name));
  const courses = [];
  for (const c of cs) {
    const as = await get("/api/v1/courses/" + c.id + "/assignments?include[]=submission&per_page=100");
    courses.push({ name: c.name, assignments: as.map(a => ({ name: a.name, points: a.points_possible,
      score: a.submission && typeof a.submission.score === "number" ? a.submission.score : null })) });
  }
  return { v: 1, courses };
}
