// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "3.10.2",
  items: [
    "Fundo do Canvas com a cor do tema, ou a sua cor, e desenhos: pautado, quadriculado, pontilhado e aurora",
    "Modo escuro que mantém a cor do tema",
    "Porcentagem garantida num círculo em cada card de matéria, com quanto ainda falta embaixo",
    "Barra do Caderno+ ao lado do Boa noite, no lugar do botão de visualização",
    "Páginas das matérias com o tema: módulos, cabeçalhos e Plano de Ensino",
    "Marque como feito direto na lista A seguir de cada matéria",
    "Anotações com checklist em cada matéria e no painel, ao lado dos cards (Alt+N abre)",
    "Item do checklist com dia aparece nos próximos 7 dias",
    "Arquivo para a sua IA (beta, desligado de início): o Caderno+ MCP lê o que o painel mostra, sem token",
    "Mais rápido: o painel abre com uma leitura só e menos trabalho na página",
  ],
};
