// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "4.0.1",
  items: [
    "Menos memória: cada aba do Canvas guarda menos da metade do código de antes, e a leitura salva ficou menor",
    "Sua IA integrada: página nova (botão da extensão, Mais) com o estado do arquivo, perguntas prontas e como conectar",
    "A sua IA agora sabe também seus checklists e tarefas, o que mudou no Canvas, os módulos e os professores",
    "O arquivo para a IA se atualiza sozinho quando você muda um checklist ou uma tarefa",
    "Botão da extensão em abas (Visual, Painel, Avisos, Mais), com a última leitura e o Atualizar no topo",
    "Mais rápido: depois de uma atualização o painel abre na hora, e o Canvas é lido em menos idas",
    "Boas-vindas nova: passos com nome, Pular a qualquer hora e retoma de onde parou",
    "Anotações com checklist em cada matéria e no painel (Alt+N abre); item com dia entra nos próximos 7 dias",
  ],
};
