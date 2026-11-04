# Chrome Web Store: textos para colar

Upload: `./scripts/package-extension` gera `dist/quanto-falta-extension-<versão>.zip`.

## Item

- **Nome:** Quanto falta · PUCPR
- **Resumo (até 132 caracteres):** Importa suas notas do Canvas da PUCPR e mostra quanto falta para passar em cada matéria. Sem senha, sem servidor.
- **Categoria:** Educação
- **Idioma:** Português (Brasil)
- **Ícone:** `extension/icons/icon128.png`
- **Capturas (1280x800):** `store/screenshot-1280x800.png`, `store/screenshot-2-1280x800.png`
- **Site:** https://falta-quanto.vercel.app/
- **Política de privacidade:** https://falta-quanto.vercel.app/privacidade.html
- **Suporte:** https://github.com/Bossmann007/quanto-falta-pucpr/issues

## Descrição

Calculadora de notas para alunos da PUCPR (2026/2).

Com o Canvas aberto, clique no ícone da extensão e em "Importar notas do Canvas". A extensão lê as suas notas na aba do Canvas e abre o Quanto falta, que mostra:

- quanto você precisa tirar em cada avaliação que falta, respeitando os pesos dos Planos de Ensino;
- o mínimo em cada prova se você tirar nota cheia no resto;
- quais matérias já estão garantidas e quais ainda dependem de nota;
- o que falta entregar nos próximos 14 dias e o que passou do prazo sem envio;
- o prazo do Canvas ao lado da data do Plano de Ensino, e quais notas são novas desde a última importação;
- a sua nota comparada com a média da turma (quando o professor libera) e os avisos dos professores, com os não lidos em destaque;
- um arquivo de calendário (.ics) com as avaliações e entregas.

Privacidade: a extensão usa o login que você já tem no Canvas, não pede senha nem token, só lê (nunca grava no Canvas) e não envia nada para servidor nenhum. As notas ficam só no seu navegador.

Código aberto: https://github.com/Bossmann007/quanto-falta-pucpr
Projeto de aluno, sem vínculo oficial com a PUCPR ou com a Instructure.

## Práticas de privacidade (aba Privacy)

- **Finalidade única:** importar as notas do próprio aluno no Canvas da PUCPR para calcular quanto falta para passar.
- **activeTab:** ler a aba do Canvas só quando o usuário clica no botão da extensão.
- **scripting:** executar, nessa aba e nesse momento, a leitura das notas pela API do Canvas com a sessão do próprio usuário.
- **Código remoto:** não. Todo o código está no pacote.
- **Dados tratados:** as notas, prazos, situação de entrega, marcações de entrega atrasada, estatísticas da turma e títulos de avisos são conteúdo lido do site do Canvas; marque a categoria de conteúdo de site que o formulário oferecer (confira o nome exato na hora) e declare que ficam só no dispositivo do usuário e não são transmitidas ao desenvolvedor.
- **Declarações:** não vende dados; não usa para fins alheios à finalidade única; não usa para crédito ou empréstimo.
