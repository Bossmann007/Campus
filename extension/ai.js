// "Sua IA": how to connect the Caderno+ MCP with a Canvas token (no file, no server), and questions to copy.
const $ = id => document.getElementById(id);
for (const b of document.querySelectorAll("[data-q]")) b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(b.dataset.q); $("copied").textContent = "Copiado: cole na sua IA."; } catch (e) { $("copied").textContent = b.dataset.q; }
});
