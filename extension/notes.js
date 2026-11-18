// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "6.24.0",
  items: [
    "Sua fórmula por RA: escolha quantos RAs e quanto vale cada um; as atividades da matéria, lidas na hora do Canvas, entram no RA com um clique (uma Entrega TDE dos 3 RAs entra nos 3), e se o professor já lança em pontos da final o RA soma os pontos do Canvas; sem Plano, ela começa pelos grupos RA do Canvas. Sua IA e o popup também estão de cara nova",
    "Notas em todas as matérias: na página de cada uma, Simular (vê com quanto fica, nada é salvo) ou Minhas notas (lance a nota que o Canvas ainda não mostra, até de uma prova que nem está no Canvas: ela conta no painel e nos cards). Atividade dispensada no Canvas sai da conta. Abaixo da meta, o quanto precisa na recuperação, com caixa para simular",
    "O topo da matéria acompanha o que você digita: o anel, o quanto está garantido e a média que falta tirar mudam na hora",
    "Boas-vindas em 4 passos, com um passo para usar a fórmula do professor (Centro de Notas): diz o que é lido, o que não é, e dá para dizer Agora não",
    "Estimativas (soma dos pontos, fórmula com parte escondida) aparecem como estimativa, com ≈ e confira, nunca como garantido",
    "Painel mais claro: \"Precisa tirar\" (média no que falta) e \"+0,5 pts\" (pontos até a meta), a linha da meta com nome no gráfico e o aviso de onde vem cada número sem cortes",
    "Copiar texto e imagens no fim de cada tarefa, página e fórum, e aviso quando um prazo muda. Gostou? Avalie o Caderno+ no popup (aba Mais), onde também dá para testar o visual novo (Labs) e contar o que achou. Fundos novos: cenas animadas na cor do tema (Aurora viva, Mar, Brasas, Estrelas) ou uma imagem sua",
  ],
};
