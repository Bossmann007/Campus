# SPEC: notas-pucpr, do now to launch

Goal: a public page where any PUCPR 2026/2 classmate sees how much they need on each remaining assessment, with grades imported from Canvas in one click, no token and no server.

## Done means

- `scripts/verify` exits 0: core tests (weights, math, the Canvas mapper) and the UI script parse.
- Enzo runs the bookmarklet on his own Canvas and every imported grade matches what Canvas shows (canary).
- A Vercel preview URL serves only `index.html`; production goes live only after Enzo says "sobe".

## Phases (one at a time; each ends with `scripts/verify` and screenshots)

1. **Canvas names (read-only).** With a read-only Canvas token kept outside the repo (never printed or copied), list each 2026/2 course and its assignment names, points and due dates. Output: `canvas/mapping.json` (course id → our course id; assignment name pattern → our item id). Check: every item in `COURSES` maps to one Canvas assignment, or is listed as "manual" with the reason.
2. **Mapper in the core (TDD).** Pure `fromCanvas(json)` in `<script id="core">` that turns the bookmarklet's JSON into `{ "course:item": "grade" }` in the professor's scale, plus a list of unmatched names. Tests first, in `tests/notas-test.js`: exact match, rescale (Canvas points vs our `inMax`), missing grade, unknown course, merged WEB exam.
3. **Bookmarklet + import UI** (removed 2026-11-04: the site now points only to the extension, phase 4b; the paste box stays for text copied from the popup). A "Importar do Canvas" link to drag to the bookmarks bar; it runs on `pucpr.instructure.com`, calls `/api/v1/courses?enrollment_state=active` (2026/2 only) and `/api/v1/courses/:id/assignments?include[]=submission` with the student's session (same origin), and shows the JSON in a box with a Copiar button. The page gets "Colar notas do Canvas" (paste box; `navigator.clipboard` when allowed), shows what was imported and what was not, and never overwrites a grade without showing it. Check: Enzo canary on his Canvas; screenshots light/dark/mobile.
4. **Hardening.** `blindspot-pass`, `/security-review` (the bookmarklet runs with the student's Canvas session: read-only GETs, no third-party calls, no eval of pasted data), fresh-context `/code-review` for correctness only.
4b. **Chrome extension (MV3, v0.1 built 2026-11-04).** `extension/`: popup injects `collect.js` into the active Canvas tab (`activeTab` + `scripting`, no host permissions) and opens the page with `#canvas=<base64url>` (read locally, removed from the address) or copies the JSON. Prior art checked (decision: build; BetterCanvas is AGPL and stale). Check: `tests/extension-test.js`; canary = Enzo loads it unpacked. v0.3 also carries each due date and Canvas's `missing` flag; the page lists those as "Entregas atrasadas" (a snapshot from the last import). Next versions: Web Store listing, auto-read on Canvas, new-grade notice, badge.
5. **Deploy.** Enzo runs `npx vercel login` once; I deploy a preview (`.vercelignore` whitelists `index.html`), check the URL loads, has no personal data and the CSP header holds. Production only on "sobe".
6. **Launch.** Enzo shares the link with the turma (I draft the message; I never send it).

## Out of scope

- Canvas tokens, OAuth or any server/proxy (tokens give full account access; PUCPR Canvas sends no CORS headers, checked 2026-11-04).
- Other semesters, courses outside the six, recuperação simulation, accounts or sync between devices.

## Open risks (checked in the phase named)

- Canvas CSP or the browser may block bookmarklets (phase 1: read Canvas response headers; phase 3: canary).
- Professors' assignment names may not be stable or may differ per turma (phase 1; unmatched items stay manual).
- `navigator.clipboard.readText` needs a permission prompt; the paste box is the fallback (phase 3).

## Undo

Each phase is one change to `index.html` or `tests/`; `scripts/snapshot` saves the page first. Vercel deploys can be rolled back or deleted from the dashboard.
