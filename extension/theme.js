// Runs at document_start on pucpr.instructure.com, before Canvas paints: the Caderno+ look of the whole Canvas.
// Look (Caderno, Pastel, Alto contraste, or Canvas original): Canvas's own brand variables (--ic-brand-*, the ones its
// Theme Editor sets) overridden on :root, plus a few stable ic-* selectors (page background, cards, headings). Font and
// left-menu color on top. Dark modes invert the page and turn pictures, embeds, the left menu and our panels back.
(() => {
  const BACK = "invert(1) hue-rotate(180deg)";
  const LOOKS = {   // paper, card, ink, muted, line, accent, link, menu
    caderno: ["#FBF7EF", "#FFFFFF", "#1D2433", "#5F6675", "#ECE4D3", "#E2482B", "#B8361C", "#1D2433"],
    pastel: ["#F6F4FB", "#FFFFFF", "#2A2540", "#625C78", "#E6E1F2", "#7C5CDB", "#6246C2", "#3B3363"],
    kraft: ["#F3EBDD", "#FBF6EC", "#3B2F25", "#6E6052", "#E2D5BF", "#C2611F", "#9A4A12", "#3B2F25"],
    marca: ["#FFFFFF", "#FFFFFF", "#1C1C1C", "#5C5C5C", "#ECECEC", "#E0A800", "#1C1C1C", "#1C1C1C"],
    menta: ["#F2F8F5", "#FFFFFF", "#1E3B32", "#55706A", "#D9EAE2", "#2F9E74", "#1F7A57", "#1E3B32"],
    oceano: ["#F3F7FB", "#FFFFFF", "#14273E", "#566A80", "#DCE6F1", "#1E6FD9", "#1857B0", "#14273E"],
    grafite: ["#F7F7F5", "#FFFFFF", "#111111", "#666666", "#E6E6E3", "#111111", "#111111", "#111111"],
    contraste: ["#FFFFFF", "#FFFFFF", "#000000", "#1F1F1F", "#000000", "#0040C1", "#0033A0", "#000000"]
  };
  const NAV = { tinta: "#1D2433", coral: "#B8361C", verde: "#1F5C42", azul: "#1E3A6E", roxo: "#3B3363" };
  const css = (look, nav, f, cards, dark) => {
    // dark modes invert the page: a cream paper would turn to mud, so under them every look paints on neutral white
    const L = LOOKS[look] && dark ? ["#FFFFFF", "#F3F3F3"].concat(LOOKS[look].slice(2, 4), ["#E0E0E0"], LOOKS[look].slice(5)) : LOOKS[look], out = [];
    // the dashboard: the Caderno+ panel takes the place of Canvas's (its widget dashboard is React with generated classes);
    // "Painel do Canvas" in our header brings the original back
    // Canvas's widget dashboard (data-testid hooks from canvas-lms ui/features/widget_dashboard): its widgets hidden when
    // the student keeps only Caderno+ (or in Foco); otherwise styled like our cards
    const W = ":root.cp-dash-page";
    if (!cards.native || cards.mode === "foco") out.push(`${W}.cp-has-panel [data-testid="widget-columns"] { display:none !important; }`);
    if (cards.mode === "limpo" || cards.mode === "foco") out.push(`${W} [data-testid="switch-to-old-dashboard-button"] { display:none !important; }`);
    out.push(`${W}.cp-has-panel [data-testid="widget-container-course-work-combined-widget"] { display:none !important; }`);   // our 7 days show the same work
    // /calendar: ours in place of Canvas's (its calendar, mini month and calendar list), unless the student keeps Canvas's
    if (!cards.nativeCal) out.push(`:root.cp-cal-page.cp-has-cal #content > :not(#cp-cal), :root.cp-cal-page.cp-has-cal #right-side-wrapper { display:none !important; }`);
    // Cursos and Grupos (Canvas tables): our cards' look
    const TB = ":is(#my_courses_table, .course-list-table, #current_groups_table, #previous_groups_table)";   // only the Cursos and Grupos lists (the grades table uses th per row)
    if (L) out.push(`:root.cp-look ${TB} { background:var(--cp-card) !important; border:1px solid var(--cp-line) !important; border-radius:14px !important; border-collapse:separate !important; border-spacing:0 !important; }
:root.cp-look ${TB} thead th { background:var(--cp-paper) !important; color:var(--cp-muted) !important; font-size:11.5px !important; text-transform:uppercase; letter-spacing:.05em; }
:root.cp-look ${TB} :is(th, td) { padding:12px 16px !important; border-color:var(--cp-line) !important; }
:root.cp-look ${TB} tbody tr:hover td { background:color-mix(in srgb, var(--cp-accent) 6%, transparent) !important; }`);
    // the classic dashboard: our panel sits between its header and the course cards; its side column (to do, coming up:
    // our week shows them) goes away while our panel is there
    out.push(`${W}.cp-has-panel #right-side-wrapper { display:none !important; } ${W}.cp-has-panel #DashboardCard_Container { margin-top:6px; }`);
    // Only on the dashboard (quizzes, grades and assignments keep their side column: timers, totals and submissions live there).
    // limpo: the side column, footer, activity stream and card icons go; foco: also the course cards, once our panel is drawn
    const D = ":root.cp-dash-page";
    if (cards.mode === "limpo" || cards.mode === "foco") out.push(`${D} :is(#right-side-wrapper, #right-side, #footer, .recent_activity, #dashboard-activity, .ic-DashboardCard__action-container) { display:none !important; }
${D} .ic-Layout-contentMain { max-width:1180px; margin-left:auto !important; margin-right:auto !important; }`);
    if (cards.mode === "foco") out.push(`${D}.cp-has-panel :is(#DashboardCard_Container, .ic-DashboardCard, .ic-Dashboard-header, #cp-scroll) { display:none !important; }`);
    // Canvas's own card layout (262px cards in .ic-DashboardCard__box__container, canvas-lms dashboard_card.scss) is kept;
    // the rows are only centered and balanced (2 side by side, 4 as 2+2, 5-6 as 3+3) by the width of the box
    out.push(`.ic-DashboardCard__box__container { text-align:center; } .ic-DashboardCard__box__container > * { text-align:left; }
:root.cp-dash-page .ic-DashboardCard__box { max-width:calc(var(--cp-cols, 4) * 286px + 24px); margin-left:auto !important; margin-right:auto !important; }`);
    if (!cards.cardImg) out.push(`.ic-DashboardCard__header_image { background-image:none !important; } .ic-DashboardCard__header_hero { opacity:1 !important; }`);
    if (L) {
      const [paper, card, ink, muted, line, accent, link, menu] = L;
      out.push(`:root.cp-look { --cp-paper:${paper}; --cp-card:${card}; --cp-ink:${ink}; --cp-muted:${muted}; --cp-line:${line}; --cp-accent:${accent};
  --ic-brand-primary:${accent} !important; --ic-link-color:${link} !important; --ic-brand-font-color-dark:${ink} !important;
  --ic-brand-button--primary-bgd:${accent} !important; --ic-brand-button--primary-text:#FFFFFF !important;
  --ic-brand-button--secondary-bgd:${card} !important; --ic-brand-button--secondary-text:${ink} !important; --cp-menu:${menu}; }
:root.cp-look body, :root.cp-look #application, :root.cp-look #wrapper, :root.cp-look #main, :root.cp-look .ic-Layout-wrapper,
:root.cp-look .ic-Layout-contentMain, :root.cp-look #content-wrapper, :root.cp-look #right-side-wrapper, :root.cp-look #right-side { background-color:var(--cp-paper) !important; color:var(--cp-ink); }
:root.cp-look .ic-DashboardCard { border-radius:14px; overflow:hidden; border:1px solid var(--cp-line); background:var(--cp-card); box-shadow:0 1px 2px rgba(29,36,51,.06); transition:transform .18s, box-shadow .18s; }
:root.cp-look .ic-DashboardCard:hover { transform:translateY(-2px); box-shadow:0 10px 24px -14px rgba(29,36,51,.45); }
:root.cp-look :is(.Button, .btn, button.ui-button) { border-radius:10px; }
:root.cp-look :is(.ic-Dashboard-header__layout, .ic-app-nav-toggle-and-crumbs, .page-header) { border-color:var(--cp-line) !important; }
:root.cp-look #section-tabs a.active, :root.cp-look #section-tabs a:hover { border-left-color:var(--cp-accent) !important; color:var(--cp-ink) !important; }`);
      if (look === "contraste") out.push(`:root.cp-look a { text-decoration:underline; } :root.cp-look .ic-DashboardCard { border-width:2px; }`);
    }
    const menu = nav === "original" ? null : NAV[nav] || (L ? "var(--cp-menu)" : null);
    if (menu) out.push(`:root.cp-look-nav { --ic-brand-global-nav-bgd:${menu} !important; --ic-brand-global-nav-ic-icon-svg-fill:#FBF7EF !important; --ic-brand-global-nav-menu-item__text-color:#FBF7EF !important; }
:root.cp-look-nav .ic-app-header { background:${menu} !important; }
:root.cp-look-nav .ic-app-header .ic-app-header__menu-list-item.ic-app-header__menu-list-item--active .ic-app-header__menu-list-link { background:${L ? L[5] : "rgba(255,255,255,.18)"} !important; color:#fff !important; }
:root.cp-look-nav .ic-app-header .ic-app-header__menu-list-link:hover { background-color:rgba(255,255,255,.14) !important; }`);
    return out.join("\n");
  };
  if (typeof location !== "undefined" && /^\/(dashboard)?\/?$/.test(location.pathname || "")) document.documentElement.classList.toggle("cp-dash-page", true);
  if (typeof location !== "undefined" && /^\/calendar\/?$/.test(location.pathname || "")) document.documentElement.classList.toggle("cp-cal-page", true);
  const style = document.createElement("style"), look = document.createElement("style");
  style.id = "cp-theme"; look.id = "cp-look";
  style.textContent = `html.cp-dark { background:#fff !important; filter:${BACK} contrast(.9); }
html.cp-dark.cp-dim { filter:${BACK} contrast(.78) brightness(1.08); }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .cp-host, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) { filter:${BACK}; }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .cp-host, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) :is(img, video, picture, canvas, [style*="background-image"], .ic-DashboardCard__header_hero) { filter:none; }`;
  (document.head || document.documentElement).append(style, look);
  const dark = matchMedia("(prefers-color-scheme: dark)");
  let p = cpPrefs(null);
  // last choice kept in this page's storage, so the look is there on the first paint (prefs arrive a moment later)
  try { const last = JSON.parse(localStorage.getItem("cp-look") || "null"); if (last && typeof last === "object") p = cpPrefs(last); } catch (e) { /* no storage */ }
  // dark | dim (softer) | auto (the system) | night (19:00 to 07:00, checked every 5 minutes) | off
  const night = () => { const h = new Date().getHours(); return h >= 19 || h < 7; };
  const apply = () => {
    const t = p.theme, on = t === "dark" || t === "dim" || (t === "auto" && dark.matches) || (t === "night" && night()), cl = document.documentElement.classList;
    cl.toggle("cp-dark", on); cl.toggle("cp-dim", on && t === "dim");
    look.textContent = css(p.look, p.nav, null, p, on);
    cl.toggle("cp-mode-limpo", p.mode === "limpo"); cl.toggle("cp-mode-foco", p.mode === "foco");
    cl.toggle("cp-look", !!LOOKS[p.look]); cl.toggle("cp-look-nav", p.nav !== "original" && (!!NAV[p.nav] || !!LOOKS[p.look]));
  };
  const take = prefs => {
    p = cpPrefs(prefs); apply();
    try { localStorage.setItem("cp-look", JSON.stringify({ theme: p.theme, look: p.look, nav: p.nav, mode: p.mode, native: p.native, cardImg: p.cardImg, nativeCal: p.nativeCal })); } catch (e) { /* no storage */ }
  };
  apply();
  setInterval(() => { if (p.theme === "night") apply(); }, 5 * 60 * 1000);
  chrome.storage.local.get("prefs").then(({ prefs }) => take(prefs));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) take(ch.prefs.newValue); });
  dark.addEventListener("change", apply);
})();
