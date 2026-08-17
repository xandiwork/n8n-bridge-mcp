const config = require('../src/config');
const N8nClient = require('../src/n8n-client');

async function testConnection() {
  console.log('🤖 Testando conexão do n8n-bridge-mcp...');
  try {
    const { baseUrl, apiKey, timeout } = config.required;
    console.log(`URL: ${baseUrl}`);
    console.log(`Timeout: ${timeout}ms`);
    console.log(`API Key: ${apiKey ? 'Configurada' : 'Não configurada'}`);
    
    const client = new N8nClient(baseUrl, apiKey, timeout);
    
    console.log('\n1. Testando Health Check (probe rápido)...');
    const health = await client.healthCheck(3000);
    console.log('Health Result:', health);

    if (health.ok) {
      console.log('\n2. Testando Listagem de Fluxos...');
      const workflows = await client.getWorkflows(5000);
      const data = workflows.data || [];
      console.log(`✅ Sucesso! Encontrados ${data.length} fluxos.`);
      if (data.length > 0) {
        console.log(`Primeiro fluxo: ${data[0].name} (ID: ${data[0].id})`);
      }
    } else {
      console.log('⚠️ n8n está offline ou inacessível no momento.');
    }

  } catch (e) {
    console.error('❌ Erro no teste:', e.message);
  }
}

testConnection();

