# Como ajudar

Obrigado por querer ajudar! Tudo é HTML, CSS e JavaScript puro: não há build nem dependências.

## Antes de começar

- Precisa de Node.js 20 ou mais novo e Python 3.
- Rode `./scripts/verify`. Ele precisa terminar sem erro antes e depois da sua mudança.

## Onde fica cada coisa

- `index.html`: a página inicial (download e favorito). `app.html`: a calculadora, que vai para dentro da extensão. O bloco `<script id="core">` tem as contas, e os pesos vêm das regras em `rules/` (embutidas entre os marcadores `/*RULES*/` por `scripts/sync-rules`); o `<script id="ui">` desenha a tela. Depois de mexer em `app.html` ou na extensão, rode `./scripts/sync-ext-core` e `./scripts/sync-bookmarklet` (o teste acusa se esquecer).
- `extension/`: a extensão Caderno+, que roda dentro do Canvas. Para testar, abra `chrome://extensions`, ligue o modo do desenvolvedor e use "Carregar sem compactação" nessa pasta. `extension/core.js` é gerado do `app.html` por `scripts/sync-ext-core`: não edite à mão.
- `tests/`: os testes que o `scripts/verify` roda.
- `rules/<semestre>/<turma>.json`: as regras de cada turma (pesos, datas e quais tarefas do Canvas viram cada avaliação). O formato está em `rules/schema.json`. (`canvas/mapping.json` é o levantamento original da turma de `rules/2026-2/cc-manha.json`; as regras valem a partir de `rules/`.)

## Adicionar uma turma

O Quanto falta calcula as notas das turmas que têm um arquivo de regras em `rules/<semestre>/` (formato em [`rules/schema.json`](rules/schema.json)). Por enquanto, turma nova entra pelas mãos de um mantenedor, como um arquivo desses conferido pelo `./scripts/verify`. Sem esse arquivo, quanto falta usa a fórmula do professor no Centro de Notas ou a regra que o próprio aluno monta na extensão (os pontos do Canvas que contam), que fica só no computador dele. Um jeito de transformar isso num arquivo de regras está planejado (SPEC.md, fase 9), mas ainda não existe.

Para montar o arquivo:

1. Copie `rules/2026-2/cc-manha.json` para `rules/<semestre>/<sua-turma>.json` (nome com letras minúsculas, números e hífen, ex.: `si-noite.json`).
2. Preencha `turma` e, para cada matéria: `id` (letras minúsculas e números, único no semestre: comece com uma sigla da turma, ex. `sinbd`), `name` (como começa no Canvas), `short`, `canvasIds` (o número em `pucpr.instructure.com/courses/<número>`), `formula`, `src` e as avaliações em `items`. Cada `max` é quanto a avaliação vale na nota final; a soma da matéria dá 10. Toda avaliação tem a fonte do peso (`wSrc`) e da data (`dateSrc`).
3. Opcional: `canvas.items` diz quais tarefas do Canvas viram cada avaliação (`one`, `avg` ou `sum` com `factor`). Sem isso, o aluno lança a nota à mão.
4. Rode `./scripts/check-rules` (diz o arquivo e o campo de cada problema), depois `./scripts/sync-ext-core` e `./scripts/sync-bookmarklet`, e por fim `./scripts/verify`.
5. Abra o pull request com a saída do `./scripts/verify` e o link ou trecho do Plano de Ensino.

Semestre novo vai numa pasta nova (`rules/2027-1/`). O core guarda um semestre só, o da pasta mais nova; enquanto o semestre anterior não acabou (`termEnd`), o `scripts/sync-rules` para com erro, a não ser que a troca seja de propósito: `CP_RULES_NEW_TERM=1 ./scripts/sync-ext-core`.

Os ids das turmas que já existem não mudam: as notas salvas e os backups usam `matéria:avaliação`.

## Mudanças mais úteis

- **Peso ou data errados:** abra uma issue com o trecho do Plano de Ensino ou o aviso do professor. Cada avaliação em `rules/` tem a fonte do peso (`wSrc`) e da data (`dateSrc`).
- **Outra turma ou matéria:** veja [Adicionar uma turma](#adicionar-uma-turma). Mande só nomes de avaliações, pesos e datas, nunca notas.
- **Bugs e melhorias de tela:** descreva o que esperava e o que aconteceu, com o navegador.

## Regras

- Nunca coloque notas reais, nomes de colegas, tokens ou cookies em issues, commits ou testes. Use notas inventadas.
- Mudança de conta precisa de teste em `tests/notas-test.js`. Os números da turma de `cc-manha` são conferidos por `tests/rules-golden.js`: se você mudou de propósito as regras dessa turma ou as contas, regenere com `node tests/rules-golden.js app.html --write` e explique no PR.
- Nada pode chamar um servidor nosso ou de terceiros: a página tem CSP que bloqueia rede, e a extensão só fala com o próprio Canvas da PUCPR.
- Na extensão, monte a tela com `textContent` (nunca `innerHTML`) e só abra links do Canvas da PUCPR.
- Permissão nova na extensão precisa de motivo na `privacidade.html` e em `store/STORE.md` (o teste confere).
- Abra um pull request para `main` com a saída do `./scripts/verify`.
