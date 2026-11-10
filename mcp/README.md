# Caderno+ MCP: o seu Canvas da PUCPR para a sua IA

Não oficial. Roda **no seu computador** e pergunta para a **extensão Caderno+**, que lê o Canvas com o login do seu
navegador: **sem token**. Só lê: não entrega trabalho, não responde quiz, não manda mensagem, não marca nada.

## Antes de instalar: para onde vão os seus dados

- O que as ferramentas devolvem (notas, prazos, títulos de avisos e de módulos, nomes das matérias e dos professores) vai para o app de IA
  que você conectar e, por ele, para a nuvem do provedor (por exemplo, a Anthropic, no Claude). Fica no histórico da
  conversa e pode ficar nos logs do app.
- Títulos escritos no Canvas podem ter nomes de professores ou colegas (ex.: "Grupo da Ana").
- Depois de conectado, a IA pode consultar sozinha durante a conversa (as ferramentas só leem).
- A ponte fica num canal local que só o seu usuário abre (`~/.caderno-mcp/ponte.sock`, ou um pipe no Windows). Programas
  que rodam com o seu próprio usuário conseguem usá-la; a extensão só aceita leituras de uma lista fixa.

## Como ele lê o Canvas: a ponte

```
app de IA → caderno-mcp → (canal local) → ponte → (native messaging) → extensão Caderno+ → Canvas, com o seu login
```

1. `npm install -g caderno-mcp` (Node 18 ou mais novo; o pacote do npm publicado por `bossmann`).
2. `caderno-mcp ponte <id da extensão>`: registra a ponte nos navegadores que você tem (Chrome, Brave, Edge, Chromium;
   no Windows, uma chave do registro do seu usuário). O comando com o seu id está na página Sua IA do Caderno+.
3. Na extensão: Mais → Sua IA → **Ligar a ponte** (o navegador pede para "se comunicar com aplicativos nativos").
4. `caderno-mcp ponte status` confere; `caderno-mcp setup` mostra como ligar em cada app de IA.

O navegador precisa estar aberto, com você logado no Canvas. `caderno-mcp ponte remove` desfaz o passo 2.

**Centro de Notas:** para as matérias sem as regras do Caderno+, o `quanto_falta` usa a fórmula que o professor pôs no
Centro de Notas (a ferramenta de notas da PUCPR no Canvas), lida pela extensão como o painel lê. Matérias em que o
professor não pôs fórmula aparecem como "sem fórmula".

## Instalar no Claude Desktop

Abra `caderno-mcp-<versão>.mcpb` com dois cliques e cole o **id da extensão** (página Sua IA do Caderno+) no campo
pedido: o servidor registra a ponte sozinho. Depois, Ligar a ponte na extensão.

## Uso pessoal com token (opcional)

Sem a ponte, dá para usar um token do Canvas seu: Canvas → Conta → Configurações → **+ Novo token de acesso**, e
`caderno-mcp login` (fica no cofre do sistema: Keychain, DPAPI ou Secret Service). A documentação do Canvas não permite
que um app usado por várias pessoas peça isso a cada aluno, por isso é só para você. O token dá acesso **total** à sua
conta; nunca cole no chat; revogue no Canvas quando parar. Com a ponte ligada, ela é usada primeiro.

## Funciona com

Apps que rodam o servidor no seu computador: Claude Desktop e Claude Code, Codex (CLI, IDE e o ChatGPT desktop),
Gemini CLI, Cursor, VS Code (Copilot), Windsurf, Zed, JetBrains AI, LM Studio, Goose, Cline, Roo, Continue e
Perplexity (Mac). Testados de verdade aqui: Claude Code, Codex, Gemini CLI e o inspetor oficial do MCP; nos outros, o
formato segue a documentação de cada app. `node mcp/cli.js setup <app>` mostra o comando ou o trecho de config de cada um (ex.: `setup codex`,
`setup gemini`, `setup cursor`, `setup vscode`); nada é gravado nos seus apps.

Só pela web (ChatGPT web, Claude web, Le Chat, Grok, Gemini app): esses só falam com servidores na internet, e este fica
no seu computador de propósito. No ChatGPT, use o app desktop (via Codex) ou o Secure MCP Tunnel da OpenAI.

Pergunte: "quanto falta em cada matéria?", "o que eu ainda não entreguei?", "o que vence esta semana?".

## Onde instalar

Instale só o pacote `caderno-mcp` do npm (publicado por `bossmann`) ou o `.mcpb` da release no GitHub do projeto
(github.com/Bossmann007/Campus). Não instale cópias com nome parecido.

## Ferramentas

- `quanto_falta`: quanto falta em cada matéria para a meta (padrão 7). Regras do Plano de Ensino da turma quando o
  Caderno+ as tem; senão, a fórmula do Centro de Notas (nota de agora, a nota que precisa em tudo o que falta, o que
  ainda não tem nota). Só notas do Canvas.
- `upcoming`: entregas, provas e eventos que vêm.
- `grades`: notas lançadas no Canvas por avaliação.
- `courses`: matérias do semestre, com o `course_id`.
- `announcements`: avisos recentes (título, matéria, data, se foi lido); sem autor nem texto.
- `modules`: módulos de uma matéria e os títulos dos itens.
- `teachers`: o nome dos professores de cada matéria.
- `pendencias`: o que o Canvas marca como faltando e as entregas online ainda abertas com prazo à frente.
- `quizzes`: quizzes clássicos de uma matéria (datas, tentativas, tempo, pontos); sem as perguntas.

`grades`, `modules`, `pendencias` e `quizzes` aceitam `course_id` ou `course` (um pedaço do nome da matéria). Sem
uma matéria só com esse nome, a resposta traz as candidatas com o `course_id`.

## Segurança

- Só leitura: o servidor só faz GET no Canvas, por uma lista fechada de caminhos (ids só com dígitos); qualquer outro
  endereço é recusado antes de sair do computador. A única exceção é o formulário de lançamento do Centro de Notas,
  enviado só para o endereço dele.
- Até 400 leituras a cada 5 minutos, para um laço da IA não martelar o Canvas.
- Textos do Canvas chegam marcados como `untrusted_canvas_text`, sem caracteres invisíveis: a IA deve tratá-los como
  dados, nunca como instruções.
- A extensão confere de novo cada pedido da ponte (só GET, a mesma lista de caminhos, resposta de até 5 MB).
- No uso com token, ele fica no cofre do sistema e nunca aparece em resposta, erro ou log.

## Parar

`caderno-mcp ponte remove` tira a ponte dos navegadores. Remova o servidor do app (`claude mcp remove caderno`). Com
token: `caderno-mcp logout` apaga do cofre; revogue também no Canvas (Conta → Configurações).

## Aviso

A política de API da Instructure (§3(i)) proíbe acessar o Canvas por servidores MCP não aprovados por ela. Este servidor
não é aprovado pela Instructure nem pela PUCPR. Use por sua conta.
