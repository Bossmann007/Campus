// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "6.16.0",
  items: [
    "Copiar texto e imagens: um botão no fim de cada tarefa, página e fórum copia o título, as datas e o enunciado com as imagens, pronto para colar no Docs, no Word ou no Notion",
    "Prazo mudou: quando o professor muda a data de uma entrega ou prova, chega um aviso (com a data antiga e a nova) e ela aparece em Desde a sua última visita",
    "Na página da matéria, a tabela das provas voltou: peso e nota de cada uma (ex.: 9,0 de 10) e, onde ainda não tem nota, uma caixa para digitar a que você espera e ver na hora com quanto você fica (fica salvo no seu computador)",
    "Escolha uma matéria no painel: a próxima entrega, os números, o gráfico, o resumo de cada atividade e o cartão do Canvas mostram só ela; dois cliques no nome abrem a matéria",
    "Quanto falta em gráfico (Barras, Falta, Anéis, Entregas ou Lista), com quantos pontos faltam até a sua meta (ex.: +0,5)",
    "Para qualquer curso e turma, cada matéria pela melhor fonte: sua regra, a fórmula do Centro de Notas, os pesos do Canvas, o Plano de Ensino, a soma dos pontos; os cartões e a barra de Cursos mostram o mesmo número",
  ],
};
