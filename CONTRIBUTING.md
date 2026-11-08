# Como ajudar

Obrigado por querer ajudar! Tudo é HTML, CSS e JavaScript puro: não há build nem dependências.

## Antes de começar

- Precisa de Node.js 20 ou mais novo e Python 3.
- Rode `./scripts/verify`. Ele precisa terminar sem erro antes e depois da sua mudança.

## Onde fica cada coisa

- `index.html`: a página inicial (download e favorito). `app.html`: a calculadora, que vai para dentro da extensão. O bloco `<script id="core">` tem os pesos das matérias e as contas; o `<script id="ui">` desenha a tela. Depois de mexer em `app.html` ou na extensão, rode `./scripts/sync-ext-core` e `./scripts/sync-bookmarklet` (o teste acusa se esquecer).
- `extension/`: a extensão Campus+, que roda dentro do Canvas. Para testar, abra `chrome://extensions`, ligue o modo do desenvolvedor e use "Carregar sem compactação" nessa pasta. `extension/core.js` é gerado do `app.html` por `scripts/sync-ext-core`: não edite à mão.
- `tests/`: os testes que o `scripts/verify` roda.
- `canvas/mapping.json`: qual avaliação do Canvas vira qual item da calculadora.

## Mudanças mais úteis

- **Peso ou data errados:** abra uma issue com o trecho do Plano de Ensino ou o aviso do professor. Cada item no código tem a fonte do peso (`wSrc`) e da data (`dateSrc`).
- **Outra turma ou matéria:** os nomes das avaliações no Canvas mudam entre turmas. Mande os nomes (sem as suas notas).
- **Bugs e melhorias de tela:** descreva o que esperava e o que aconteceu, com o navegador.

## Regras

- Nunca coloque notas reais, nomes de colegas, tokens ou cookies em issues, commits ou testes. Use notas inventadas.
- Mudança de conta precisa de teste em `tests/notas-test.js`.
- Nada pode chamar um servidor nosso ou de terceiros: a página tem CSP que bloqueia rede, e a extensão só fala com o próprio Canvas da PUCPR.
- Na extensão, monte a tela com `textContent` (nunca `innerHTML`) e só abra links do Canvas da PUCPR.
- Permissão nova na extensão precisa de motivo na `privacidade.html` e em `store/STORE.md` (o teste confere).
- Abra um pull request para `main` com a saída do `./scripts/verify`.
