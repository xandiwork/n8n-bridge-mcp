/**
 * n8n-bridge-mcp - Servidor MCP resiliente para n8n
 * Protocolo: Model Context Protocol (MCP) 2024-11-05 / JSON-RPC 2.0
 */

// REDIRECIONAMENTO DE LOGS: Garante que stdout contenha EXCLUSIVAMENTE mensagens JSON-RPC
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  if (process.stderr && process.stderr.write) {
    process.stderr.write(`[MCP INFO] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`);
  }
};
console.info = console.log;
console.warn = (...args) => {
  if (process.stderr && process.stderr.write) {
    process.stderr.write(`[MCP WARN] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`);
  }
};

const readline = require('readline');
const config = require('./config');
const audit = require('./audit');
const N8nClient = require('./n8n-client');
const ResponseFormatter = require('./formatter');

class MCPServer {
  constructor() {
    this.dynamicToolsMap = new Map();
    this.initClient();

    // Tratamento de exceções globais para nunca derrubar o processo
    process.on('uncaughtException', (err) => {
      if (process.stderr && process.stderr.write) {
        process.stderr.write(`[MCP UncaughtException] ${err.stack || err.message}\n`);
      }
    });

    process.on('unhandledRejection', (reason) => {
      if (process.stderr && process.stderr.write) {
        process.stderr.write(`[MCP UnhandledRejection] ${reason && (reason.stack || reason.message) || reason}\n`);
      }
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      
      try {
        const msg = JSON.parse(trimmed);
        this.handleMessage(msg).catch((err) => {
          if (process.stderr && process.stderr.write) {
            process.stderr.write(`[MCP HandleError] ${err.message}\n`);
          }
        });
      } catch (e) {
        // Enviar erro JSON-RPC de Parse Error (-32700) se for linha malformada
        this.sendError(null, -32700, 'Parse error: Linha recebida não é um JSON válido');
      }
    });
  }

  initClient() {
    const { baseUrl, apiKey, timeout } = config.required;
    this.client = new N8nClient(baseUrl, apiKey, timeout);
  }

  // Envia EXCLUSIVAMENTE para stdout no formato JSON-RPC 2.0 delimitado por \n
  send(msg) {
    try {
      const raw = JSON.stringify(msg) + '\n';
      process.stdout.write(raw);
    } catch (err) {
      if (process.stderr && process.stderr.write) {
        process.stderr.write(`[MCP SendError] ${err.message}\n`);
      }
    }
  }

  sendError(id, code, message, data = null) {
    const payload = {
      jsonrpc: '2.0',
      id: (id !== undefined) ? id : null,
      error: { code, message }
    };
    if (data !== null && data !== undefined) {
      payload.error.data = data;
    }
    this.send(payload);
  }

  sendResult(id, result) {
    this.send({
      jsonrpc: '2.0',
      id,
      result
    });
  }
  
  toSnakeCase(str) {
    if (!str) return 'tool';
    return String(str).replace(/\W+/g, '_').toLowerCase();
  }

  getStaticTools() {
    return [
      {
        name: 'n8n_saude',
        description: 'Verifica se o servidor n8n está online e acessível.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'n8n_listar_fluxos',
        description: 'Retorna um índice compacto de todos os fluxos com seus pesos estimados e status.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'n8n_obter_fluxo',
        description: 'Obtém informações de um fluxo pelo ID. Por padrão traz resumo estruturado. Se detalhe: true, traz o JSON integral.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID do fluxo no n8n' },
            detalhe: { type: 'boolean', description: 'Se true, retorna o JSON integral do fluxo. Padrão: false' }
          },
          required: ['id']
        }
      },
      {
        name: 'n8n_criar_fluxo',
        description: 'Cria um novo fluxo de automação no n8n.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome do fluxo' },
            nodes: { type: 'array', description: 'Array de nós do fluxo' },
            connections: { type: 'object', description: 'Objeto de conexões do fluxo' }
          },
          required: ['name']
        }
      },
      {
        name: 'n8n_atualizar_fluxo',
        description: 'Atualiza um fluxo existente no n8n.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID do fluxo a ser atualizado' },
            name: { type: 'string', description: 'Novo nome do fluxo' },
            nodes: { type: 'array', description: 'Array de nós do fluxo' },
            connections: { type: 'object', description: 'Objeto de conexões do fluxo' }
          },
          required: ['id']
        }
      },
      {
        name: 'n8n_ativar_fluxo',
        description: 'Ativa ou desativa um fluxo no n8n.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID do fluxo' },
            active: { type: 'boolean', description: 'true para ativar, false para desativar' }
          },
          required: ['id', 'active']
        }
      },
      {
        name: 'n8n_listar_execucoes',
        description: 'Lista as execuções recentes com status, horário e duração.',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filtro por status: success, error, running, waiting' },
            workflowId: { type: 'string', description: 'Filtrar por ID do fluxo' },
            limit: { type: 'number', description: 'Quantidade máxima de execuções (padrão: 20)' }
          }
        }
      },
      {
        name: 'n8n_obter_execucao',
        description: 'Obtém detalhes completos de uma execução pelo ID (dados de entrada, nós e erros).',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID da execução' }
          },
          required: ['id']
        }
      },
      {
        name: 'n8n_executar_webhook',
        description: 'Dispara um webhook configurado no n8n enviando payload JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Caminho do webhook (ex: webhook/minha-acao ou webhook-test/minha-acao)' },
            data: { type: 'object', description: 'Payload JSON para o webhook' }
          },
          required: ['url']
        }
      },
      {
        name: 'n8n_auditoria',
        description: 'Retorna o relatório de operações, status e consumo de tokens da sessão atual.',
        inputSchema: { type: 'object', properties: {} }
      }
    ];
  }

  async handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    const { id, method, params } = msg;

    // 1. Handshake MCP: initialize
    if (method === 'initialize') {
      this.sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'n8n-bridge-mcp',
          version: '2.0.0'
        }
      });
      return;
    }

    // 2. Notificação MCP: notifications/initialized
    if (method === 'notifications/initialized') {
      // Notificação não requer resposta
      return;
    }

    // 3. Ping MCP
    if (method === 'ping') {
      this.sendResult(id, {});
      return;
    }

    // 4. MCP Tools List: tools/list
    if (method === 'tools/list') {
      const staticTools = this.getStaticTools();
      let dynamicTools = [];

      // Tentativa não-bloqueante e rápida de buscar ferramentas dinâmicas
      try {
        // Usa timeout curto de 1500ms para nunca travar a IDE se o n8n estiver offline
        const res = await this.client.getWorkflows(1500);
        const data = (res && Array.isArray(res.data)) ? res.data : [];
        const mcpFlows = data.filter(wf => wf && wf.tags && Array.isArray(wf.tags) && wf.tags.some(t => t && t.name === 'mcp-tool'));
        
        for (const wf of mcpFlows) {
          if (!wf || !wf.id) continue;
          const toolName = this.toSnakeCase(wf.name || `wf_${wf.id}`);
          
          try {
            const wfDetails = await this.client.getWorkflow(wf.id, 1000);
            const nodes = (wfDetails && Array.isArray(wfDetails.nodes)) ? wfDetails.nodes : [];
            const webhookNode = nodes.find(n => n && (n.type === 'n8n-nodes-base.webhook' || String(n.type).includes('webhook')));
            const webhookPath = (webhookNode && webhookNode.parameters && webhookNode.parameters.path) 
              ? webhookNode.parameters.path 
              : toolName;
            
            this.dynamicToolsMap.set(toolName, webhookPath);

            dynamicTools.push({
              name: toolName,
              description: `[Ferramenta Dinâmica] Fluxo n8n: ${wf.name || wf.id}`,
              inputSchema: {
                type: 'object',
                properties: {
                  data: { type: 'object', description: 'Payload em JSON para o webhook do fluxo' }
                }
              }
            });
          } catch {
            // Ignora falhas em fluxos individuais
          }
        }
      } catch (err) {
        // Se n8n estiver offline, apenas registra na auditoria silenciosamente
        audit.log({ operation: 'fetch_dynamic_tools', status: 'error', error: err });
      }

      this.sendResult(id, {
        tools: [...staticTools, ...dynamicTools]
      });
      return;
    }

    // 5. MCP Tool Call: tools/call
    if (method === 'tools/call') {
      await this.handleToolCall(id, params || {});
      return;
    }

    // 6. Suporte a métodos opcionais para compatibilidade total com clientes MCP
    if (method === 'resources/list') {
      this.sendResult(id, { resources: [] });
      return;
    }

    if (method === 'prompts/list') {
      this.sendResult(id, { prompts: [] });
      return;
    }

    if (method === 'logging/setLevel') {
      this.sendResult(id, {});
      return;
    }

    // Método desconhecido: se for requisição com ID, retorna Method Not Found (-32601)
    if (id !== undefined && id !== null) {
      this.sendError(id, -32601, `Método não suportado: ${method}`);
    }
  }

  async handleToolCall(id, params) {
    const name = params.name || '';
    const args = params.arguments || {};
    let resultText = '';
    let isError = false;
    let tokensEstimate = 0;
    
    try {
      if (name === 'n8n_saude') {
        const health = await this.client.healthCheck(3000);
        if (health.ok) {
          resultText = `✅ **n8n Online e Operacional**\n- **URL**: ${this.client.baseUrl}\n- **Status**: ${health.status}\n- **API Key**: ${this.client.apiKey ? 'Configurada' : 'Não informada'}`;
        } else {
          resultText = `❌ **n8n Offline ou Inacessível**\n- **URL**: ${this.client.baseUrl}\n- **Diagnóstico**: ${health.error || 'Sem resposta do servidor'}\n- **Dica**: Certifique-se de que o contêiner ou serviço do n8n está em execução.`;
        }
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: name, tokensResponse: tokensEstimate, status: health.ok ? 'success' : 'error' });

      } else if (name === 'n8n_listar_fluxos') {
        const res = await this.client.getWorkflows();
        const data = (res && Array.isArray(res.data)) ? res.data : [];
        resultText = ResponseFormatter.formatWorkflowsList(data);
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_obter_fluxo') {
        if (!args.id) {
          throw new Error('Parâmetro obrigatório ausente: id');
        }
        const res = await this.client.getWorkflow(args.id);
        if (args.detalhe) {
          resultText = JSON.stringify(res, null, 2);
        } else {
          resultText = ResponseFormatter.formatWorkflowSummary(res);
        }
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_criar_fluxo') {
        if (!args.name) {
          throw new Error('Parâmetro obrigatório ausente: name');
        }
        const payload = {
          name: args.name,
          nodes: Array.isArray(args.nodes) ? args.nodes : [],
          connections: (args.connections && typeof args.connections === 'object') ? args.connections : {},
          active: false
        };
        const res = await this.client.createWorkflow(payload);
        resultText = `✅ Fluxo "${args.name}" criado com sucesso! ID: \`${res.id || 'N/A'}\``;
        tokensEstimate = 25;
        audit.log({ operation: name, tokensResponse: tokensEstimate });
        
      } else if (name === 'n8n_atualizar_fluxo') {
        if (!args.id) {
          throw new Error('Parâmetro obrigatório ausente: id');
        }
        const payload = {};
        if (args.name !== undefined) payload.name = args.name;
        if (args.nodes !== undefined) payload.nodes = args.nodes;
        if (args.connections !== undefined) payload.connections = args.connections;
        if (args.settings !== undefined) {
          payload.settings = args.settings;
        } else {
          try {
            const existing = await this.client.getWorkflow(args.id);
            payload.settings = {
              executionOrder: (existing && existing.settings && existing.settings.executionOrder) || 'v1'
            };
          } catch (_) {
            payload.settings = { executionOrder: 'v1' };
          }
        }
        
        await this.client.updateWorkflow(args.id, payload);
        resultText = `✅ Fluxo \`${args.id}\` atualizado com sucesso no n8n.`;
        tokensEstimate = 20;
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_ativar_fluxo') {
        if (!args.id || args.active === undefined) {
          throw new Error('Parâmetros obrigatórios ausentes: id e active');
        }
        await this.client.setWorkflowActive(args.id, Boolean(args.active));
        resultText = `✅ Fluxo \`${args.id}\` foi ${args.active ? 'ativado' : 'desativado'} com sucesso.`;
        tokensEstimate = 20;
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_listar_execucoes') {
        const res = await this.client.getExecutions(args.status, args.workflowId, args.limit || 20);
        const data = (res && Array.isArray(res.data)) ? res.data : [];
        resultText = ResponseFormatter.formatExecutionsList(data);
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_obter_execucao') {
        if (!args.id) {
          throw new Error('Parâmetro obrigatório ausente: id');
        }
        const res = await this.client.getExecution(args.id);
        resultText = JSON.stringify(res, null, 2);
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_executar_webhook') {
        if (!args.url) {
          throw new Error('Parâmetro obrigatório ausente: url');
        }
        const res = await this.client.triggerWebhook(args.url, args.data || {});
        resultText = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${args.url})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_auditoria') {
        resultText = audit.getReport();
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);

      } else if (this.dynamicToolsMap.has(name)) {
        const webhookPath = this.dynamicToolsMap.get(name);
        const res = await this.client.triggerWebhook(webhookPath, args.data !== undefined ? args.data : args);
        resultText = typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res);
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `DynamicTool(${name})`, tokensResponse: tokensEstimate });
        
      } else {
        throw new Error(`Ferramenta desconhecida: "${name}"`);
      }

      this.sendResult(id, {
        content: [{ type: 'text', text: resultText }],
        isError: false
      });

    } catch (e) {
      audit.log({ operation: name || 'tools/call', status: 'error', error: e });
      this.sendResult(id, {
        content: [{ type: 'text', text: `⚠️ Falha ao executar "${name}": ${e.message}` }],
        isError: true
      });
    }
  }
}

// Inicia o servidor se executado diretamente
if (require.main === module) {
  new MCPServer();
}

module.exports = MCPServer;

