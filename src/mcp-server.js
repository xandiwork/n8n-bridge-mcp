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
const vm = require('vm');
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
      id: (id !== undefined) ? id : null,
      result: result || {}
    });
  }

  toSnakeCase(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  getStaticTools() {
    return [
      {
        name: 'n8n_saude',
        description: 'Verifica conectividade e integridade do n8n (com diagnóstico detalhado).',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'n8n_listar_fluxos',
        description: 'Lista todos os fluxos com ID, nome, status, tags e peso estimado em tokens.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'n8n_obter_fluxo',
        description: 'Obtém detalhes de um fluxo pelo ID. Por padrão retorna resumo estruturado; use detalhe: true para o JSON completo.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID do fluxo' },
            detalhe: { type: 'boolean', description: 'Se true, retorna o JSON completo do fluxo' }
          },
          required: ['id']
        }
      },
      {
        name: 'n8n_criar_fluxo',
        description: 'Cria um novo fluxo no n8n (com validação prévia de nós).',
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
        description: 'Atualiza um fluxo existente no n8n com sanitização automática.',
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
        name: 'n8n_testar_codigo_no',
        description: 'Executa o código JavaScript de um nó de Code do n8n com dados simulados (dry run) via vm nativo do Node. Isolamento básico apenas — não é um sandbox de segurança; não execute código de origem não confiável.',
        inputSchema: {
          type: 'object',
          properties: {
            jsCode: { type: 'string', description: 'Código JavaScript do nó (ex: const items = $input.all(); ...)' },
            inputData: { type: 'array', description: 'Array de objetos JSON simulando os itens de entrada do nó' }
          },
          required: ['jsCode']
        }
      },
      {
        name: 'n8n_listar_credenciais',
        description: 'Lista com segurança os nomes e tipos de credenciais configuradas na instância do n8n (sem expor senhas/tokens).',
        inputSchema: { type: 'object', properties: {} }
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
          version: '2.1.0'
        }
      });
      return;
    }

    // 2. Notificação MCP: notifications/initialized
    if (method === 'notifications/initialized') {
      return;
    }

    // 3. Ping Liveness
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
          settings: { executionOrder: 'v1' },
          active: false
        };
        const res = await this.client.createWorkflow(payload);
        resultText = `✅ **Fluxo criado com sucesso!**\n- **ID**: ${res.id}\n- **Nome**: ${res.name}\n- **Nós**: ${Array.isArray(res.nodes) ? res.nodes.length : 0}`;
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${res.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_atualizar_fluxo') {
        if (!args.id) {
          throw new Error('Parâmetro obrigatório ausente: id');
        }
        const payload = {};
        if (args.name) payload.name = args.name;
        if (args.nodes) payload.nodes = args.nodes;
        if (args.connections) payload.connections = args.connections;
        payload.settings = { executionOrder: 'v1' };

        const res = await this.client.updateWorkflow(args.id, payload);
        resultText = `✅ **Fluxo atualizado com sucesso!**\n- **ID**: ${res.id}\n- **Nome**: ${res.name}\n- **Nós**: ${Array.isArray(res.nodes) ? res.nodes.length : 0}`;
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_ativar_fluxo') {
        if (!args.id || args.active === undefined) {
          throw new Error('Parâmetros obrigatórios ausentes: id e active');
        }
        const res = await this.client.setWorkflowActive(args.id, Boolean(args.active));
        const statusStr = res.active ? 'Ativado' : 'Desativado';
        resultText = `✅ **Fluxo ${statusStr} com sucesso!** (ID: ${args.id})`;
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${args.id}, active=${args.active})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_listar_execucoes') {
        const limit = args.limit || 20;
        const res = await this.client.getExecutions(args.status, args.workflowId, limit);
        const data = (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
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

      } else if (name === 'n8n_testar_codigo_no') {
        if (!args.jsCode) {
          throw new Error('Parâmetro obrigatório ausente: jsCode');
        }
        const mockInput = Array.isArray(args.inputData) ? args.inputData.map(d => ({ json: d })) : [{ json: {} }];
        
        // Contexto simulado do n8n Code Node
        const sandbox = {
          $input: {
            all: () => mockInput,
            first: () => mockInput[0],
            item: (idx = 0) => mockInput[idx]
          },
          console: {
            log: (...m) => {},
            error: (...m) => {}
          }
        };

        const context = vm.createContext(sandbox);
        const wrappedCode = `(function() {\n${args.jsCode}\n})()`;
        const script = new vm.Script(wrappedCode, { timeout: 2000 });
        const output = script.runInContext(context);
        
        resultText = `🧪 **Resultado do Teste de Código do Nó (Dry Run):**\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``;
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_listar_credenciais') {
        const creds = await this.client.getCredentials();
        resultText = ResponseFormatter.formatCredentialsList(creds);
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_executar_webhook') {
        if (!args.url) {
          throw new Error('Parâmetro obrigatório ausente: url');
        }
        const res = await this.client.triggerWebhook(args.url, args.data || {});
        resultText = `⚡ **Webhook disparado com sucesso!**\n- **URL**: ${args.url}\n- **Resposta**: \`\`\`json\n${JSON.stringify(res, null, 2)}\n\`\`\``;
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `${name}(${args.url})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_auditoria') {
        resultText = audit.getReport();
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);

      } else if (this.dynamicToolsMap.has(name)) {
        const webhookPath = this.dynamicToolsMap.get(name);
        const res = await this.client.triggerWebhook(webhookPath, (args && args.data) || args || {});
        resultText = `⚡ **Fluxo dinâmico '${name}' executado via webhook!**\n- **Resposta**: \`\`\`json\n${JSON.stringify(res, null, 2)}\n\`\`\``;
        tokensEstimate = ResponseFormatter.estimateTokens(resultText);
        audit.log({ operation: `dynamic_tool(${name})`, tokensResponse: tokensEstimate });

      } else {
        throw new Error(`Ferramenta desconhecida: ${name}`);
      }

    } catch (err) {
      isError = true;
      resultText = `❌ **Erro ao executar ${name}:** ${err.message}`;
      tokensEstimate = ResponseFormatter.estimateTokens(resultText);
      audit.log({ operation: name, tokensResponse: tokensEstimate, status: 'error', error: err.message });
    }

    this.sendResult(id, {
      content: [
        {
          type: 'text',
          text: resultText
        }
      ],
      isError
    });
  }
}

if (require.main === module) {
  new MCPServer();
}

module.exports = MCPServer;
