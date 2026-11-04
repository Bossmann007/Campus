#!/usr/bin/env python3
"""Export your PUCPR Canvas grades with your own Canvas API token, for the Quanto falta paste box.

Runs on your computer and only sends read-only GET requests to pucpr.instructure.com.
The token is read from CANVAS_TOKEN or typed at a hidden prompt; it is never printed or saved.

  python3 canvas-export.py > notas.json        # then paste the file's text into "Copiei o texto"
  python3 canvas-export.py | pbcopy            # macOS: straight to the clipboard

Create a token in Canvas: Conta > Configurações > "+ Novo token de acesso". Delete it when you are done.
"""
import getpass, json, os, re, sys, urllib.request
from urllib.parse import urlsplit

BASE = "https://pucpr.instructure.com"
SEMESTER = re.compile(r"2026 / 2")
OFFLINE = re.compile(r"^(on_paper|none|not_graded)$")


def get(token, url):
    out = []
    while url:
        if urlsplit(url).netloc != urlsplit(BASE).netloc:
            sys.exit("o Canvas indicou uma página fora do Canvas; parei")
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
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
    }


def main():
    token = os.environ.get("CANVAS_TOKEN") or getpass.getpass("Token da API do Canvas (não aparece na tela): ")
    if not token.strip():
        sys.exit("sem token")
    try:
        courses = [c for c in get(token, BASE + "/api/v1/courses?enrollment_state=active&per_page=100")
                   if isinstance(c.get("name"), str) and SEMESTER.search(c["name"])]
        data = {"v": 1, "ext": "script", "courses": [
            {"name": c["name"], "assignments": [assignment(a) for a in get(token, f"{BASE}/api/v1/courses/{c['id']}/assignments?include[]=submission&per_page=100")]}
            for c in courses]}
    except urllib.error.HTTPError as e:
        sys.exit(f"o Canvas respondeu {e.code}" + (": confira o token" if e.code == 401 else ""))
    print(json.dumps(data, ensure_ascii=False))
    print(f"{len(courses)} matérias lidas. Cole o texto no Quanto falta.", file=sys.stderr)


if __name__ == "__main__":
    main()
