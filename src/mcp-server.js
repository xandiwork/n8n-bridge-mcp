const readline = require('readline');
const config = require('./config');
const audit = require('./audit');
const N8nClient = require('./n8n-client');
const ResponseFormatter = require('./formatter');

class MCPServer {
  constructor() {
    try {
      const { baseUrl, apiKey } = config.required;
      this.client = new N8nClient(baseUrl, apiKey);
      this.dynamicToolsMap = new Map(); // Para guardar os caminhos dos webhooks das ferramentas dinâmicas
    } catch (e) {
      this.sendError(null, -32000, e.message);
      process.exit(1);
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    this.rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        this.handleMessage(msg);
      } catch (e) {
        // Ignorar linhas não JSON
      }
    });
  }

  send(msg) {
    console.log(JSON.stringify(msg));
  }

  sendError(id, code, message) {
    this.send({
      jsonrpc: '2.0',
      id,
      error: { code, message }
    });
  }

  sendResult(id, result) {
    this.send({
      jsonrpc: '2.0',
      id,
      result
    });
  }
  
  toSnakeCase(str) {
    return str.replace(/\W+/g, '_').toLowerCase();
  }

  async handleMessage(msg) {
    if (msg.method === 'initialize') {
      this.sendResult(msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'n8n-bridge-neuralvault', version: '2.0.0' }
      });
    } else if (msg.method === 'notifications/initialized') {
      // Setup completo
    } else if (msg.method === 'tools/list') {
      const staticTools = [
        {
          name: 'n8n_saude',
          description: 'Verifica se o n8n está online.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'n8n_listar_fluxos',
          description: 'Retorna um índice compacto de todos os fluxos com seus pesos estimados.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'n8n_obter_fluxo',
          description: 'Obtém um fluxo. Por padrão traz um resumo. Para trazer o JSON completo, passe detalhe: true',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID do fluxo' },
              detalhe: { type: 'boolean', description: 'Se true, retorna o JSON integral. Se false, retorna resumo.' }
            },
            required: ['id']
          }
        },
        {
          name: 'n8n_criar_fluxo',
          description: 'Cria um novo fluxo no n8n.',
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
          description: 'Ativa ou desativa um fluxo.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              active: { type: 'boolean' }
            },
            required: ['id', 'active']
          }
        },
        {
          name: 'n8n_listar_execucoes',
          description: 'Lista as execuções recentes.',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', description: 'success, error, etc' },
              workflowId: { type: 'string' },
              limit: { type: 'number', description: 'Padrão 20' }
            }
          }
        },
        {
          name: 'n8n_obter_execucao',
          description: 'Detalhes completos de uma execução pelo ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string' }
            },
            required: ['id']
          }
        },
        {
          name: 'n8n_executar_webhook',
          description: 'Dispara um webhook enviando JSON.',
          inputSchema: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Path do webhook, ex: webhook/teste' },
              data: { type: 'object', description: 'Payload em JSON' }
            },
            required: ['url']
          }
        },
        {
          name: 'n8n_auditoria',
          description: 'Retorna o relatório de operações e consumo de tokens da sessão atual.',
          inputSchema: { type: 'object', properties: {} }
        }
      ];

      let dynamicTools = [];
      try {
        const res = await this.client.getWorkflows();
        const data = res.data || [];
        const mcpFlows = data.filter(wf => wf.tags && wf.tags.some(t => t.name === 'mcp-tool'));
        
        for (const wf of mcpFlows) {
          const toolName = this.toSnakeCase(wf.name);
          
          // Buscar detalhes do fluxo para achar o caminho do webhook
          const wfDetails = await this.client.getWorkflow(wf.id);
          const nodes = wfDetails.nodes || [];
          const webhookNode = nodes.find(n => n.type === 'n8n-nodes-base.webhook');
          const webhookPath = webhookNode && webhookNode.parameters ? webhookNode.parameters.path : toolName;
          
          // Guarda no mapa para usar em tools/call
          this.dynamicToolsMap.set(toolName, webhookPath);

          dynamicTools.push({
            name: toolName,
            description: `[Dynamic Tool] Fluxo n8n: ${wf.name}`,
            inputSchema: {
              type: 'object',
              properties: {
                data: { type: 'object', description: 'Payload em JSON para o webhook' }
              }
            }
          });
        }
      } catch (err) {
        audit.log({ operation: 'fetch_dynamic_tools', status: 'error', error: err });
      }

      this.sendResult(msg.id, {
        tools: [...staticTools, ...dynamicTools]
      });
    } else if (msg.method === 'tools/call') {
      await this.handleToolCall(msg);
    }
  }

  async handleToolCall(msg) {
    const { name, arguments: args } = msg.params;
    let result = '';
    let tokensEstimate = 0;
    
    try {
      if (name === 'n8n_saude') {
        const res = await this.client.healthCheck();
        result = `✅ n8n Online. Status: ${res.status || 'OK'}`;
        tokensEstimate = 10;
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_listar_fluxos') {
        const res = await this.client.getWorkflows();
        const data = res.data || [];
        result = ResponseFormatter.formatWorkflowsList(data);
        tokensEstimate = ResponseFormatter.estimateTokens(result);
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_obter_fluxo') {
        const res = await this.client.getWorkflow(args.id);
        if (args.detalhe) {
          result = JSON.stringify(res, null, 2);
        } else {
          result = ResponseFormatter.formatWorkflowSummary(res);
        }
        tokensEstimate = ResponseFormatter.estimateTokens(result);
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_criar_fluxo') {
        const payload = {
          name: args.name,
          nodes: args.nodes || [],
          connections: args.connections || {},
          active: false
        };
        const res = await this.client.createWorkflow(payload);
        result = `Fluxo criado com sucesso. ID: ${res.id}`;
        tokensEstimate = 20;
        audit.log({ operation: name, tokensResponse: tokensEstimate });
        
      } else if (name === 'n8n_atualizar_fluxo') {
        const payload = {};
        if (args.name) payload.name = args.name;
        if (args.nodes) payload.nodes = args.nodes;
        if (args.connections) payload.connections = args.connections;
        
        const res = await this.client.updateWorkflow(args.id, payload);
        result = `Fluxo ${args.id} atualizado com sucesso.`;
        tokensEstimate = 20;
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_ativar_fluxo') {
        await this.client.setWorkflowActive(args.id, args.active);
        result = `Fluxo ${args.id} foi ${args.active ? 'ativado' : 'desativado'} com sucesso.`;
        tokensEstimate = 20;
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_listar_execucoes') {
        const res = await this.client.getExecutions(args.status, args.workflowId, args.limit);
        const data = res.data || [];
        result = ResponseFormatter.formatExecutionsList(data);
        tokensEstimate = ResponseFormatter.estimateTokens(result);
        audit.log({ operation: name, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_obter_execucao') {
        const res = await this.client.getExecution(args.id);
        result = JSON.stringify(res, null, 2);
        tokensEstimate = ResponseFormatter.estimateTokens(result);
        audit.log({ operation: `${name}(${args.id})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_executar_webhook') {
        const res = await this.client.triggerWebhook(args.url, args.data);
        result = JSON.stringify(res, null, 2);
        tokensEstimate = ResponseFormatter.estimateTokens(result);
        audit.log({ operation: `${name}(${args.url})`, tokensResponse: tokensEstimate });

      } else if (name === 'n8n_auditoria') {
        result = audit.getReport();
        // Não auditar a própria ferramenta de auditoria para evitar loops infinitos visuais
        
      } else if (this.dynamicToolsMap.has(name)) {
        // Ferramenta Dinâmica
        const webhookPath = this.dynamicToolsMap.get(name);
        const res = await this.client.triggerWebhook(webhookPath, args.data || args);
        result = JSON.stringify(res, null, 2);
        tokensEstimate = ResponseFormatter.estimateTokens(result);
        audit.log({ operation: `DynamicTool(${name})`, tokensResponse: tokensEstimate });
        
      } else {
        throw new Error(`Tool unknown: ${name}`);
      }

      this.sendResult(msg.id, {
        content: [{ type: 'text', text: result }]
      });

    } catch (e) {
      audit.log({ operation: name, status: 'error', error: e });
      this.sendResult(msg.id, {
        isError: true,
        content: [{ type: 'text', text: `Erro ao executar ${name}: ${e.message}` }]
      });
    }
  }
}

new MCPServer();
