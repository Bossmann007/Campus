// Caderno+ settings, shared by the popup, the Canvas page scripts and the service worker. Stored in chrome.storage.local "prefs".
const CP_DEFAULTS = { mode: "completo", theme: "off", look: "caderno", bg: "liso", bgColor: "", nav: "tema", grades: true, files: true, week: true, news: true, remind: true, search: true, newgrades: true, summary: true, scroll: true, inbox: true, cardImg: true, cardPct: false, tasks: true, kpiCourse: "", changes: true, meta: "7", native: true, calendar: true, nativeCal: false, navHide: false, cardsFirst: false, dash: true, dlFolder: "PUCPR", turma: null };   // theme (dark mode): off | dark | dim | auto | night; mode: completo | limpo | foco; look: caderno | kraft | marca | menta | oceano | pastel | grafite | contraste | original; nav: tema | tinta | coral | verde | azul | roxo | original;
const cpPrefs = p => Object.assign({}, CP_DEFAULTS, p && typeof p === "object" ? p : {});
// The downloads folder inside the browser's Downloads (Chrome cannot save elsewhere): up to 3 levels of plain names; "PUCPR" otherwise.
const cpFolder = raw => {
  const parts = String(raw == null ? "" : raw).split("/").map(x => x.replace(/[<>:"\\|?*~\u0000-\u001f]/g, "").trim().replace(/[.\s]+$/, ""))   // no trailing dots or spaces (Windows)
    .filter(x => x && x !== "." && x !== "..").map(x => /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(x) ? x + "_" : x);
  return parts.length && parts.length <= 3 && parts.every(x => x.length <= 60 && !/^\.+$/.test(x)) ? parts.join("/") : "PUCPR";
};
