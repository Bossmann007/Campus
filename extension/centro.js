// The Centro de Notas permission (optional host), asked here because a Canvas page cannot ask for it: the button is the
// user gesture the browser requires. The service worker reads every course as soon as it is granted.
const CENTRO = "https://ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.azurecontainerapps.io/*";
const st = document.getElementById("st"), btn = document.getElementById("allow");
const done = () => { st.textContent = "Permitido. O Caderno+ está lendo o Centro de Notas; volte para o Canvas."; btn.textContent = "Permitido"; btn.disabled = true; };
chrome.permissions.contains({ origins: [CENTRO] }).then(has => { if (has) done(); });
btn.addEventListener("click", async () => {
  let ok = false; try { ok = await chrome.permissions.request({ origins: [CENTRO] }); } catch (e) { ok = false; }
  if (ok) done(); else st.textContent = "Sem a permissão, o quanto falta usa as regras do Plano de Ensino e a soma dos pontos do Canvas.";
});
