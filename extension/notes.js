// Novidades: shown once after an update, on the Canvas dashboard and in the popup, until the student closes it
// (chrome.storage.local "notesSeen" = the version read). A fresh install skips it (the onboarding comes instead).
const CP_NOTES = {
  version: "6.1.1",
  items: [
    "Anotações do painel arrumadas: a coluna fica sempre no topo, ao lado do painel, e os cards não se espalham mais em volta dela ao trocar de modo",
    "Menos memória: os ícones do menu da matéria viraram uma imagem só, e o processo de fundo só acorda quando algo muda",
    "Mais rápido: o painel aparece assim que a página do Canvas chega, a leitura das notas faz uma ida a menos ao Canvas e o Centro de Notas é lido de hora em hora",
    "Quanto falta em qualquer matéria cujo professor montou a fórmula no Centro de Notas da PUCPR, de qualquer curso e turma (clique em Atualizar para permitir)",
    "Simulador na página da matéria: tirando X no que falta, com quanto você fica",
    "Sua IA pelo Caderno+ MCP (beta, já dá para instalar) com um token do Canvas no cofre do sistema: sem arquivo nenhum (pode apagar o caderno-agente.json antigo da pasta de downloads)",
    "Botão da extensão com A seguir (as próximas entregas e provas), ícones nas abas e o último erro, se houver",
    "Menos falhas: o Canvas lento ou ocupado é tentado de novo, e o painel diz quando não conseguiu ler",
    "Mais leve: o código de cada aba ocupa menos da metade da memória, e o painel abre na hora depois de atualizar",
    "Anotações com checklist em cada matéria e no painel (Alt+N); item com dia entra nos próximos 7 dias",
  ],
};
