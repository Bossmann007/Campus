# Segurança

O Caderno+ (antes Campus+ e Quanto falta) lida com as notas dos alunos e com a sessão deles no Canvas. Se você achou uma falha, **não abra uma issue pública**.

Reporte em particular pela aba **Security → Report a vulnerability** deste repositório. Respondo assim que puder.

O que conta como falha, por exemplo:

- a extensão, o favorito ou o Caderno+ MCP enviando dados para fora do Canvas, do Centro de Notas ou do site (o MCP entrega as respostas só ao app de IA que o aluno escolheu);
- a extensão abrindo um link, salvando um arquivo ou baixando algo de fora do Canvas da PUCPR;
- uma forma de rodar código na página a partir de um texto colado ou de um link;
- uma conta errada que faça alguém achar que passou quando não passou.

O que o projeto promete: nenhum servidor recebe notas, a extensão não pede token do Canvas (o Caderno+ MCP lê pela ponte com a extensão; o token no cofre do sistema é só um modo pessoal opcional), a extensão só roda no Canvas da PUCPR (e no Centro de Notas, se o aluno permitir), só faz leituras (nunca grava no Canvas) e guarda tudo no próprio computador.
