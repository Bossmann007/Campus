# Como ajudar

Obrigado por querer ajudar! Tudo é HTML, CSS e JavaScript puro: não há build nem dependências.

## Antes de começar

- Precisa de Node.js 20 ou mais novo e Python 3.
- Rode `./scripts/verify`. Ele precisa terminar sem erro antes e depois da sua mudança.

## Onde fica cada coisa

- `index.html`: a página inteira. O bloco `<script id="core">` tem os pesos das matérias e as contas; o `<script id="ui">` desenha a tela.
- `extension/`: a extensão do Chrome. Para testar, abra `chrome://extensions`, ligue o modo do desenvolvedor e use "Carregar sem compactação" nessa pasta.
- `tests/`: os testes que o `scripts/verify` roda.
- `canvas/mapping.json`: qual avaliação do Canvas vira qual item da calculadora.

## Mudanças mais úteis

- **Peso ou data errados:** abra uma issue com o trecho do Plano de Ensino ou o aviso do professor. Cada item no código tem a fonte do peso (`wSrc`) e da data (`dateSrc`).
- **Outra turma ou matéria:** os nomes das avaliações no Canvas mudam entre turmas. Mande os nomes (sem as suas notas).
- **Bugs e melhorias de tela:** descreva o que esperava e o que aconteceu, com o navegador.

## Regras

- Nunca coloque notas reais, nomes de colegas, tokens ou cookies em issues, commits ou testes. Use notas inventadas.
- Mudança de conta precisa de teste em `tests/notas-test.js`.
- A página não pode chamar nenhum servidor: a política de segurança (CSP) bloqueia rede, e isso é de propósito.
- Abra um pull request para `main`; o teste automático precisa passar.
