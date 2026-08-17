class N8nClient {
  constructor(baseUrl = 'http://localhost:5678', apiKey = '', defaultTimeout = 5000) {
    let cleanedUrl = (baseUrl || 'http://localhost:5678').trim();
    if (!cleanedUrl.startsWith('http://') && !cleanedUrl.startsWith('https://')) {
      cleanedUrl = 'http://' + cleanedUrl;
    }
    this.baseUrl = cleanedUrl.replace(/\/+$/, ''); // Remove barras finais
    this.apiKey = (apiKey || '').trim();
    this.defaultTimeout = Number(defaultTimeout) || 5000;
  }

  async request(method, path, body = null, customTimeout = null) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = this.baseUrl + cleanPath;
    const timeoutMs = customTimeout || this.defaultTimeout;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (_) {
        // Ignora erros ao abortar
      }
    }, timeoutMs);

    const headers = {
      'Accept': 'application/json, text/plain, */*'
    };

    if (this.apiKey) {
      headers['X-N8N-API-KEY'] = this.apiKey;
    }

    const options = {
      method: method.toUpperCase(),
      headers,
      signal: controller.signal
    };

    if (body !== null && body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      const contentType = response.headers.get('content-type') || '';
      let data;
      
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          data = { message: 'Erro ao converter resposta JSON do n8n' };
        }
      } else {
        const textData = await response.text();
        try {
          data = JSON.parse(textData);
        } catch {
          data = textData ? { result: textData } : {};
        }
      }

      if (response.ok) {
        return data;
      }

      // Tratamento de códigos de erro HTTP
      let errorMessage = `n8n API Error (HTTP ${response.status})`;
      if (response.status === 401) {
        errorMessage = 'Não autorizado no n8n (HTTP 401). Verifique a N8N_API_KEY no arquivo .env.';
      } else if (response.status === 403) {
        errorMessage = 'Acesso negado no n8n (HTTP 403). A API key não tem permissões para esta ação.';
      } else if (response.status === 404) {
        errorMessage = `Recurso não encontrado no n8n (HTTP 404): ${cleanPath}`;
      } else if (response.status >= 500) {
        errorMessage = `Erro interno no servidor n8n (HTTP ${response.status}). O serviço pode estar sobrecarregado ou reiniciando.`;
      } else if (data && data.message) {
        errorMessage = `n8n Error (HTTP ${response.status}): ${data.message}`;
      }

      const err = new Error(errorMessage);
      err.statusCode = response.status;
      err.data = data;
      throw err;

    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutErr = new Error(`Timeout de conexão com o n8n em ${this.baseUrl} após ${timeoutMs}ms.`);
        timeoutErr.code = 'ETIMEDOUT';
        throw timeoutErr;
      }

      // Diagnóstico detalhado de falhas de rede do Node.js fetch
      const causeCode = (error.cause && error.cause.code) ? error.cause.code : '';
      const causeMsg = (error.cause && error.cause.message) ? error.cause.message : '';

      if (causeCode === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
        error.message = `Conexão recusada em ${this.baseUrl}. O n8n está offline ou inacessível nesta porta.`;
      } else if (causeCode === 'ENOTFOUND' || error.message.includes('ENOTFOUND')) {
        error.message = `Endereço host não encontrado: ${this.baseUrl}. Verifique a URL configurada no .env.`;
      } else if (causeCode === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
        error.message = `Tempo limite esgotado ao tentar alcançar ${this.baseUrl}.`;
      } else if (error.message.includes('fetch failed')) {
        error.message = `Falha ao conectar com n8n em ${this.baseUrl}: ${causeMsg || causeCode || 'Servidor indisponível'}`;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Ferramentas da API

  async healthCheck(timeoutMs = 3000) {
    try {
      const res = await this.request('GET', '/healthz', null, timeoutMs);
      return { ok: true, status: (res && res.status) ? res.status : 'OK', data: res };
    } catch (err) {
      // Se /healthz não responder (versões antigas do n8n), tenta testar /api/v1/workflows com limite 1
      try {
        await this.request('GET', '/api/v1/workflows?limit=1', null, timeoutMs);
        return { ok: true, status: 'OK (via API v1)', data: {} };
      } catch (fallbackErr) {
        return { ok: false, status: 'Offline', error: fallbackErr.message };
      }
    }
  }

  async getWorkflows(customTimeout = null) {
    return this.request('GET', '/api/v1/workflows?limit=100', null, customTimeout);
  }

  async getWorkflow(id, customTimeout = null) {
    return this.request('GET', `/api/v1/workflows/${encodeURIComponent(id)}`, null, customTimeout);
  }
  
  async createWorkflow(data, customTimeout = null) {
    return this.request('POST', '/api/v1/workflows', data, customTimeout);
  }
  
  async updateWorkflow(id, data, customTimeout = null) {
    return this.request('PUT', `/api/v1/workflows/${encodeURIComponent(id)}`, data, customTimeout);
  }

  async setWorkflowActive(id, active, customTimeout = null) {
    const endpoint = active ? 'activate' : 'deactivate';
    return this.request('POST', `/api/v1/workflows/${encodeURIComponent(id)}/${endpoint}`, null, customTimeout);
  }

  async getExecutions(status = null, workflowId = null, limit = 20, customTimeout = null) {
    let url = `/api/v1/executions?limit=${encodeURIComponent(limit)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (workflowId) url += `&workflowId=${encodeURIComponent(workflowId)}`;
    return this.request('GET', url, null, customTimeout);
  }

  async getExecution(id, customTimeout = null) {
    return this.request('GET', `/api/v1/executions/${encodeURIComponent(id)}`, null, customTimeout);
  }

  async triggerWebhook(path, payload, customTimeout = null) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return this.request('POST', cleanPath, payload, customTimeout);
  }
}

module.exports = N8nClient;

