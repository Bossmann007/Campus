# Quanto falta for every PUCPR course, from the Centro de Notas

Status: draft, 2026-11-09. Decided by Enzo: no server; the Centro de Notas formulas are the source.

## Goal

Quanto falta in every course of every PUCPR student, with the formula the professor set, instead of rule packs
written by hand for one turma (today only CC manhã). Rule packs stay as the fallback.

## Facts checked (2026-11-09)

- The Centro de Notas is an LTI 1.1 tool of PUCPR (`ca-centro-notas-es-prd.lemonfield-d7b6934d.brazilsouth.
  azurecontainerapps.io/lti`), a course tab "Centro de Notas" in all 6 of Enzo's courses (`/api/v1/courses/:id/tabs`).
  Read with Enzo's Canvas token through `sessionless_launch` → the launch form → POST `/lti` → GET `/lti/finalize`
  (XHR) → GET `/curso/:id` with `X-Inertia: true` → JSON `props.curso`.
- `props.curso`: `grupos[].grupo_colunas[].coluna` and `colunas[]` (the `final` column). A column has `tipo_coluna`
  (`padrao`, `calculo`, `grupo`, `recuperacao_grupo`, `final_grupo`, `final`), `tipo_calculo` (`minimo`, `maximo`,
  `media_aritmetica`, `media_ponderada`, `total`), children in `colunas_associadas_pai[]` with
  `pivot.peso_coluna_filho`, `atividade.pontos_possiveis`, `atividade.omitir_nota_final`, `publicacao_nota`, and the
  student's `notas[]` (`nota` as "1,10", `avaliacao_estado`, `entrega_estado`). Synced from Canvas (`last_sync_canvas`).
- Formulas seen: Imperativa (Nota Final = weighted RA1 40 / RA2 60; RA1 = prova 75 + exercícios 25, exercícios =
  arithmetic mean of TDEs and PBLs; RA2 with a recovery column), RPND (weighted per RA, recovery, `maximo`). BD, Web,
  Ética, Conectividade: no formula, `final` without `tipo_calculo`; points sum to 8.25, 5.8, 40 and 16 so far.
- An extension service worker can run the same flow with the student's Canvas session, no token, no Canvas tab: the
  tool's session cookie is stored and sent back (Chrome for Testing 156 and Brave 157 against a stand-in Canvas and
  tool, `/tmp/swck`). Not checked against the real Canvas session.

## Ground truth (Enzo's courses, 2026-11-09)

- Formula columns carry the value the Centro de Notas computed in their own `notas[]`. Imperativa: Exercícios (mean)
  10,00; Nota do RA (RA1) = 0,75 × 8 + 0,25 × 10 = 8,50; Nota Final = 0,40 × 8,50 + 0,60 × 0 = 3,40: weights are
  percentages and a part without a grade counts as 0. RPND: Nota do RA 1,43, Recuperação 0,50, Nota Final do RA
  (`maximo`) 1,43, Nota Final 1,08.
- Without a formula (BD, Web, Ética, Conectividade) the `final` column has no value: the Centro de Notas computes
  nothing there, and the points do not add up to a grade (Conectividade: 9,97 of grades on 3,00 graded points, from
  0-point items with grades). For these courses the rule pack (when it exists) or Canvas stays the source.
- So the Centro de Notas solves "only my course" for every course whose professor set a formula (2 of Enzo's 6),
  not for all.

- Imperativa, rule vs Centro (2026-11-09, real grades): both give 3,40 earned and 3,60 missing with RA2 worth 6 points.
  The rule pack says "precisa 7,2" (the RA2 exercises, 1 point, are past due and ungraded, so it asks the 3,6 from the
  5 future points); the Centro engine says "precisa 6,0" (the same grade on all 6 points). The hidden RA2 formula counts
  PBL06–10, which sit in the default group: a hidden formula's members are not knowable, so its result is always approx.

## Engine (`core.js`, shared with the MCP)

`centroGrade(curso, notas)`: evaluates the tree bottom-up. Leaves (`padrao`) count only with a published grade and
not `omitir_nota_final`. `centroNeed(curso, meta)`: the lowest uniform fraction of the remaining points on the leaves
without a grade that brings the `final` column to the meta (bisection); "garantido" at 0, "nem com 10" above 1.

## Open (must be settled with real numbers before shipping)

- Scale of a leaf inside a mean when its points are not 10 (Imperativa and RPND leaves are all 10 points). A `final` without a formula: sum of points
  as the grade only when the planned total is 10? Ética (40) and Conectividade (16) say no: compare with what the
  Centro de Notas shows the student (Enzo's screenshot of each course).
- `recuperacao_grupo` and `final_grupo` semantics (replace, maximum, or mean with the RA grade).
- Columns not yet created: the remaining points are unknown when the total is not stated; say "faltam atividades".

## Extension

Optional host permission for the tool host, asked once from the course panel ("Ler o Centro de Notas"). The service
worker runs the flow, caches `centro[user][course]` for 6 hours, and the panels use the engine; then the rule pack;
then Canvas points. Nothing leaves the computer except the requests to Canvas and to PUCPR's own tool.

## MCP

Token mode runs the same flow (`sessionless_launch` with the token) and `quanto_falta` uses the engine.

## End-to-end check

`./scripts/verify` exit 0 with: engine tests on synthetic trees shaped like Imperativa, RPND and BD (no personal
data) matching hand-computed values; the service-worker flow against a stand-in tool; then a canary in Enzo's
browser on the real Canvas, numbers compared with the Centro de Notas page for each of his 6 courses.

## Out of scope

Writing anything to the Centro de Notas or Canvas; courses without the tab (fallback as today).
