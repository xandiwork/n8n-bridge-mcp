# n8n-bridge v2

Conector inteligente entre n8n e Antigravity IDE, otimizado com Context Engineering (NeuralVault).

## Funcionalidades
- **Zero Dependências:** Funciona apenas com Node.js nativo.
- **MCP Server:** Expõe 8 ferramentas para o agente de IA da IDE.
- **Context-Aware:** As respostas são formatadas em Markdown compacto com estimativa de tokens, prevenindo alucinações da IA.
- **Auditoria Integrada:** Registra e totaliza o consumo de tokens e chamadas à API em tempo real.

## Setup Interativo (Recomendado)
Apenas rode o script de setup na raiz do projeto:
```bash
node scripts/setup.js
```

## Setup Manual
1. Copie `.env.example` para `.env`
2. Configure sua URL e API Key do n8n.
3. Adicione no `mcp_config.json` da sua IDE:
```json
{
  "mcpServers": {
    "n8n-bridge": {
      "command": "node",
      "args": ["caminho/para/n8n-bridge/src/mcp-server.js"]
    }
  }
}
```

## Ferramentas Disponíveis
- `n8n_saude`: Ping para verificar se o serviço está rodando.
- `n8n_listar_fluxos`: Retorna Neural Map de fluxos com ID, nome, status e peso.
- `n8n_obter_fluxo`: Retorna resumo estruturado (nós, conexões, triggers). Com `{ detalhe: true }`, retorna JSON.
- `n8n_ativar_fluxo`: Ativa/desativa fluxo.
- `n8n_listar_execucoes`: Lista histórico.
- `n8n_obter_execucao`: Retorna JSON completo da execução.
- `n8n_executar_webhook`: POST no n8n.
- `n8n_auditoria`: Relatório de consumo da sessão atual.
