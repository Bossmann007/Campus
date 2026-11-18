// Onboarding (opened once on install, and from the popup): the turma, the Centro de Notas permission, the mode, the look, the notifications, the downloads
// folder and the AI (the ponte, on the Sua IA page), written straight into chrome.storage.local "prefs" (each change only its own key).
// Modeled on Ardia's: a named step track, one decision per step, "Pular" at any time, the accent follows the chosen look,
// and the step is saved ("obStep") so a closed tab resumes where it stopped; the last step stores "obDone".
const $ = id => document.getElementById(id);
const steps = [...document.querySelectorAll(".step")];
let at = 0;
const setPref = async (k, v) => { const { prefs } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, prefs, { [k]: v }) }); };

// the turmas with rules in this build (the rule packs embedded in core.js), plus "another program"
const turmas = [...new Set(NotasCore.COURSES.map(c => NotasCore.turmaOf(c)).filter(Boolean))];
for (const t of turmas.concat(["outro"])) {
  const b = document.createElement("button"), name = document.createElement("b"), sub = document.createElement("span");
  b.type = "button"; b.setAttribute("role", "radio"); b.dataset.set = "turma"; b.dataset.value = t;
  // the turma is shown by its subjects, never by the course's name
  const subs = NotasCore.COURSES.filter(c => NotasCore.turmaOf(c) === t).map(c => NotasCore.SHORT[c.id]).join(", ");
  name.textContent = t === "outro" ? "Outras matérias" : subs; sub.textContent = t === "outro" ? "O quanto falta usa o Centro de Notas e as regras que você montar." : "Com os pesos do Plano de Ensino " + NotasCore.TERM.replace(/ /g, "");
  b.append(name, sub); $("turmas").appendChild(b);
}

function show(prefs) {
  lastPrefs = prefs || {}; const p = cpPrefs(prefs);
  for (const b of document.querySelectorAll("[data-set]")) b.setAttribute("aria-checked", String(String(p[b.dataset.set]) === b.dataset.value));
  for (const x of document.querySelectorAll("[data-pref]")) x.checked = !!p[x.dataset.pref];
  for (const x of document.querySelectorAll("[data-sel]")) x.value = p[x.dataset.sel];
  if (document.activeElement !== $("dlFolder")) $("dlFolder").value = cpFolder(p.dlFolder);
  $("dlPreview").textContent = "Exemplo: Downloads/" + cpFolder($("dlFolder").value) + "/Banco de Dados/Slides/Aula 3.pdf";
  accent();
  summary(p);
  roving();
}
// the chosen look's accent on the decoration; on a dark page, only a color light enough to see (Grafite falls back to coral)
const dark = matchMedia("(prefers-color-scheme: dark)");
function accent() {
  const look = document.querySelector('[data-set="look"][aria-checked="true"] i'), c = look ? look.style.getPropertyValue("--c").trim() : "";
  const lum = /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0) : 0;
  document.documentElement.style.setProperty("--accent", c && (!dark.matches || lum > .3) ? c : "");
}
dark.addEventListener("change", accent);
// the Centro de Notas (optional host): asked here because an extension page can ask (a Canvas page cannot); a store install
// starts without it, and without it every course falls back to the Canvas weights or the Plano de Ensino
const CENTRO = "https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io/*";
let centroOk = false, lastPrefs = null;
const CENTRO_NO = "Tudo bem. Sem a fórmula do professor, o quanto falta usa os pesos do Plano de Ensino, do Canvas ou a regra que você montar. Dá para permitir depois no aviso do Canvas ou em Sua IA → Centro de Notas → Permitir.";
function centroShow(ok, said) {
  centroOk = !!ok;
  for (const b of document.querySelectorAll("button[data-centro]")) { b.disabled = centroOk; b.textContent = centroOk ? "Fórmula do professor ativada ✓" : "Usar a fórmula do professor"; }
  // the result goes to the status line of the step on screen (the Notas step or the summary), and focus moves to it
  const st = steps[at] && steps[at].querySelector("[data-centro-st]");
  if (st && centroOk && said != null) st.textContent = "Pronto. Nas matérias em que o professor montou a fórmula no Centro de Notas, o quanto falta passa a usar a conta dele.";
  else if (st && centroOk && steps[at].dataset.name === "Notas") st.textContent = "Fórmula do professor ativada.";
  else if (st && said === false) st.textContent = CENTRO_NO;
  if (st && said != null) st.focus();   // the button just went disabled: the screen reader hears the result
  for (const x of document.querySelectorAll("[data-centro-late]")) x.hidden = centroOk;
  if (lastPrefs) summary(cpPrefs(lastPrefs));
  nav();
}
if (chrome.permissions) chrome.permissions.contains({ origins: [CENTRO] }).then(centroShow, () => centroShow(false));
for (const b of document.querySelectorAll("button[data-centro]")) b.addEventListener("click", async () => {
  let ok = false; try { ok = await chrome.permissions.request({ origins: [CENTRO] }); } catch (e) { ok = false; }
  centroShow(ok, ok);
});
// the closing card: what was chosen, in the words of the buttons
function summary(p) {
  const pick = k => { const b = document.querySelector('[data-set="' + k + '"][aria-checked="true"]'); return b ? (b.querySelector("b") || b).textContent.trim() : "—"; };
  const on = ["remind", "newgrades", "summary"].filter(k => p[k]).map(k => document.querySelector('[data-pref="' + k + '"]').closest("label").firstElementChild.firstChild.textContent.trim());
  const turma = document.querySelector('[data-set="turma"][aria-checked="true"]') ? pick("turma") : "não escolhida";
  const rows = [["Turma", turma], ["Fórmula do professor", centroOk ? "ativada" : "não ativada"], ["Painel", pick("mode")], ["Visual", pick("look")], ["Avisos", on.join(", ") || "nenhum"], ["Arquivos", "Downloads/" + cpFolder(p.dlFolder)]];
  $("sum").replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
}
for (const b of document.querySelectorAll("[data-set]")) b.addEventListener("click", () => setPref(b.dataset.set, b.dataset.value));
for (const x of document.querySelectorAll("[data-pref]")) x.addEventListener("change", () => setPref(x.dataset.pref, x.checked));
$("aiOpen").addEventListener("click", () => window.open(chrome.runtime.getURL("ai.html"), "_blank"));
for (const x of document.querySelectorAll("[data-sel]")) x.addEventListener("change", () => setPref(x.dataset.sel, x.value));
$("dlFolder").addEventListener("input", () => { $("dlPreview").textContent = "Exemplo: Downloads/" + cpFolder($("dlFolder").value) + "/Banco de Dados/Slides/Aula 3.pdf"; });
$("dlFolder").addEventListener("change", () => { const v = cpFolder($("dlFolder").value); $("dlFolder").value = v; setPref("dlFolder", v); });
chrome.storage.local.get("prefs").then(({ prefs }) => show(prefs));
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) show(ch.prefs.newValue); });

// the main flow: intro, Turma, Notas, Painel, Avisos, then the summary; Visual, Arquivos and IA (data-extra) keep their
// defaults and open from the summary's "Mais opções", coming back to it
const track = $("track"), last = steps.length - 1, extra = i => steps[i].hasAttribute("data-extra");
const flow = steps.map((s, i) => i).filter(i => !extra(i));
steps.forEach((s, i) => {
  if (!s.dataset.name || extra(i)) return;
  const li = document.createElement("li"), b = document.createElement("button");
  b.type = "button"; b.textContent = s.dataset.name; b.addEventListener("click", () => go(i));
  li.dataset.i = i; li.appendChild(b); track.appendChild(li);
});
const nextOf = i => extra(i) ? last : flow[Math.min(flow.length - 1, flow.indexOf(i) + 1)];
const prevOf = i => extra(i) ? last : flow[Math.max(0, flow.indexOf(i) - 1)];
// the footer: on the Notas step without the permission, "Continuar" says "Agora não" and is not the primary action
function nav() {
  const ex = extra(at), notas = steps[at].dataset.name === "Notas" && !centroOk, n = $("next");
  $("back").hidden = at === 0 || ex; n.hidden = at === last;
  n.textContent = at === 0 ? "Começar" : ex ? "Voltar ao resumo" : notas ? "Agora não" : "Continuar";
  n.classList.toggle("primary", !notas);
}
function go(n) {
  at = Math.max(0, Math.min(last, n));
  steps.forEach((s, i) => { s.hidden = i !== at; });
  for (const li of track.children) { const i = +li.dataset.i, pos = flow.indexOf(i), cur = extra(at) ? flow.length : flow.indexOf(at); li.className = pos < cur ? "done" : i === at ? "on" : ""; li.firstChild.setAttribute("aria-current", i === at ? "step" : "false"); }
  track.hidden = at === 0 || extra(at); $("skip").hidden = at === last || extra(at);
  nav();
  if (!extra(at)) chrome.storage.local.set(at === last ? { obDone: Date.now() } : { obStep: at, obStepName: steps[at].dataset.name || "" });
  const h = steps[at].querySelector("h1"); if (h) { h.tabIndex = -1; h.focus(); }
}
$("back").addEventListener("click", () => go(prevOf(at)));
$("next").addEventListener("click", () => go(nextOf(at)));
$("skip").addEventListener("click", () => go(last));   // every choice already has a default
for (const b of document.querySelectorAll("[data-goto]")) b.addEventListener("click", () => go(steps.findIndex(s => s.dataset.name === b.dataset.goto)));
document.addEventListener("keydown", e => {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input, select, a, [role=radiogroup]")) return;   // arrows inside a radiogroup belong to it
  if (e.key === "ArrowRight" && at < last) go(nextOf(at)); else if (e.key === "ArrowLeft" && at > 0) go(prevOf(at));
});
// radio groups: one Tab stop (the checked option), arrows move the choice (WAI-ARIA radio group pattern)
function roving() { for (const g of document.querySelectorAll("[role=radiogroup]")) { const rs = [...g.querySelectorAll("[role=radio]")], on = rs.find(r => r.getAttribute("aria-checked") === "true") || rs[0]; rs.forEach(r => { r.tabIndex = r === on ? 0 : -1; }); } }
document.addEventListener("keydown", e => {
  const r = e.target.closest && e.target.closest("[role=radio]"); if (!r || !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
  const rs = [...r.closest("[role=radiogroup]").querySelectorAll("[role=radio]")], k = rs.indexOf(r), d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1, to = rs[(k + d + rs.length) % rs.length];
  e.preventDefault(); to.focus(); to.click();
});
$("openCanvas").addEventListener("click", () => { location.href = "https://pucpr.instructure.com/"; });
// resume: a tab closed midway reopens on its step; after the end, the popup's "setup" skips the intro
// (by the step's name: the indexes of 6.16 and older point to other steps now; an index without a name restarts)
chrome.storage.local.get(["obStep", "obStepName", "obDone"]).then(({ obStepName, obDone }) => { const i = obStepName ? steps.findIndex(x => x.dataset.name === obStepName && !x.hasAttribute("data-extra")) : -1; go(obDone ? 1 : i > 0 ? i : 0); });
