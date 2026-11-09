# Caderno+ MCP: o seu Canvas da PUCPR para a sua IA

Não oficial. Roda **no seu computador**, com **o seu token**, guardado **no cofre do seu sistema**. Só lê: não entrega
trabalho, não responde quiz, não manda mensagem, não marca nada.

## Antes de instalar: para onde vão os seus dados

- O que as ferramentas devolvem (notas, prazos, títulos de avisos e de módulos, nomes das matérias e dos professores) vai para o app de IA
  que você conectar e, por ele, para a nuvem do provedor (por exemplo, a Anthropic, no Claude). Fica no histórico da
  conversa e pode ficar nos logs do app.
- Títulos escritos no Canvas podem ter nomes de professores ou colegas (ex.: "Grupo da Ana").
- Depois de conectado, a IA pode consultar sozinha durante a conversa (as ferramentas só leem).
- O token do Canvas dá acesso **total** à sua conta (entregar trabalho, mandar mensagem). Quem limita a leitura é este
  programa, não o token. Por isso: validade até o fim do semestre e revogue quando parar de usar.
- O cofre do sistema protege o token de arquivos e de outras contas do computador, mas **não** de programas que rodam
  com o seu próprio usuário. Não instale coisas desconhecidas na mesma conta.

## Como ele lê o Canvas

Só com **o seu token** do Canvas, guardado no cofre do sistema (`caderno-mcp login`) ou no campo protegido do Claude
Desktop. Para criar: Canvas → Conta → Configurações → **+ Novo token de acesso**, finalidade "Caderno+ MCP", validade até
o fim do semestre. **Nunca cole o token no chat**, nem com a IA.

**Centro de Notas:** para as matérias sem as regras do Caderno+, o `quanto_falta` usa a fórmula que o professor pôs no
Centro de Notas (a ferramenta de notas da PUCPR no Canvas). O MCP abre o Centro de Notas como o Canvas abre: pede ao
Canvas um lançamento (com o token), lê a página de lançamento **sem** o token, manda ao Centro de Notas só os campos
daquele formulário e guarda só os cookies que ele mesmo pôs. O token nunca vai para o Centro de Notas. Uma matéria por
vez. Matérias em que o professor não pôs fórmula aparecem como "sem fórmula".

## Instalar no Claude Desktop (mais fácil)

Abra `caderno-mcp-<versão>.mcpb` com dois cliques e cole o token do Canvas no campo pedido. O Claude Desktop guarda o
token no cofre do sistema e passa ao servidor quando abre.

## Instalar pelo terminal (Claude Code, Codex, Gemini CLI, Cursor, VS Code)

1. Node 18 ou mais novo, e `npm install -g https://github.com/Bossmann007/Campus/releases/download/mcp-v1.0.1/caderno-mcp-1.0.1.tgz` (o pacote da release no
   GitHub do projeto).
2. No Canvas: Conta → Configurações → **+ Novo token de acesso**. Finalidade "Caderno+ MCP", expira no fim do semestre.
3. `caderno-mcp login` e cole o token quando o cofre pedir (macOS: Keychain; Windows: DPAPI do seu usuário;
   Linux: Secret Service via `secret-tool`). O token não aparece na tela, nem no histórico, nem em arquivo de config.
4. `caderno-mcp status` confere se o Canvas aceita.
5. `caderno-mcp setup` mostra como ligar em cada app de IA (veja "Funciona com").

## Funciona com

Apps que rodam o servidor no seu computador: Claude Desktop e Claude Code, Codex (CLI, IDE e o ChatGPT desktop),
Gemini CLI, Cursor, VS Code (Copilot), Windsurf, Zed, JetBrains AI, LM Studio, Goose, Cline, Roo, Continue e
Perplexity (Mac). Testados de verdade aqui: Claude Code, Codex, Gemini CLI e o inspetor oficial do MCP; nos outros, o
formato segue a documentação de cada app. `node mcp/cli.js setup <app>` mostra o comando ou o trecho de config de cada um (ex.: `setup codex`,
`setup gemini`, `setup cursor`, `setup vscode`); nada é gravado nos seus apps.

Só pela web (ChatGPT web, Claude web, Le Chat, Grok, Gemini app): esses só falam com servidores na internet, e este fica
no seu computador de propósito. No ChatGPT, use o app desktop (via Codex) ou o Secure MCP Tunnel da OpenAI.

Pergunte: "quanto falta em cada matéria?", "o que vence esta semana?", "quais avisos novos?".

## O que o cofre protege (e o que não)

O token fica no cofre do sistema para não aparecer em arquivo de texto, na tela ou no histórico do terminal. Ele não
fica protegido de outros programas que rodam com o seu usuário: no Mac, por exemplo, um programa seu pode pedir o item
ao Keychain. Use um token com validade até o fim do semestre e revogue no Canvas quando parar de usar.

Instale só pelos arquivos da release no GitHub do projeto (github.com/Bossmann007/Campus): o `.mcpb` e o `.tgz`. Se
instalar pelo npm, confira antes que o pacote `caderno-mcp` é o publicado por `bossmann`. Não instale cópias com nome
parecido: o programa vai pedir o seu token.

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

## Segurança

- Só leitura: o servidor só faz GET no Canvas, por uma lista fechada de caminhos (ids só com dígitos); qualquer outro
  endereço é recusado antes de sair do computador. A única exceção é o formulário de lançamento do Centro de Notas,
  enviado só para o endereço dele.
- Até 400 leituras a cada 5 minutos, para um laço da IA não martelar o Canvas.
- Textos do Canvas chegam marcados como `untrusted_canvas_text`, sem caracteres invisíveis: a IA deve tratá-los como
  dados, nunca como instruções.
- O token fica no cofre do sistema e nunca aparece em resposta, erro ou log.

## Parar

`node mcp/cli.js logout` apaga o token do cofre. Revogue-o também no Canvas (Conta → Configurações). Remova o servidor do
app (`claude mcp remove caderno`).

## Aviso

A política de API da Instructure (§3(i)) proíbe acessar o Canvas por servidores MCP não aprovados por ela. Este servidor
não é aprovado pela Instructure nem pela PUCPR, e elas podem bloquear tokens de alunos. Use por sua conta.
