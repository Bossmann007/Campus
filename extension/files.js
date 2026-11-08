// Where a Canvas file goes inside Downloads: PUCPR/<course>/<kind>/<name>. Kind rules follow the author's canvas_files.py
// (first match wins); the extension cannot see the disk, so it always uses the canonical folder names.
const QFFiles = (() => {
  const BLOCKED = new Set([".app", ".command", ".sh", ".bash", ".zsh", ".csh", ".exe", ".msi", ".dmg", ".pkg", ".bat", ".cmd", ".com",
    ".scr", ".ps1", ".vbs", ".vbe", ".jar", ".apk", ".lnk", ".reg", ".hta", ".wsf", ".wsh", ".cpl", ".msc", ".pif", ".iso", ".img", ".vhd",
    ".docm", ".xlsm", ".pptm"]);
  const IMAGES = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".svg"]);
  const MEDIA = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".mp3", ".m4a", ".wav", ".aac", ".ogg"]);
  const CODE = new Set([".c", ".h", ".cpp", ".java", ".py", ".js", ".ts", ".php", ".sql", ".css", ".json", ".ipynb", ".html", ".xml", ".csv"]);
  const MAX_BYTES = 200 * 1024 * 1024;
  const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\s]+/g, " ").trim();
  const split = name => { const i = name.lastIndexOf("."); return i > 0 ? [name.slice(0, i), name.slice(i).toLowerCase()] : [name, ""]; };
  const two = n => String(Number(n)).padStart(2, "0");

  // Folder inside the course for one file name; "" = the course folder itself.
  function kind(name) {
    const [stem, ext] = split(name), n = norm(stem);
    let m;
    if (/plano ?(de )?ensino|planoensino|cronograma|^\d{4}\.bcc\./.test(n)) return "";   // planos are named "2026.BCC.<course>.pdf" too
    if (n.includes("gabarito")) return "Gabaritos";
    if ((m = /\btde\s*0*(\d+)?\b/.exec(n))) return m[1] ? "TDE" + two(m[1]) : "TDE";
    if ((m = /\bpbl\s*0*(\d+)\b/.exec(n))) return "PBLS/pbl" + two(m[1]);
    if ((m = /^f\s*0*(\d+)\b/.exec(n))) return "Formativas/F" + m[1];   // Ciberfísicos: F29 - ...
    if (/formativa|simulado|\bprova|avaliacao/.test(n)) return "Formativas";
    if (/lista de exercicio|exercicio/.test(n)) return "Exercicios";
    if (/\btexto\b|\bcap\b|capitulo|artigo|leitura|livro|apostila|resumo/.test(n)) return "Textos";
    if (MEDIA.has(ext)) return "Videos";
    if (/\bmodulo|\baula|slide|apresentacao|cscf|^bd\b/.test(n) || [".ppt", ".pptx", ".odp"].includes(ext)) return "Slides";
    if (/\bas\s*\d+|atividade|entrega|trabalho/.test(n)) return "Atividades";
    if (IMAGES.has(ext)) return "Imagens";
    if (CODE.has(ext)) return "Codigo";
    return "Outros";
  }
  // A name chrome.downloads accepts (no path, no reserved characters), or null for blocked executable types.
  function safeName(name) {
    let base = String(name || "").replace(/\\/g, "/").split("/").pop().replace(/[<>:"|?*~\u0000-\u001f]/g, "_").replace(/^[.\s]+|[.\s]+$/g, "");
    if (!base || BLOCKED.has(split(base)[1])) return null;
    let [stem, ext] = split(base);
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem)) stem += "_";   // Windows reserved names: Chrome refuses them everywhere
    if (stem.length > 150) stem = stem.slice(0, 150).trim();
    return stem + ext;
  }
  // Our course name when the Canvas course (by id when known, else by name) has rules (any turma), else the Canvas name without
  // turma and semester.
  function courseFolder(canvasName, courses, canvas, cid) {
    const ours = courses.find(c => canvas[c.id] && (cid != null ? canvas[c.id].cids.some(x => String(x) === String(cid)) : canvasName.startsWith(canvas[c.id].match)));
    return safeName(ours ? ours.name : canvasName.split(" (")[0].split(" - ")[0]) || "Curso";
  }
  // Downloads-relative path, or null when the file must not be saved (blocked type or too big).
  function target(canvasName, file, courses, canvas, cid) {
    const name = safeName(file.display_name || file.filename);
    if (!name || file.size > MAX_BYTES) return null;
    const k = kind(name);
    return "PUCPR/" + courseFolder(canvasName, courses, canvas, cid) + "/" + (k ? k + "/" : "") + name;
  }
  return { kind, safeName, courseFolder, target, MAX_BYTES };
})();
