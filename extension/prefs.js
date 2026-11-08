// Caderno+ settings, shared by the popup, the Canvas page scripts and the service worker. Stored in chrome.storage.local "prefs".
const CP_DEFAULTS = { theme: "off", grades: true, files: true, week: true, news: true, remind: true, search: true, newgrades: true, summary: true, scroll: true, inbox: true };   // theme: off | dark | dim | auto | night
const cpPrefs = p => Object.assign({}, CP_DEFAULTS, p && typeof p === "object" ? p : {});
