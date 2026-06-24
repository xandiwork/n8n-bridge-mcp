const fs = require('fs');
const path = require('path');
const readline = require('readline');
const http = require('http');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (question) => new Promise(resolve => rl.question(question, resolve));

async function checkHealth(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/healthz`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
  });
}

async function main() {
  console.log('🤖 n8n-bridge Setup\n=====================\n');

  let defaultUrl = 'http://localhost:5678';
  console.log(`Testando n8n local em ${defaultUrl}...`);
  let isOnline = await checkHealth(defaultUrl);

  let baseUrl = defaultUrl;
  if (!isOnline) {
    console.log('❌ O n8n não parece estar rodando em localhost:5678.');
    baseUrl = await ask('Qual é a URL base do seu n8n? (ex: http://meu-n8n.com): ');
  } else {
    console.log('✅ n8n local encontrado!');
  }

  baseUrl = baseUrl.replace(/\/$/, ''); // Remove barra final

  console.log('\nPara obter sua API Key no n8n: Settings -> n8n API -> Create API Key');
  const apiKey = await ask('Cole sua N8N_API_KEY: ');

  if (!apiKey) {
    console.log('⚠️ API Key é obrigatória. Setup cancelado.');
    process.exit(1);
  }

  const envContent = `N8N_BASE_URL=${baseUrl}\nN8N_API_KEY=${apiKey}\nN8N_TIMEOUT=30000\n`;
  const envPath = path.resolve(__dirname, '../.env');
  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ .env configurado com sucesso!');

  // Configurar no IDE
  console.log('\nTentando configurar o mcp_config.json da IDE...');
  // O caminho no Windows costuma ser %USERPROFILE%\.gemini\config\mcp_config.json
  const homeDir = process.env.USERPROFILE || process.env.HOME;
  const mcpConfigPath = path.join(homeDir, '.gemini', 'config', 'mcp_config.json');

  const serverPath = path.resolve(__dirname, '../src/mcp-server.js').replace(/\\/g, '/');

  if (fs.existsSync(mcpConfigPath)) {
    try {
      const configData = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      if (!configData.mcpServers) configData.mcpServers = {};
      
      configData.mcpServers['n8n-bridge'] = {
        command: "node",
        args: [serverPath]
      };

      fs.writeFileSync(mcpConfigPath, JSON.stringify(configData, null, 2));
      console.log('✅ mcp_config.json atualizado com sucesso!');
    } catch (e) {
      console.log('❌ Erro ao atualizar mcp_config.json:', e.message);
      console.log('Por favor, adicione manualmente:');
      console.log(`"n8n-bridge": { "command": "node", "args": ["${serverPath}"] }`);
    }
  } else {
    console.log('⚠️ mcp_config.json não encontrado. Você precisa configurá-lo manualmente.');
  }

  console.log('\n🎉 Setup concluído! Reinicie a IDE ou a sessão do chat para que o agente carregue as ferramentas MCP.');
  rl.close();
}

main().catch(console.error);
