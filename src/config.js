const fs = require('fs');
const path = require('path');

class Config {
  constructor() {
    this.env = {};
    this.load();
  }

  load() {
    this.env = {};
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          // Ignorar linhas vazias e comentários
          if (!trimmed || trimmed.startsWith('#')) return;

          const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
          if (match) {
            const key = match[1].trim();
            let value = match[2] !== undefined ? match[2].trim() : '';
            // Remover aspas simples ou duplas envolventes
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            this.env[key] = value;
          }
        });
      } catch (err) {
        // Erros de leitura de arquivo não devem derrubar o processo
        if (process.stderr && process.stderr.write) {
          process.stderr.write(`[n8n-bridge-config] Aviso ao ler .env: ${err.message}\n`);
        }
      }
    }
  }

  reload() {
    this.load();
  }

  get(key, defaultValue = '') {
    if (this.env[key] !== undefined && this.env[key] !== '') {
      return this.env[key];
    }
    if (process.env[key] !== undefined && process.env[key] !== '') {
      return process.env[key];
    }
    return defaultValue;
  }

  get baseUrl() {
    let url = this.get('N8N_BASE_URL', 'http://localhost:5678').trim();
    if (!url) url = 'http://localhost:5678';
    return url.replace(/\/+$/, ''); // Remove trailing slashes
  }

  get apiKey() {
    return this.get('N8N_API_KEY', '').trim();
  }

  get timeout() {
    const raw = parseInt(this.get('N8N_TIMEOUT', '5000'), 10);
    if (isNaN(raw) || raw < 500) return 5000;
    if (raw > 60000) return 60000;
    return raw;
  }

  get isConfigured() {
    return Boolean(this.baseUrl && this.baseUrl !== 'http://localhost:5678' || this.apiKey);
  }

  get required() {
    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      timeout: this.timeout
    };
  }
}

module.exports = new Config();

