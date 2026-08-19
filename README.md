# n8n-bridge-mcp v2.1.0

Conector inteligente, resiliente e blindado entre **n8n** e Agentes de IA via **Model Context Protocol (MCP)** (Especificação 2024-11-05).

---

## 🚀 Principais Características

- **Zero Dependências Externas**: Execução pura em Node.js nativo (Node 18+).
- **Integridade Total de Stdio**: `stdout` reservado estritamente para mensagens JSON-RPC 2.0. Todos os logs, traces e diagnósticos são roteados para `stderr`.
- **Resiliência Offline**: Se o n8n estiver desligado, inacessível ou retornar erros HTTP, o servidor MCP nunca trava nem derruba o processo (`process.exit(1)` eliminado).
- **Conformidade MCP 2024-11-05**: Suporte a `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`.
- **Descoberta Rápida e Não-Bloqueante**: Timeout de 1.5s para descoberta de ferramentas dinâmicas (evita que a IDE congele se o n8n estiver offline).
- **Context Engineering**: Respostas compactas em Markdown com estimativa heurística de tokens para evitar extrapolação de contexto do modelo de IA.
- **Auditoria de Sessão**: Rastreamento em memória de todas as operações, taxas de erro e consumo de tokens.

---

## 🛠️ Ferramentas Disponíveis

| Ferramenta | Parâmetros | Descrição |
|---|---|---|
| `n8n_saude` | — | Verifica conectividade, status e integridade do n8n com diagnóstico claro. |
| `n8n_listar_fluxos` | — | Lista os fluxos com ID, status (ativo/inativo), tags e peso estimado em tokens. |
| `n8n_obter_fluxo` | `id` (string), `detalhe` (boolean) | Retorna resumo estruturado do fluxo (nós, conexões, triggers). Com `detalhe: true`, retorna o JSON integral. |
| `n8n_criar_fluxo` | `name`, `nodes`, `connections` | Cria um novo fluxo de automação no n8n. |
| `n8n_atualizar_fluxo` | `id`, `name`, `nodes`, `connections`, `settings` | Atualiza nós, conexões, configurações ou nome de um fluxo existente com sanitização. |
| `n8n_ativar_fluxo` | `id` (string), `active` (boolean) | Ativa (`active: true`) ou desativa (`active: false`) um fluxo. |
| `n8n_listar_execucoes` | `limite` (number) | Lista execuções recentes com status, duração, horário e ID. |
| `n8n_obter_execucao` | `id` (string) | Retorna os dados completos e logs de nós de uma execução específica. |
| `n8n_executar_webhook` | `path` (string), `data` (object) | Dispara um webhook no n8n enviando payload JSON. |
| `n8n_testar_codigo_no` | `jsCode` (string), `inputData` (array) | Executa o código de um nó de Code com dados simulados (dry run). Isolamento básico — não é um sandbox de segurança. |
| `n8n_listar_credenciais` | — | Lista nomes e tipos de credenciais configuradas no n8n, sem expor valores/segredos. |
| `n8n_auditoria` | — | Exibe o relatório de operações, métricas de taxa de erro e consumo de tokens da sessão. |
| `[Ferramentas Dinâmicas]` | `data` (object) | Fluxos marcados com a tag `mcp-tool` são expostos dinamicamente como ferramentas customizadas. |

---

## 🔒 Nota de Segurança

- O `.env` nunca deve ser commitado (já está no `.gitignore`) — copie `.env.example` e preencha localmente.
- `n8n_testar_codigo_no` roda o código no módulo `vm` nativo do Node, que oferece isolamento básico, não um sandbox de segurança real. Não use com código de origem não confiável.
- `n8n_listar_credenciais` nunca retorna valores de senha/token, apenas nome e tipo.

---

## ⚙️ Configuração

### Setup Rápido (Interativo)
```bash
node scripts/setup.js
```

### Arquivo `.env`
Crie ou edite o arquivo `.env` na raiz do projeto:
```env
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=sua_api_key_aqui
N8N_TIMEOUT=5000
```

### Configuração no MCP (`mcp_config.json` ou `claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "n8n-bridge": {
      "command": "node",
      "args": ["D:/Trabalho/ANTIGRAVITY/clones GitHub/n8n-bridge-mcp/src/mcp-server.js"]
    }
  }
}
```

---

## 🧪 Testes Automatizados

Para rodar a suíte completa de testes de robustez e integridade MCP:
```bash
npm test
# ou: node test/test_mcp_robustness.js
```

Para rodar os testes unitários diretos:
```bash
npm run test:units
# ou: node test/test_units.js
```

Para testar a conectividade com o n8n:
```bash
npm run test-connection
# ou: node scripts/test-connection.js
```

---

## 📄 Licença
Distribuído sob a licença [MIT](LICENSE).
