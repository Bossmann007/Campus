# Chrome Web Store: textos para colar

Upload: `./scripts/package-extension` gera `dist/quanto-falta-extension-<versão>.zip`.

## Item

- **Nome:** Caderno+ · PUCPR
- **Resumo (até 132 caracteres):** O Canvas da PUCPR melhorado: semana, avisos, lembretes, busca, tema escuro, quanto falta e arquivos. Não oficial.
- **Categoria:** Educação
- **Idioma:** Português (Brasil)
- **Ícone:** `extension/icons/icon128.png`
- **Capturas (1280x800):** `store/screenshot-1280x800.png`, `store/screenshot-2-1280x800.png`
- **Site:** https://falta-quanto.vercel.app/
- **Política de privacidade:** https://falta-quanto.vercel.app/privacidade.html
- **Suporte:** https://github.com/Bossmann007/Campus/issues

## Descrição

O Canvas da PUCPR do jeito que o aluno usa (2026/2). Projeto independente, sem vínculo com a PUCPR nem com a Instructure.

Dentro do Canvas, sem configurar nada:

- **Próximos 7 dias:** no painel, a próxima avaliação, a média, as matérias e uma linha do tempo com as entregas e provas de todas as matérias, com o que já foi entregue e o que está atrasado;
- **Marcar como feito:** um ✓ em cada tarefa da semana; ela fica cinza, sai dos lembretes e conta no progresso da semana (a marca fica só no seu computador, o Canvas não muda);
- **Página de cada matéria:** cabeçalho com a cor da matéria e o professor, e abas Visão geral, Notas (com simulador), Materiais, Avisos e Anotações;
- **Calendário do semestre:** no lugar do calendário do Canvas, mês a mês, com prazos, provas e as suas tarefas;
- **Pergunte ao professor:** os avisos com a foto de quem escreveu e cada professor a um clique (a mensagem abre pronta na caixa de entrada do Canvas);
- **Busca (Ctrl+K ou ⌘K):** em qualquer página do Canvas, acha matérias, tarefas e itens dos módulos de todas as matérias e abre com Enter;
- **Notas novas:** aviso quando sai nota e um card com as últimas notas;
- **Resumo da semana:** segunda às 8h, quantas entregas e provas vêm aí;
- **Caixa de entrada:** as mensagens não lidas do Canvas no painel;
- **Simular notas** e **anotações** na página de cada matéria;
- **Exportar .ics** para Google Agenda, Outlook ou celular;
- **Foco:** timer de 25/5 minutos no botão da extensão;
- **Temas** escuro, escuro suave e escuro à noite; cards recolhíveis; botões ↑ ↓ em páginas longas;
- **Avisos:** os avisos de todas as matérias num lugar só, com os não lidos contados;
- **Lembretes:** notificação 1 dia e 1 hora antes de cada entrega que falta, e na véspera e no dia de cada prova;
- **Tema escuro** (ou igual ao sistema);
- **Quanto falta:** em cada card e em cada matéria, quanto você precisa tirar nas próximas avaliações;
- **Arquivos:** baixa os arquivos da matéria organizados numa pasta sua dentro de Downloads (PUCPR por padrão), por matéria e tipo;
- o número de dias até a próxima prova no ícone.

Cada parte pode ser desligada no botão da extensão.

Na página de cada matéria, a calculadora mostra:

- quanto você precisa tirar em cada avaliação que falta, respeitando os pesos dos Planos de Ensino;
- o mínimo em cada prova se você tirar nota cheia no resto;
- quais matérias já estão garantidas e quais ainda dependem de nota;
- o que falta entregar nos próximos 14 dias e o que passou do prazo sem envio;
- um simulador: digite notas e veja na hora se garante a meta, ou guarde como suas notas onde o Canvas não tem;
- a meta (de 5 a 10) muda no painel e todos os números acompanham.

Aparência: o Canvas inteiro com a identidade do Caderno+ (9 temas, fonte, cor do menu, cards em grade, compactos ou lista, cor por matéria) e os modos Limpo (só o que importa) e Foco (só o que fazer agora).

Privacidade: a extensão usa o login que você já tem no Canvas, não pede senha nem token, só lê (nunca grava no Canvas) e não envia nada para servidor nenhum. As notas ficam só no seu navegador.

Código aberto: https://github.com/Bossmann007/Campus
Projeto independente e não oficial, sem vínculo com a PUCPR nem com a Instructure. Canvas é marca da Instructure.

## Práticas de privacidade (aba Privacy)

- **Finalidade única:** melhorar o Canvas da PUCPR para o próprio aluno: organizar prazos, avisos, notas e arquivos das matérias dele.
- **Host pucpr.instructure.com (só esse site):** mostrar dentro do Canvas da PUCPR a semana, os avisos, quanto falta em cada matéria, a calculadora dentro das páginas do Canvas, a aparência (temas, fonte e cores, com as fontes da própria extensão expostas só ao Canvas da PUCPR), o tema escuro e o download dos arquivos da matéria; lê pela API do Canvas com a sessão do próprio usuário, no máximo a cada 10 minutos.
- **storage:** guardar no dispositivo as escolhas do usuário, a última leitura do Canvas, os lembretes, a data da próxima prova (número no ícone), quais arquivos já foram baixados, as tarefas marcadas como feitas, as notas novas encontradas, as anotações e checklists por matéria e do painel, e, só se o usuário ligar "Arquivo para a sua IA", um arquivo local caderno-agente.json na pasta de downloads com o que o painel mostra, os itens de menu e módulos escondidos, a turma confirmada, a pasta de downloads, as novidades já vistas, o passo em que parou nas boas-vindas, quais cards foram recolhidos, a lista da semana para o resumo de segunda e o fim do timer de foco. Separado por usuário do Canvas; a leitura do Canvas é apagada ao sair dele.
- **alarms:** atualizar de hora em hora o número de dias até a próxima prova no ícone, disparar os lembretes na hora marcada, o resumo da semana na segunda às 8h e o fim do timer de foco (não lê nada).
- **notifications:** mostrar os lembretes de entregas e provas, o aviso de nota nova, o resumo da semana e o fim do timer de foco, cada um com sua chave no botão da extensão; o texto é gerado no dispositivo.
- **downloads:** salvar, a pedido do usuário, os arquivos das matérias na pasta escolhida dentro de Downloads (PUCPR por padrão), por matéria e tipo; só endereços do Canvas da PUCPR.
- **Código remoto:** não. Todo o código está no pacote.
- **Dados tratados:** as notas, prazos, situação de entrega, marcações de entrega atrasada, estatísticas da turma, títulos de avisos, a agenda do Canvas e os títulos dos módulos são conteúdo lido do site do Canvas; nome e foto de quem escreveu os avisos e dos professores das matérias (o botão Perguntar só abre a caixa de entrada do Canvas); das mensagens do Canvas, só as não lidas: assunto, nomes de quem participa e data, nunca o texto (marque também "Comunicações pessoais"); o número do usuário do Canvas separa os dados de cada aluno (marque "Informações de identificação pessoal"); marque a categoria de conteúdo de site que o formulário oferecer (confira o nome exato na hora) e declare que ficam só no dispositivo do usuário e não são transmitidas ao desenvolvedor.
- **Declarações:** não vende dados; não usa para fins alheios à finalidade única; não usa para crédito ou empréstimo.
