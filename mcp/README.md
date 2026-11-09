# Caderno+ MCP: o seu Canvas da PUCPR para a sua IA

Não oficial. Roda **no seu computador**, com **o seu token**, guardado **no cofre do seu sistema**. Só lê: não entrega
trabalho, não responde quiz, não manda mensagem, não marca nada.

## Antes de instalar: para onde vão os seus dados

- O que as ferramentas devolvem (notas, prazos, títulos de avisos e de módulos, nomes das matérias) vai para o app de IA
  que você conectar e, por ele, para a nuvem do provedor (por exemplo, a Anthropic, no Claude). Fica no histórico da
  conversa e pode ficar nos logs do app.
- Títulos escritos no Canvas podem ter nomes de professores ou colegas (ex.: "Grupo da Ana").
- Depois de conectado, a IA pode consultar sozinha durante a conversa (as ferramentas só leem).
- O token do Canvas dá acesso **total** à sua conta (entregar trabalho, mandar mensagem). Quem limita a leitura é este
  programa, não o token. Por isso: validade até o fim do semestre e revogue quando parar de usar.
- O cofre do sistema protege o token de arquivos e de outras contas do computador, mas **não** de programas que rodam
  com o seu próprio usuário. Não instale coisas desconhecidas na mesma conta.

## Instalar (Claude Code ou Claude Desktop)

1. Node 18 ou mais novo.
2. No Canvas: Conta → Configurações → **+ Novo token de acesso**. Finalidade "Caderno+ MCP", expira no fim do semestre.
3. `node mcp/cli.js login` e cole o token quando o cofre pedir (macOS: Keychain; Windows: DPAPI do seu usuário;
   Linux: Secret Service via `secret-tool`). O token não aparece na tela, nem no histórico, nem em arquivo de config.
4. `node mcp/cli.js status` confere se o Canvas aceita.
5. `node mcp/cli.js setup` mostra o comando para o Claude Code e o trecho para o Claude Desktop.

Pergunte: "quanto falta em cada matéria?", "o que vence esta semana?", "quais avisos novos?".

## Ferramentas

`quanto_falta` (regras do Plano de Ensino, só notas do Canvas), `upcoming`, `grades`, `courses`, `announcements` (sem
autor nem texto), `modules`. Textos do Canvas chegam marcados como `untrusted_canvas_text`: a IA deve tratá-los como
dados, nunca como instruções.

## Parar

`node mcp/cli.js logout` apaga o token do cofre. Revogue-o também no Canvas (Conta → Configurações). Remova o servidor do
app (`claude mcp remove caderno`).

## Aviso

A política de API da Instructure (§3(i)) proíbe acessar o Canvas por servidores MCP não aprovados por ela. Este servidor
não é aprovado pela Instructure nem pela PUCPR, e elas podem bloquear tokens de alunos. Use por sua conta.
