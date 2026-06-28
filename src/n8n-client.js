class N8nClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  // Padrão inspirado no NeuralVault: fallback e resiliência com fetch nativo
  async request(method, path, body = null) {
    const url = this.baseUrl + path;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout

    const options = {
      method,
      headers: {
        'Accept': 'application/json',
        'X-N8N-API-KEY': this.apiKey
      },
      signal: controller.signal
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textData = await response.text();
        try {
          data = JSON.parse(textData);
        } catch (e) {
          data = { result: textData };
        }
      }

      if (response.ok) {
        return data;
      } else {
        const err = new Error(`n8n API Error: ${response.status} - ${JSON.stringify(data)}`);
        err.statusCode = response.status;
        err.data = data;
        throw err;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Timeout ao conectar com ${this.baseUrl}`);
      }

      // Diagnóstico automático para erros comuns de conexão
      if (error.cause && error.cause.code === 'ECONNREFUSED') {
        error.message = `Conexão recusada ao n8n em ${this.baseUrl}. O serviço está rodando?`;
      } else if (error.message.includes('fetch failed')) {
        error.message = `Falha na requisição para ${this.baseUrl}: ${error.message}`;
      }

      throw error;
    }
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
  
  async createWorkflow(data) {
    return this.request('POST', '/api/v1/workflows', data);
  }
  
  async updateWorkflow(id, data) {
    return this.request('PUT', `/api/v1/workflows/${id}`, data);
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
