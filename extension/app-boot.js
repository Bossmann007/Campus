// The Campus+ page inside the extension: hands the last Canvas reading (saved by content.js) and its Canvas user (the calculator
// keeps each user's grades apart) to the calculator, then starts it.
chrome.storage.local.get("cache").then(({ cache }) => {
  window.CP_EXT = { data: cache && cache.data && !cache.data.error ? Object.assign({ ext: chrome.runtime.getManifest().version }, cache.data) : null, at: cache ? cache.at : null, user: cache ? cache.user : null };
  const s = document.createElement("script"); s.src = "app-ui.js"; document.body.appendChild(s);
});
