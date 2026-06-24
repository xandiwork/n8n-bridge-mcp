const http = require('http');
const https = require('https');

class N8nClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  // Padrão inspirado no NeuralVault: fallback e resiliência
  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const isHttps = this.baseUrl.startsWith('https');
      const client = isHttps ? https : http;
      
      const url = new URL(this.baseUrl + path);
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Accept': 'application/json',
          'X-N8N-API-KEY': this.apiKey
        },
        timeout: 10000 // 10 segundos timeout
      };

      if (body) {
        options.headers['Content-Type'] = 'application/json';
      }

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = data ? JSON.parse(data) : {};
              resolve(parsed);
            } catch (e) {
              // Fallback para texto plano se não for JSON
              resolve({ result: data });
            }
          } else {
            const err = new Error(`n8n API Error: ${res.statusCode} - ${data}`);
            err.statusCode = res.statusCode;
            err.data = data;
            reject(err);
          }
        });
      });

      req.on('error', (e) => {
        // Diagnóstico automático para erros comuns
        if (e.code === 'ECONNREFUSED') {
          e.message = `Conexão recusada ao n8n em ${this.baseUrl}. O serviço está rodando?`;
        }
        reject(e);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout ao conectar com ${this.baseUrl}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  // Ferramentas da API

  async healthCheck() {
    return this.request('GET', '/healthz');
  }

  async getWorkflows() {
    return this.request('GET', '/api/v1/workflows?limit=100');
  }

  async getWorkflow(id) {
    return this.request('GET', `/api/v1/workflows/${id}`);
  }

  async setWorkflowActive(id, active) {
    // A API v1 não usa PATCH /id {active}. Usa endpoints específicos.
    const endpoint = active ? 'activate' : 'deactivate';
    return this.request('POST', `/api/v1/workflows/${id}/${endpoint}`);
  }

  async getExecutions(status = null, workflowId = null, limit = 20) {
    let url = `/api/v1/executions?limit=${limit}`;
    if (status) url += `&status=${status}`;
    if (workflowId) url += `&workflowId=${workflowId}`;
    return this.request('GET', url);
  }

  async getExecution(id) {
    return this.request('GET', `/api/v1/executions/${id}`);
  }

  async triggerWebhook(path, payload) {
    // Webhooks no n8n tipicamente não ficam em /api/v1/, mas no root (ou /webhook/)
    const fullPath = path.startsWith('/') ? path : `/${path}`;
    return this.request('POST', fullPath, payload);
  }
}

module.exports = N8nClient;
