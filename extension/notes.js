// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "6.13.0",
  items: [
    "Quanto falta em gráfico: Barras, Falta, Anéis, Entregas ou Lista, você escolhe no quadro e ele lembra",
    "Para qualquer curso e turma: cada matéria usa a melhor fonte, nesta ordem: sua regra, a fórmula do professor no Centro de Notas, os pesos do Canvas, o Plano de Ensino, a soma dos pontos",
    "Os cartões das matérias no painel do Canvas mostram o mesmo número do quadro, em todas as matérias",
    "O Centro de Notas é lido menos vezes (a cada 6 horas ou no Atualizar), então ele não enche mais o seu Histórico recente",
    "A nota de agora é sempre arredondada para baixo, igual em todo lugar; a fórmula avisa somas e nomes que contariam duas vezes",
  ],
};
