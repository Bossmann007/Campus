// Runs at document_start on pucpr.instructure.com: the Caderno+ dark theme, applied before Canvas paints.
// Inverts the page and turns pictures, videos, embeds, the left menu (already dark), the course colors and our own panels back.
(() => {
  const BACK = "invert(1) hue-rotate(180deg)";
  const style = document.createElement("style");
  style.id = "cp-theme";
  style.textContent = `html.cp-dark { background:#fff !important; filter:${BACK} contrast(.9); }
html.cp-dark.cp-dim { filter:${BACK} contrast(.78) brightness(1.08); }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .cp-host, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) { filter:${BACK}; }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .cp-host, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) :is(img, video, picture, canvas, [style*="background-image"]) { filter:none; }`;
  (document.head || document.documentElement).appendChild(style);
  const dark = matchMedia("(prefers-color-scheme: dark)");
  let theme = CP_DEFAULTS.theme;
  // dark | dim (softer) | auto (the system) | night (19:00 to 07:00, checked every 5 minutes) | off
  const night = () => { const h = new Date().getHours(); return h >= 19 || h < 7; };
  const apply = () => {
    const on = theme === "dark" || theme === "dim" || (theme === "auto" && dark.matches) || (theme === "night" && night()), cl = document.documentElement.classList;
    cl.toggle("cp-dark", on); cl.toggle("cp-dim", on && theme === "dim");
  };
  setInterval(() => { if (theme === "night") apply(); }, 5 * 60 * 1000);
  chrome.storage.local.get("prefs").then(({ prefs }) => { theme = cpPrefs(prefs).theme; apply(); });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) { theme = cpPrefs(ch.prefs.newValue).theme; apply(); } });
  dark.addEventListener("change", apply);
})();
