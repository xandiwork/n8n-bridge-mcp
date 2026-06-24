const fs = require('fs');
const path = require('path');

class Config {
  constructor() {
    this.env = {};
    this.load();
  }

  load() {
    // Busca o .env na raiz do projeto (um nível acima de src)
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || '';
          // Remove aspas
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          this.env[key] = value;
        }
      });
    }
  }

  get(key, defaultValue = '') {
    return this.env[key] || process.env[key] || defaultValue;
  }

  get required() {
    const baseUrl = this.get('N8N_BASE_URL');
    const apiKey = this.get('N8N_API_KEY');
    
    if (!baseUrl) {
      throw new Error('Configuração ausente: N8N_BASE_URL. Crie um arquivo .env na raiz do n8n-bridge.');
    }
    
    return { baseUrl, apiKey };
  }
}

module.exports = new Config();
