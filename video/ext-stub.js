// Video only: the calculator page (app.html, in an iframe of video/scene.html) reads the same stubbed chrome.storage as the scene.
window.chrome = window.parent.chrome;
