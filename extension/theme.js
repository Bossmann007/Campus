// Runs at document_start on pucpr.instructure.com: the Campus+ dark theme, applied before Canvas paints.
// Inverts the page and turns pictures, videos, embeds, the left menu (already dark), the course colors and our own panels back.
(() => {
  const BACK = "invert(1) hue-rotate(180deg)";
  const style = document.createElement("style");
  style.id = "cp-theme";
  style.textContent = `html.cp-dark { background:#fff !important; filter:${BACK} contrast(.9); }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .cp-host, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) { filter:${BACK}; }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .cp-host, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) :is(img, video, picture, canvas, [style*="background-image"]) { filter:none; }`;
  (document.head || document.documentElement).appendChild(style);
  const dark = matchMedia("(prefers-color-scheme: dark)");
  let theme = CP_DEFAULTS.theme;
  const apply = () => document.documentElement.classList.toggle("cp-dark", theme === "dark" || (theme === "auto" && dark.matches));
  chrome.storage.local.get("prefs").then(({ prefs }) => { theme = cpPrefs(prefs).theme; apply(); });
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) { theme = cpPrefs(ch.prefs.newValue).theme; apply(); } });
  dark.addEventListener("change", apply);
})();
