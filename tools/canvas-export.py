#!/usr/bin/env python3
"""Export your PUCPR Canvas grades with your own Canvas API token, for the Quanto falta paste box.

Runs on your computer and only sends read-only GET requests to pucpr.instructure.com.
The token is read from CANVAS_TOKEN, then from a .env file next to this script or in the current folder
(see .env.example), then from a hidden prompt. It is never printed or saved by the script.

  python3 canvas-export.py > notas.json        # then paste the file's text into "Copiei o texto"
  python3 canvas-export.py | pbcopy            # macOS: straight to the clipboard

Create a token in Canvas: Conta > Configurações > "+ Novo token de acesso". Delete it when you are done.
"""
import datetime, getpass, json, os, re, sys, urllib.error, urllib.request
from urllib.parse import urlsplit

BASE = "https://pucpr.instructure.com"
SEMESTER = "2026 / 2"   # NotasCore.TERM in app.html
OFFLINE = re.compile(r"^(on_paper|none|not_graded)$")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never follow a redirect: the Authorization header must not go to another host."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "o Canvas redirecionou para " + urlsplit(newurl).netloc + "; parei", headers, fp)


OPENER = urllib.request.build_opener(NoRedirect)


def get(token, url):
    out = []
    while url:
        if urlsplit(url).netloc != urlsplit(BASE).netloc:
            sys.exit("o Canvas indicou uma página fora do Canvas; parei")
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
        with OPENER.open(req, timeout=30) as r:
            out += json.loads(r.read().decode().removeprefix("while(1);"))
            m = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link") or "")
        url = m.group(1) if m else None
    return out


def assignment(a):
    s = a.get("submission") or {}
    types = a.get("submission_types")
    return {
        "name": a.get("name"),
        "points": a.get("points_possible"),
        "score": s.get("score") if isinstance(s.get("score"), (int, float)) else None,
        "due": a.get("due_at"),
        "missing": bool(s.get("missing")),
        "submitted": bool(s.get("submitted_at") or re.match(r"^(submitted|graded|pending_review)$", s.get("workflow_state") or "")),
        "online": not isinstance(types, list) or any(not OFFLINE.match(t) for t in types),
        "stats": {k: st.get(k) for k in ("mean", "min", "max")} if isinstance(st := a.get("score_statistics"), dict) and isinstance(st.get("mean"), (int, float)) else None,
    }


def env_token():
    """CANVAS_TOKEN from a .env next to the script or in the current folder (KEY=VALUE lines, # comments)."""
    for folder in (os.path.dirname(os.path.abspath(__file__)), os.getcwd()):
        path = os.path.join(folder, ".env")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                for line in f:
                    key, sep, value = line.strip().partition("=")
                    if sep and key.strip() == "CANVAS_TOKEN" and value.strip():
                        return value.strip().strip('"').strip("'")
    return None


def main():
    token = os.environ.get("CANVAS_TOKEN") or env_token() or getpass.getpass("Token da API do Canvas (não aparece na tela): ")
    if not token.strip():
        sys.exit("sem token")
    try:
        courses = [c for c in get(token, BASE + "/api/v1/courses?enrollment_state=active&per_page=100")
                   if isinstance(c.get("name"), str) and SEMESTER in c["name"]]
        data = {"v": 1, "ext": "script", "courses": [
            {"id": c["id"], "name": c["name"], "assignments": [assignment(a) for a in get(token, f"{BASE}/api/v1/courses/{c['id']}/assignments?include[]=submission&include[]=score_statistics&per_page=100")]}
            for c in courses]}
        since = (datetime.date.today() - datetime.timedelta(days=60)).isoformat()
        until = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()   # Canvas caps the window when end_date is left out
        by_code = {f"course_{c['id']}": c for c in courses}
        try:
            an = get(token, BASE + "/api/v1/announcements?" + "&".join(f"context_codes[]=course_{c['id']}" for c in courses) + f"&start_date={since}&end_date={until}&per_page=50") if courses else []
            data["announcements"] = [{"course": by_code.get(a.get("context_code"), {}).get("name", ""), "courseId": by_code.get(a.get("context_code"), {}).get("id"), "title": a.get("title"), "at": a.get("posted_at"),
                                      "unread": a.get("read_state") == "unread", "url": a.get("html_url")} for a in an[:50]]
        except (urllib.error.URLError, ValueError):   # announcements are optional: keep the grades
            data["announcements"] = None
    except urllib.error.HTTPError as e:
        sys.exit(f"o Canvas respondeu {e.code}" + (": confira o token" if e.code == 401 else f" ({e.msg})" if 300 <= e.code < 400 else ""))
    except (urllib.error.URLError, ValueError) as e:
        sys.exit(f"não consegui ler o Canvas: {e}")
    print(json.dumps(data, ensure_ascii=False))
    print(f"{len(courses)} matérias lidas. Cole o texto no Quanto falta.", file=sys.stderr)


if __name__ == "__main__":
    main()
