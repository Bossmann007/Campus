// Runs at document_start on pucpr.instructure.com, before Canvas paints: the Caderno+ look of the whole Canvas.
// Look (Caderno, Pastel, Alto contraste, or Canvas original): Canvas's own brand variables (--ic-brand-*, the ones its
// Theme Editor sets) overridden on :root, plus a few stable ic-* selectors (page background, cards, headings). Font and
// left-menu color on top. Dark modes invert the page and turn pictures, embeds, the left menu and our panels back.
(() => {
  const BACK = "invert(1) hue-rotate(180deg)";
  const LOOKS = {   // paper, card, ink, muted, line, accent, link, menu
    caderno: ["#F7EFDF", "#FFFFFF", "#1D2433", "#5F6675", "#ECE4D3", "#E2482B", "#B8361C", "#1D2433"],
    pastel: ["#EEE9F9", "#FFFFFF", "#2A2540", "#625C78", "#E6E1F2", "#7C5CDB", "#6246C2", "#3B3363"],
    kraft: ["#EEE2CC", "#FBF6EC", "#3B2F25", "#6E6052", "#E2D5BF", "#C2611F", "#9A4A12", "#3B2F25"],
    marca: ["#FFF8D9", "#FFFFFF", "#1C1C1C", "#5C5C5C", "#ECECEC", "#E0A800", "#1C1C1C", "#1C1C1C"],
    menta: ["#E2F2EA", "#FFFFFF", "#1E3B32", "#55706A", "#D9EAE2", "#2F9E74", "#1F7A57", "#1E3B32"],
    oceano: ["#E2EDF9", "#FFFFFF", "#14273E", "#566A80", "#DCE6F1", "#1E6FD9", "#1857B0", "#14273E"],
    grafite: ["#EEEEEB", "#FFFFFF", "#111111", "#666666", "#E6E6E3", "#111111", "#111111", "#111111"],
    contraste: ["#FFFFFF", "#FFFFFF", "#000000", "#1F1F1F", "#000000", "#0040C1", "#0033A0", "#000000"]
  };
  // the page background under any look (pure CSS, faint ink so every look and the dark modes keep it quiet)
  const INK = "color-mix(in srgb, var(--cp-ink) 7%, transparent)", TINT = n => `color-mix(in srgb, var(--cp-accent) ${n}%, transparent)`;
  const BGS = {
    pautado: [`repeating-linear-gradient(180deg, transparent 0 27px, ${INK} 27px 28px)`, "auto"],
    quadriculado: [`linear-gradient(90deg, ${INK} 1px, transparent 1px), linear-gradient(180deg, ${INK} 1px, transparent 1px)`, "24px 24px"],
    pontilhado: [`radial-gradient(color-mix(in srgb, var(--cp-ink) 16%, transparent) 1.3px, transparent 1.7px)`, "20px 20px"],
    aurora: [`radial-gradient(1100px 620px at 0% 0%, ${TINT(11)}, transparent 70%), radial-gradient(900px 620px at 100% 100%, ${TINT(8)}, transparent 70%)`, "auto"]
  };
  const NAV = { tinta: "#1D2433", coral: "#B8361C", verde: "#1F5C42", azul: "#1E3A6E", roxo: "#3B3363" };
  const css = (look, nav, cards, dark) => {
    // dark modes invert the page: a cream paper would turn to mud, so under them every look paints on neutral white
    // the student's own background color (popup) over the look's paper. Dark modes invert the page, so a light tint turns
    // into the same hue, dark: every tinted look keeps it there too (only the neutral ones, Grafite and Contraste, stay gray)
    const own = /^#[0-9a-f]{6}$/i.test(cards.bgColor || "") ? cards.bgColor : dark && LOOKS[look] && !/^(grafite|contraste)$/.test(look) ? LOOKS[look][0] : "";
    const L0 = LOOKS[look] && dark ? ["#FFFFFF", "#F3F3F3"].concat(LOOKS[look].slice(2, 4), ["#E0E0E0"], LOOKS[look].slice(5)) : LOOKS[look], L = L0 && own ? (dark   // dark: cards and lines from the same tint (a shade darker here, so a shade lighter once inverted), not neutral gray
      ? [own, `color-mix(in srgb, ${own} 94%, #000)`].concat(L0.slice(2, 4), [`color-mix(in srgb, ${own} 88%, #000)`], L0.slice(5))
      : [own].concat(L0.slice(1))) : L0, out = [];
    // the dashboard: the Caderno+ panel takes the place of Canvas's (its widget dashboard is React with generated classes);
    // "Painel do Canvas" in our header brings the original back
    // Canvas's widget dashboard (data-testid hooks from canvas-lms ui/features/widget_dashboard): its widgets hidden when
    // the student keeps only Caderno+ (or in Foco); otherwise styled like our cards
    const W = ":root.cp-dash-page";
    if (!cards.native || cards.mode === "foco") out.push(`${W}.cp-has-panel [data-testid="widget-columns"] { display:none !important; }`);
    if (cards.mode === "limpo" || cards.mode === "foco") out.push(`${W} [data-testid="switch-to-old-dashboard-button"] { display:none !important; }`);
    if (cards.week && cards.mode !== "foco") out.push(`${W}.cp-has-panel [data-testid="widget-container-course-work-combined-widget"] { display:none !important; }`);   // our 7 days show the same work
    // /calendar: ours in place of Canvas's (its calendar, mini month and calendar list), unless the student keeps Canvas's
    if (!cards.nativeCal) out.push(`:root.cp-cal-page.cp-has-cal #content > :not(#cp-cal), :root.cp-cal-page.cp-has-cal #right-side-wrapper { display:none !important; }`);
    // Cursos and Grupos (Canvas tables): our cards' look
    const TB = ":is(#my_courses_table, #past_enrollments_table, #future_enrollments_table, #my_groups_table, .course-list-table, #current_groups_table, #previous_groups_table)";   // only the Cursos and Grupos lists (the grades table uses th per row)
    if (L) out.push(`:root.cp-look ${TB} { background:var(--cp-card) !important; border:1px solid var(--cp-line) !important; border-radius:14px !important; border-collapse:separate !important; border-spacing:0 !important; }
:root.cp-look ${TB} thead th { background:var(--cp-paper) !important; color:var(--cp-muted) !important; font-size:11.5px !important; text-transform:uppercase; letter-spacing:.05em; }
:root.cp-look ${TB} :is(th, td) { padding:12px 16px !important; border-color:var(--cp-line) !important; }
:root.cp-look ${TB} tbody tr:hover td { background:color-mix(in srgb, var(--cp-accent) 6%, transparent) !important; }`);
    // Menu lateral escondido: Canvas's left menu (.ic-app-header, fixed; the page leaves it room on .ic-Layout-wrapper, canvas-lms
    // _ic_app_layout.scss) slides out leaving a thin strip, and comes back while the mouse (or the keyboard focus) is on it
    if (cards.navHide) out.push(`@media (min-width: 768px) {
:root .ic-app-header { transform:translateX(calc(-100% + 10px)); transition:transform .22s cubic-bezier(.23,1,.32,1) .25s, box-shadow .22s; z-index:1000 !important; }
:root .ic-app-header::after { content:""; position:absolute; top:0; right:0; bottom:0; width:10px; background:linear-gradient(90deg, transparent, rgba(255,255,255,.18)); pointer-events:none; }
:root .ic-app-header:is(:hover, :focus-within) { transform:none; transition-delay:0s; box-shadow:8px 0 30px -12px rgba(0,0,0,.45); }
:root .ic-app-header:is(:hover, :focus-within)::after { opacity:0; }
:root body:not(.no-headers):not(.content-only):not(.hide-global-nav) .ic-Layout-wrapper { margin-left:10px !important; }
:root:has(#nav-tray-portal [role="dialog"]) .ic-app-header { transform:none; } }`);   // a tray (Cursos, Histórico...) keeps the menu out
    // the classic dashboard header: our greeting in place of the title (kept for screen readers), calmer buttons
    out.push(`:root.cp-greet-on .cp-greet ~ * { position:absolute !important; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
:root.cp-greet-on .ic-Dashboard-header__layout { padding:10px 0 6px; } .ic-Dashboard-header__actions { display:flex !important; flex-wrap:nowrap; gap:8px; align-items:center; } :root.cp-greet-on .ic-Dashboard-header__actions :is(button, a) { border-radius:999px !important; }
:root.cp-greet-on .ic-Dashboard-header__actions [data-testid="switch-to-new-dashboard-button"] { font-size:13px !important; padding:0 14px !important; }`);
    // the left-menu trays (Cursos, Grupos, Histórico, Ajuda) in #nav-tray-portal: paper, items as small cards
    if (L) out.push(`:root.cp-look #nav-tray-portal [role="dialog"], :root.cp-look #nav-tray-portal [role="dialog"] > div { background:var(--cp-paper) !important; }
:root.cp-look #nav-tray-portal h2 { color:var(--cp-ink) !important; letter-spacing:-.01em; }
:root.cp-look #nav-tray-portal hr { border:0 !important; border-top:1px solid var(--cp-line) !important; }
:root.cp-look #nav-tray-portal li { padding:10px 12px !important; margin:0 0 8px !important; border:1px solid var(--cp-line); border-radius:12px; background:var(--cp-card); }
:root.cp-look #nav-tray-portal li:has(> hr) { padding:0 !important; border:0; background:none; }
:root.cp-look #nav-tray-portal a { color:var(--cp-ink) !important; font-weight:600 !important; text-decoration:none !important; }
:root.cp-look #nav-tray-portal a:hover { color:var(--cp-accent) !important; }
:root.cp-look #nav-tray-portal li a { display:-webkit-box !important; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; }`);
    // Histórico recente tray: the item's icon in an accent chip, its course line quiet
    if (L) out.push(`:root.cp-look #nav-tray-portal li i[class^="icon-"] { display:inline-grid; place-items:center; width:28px; height:28px; border-radius:8px; color:var(--cp-accent) !important; background:color-mix(in srgb, var(--cp-accent) 12%, transparent); }
:root.cp-look #nav-tray-portal [id^="history_list_"] { color:var(--cp-muted) !important; margin-top:2px; }
:root.cp-look #nav-tray-portal .time_ago_date { color:var(--cp-muted) !important; }`);
    // Caixa de entrada (/conversations; canvas-lms ui/features/inbox data-testids): toolbar on paper, conversations as calm rows
    if (L) out.push(`:root.cp-look [data-testid="tool-bar"] { background:var(--cp-paper) !important; border-bottom:1px solid var(--cp-line) !important; }
:root.cp-look [data-testid="conversationListItem-Item"] { border-bottom:1px solid var(--cp-line) !important; transition:background-color .15s; }
:root.cp-look [data-testid="conversationListItem-Item"]:hover { background:color-mix(in srgb, var(--cp-accent) 6%, transparent) !important; }
:root.cp-look [data-testid="last-message-content"] { color:var(--cp-muted) !important; }`);
    // The course page's right column (canvas-lms courses/_course_show_secondary, the planner ToDoSidebar, _group_list,
    // _recent_feedback): buttons as cards, quiet section titles, items as small cards; the course name on every item hidden
    // on course pages (they are all this course).
    const RS = ":root.cp-look #right-side";
    if (L) out.push(`${RS} .course-options { display:grid; gap:8px; margin-bottom:6px; }
${RS} .button-sidebar-wide { display:flex !important; align-items:center; gap:10px; width:100% !important; box-sizing:border-box; margin:0 !important; padding:10px 14px !important; border-radius:12px !important;
  border:1px solid var(--cp-line) !important; background:var(--cp-card) !important; color:var(--cp-ink) !important; font-weight:600 !important; text-align:left !important; box-shadow:none !important; text-decoration:none !important; }
${RS} .button-sidebar-wide:hover { border-color:var(--cp-accent) !important; color:var(--cp-accent) !important; }
${RS} .button-sidebar-wide [class^="icon-"] { color:var(--cp-accent); }
${RS} :is(h2, h3, .todo-list-header) { font-size:11.5px !important; font-weight:700 !important; letter-spacing:.07em !important; text-transform:uppercase !important; color:var(--cp-muted) !important; border:0 !important; margin:22px 0 8px !important; padding:0 !important; }
${RS} :is(.ToDoSidebarItem, .to-do-list > li, .group_list > li, .event) { padding:10px 12px !important; margin:0 0 8px !important; border:1px solid var(--cp-line) !important; border-radius:12px !important; background:var(--cp-card) !important; list-style:none; }
${RS} :is(.ToDoSidebarItem__Title a, .todo-details__title, .event-details__title, .group_list a) { font-weight:600 !important; color:var(--cp-ink) !important; text-decoration:none !important; }
${RS} :is(.ToDoSidebarItem__Title a, .event-details__title, .group_list a):hover { color:var(--cp-accent) !important; }
${RS} :is(.ToDoSidebarItem__Icon, .recent_feedback_icon) { color:var(--cp-accent) !important; }
${RS} :is(ul, ol) { padding-left:0 !important; margin-left:0 !important; } ${RS} li { list-style:none !important; }
${RS} .event-details > * { margin-top:2px; } ${RS} .event-details :is(b, strong) { color:var(--cp-ink); }
:root.cp-look body[class*="context-course_"] #right-side :is(.ToDoSidebarItem__Title + span, .todo-details__context, .event-details__context) { display:none !important; }`);
    // Cursos page (/courses) and Grupos page: headers and spacing in our look (the tables are styled above)
    if (L) out.push(`:root.cp-look :is(.ic-Action-header, .page_header_container) { border-bottom:1px solid var(--cp-line) !important; padding-bottom:10px; margin-bottom:16px; }
:root.cp-look :is(#my_courses_table, #past_enrollments_table, #future_enrollments_table, #my_groups_table) { margin:6px 0 26px !important; }
:root.cp-look .course-list-term-column, :root.cp-look .course-list-group-column { color:var(--cp-muted) !important; font-size:13px; }`);
    // the classic dashboard: our panel sits between its header and the course cards; its side column (to do, coming up:
    // our week shows them) goes away while our panel is there
    out.push(`${W}.cp-has-panel #right-side-wrapper { display:none !important; } ${W}.cp-has-panel #DashboardCard_Container { margin-top:6px; }`);
    // Only on the dashboard (quizzes, grades and assignments keep their side column: timers, totals and submissions live there).
    // limpo: the side column, footer, activity stream and card icons go; foco: also the course cards, once our panel is drawn
    const D = ":root.cp-dash-page";
    if (cards.mode === "limpo" || cards.mode === "foco") out.push(`${D} :is(#right-side-wrapper, #right-side, #footer, .recent_activity, #dashboard-activity, .ic-DashboardCard__action-container) { display:none !important; }
${D} .ic-Layout-contentMain { max-width:1180px; margin-left:auto !important; margin-right:auto !important; }`);
    if (cards.mode === "foco") out.push(`${D}.cp-has-panel #cp-scroll { display:none !important; }`);   // Foco keeps the course cards (with their grades)
    // the whole Canvas follows the mode: Limpo and Foco drop footers everywhere and, on a course's home and modules pages, the
    // side column (our course panel has what comes next and the announcements); Foco also folds the course menu (content.js)
    if (cards.mode === "limpo" || cards.mode === "foco") out.push(`:root :is(#footer, .ic-app-footer) { display:none !important; }
:root.cp-course-page #right-side-wrapper { display:none !important; }`);
    // Canvas's own card layout (262px cards in .ic-DashboardCard__box__container, canvas-lms dashboard_card.scss) is kept;
    // the rows are only centered and balanced (2 side by side, 4 as 2+2, 5-6 as 3+3) by the width of the box
    out.push(`.ic-DashboardCard__box__container { text-align:center; } .ic-DashboardCard__box__container > * { text-align:left; } .ic-DashboardCard__header_content { min-height:96px; } .ic-DashboardCard__header-term { display:none !important; } .ic-DashboardCard__header { position:relative; }   /* the term repeats on every card */
:root.cp-has-panel #DashboardCard_Container { padding-top:28px; }
:root.cp-notes-open #DashboardCard_Container { display:flow-root; }   /* beside the Anotações column as one block: the cards do not wrap around it */
.ic-Dashboard-header__layout .cp-off { display:none !important; }   /* the Caderno+ bar took the place of Canvas's switch to its new view */   /* its cards' row has a negative top margin: keep it off our panel */
:root.cp-dash-page .ic-DashboardCard__box { max-width:calc(var(--cp-cols, 4) * 298px - 24px); margin-left:auto !important; margin-right:auto !important; }`);
    if (!cards.cardImg) out.push(`.ic-DashboardCard__header_image { background-image:none !important; height:72px !important; } .ic-DashboardCard__header_hero { opacity:1 !important; height:72px !important; }`);
    if (L) {
      const [paper, card, ink, muted, line, accent, link, menu] = L;
      const B = BGS[cards.bg];   // the same fixed background on every page layer, so the nested layers line up
      if (B) out.push(`:root.cp-look :is(body, #application, #wrapper, #main, .ic-Layout-wrapper, .ic-Layout-contentMain, #content-wrapper, #right-side-wrapper, #right-side, .ic-Dashboard-header, .ic-Dashboard-header :is(div, span, header):not(.cp-host, button *, [role="button"] *)) { background-image:${B[0]} !important; background-size:${B[1]} !important; background-attachment:fixed !important; }`);
      out.push(`:root.cp-look { --cp-paper:${paper}; --cp-card:${card}; --cp-ink:${ink}; --cp-muted:${muted}; --cp-line:${line}; --cp-accent:${accent};
  --ic-brand-primary:${accent} !important; --ic-link-color:${link} !important; --ic-brand-font-color-dark:${ink} !important;
  --ic-brand-button--primary-bgd:${accent} !important; --ic-brand-button--primary-text:#FFFFFF !important;
  --ic-brand-button--secondary-bgd:${card} !important; --ic-brand-button--secondary-text:${ink} !important; --cp-menu:${menu}; }
:root.cp-look body, :root.cp-look #application, :root.cp-look #wrapper, :root.cp-look #main, :root.cp-look .ic-Layout-wrapper,
:root.cp-look .ic-Layout-contentMain, :root.cp-look #content-wrapper, :root.cp-look #right-side-wrapper, :root.cp-look #right-side { background-color:var(--cp-paper) !important; color:var(--cp-ink); }
:root.cp-look :is(.ic-Dashboard-header, .ic-Dashboard-header :is(div, span, header):not(.cp-host, button *, [role="button"] *)) { background-color:var(--cp-paper) !important; }   /* its React header paints its own white box */
:root.cp-look :is(.ic-app-nav-toggle-and-crumbs, #breadcrumbs, .header-bar, #context_modules_sortable_container, .item-group-container) { background-color:transparent !important; border-color:var(--cp-line) !important; }
:root.cp-look :is(.context_module, .item-group-condensed .ig-row, .context_module_item) { background-color:var(--cp-card) !important; border-color:var(--cp-line) !important; }
:root.cp-look .item-group-condensed .ig-header { background-color:color-mix(in srgb, var(--cp-card) 70%, var(--cp-paper)) !important; border-color:var(--cp-line) !important; }   /* modules: Canvas paints them white and #f2f4f4; here they take the look (and its dark tint) */
:root.cp-look #context_modules .context_module.item-group-condensed { padding:0 !important; }
:root.cp-look #context_modules .context_module .ig-header { margin-top:0 !important; }   /* its 15px top margin showed as a dark strip over each module */
:root.cp-look .ic-DashboardCard { border-radius:14px; overflow:hidden; border:1px solid var(--cp-line); background:var(--cp-card); box-shadow:0 1px 2px rgba(29,36,51,.06); transition:transform .18s, box-shadow .18s; }
:root.cp-look .ic-DashboardCard__header_content { background:var(--cp-card) !important; }
:root.cp-look .ic-DashboardCard:hover { transform:translateY(-2px); box-shadow:0 10px 24px -14px rgba(29,36,51,.45); }
:root.cp-look :is(.Button, .btn, button.ui-button) { border-radius:10px; }
:root.cp-look :is(.ic-Dashboard-header__layout, .ic-app-nav-toggle-and-crumbs, .page-header) { border-color:var(--cp-line) !important; }
:root.cp-look #section-tabs li a { border-left:0 !important; border-radius:10px !important; padding:7px 12px 7px 10px !important; display:flex !important; align-items:center; gap:10px; margin:1px 0 !important; color:var(--cp-ink) !important; transition:background-color .15s; }
:root.cp-look #section-tabs li a::before { content:""; flex:none; width:16px; height:16px; background:currentColor; opacity:.55; -webkit-mask:no-repeat center / contain; mask:no-repeat center / contain; -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12'/></svg>"); }
:root.cp-look #section-tabs li a.active::before, :root.cp-look #section-tabs li a:hover::before { opacity:1; color:var(--cp-accent); }
:root.cp-look #section-tabs li a.active { box-shadow:inset 3px 0 0 var(--cp-accent); }
:root.cp-look #section-tabs-header-subtitle { display:block; margin:0 0 8px 10px; font-size:11px !important; font-style:normal !important; letter-spacing:.04em; text-transform:uppercase; color:var(--cp-muted) !important; }
:root.cp-look #section-tabs a.home::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 7.5 8 3l5.5 4.5V13H9.5v-3h-3v3H2.5z'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 7.5 8 3l5.5 4.5V13H9.5v-3h-3v3H2.5z'/></svg>"); }
:root.cp-look #section-tabs a.announcements::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 6.5v3h2l5 3v-9l-5 3zM12 6a3 3 0 0 1 0 4'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 6.5v3h2l5 3v-9l-5 3zM12 6a3 3 0 0 1 0 4'/></svg>"); }
:root.cp-look #section-tabs a.modules::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 4h11M2.5 8h11M2.5 12h11'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 4h11M2.5 8h11M2.5 12h11'/></svg>"); }
:root.cp-look #section-tabs a.assignments::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h8v11H4zM6 6h4M6 9h4M6 12h2'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h8v11H4zM6 6h4M6 9h4M6 12h2'/></svg>"); }
:root.cp-look #section-tabs a.quizzes::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h8v11H4zM6.3 6.2a1.7 1.7 0 1 1 2.4 1.6c-.5.3-.7.6-.7 1.2M8 11.3v.1'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h8v11H4zM6.3 6.2a1.7 1.7 0 1 1 2.4 1.6c-.5.3-.7.6-.7 1.2M8 11.3v.1'/></svg>"); }
:root.cp-look #section-tabs a.grades::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 13V8M6.5 13V5M10 13V9M13.5 13V3'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 13V8M6.5 13V5M10 13V9M13.5 13V3'/></svg>"); }
:root.cp-look #section-tabs a.discussions::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 3.5h8v6h-4l-2.5 2v-2h-1.5zM10.5 6.5h3v5H12v1.5L10 11.5H8'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 3.5h8v6h-4l-2.5 2v-2h-1.5zM10.5 6.5h3v5H12v1.5L10 11.5H8'/></svg>"); }
:root.cp-look #section-tabs a.syllabus::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 3h4.5v10.5H3zM8.5 3H13v10.5H8.5z'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M3 3h4.5v10.5H3zM8.5 3H13v10.5H8.5z'/></svg>"); }
:root.cp-look #section-tabs a.pages::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12'/></svg>"); }
:root.cp-look #section-tabs a.files::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 4.5h4l1.5 1.5h5.5v7h-11z'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 4.5h4l1.5 1.5h5.5v7h-11z'/></svg>"); }
:root.cp-look #section-tabs a.people::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 13c0-2 1.6-3.5 3.5-3.5S9.5 11 9.5 13M10.5 7.5a1.7 1.7 0 1 0 0-3.4M11.5 9.6c1.2.4 2 1.6 2 3.4'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2.5 13c0-2 1.6-3.5 3.5-3.5S9.5 11 9.5 13M10.5 7.5a1.7 1.7 0 1 0 0-3.4M11.5 9.6c1.2.4 2 1.6 2 3.4'/></svg>"); }
:root.cp-look #section-tabs a.collaborations::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6.5 9.5l3-3M7 5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11l-1 1A2.5 2.5 0 0 1 4.5 8.5l1-1'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6.5 9.5l3-3M7 5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11l-1 1A2.5 2.5 0 0 1 4.5 8.5l1-1'/></svg>"); }
:root.cp-look #section-tabs a.conferences::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 4.5h8v7h-8zM10.5 7l3-2v6l-3-2'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M2.5 4.5h8v7h-8zM10.5 7l3-2v6l-3-2'/></svg>"); }
:root.cp-look #section-tabs a.outcomes::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'/></svg>"); }
:root.cp-look #section-tabs a[class*="context_external_tool"]::before { -webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6 2.5h4v2a1.5 1.5 0 1 1 0 3v2h-2a1.5 1.5 0 1 0-3 0H2.5v-4h2a1.5 1.5 0 1 0 0-3h1.5z'/></svg>"); mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'><path d='M6 2.5h4v2a1.5 1.5 0 1 1 0 3v2h-2a1.5 1.5 0 1 0-3 0H2.5v-4h2a1.5 1.5 0 1 0 0-3h1.5z'/></svg>"); }
:root.cp-look #section-tabs li a:hover { background:color-mix(in srgb, var(--cp-accent) 8%, transparent) !important; text-decoration:none !important; }
:root.cp-look #section-tabs li a.active { background:color-mix(in srgb, var(--cp-accent) 15%, transparent) !important; font-weight:650 !important; }
:root.cp-look .context_module { border:1px solid var(--cp-line) !important; border-radius:14px !important; overflow:hidden; background:var(--cp-card) !important; margin-bottom:14px !important; box-shadow:0 1px 2px rgba(29,36,51,.05); }
:root.cp-look .context_module > .ig-header { background:var(--cp-paper) !important; border:0 !important; border-bottom:1px solid var(--cp-line) !important; padding:10px 14px !important; font-weight:600; min-height:0 !important; height:auto !important; display:flex !important; align-items:center; }
:root.cp-look .context_module .context_module_item { margin:0 !important; } :root.cp-look .context_module .ig-row { border:0 !important; border-top:1px solid var(--cp-line) !important; background:none !important; }
:root.cp-look .context_module .context_module_item:first-child .ig-row { border-top:0 !important; }
:root.cp-look .context_module .ig-row { border-color:var(--cp-line) !important; transition:background-color .15s; }
:root.cp-look .context_module > .footer:not(:has(*:not(:empty))) { display:none !important; }   /* the empty band under each module */
:root.cp-look .context_module_item:hover .ig-row { background:color-mix(in srgb, var(--cp-accent) 5%, transparent) !important; }
`);
      if (look === "contraste") out.push(`:root.cp-look #content a:not(.ic-DashboardCard__link) { text-decoration:underline; } :root.cp-look .ic-DashboardCard__header-title { text-decoration:underline; } :root.cp-look .ic-DashboardCard { border-width:2px; }`);
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
  // a course's home or modules page (not quizzes, assignments or grades, where the side column holds timers and totals)
  if (typeof location !== "undefined" && /^\/courses\/\d+(\/modules)?\/?$/.test(location.pathname || "")) document.documentElement.classList.toggle("cp-course-page", true);
  const style = document.createElement("style"), look = document.createElement("style");
  style.id = "cp-theme"; look.id = "cp-look";
  style.textContent = `html.cp-dark { background:#fff !important; filter:${BACK} contrast(.9); }
html.cp-dark.cp-dim { filter:${BACK} contrast(.78) brightness(1.08); }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .ic-app-header, .mobile-header, #mobile-header, .ic-DashboardCard__header_hero, [style*="background-image"]) { filter:${BACK}; }
html.cp-dark :is(img, video, picture, canvas, iframe, embed, object, .ic-app-header, .ic-DashboardCard__header_hero, [style*="background-image"]) :is(img, video, picture, canvas, [style*="background-image"], .ic-DashboardCard__header_hero) { filter:none; }`;
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
    const next = css(p.look, p.nav, p, on); if (look.textContent !== next) look.textContent = next;   // the same 15 KB again would restyle the page for nothing
    cl.toggle("cp-mode-limpo", p.mode === "limpo"); cl.toggle("cp-mode-foco", p.mode === "foco");
    cl.toggle("cp-look", !!LOOKS[p.look]); cl.toggle("cp-look-nav", p.nav !== "original" && (!!NAV[p.nav] || !!LOOKS[p.look]));
  };
  const take = prefs => {
    p = cpPrefs(prefs); apply();
    try { localStorage.setItem("cp-look", JSON.stringify({ theme: p.theme, look: p.look, bg: p.bg, bgColor: p.bgColor, nav: p.nav, mode: p.mode, native: p.native, cardImg: p.cardImg, nativeCal: p.nativeCal, navHide: p.navHide })); } catch (e) { /* no storage */ }
  };
  apply();
  setInterval(() => { if (p.theme === "night") apply(); }, 5 * 60 * 1000);
  chrome.storage.local.get("prefs").then(({ prefs }) => take(prefs));
  chrome.storage.onChanged.addListener((ch, area) => { if (area === "local" && ch.prefs) take(ch.prefs.newValue); });
  dark.addEventListener("change", apply);
})();
