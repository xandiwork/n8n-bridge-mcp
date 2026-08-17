# n8n-bridge-mcp v2.0.0

Conector inteligente, resiliente e blindado entre **n8n** e Agentes de IA via **Model Context Protocol (MCP)** (Especificação 2024-11-05).

## 🚀 Principais Características

- **Zero Dependências Externas**: Execução pura em Node.js nativo (Node 18+).
- **Integridade Total de Stdio**: Stdout reservado estritamente para mensagens JSON-RPC 2.0. Todos os logs, traces e avisos são roteados para `stderr`.
- **Resiliência Offline**: Se o n8n estiver desligado, inacessível ou retornar erros HTTP, o servidor MCP nunca trava nem derruba o processo (`process.exit(1)` removido).
- **Conformidade MCP 2024-11-05**: Suporte a `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`, `resources/list`, `prompts/list`.
- **Carregamento Rápido de Ferramentas**: Timeout ultra-rápido de descoberta para que a inicialização da IDE nunca congele se a rede falhar.
- **Context Engineering**: Respostas compactas em Markdown com estimativa heurística de tokens para evitar extrapolação de contexto do modelo.
- **Auditoria de Sessão**: Rastreamento em memória de todas as operações, taxas de erro e consumo de tokens.

---

## 🛠️ Ferramentas Disponíveis

| Ferramenta | Descrição |
|---|---|
| `n8n_saude` | Verifica conectividade, status e integridade do n8n com diagnóstico claro. |
| `n8n_listar_fluxos` | Lista os fluxos com ID, status, tags e peso estimado em tokens. |
| `n8n_obter_fluxo` | Retorna resumo estruturado do fluxo (nós, conexões, triggers). Use `detalhe: true` para o JSON integral. |
| `n8n_criar_fluxo` | Cria um novo fluxo de automação no n8n. |
| `n8n_atualizar_fluxo` | Atualiza nós, conexões ou nome de um fluxo existente. |
| `n8n_ativar_fluxo` | Ativa (`active: true`) ou desativa (`active: false`) um fluxo. |
| `n8n_listar_execucoes` | Lista execuções recentes com status, duração e horário. |
| `n8n_obter_execucao` | Retorna os dados completos e logs de nós de uma execução específica. |
| `n8n_executar_webhook` | Dispara um webhook no n8n enviando payload JSON. |
| `n8n_auditoria` | Exibe o relatório de operações, métricas e consumo da sessão. |
| `[Ferramentas Dinâmicas]` | Fluxos marcados com a tag `mcp-tool` são expostos dinamicamente como ferramentas personalizadas. |

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
node test/test_mcp_robustness.js
```

Ou execute os testes unitários diretos:
```bash
node test/test_units.js
```

