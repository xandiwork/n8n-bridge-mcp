const config = require('../src/config');
const N8nClient = require('../src/n8n-client');

async function testConnection() {
  console.log('Testando conexão com o n8n...');
  try {
    const { baseUrl, apiKey } = config.required;
    console.log(`URL: ${baseUrl}`);
    const client = new N8nClient(baseUrl, apiKey);
    
    console.log('1. Testando Health Check...');
    const health = await client.healthCheck();
    console.log('Health:', health);

    console.log('\n2. Testando Listagem de Fluxos...');
    const workflows = await client.getWorkflows();
    console.log(`Sucesso! Encontrados ${workflows.data ? workflows.data.length : 0} fluxos.`);
    if (workflows.data && workflows.data.length > 0) {
      console.log(`Primeiro fluxo: ${workflows.data[0].name} (ID: ${workflows.data[0].id})`);
    }

  } catch (e) {
    console.error('❌ Erro no teste:', e.message);
  }
}

testConnection();
