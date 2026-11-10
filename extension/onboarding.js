// Onboarding (opened once on install, and from the popup): the turma, the mode, the look, the notifications, the downloads
// folder and the optional file for the AI, written straight into chrome.storage.local "prefs" (each change only its own key).
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
  const p = cpPrefs(prefs);
  for (const b of document.querySelectorAll("[data-set]")) b.setAttribute("aria-checked", String(String(p[b.dataset.set]) === b.dataset.value));
  for (const x of document.querySelectorAll("[data-pref]")) x.checked = !!p[x.dataset.pref];
  for (const x of document.querySelectorAll("[data-sel]")) x.value = p[x.dataset.sel];
  if (document.activeElement !== $("dlFolder")) $("dlFolder").value = cpFolder(p.dlFolder);
  $("dlPreview").textContent = "Exemplo: Downloads/" + cpFolder($("dlFolder").value) + "/Banco de Dados/Slides/Aula 3.pdf";
  accent();
  summary(p);
}
// the chosen look's accent on the decoration; on a dark page, only a color light enough to see (Grafite falls back to coral)
const dark = matchMedia("(prefers-color-scheme: dark)");
function accent() {
  const look = document.querySelector('[data-set="look"][aria-checked="true"] i'), c = look ? look.style.getPropertyValue("--c").trim() : "";
  const lum = /^#[0-9a-f]{6}$/i.test(c) ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0) : 0;
  document.documentElement.style.setProperty("--accent", c && (!dark.matches || lum > .3) ? c : "");
}
dark.addEventListener("change", accent);
// the closing card: what was chosen, in the words of the buttons
function summary(p) {
  const pick = k => { const b = document.querySelector('[data-set="' + k + '"][aria-checked="true"]'); return b ? (b.querySelector("b") || b).textContent.trim() : "—"; };
  const on = ["remind", "newgrades", "summary"].filter(k => p[k]).map(k => document.querySelector('[data-pref="' + k + '"]').closest("label").firstElementChild.firstChild.textContent.trim());
  const rows = [["Turma", pick("turma")], ["Painel", pick("mode")], ["Visual", pick("look")], ["Avisos", on.join(", ") || "nenhum"], ["Arquivos", "Downloads/" + cpFolder(p.dlFolder)]];
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

const track = $("track"), last = steps.length - 1;
steps.forEach((s, i) => {
  if (!s.dataset.name) return;
  const li = document.createElement("li"), b = document.createElement("button");
  b.type = "button"; b.textContent = s.dataset.name; b.addEventListener("click", () => go(i));
  li.dataset.i = i; li.appendChild(b); track.appendChild(li);
});
function go(n) {
  at = Math.max(0, Math.min(last, n));
  steps.forEach((s, i) => { s.hidden = i !== at; });
  for (const li of track.children) { const i = +li.dataset.i; li.className = i < at ? "done" : i === at ? "on" : ""; li.firstChild.setAttribute("aria-current", i === at ? "step" : "false"); }
  track.hidden = at === 0; $("skip").hidden = at === last;
  $("back").hidden = at === 0; $("next").hidden = at === last;
  $("next").textContent = at === 0 ? "Começar" : "Continuar";
  chrome.storage.local.set(at === last ? { obDone: Date.now() } : { obStep: at });
  const h = steps[at].querySelector("h1"); if (h) { h.tabIndex = -1; h.focus(); }
}
$("back").addEventListener("click", () => go(at - 1));
$("next").addEventListener("click", () => go(at + 1));
$("skip").addEventListener("click", () => go(last));   // every choice already has a default
document.addEventListener("keydown", e => {
  if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input, select, a, [role=radiogroup]")) return;   // arrows inside a radiogroup belong to it
  if (e.key === "ArrowRight" && at < last) go(at + 1); else if (e.key === "ArrowLeft" && at > 0) go(at - 1);
});
$("openCanvas").addEventListener("click", () => { location.href = "https://pucpr.instructure.com/"; });
// resume: a tab closed midway reopens on its step; after the end, the popup's "setup" skips the intro
chrome.storage.local.get(["obStep", "obDone"]).then(({ obStep, obDone }) => go(obDone ? 1 : Number.isInteger(obStep) ? obStep : 0));
