// The Centro de Notas permission (optional host), asked here because a Canvas page cannot ask for it: the button is the
// user gesture the browser requires. The service worker reads every course as soon as it is granted.
const CENTRO = "https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io/*";
const st = document.getElementById("st"), btn = document.getElementById("allow"), back = document.getElementById("back");
const done = said => { st.textContent = "Pronto. Em um ou dois minutos, o quanto falta passa a usar a fórmula do professor nas matérias que têm uma no Centro de Notas."; btn.textContent = "Fórmula do professor ativada ✓"; btn.disabled = true; back.hidden = false; if (said) st.focus(); };
chrome.permissions.contains({ origins: [CENTRO] }).then(has => { if (has) done(false); });
btn.addEventListener("click", async () => {
  let ok = false; try { ok = await chrome.permissions.request({ origins: [CENTRO] }); } catch (e) { ok = false; }
  if (ok) done(true); else { st.textContent = "Tudo bem. Sem a fórmula do professor, o quanto falta usa os pesos do Plano de Ensino, do Canvas ou a regra que você montar. Dá para permitir depois no aviso do Canvas ou em Sua IA → Centro de Notas → Permitir."; st.focus(); }
});
// this page was opened by the Canvas tab's button: closing it lands back there
back.addEventListener("click", () => chrome.tabs.getCurrent(t => { if (t) chrome.tabs.remove(t.id); else location.href = "https://pucpr.instructure.com/"; }));
document.getElementById("manage").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id }));
