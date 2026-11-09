// Onboarding (opened once on install, and from the popup): the turma, the mode, the look, the notifications and the downloads
// folder, written straight into chrome.storage.local "prefs" (each change only its own key).
const $ = id => document.getElementById(id);
const steps = [...document.querySelectorAll(".step")];
let at = 0;
const setPref = async (k, v) => { const { prefs } = await chrome.storage.local.get("prefs"); await chrome.storage.local.set({ prefs: Object.assign({}, prefs, { [k]: v }) }); };

// the turmas with rules in this build (the rule packs embedded in core.js), plus "another program"
const turmas = [...new Set(NotasCore.COURSES.map(c => NotasCore.turmaOf(c)).filter(Boolean))];
for (const t of turmas.concat(["outro"])) {
  const b = document.createElement("button"), name = document.createElement("b"), sub = document.createElement("span");
  b.type = "button"; b.setAttribute("role", "radio"); b.dataset.set = "turma"; b.dataset.value = t;
  name.textContent = t === "outro" ? "Outro curso ou outra turma" : t; sub.textContent = t === "outro" ? "Sem as notas por enquanto; o resto funciona." : "Notas com os pesos do Plano de Ensino " + NotasCore.TERM.replace(/ /g, "");
  b.append(name, sub); $("turmas").appendChild(b);
}

function show(prefs) {
  const p = cpPrefs(prefs);
  for (const b of document.querySelectorAll("[data-set]")) b.setAttribute("aria-checked", String(String(p[b.dataset.set]) === b.dataset.value));
  for (const x of document.querySelectorAll("[data-pref]")) x.checked = !!p[x.dataset.pref];
  for (const x of document.querySelectorAll("[data-sel]")) x.value = p[x.dataset.sel];
  if (document.activeElement !== $("dlFolder")) $("dlFolder").value = cpFolder(p.dlFolder);
  $("dlPreview").textContent = "Exemplo: Downloads/" + cpFolder($("dlFolder").value) + "/Banco de Dados/Slides/Aula 3.pdf";
}
for (const b of document.querySelectorAll("[data-set]")) b.addEventListener("click", () => setPref(b.dataset.set, b.dataset.value));
for (const x of document.querySelectorAll("[data-pref]")) x.addEventListener("change", () => setPref(x.dataset.pref, x.checked));
for (const x of document.querySelectorAll("[data-sel]")) x.addEventListener("change", () => setPref(x.dataset.sel, x.value));
$("dlFolder").addEventListener("input", () => { $("dlPreview").textContent = "Exemplo: Downloads/" + cpFolder($("dlFolder").value) + "/Banco de Dados/Slides/Aula 3.pdf"; });
$("dlFolder").addEventListener("change", () => { const v = cpFolder($("dlFolder").value); $("dlFolder").value = v; setPref("dlFolder", v); });
chrome.storage.local.get("prefs").then(({ prefs }) => show(prefs));
chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) show(ch.prefs.newValue); });

const dots = $("dots");
steps.forEach(() => dots.appendChild(document.createElement("li")));
function go(n) {
  at = Math.max(0, Math.min(steps.length - 1, n));
  steps.forEach((s, i) => { s.hidden = i !== at; dots.children[i].className = i === at ? "on" : ""; });
  $("back").hidden = at === 0; $("next").hidden = at === steps.length - 1;
  $("next").textContent = at === 0 ? "Começar" : "Continuar";
  const h = steps[at].querySelector("h1"); if (h) { h.tabIndex = -1; h.focus(); }
}
$("back").addEventListener("click", () => go(at - 1));
$("next").addEventListener("click", async () => { if (at === steps.length - 2) await chrome.storage.local.set({ onboarded: Date.now() }); go(at + 1); });
$("openCanvas").addEventListener("click", async () => { await chrome.storage.local.set({ onboarded: Date.now() }); location.href = "https://pucpr.instructure.com/"; });
go(0);
