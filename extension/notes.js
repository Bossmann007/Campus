// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "6.14.2",
  items: [
    "Escolha uma matéria no painel: a próxima entrega, os números, o gráfico e o cartão do Canvas mostram só ela; dois cliques no nome abrem a matéria",
    "Quanto falta em gráfico: Barras, Falta, Anéis, Entregas ou Lista, você escolhe no quadro e ele lembra; o número de cada matéria é quantos pontos faltam até a sua meta (ex.: +0,5)",
    "Para qualquer curso e turma: cada matéria usa a melhor fonte, nesta ordem: sua regra, a fórmula do professor no Centro de Notas, os pesos do Canvas, o Plano de Ensino, a soma dos pontos",
    "Os cartões das matérias e a barra de Cursos do Canvas mostram o mesmo número do quadro, em todas as matérias",
    "O Centro de Notas é lido menos vezes (a cada 6 horas ou no Atualizar), então ele não enche mais o seu Histórico recente",
  ],
};
