/**
 * test_mcp_robustness.js
 * Teste automatizado de robustez, conformidade de protocolo MCP (2024-11-05)
 * e integridade de stdio (JSON-RPC 2.0).
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

async function runRobustnessSuite() {
  console.log('====================================================');
  console.log('🧪 Iniciando Bateria de Testes de Robustez MCP n8n');
  console.log('====================================================\n');

  const serverPath = path.resolve(__dirname, '../src/mcp-server.js');
  const serverProcess = spawn('node', [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      N8N_BASE_URL: 'http://127.0.0.1:59999', // Porta deliberadamente fechada/offline para teste
      N8N_API_KEY: 'test_token_offline',
      N8N_TIMEOUT: '1500',
      MCP_DEBUG: 'false'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const receivedFrames = [];
  const stderrLogs = [];
  let testsPassed = 0;
  let testsFailed = 0;

  const stdoutRl = readline.createInterface({
    input: serverProcess.stdout,
    terminal: false
  });

  const stderrRl = readline.createInterface({
    input: serverProcess.stderr,
    terminal: false
  });

  stdoutRl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const parsed = JSON.parse(trimmed);
      receivedFrames.push({ raw: trimmed, parsed });
    } catch (err) {
      receivedFrames.push({ raw: trimmed, parseError: err.message });
    }
  });

  stderrRl.on('line', (line) => {
    stderrLogs.push(line);
  });

  // Função auxiliar para esperar resposta por id
  function waitForResponse(reqId, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        const match = receivedFrames.find(f => f.parsed && f.parsed.id === reqId);
        if (match) {
          clearInterval(interval);
          resolve(match.parsed);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout aguardando resposta para ID ${reqId} após ${timeoutMs}ms`));
        }
      }, 50);
    });
  }

  function sendRpc(msg) {
    const data = JSON.stringify(msg) + '\n';
    serverProcess.stdin.write(data);
  }

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      testsFailed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // TESTE 1: Handshake `initialize`
    // -----------------------------------------------------------------
    console.log('📌 Teste 1: Handshake initialize (MCP 2024-11-05)');
    sendRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-runner', version: '1.0.0' }
      }
    });

    const initRes = await waitForResponse(1, 3000);
    assert(initRes.jsonrpc === '2.0', 'JSON-RPC version é 2.0');
    assert(initRes.result && initRes.result.protocolVersion === '2024-11-05', 'Protocol version é 2024-11-05');
    assert(initRes.result && initRes.result.serverInfo && initRes.result.serverInfo.name === 'n8n-bridge-mcp', 'serverInfo.name retornado corretamente');
    assert(initRes.result && initRes.result.capabilities && initRes.result.capabilities.tools, 'Capabilities de tools declaradas');

    // -----------------------------------------------------------------
    // TESTE 2: Notificação `notifications/initialized`
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 2: Notificação notifications/initialized (não deve gerar resposta no stdout)');
    const countBeforeNotification = receivedFrames.length;
    serverProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    }) + '\n');
    await new Promise(r => setTimeout(r, 200));
    assert(receivedFrames.length === countBeforeNotification, 'Nenhuma resposta indevida enviada para notificação');

    // -----------------------------------------------------------------
    // TESTE 3: Método `ping`
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 3: Ping MCP');
    sendRpc({
      jsonrpc: '2.0',
      id: 2,
      method: 'ping'
    });
    const pingRes = await waitForResponse(2, 2000);
    assert(pingRes.id === 2, 'ID da resposta do ping coincide com a requisição');
    assert(pingRes.result !== undefined, 'Ping retornou objeto de resultado');

    // -----------------------------------------------------------------
    // TESTE 4: `tools/list` com n8n offline (deve responder rápido sem travar)
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 4: tools/list com n8n offline');
    const startToolsList = Date.now();
    sendRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list'
    });
    const toolsRes = await waitForResponse(3, 4000);
    const duration = Date.now() - startToolsList;
    assert(duration < 3500, `tools/list respondeu rapidamente em ${duration}ms mesmo com n8n offline`);
    assert(toolsRes.result && Array.isArray(toolsRes.result.tools), 'Retornou array de ferramentas');
    const toolNames = (toolsRes.result.tools || []).map(t => t.name);
    assert(toolNames.includes('n8n_saude'), 'Ferramenta n8n_saude presente');
    assert(toolNames.includes('n8n_listar_fluxos'), 'Ferramenta n8n_listar_fluxos presente');
    assert(toolNames.includes('n8n_obter_fluxo'), 'Ferramenta n8n_obter_fluxo presente');
    assert(toolNames.includes('n8n_criar_fluxo'), 'Ferramenta n8n_criar_fluxo presente');
    assert(toolNames.includes('n8n_atualizar_fluxo'), 'Ferramenta n8n_atualizar_fluxo presente');
    assert(toolNames.includes('n8n_ativar_fluxo'), 'Ferramenta n8n_ativar_fluxo presente');
    assert(toolNames.includes('n8n_listar_execucoes'), 'Ferramenta n8n_listar_execucoes presente');
    assert(toolNames.includes('n8n_obter_execucao'), 'Ferramenta n8n_obter_execucao presente');
    assert(toolNames.includes('n8n_executar_webhook'), 'Ferramenta n8n_executar_webhook presente');
    assert(toolNames.includes('n8n_auditoria'), 'Ferramenta n8n_auditoria presente');

    // -----------------------------------------------------------------
    // TESTE 5: `tools/call` para `n8n_saude` (offline)
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 5: Chamada n8n_saude (probe com n8n offline)');
    sendRpc({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'n8n_saude',
        arguments: {}
      }
    });
    const healthCallRes = await waitForResponse(4, 4000);
    assert(healthCallRes.result && Array.isArray(healthCallRes.result.content), 'Retornou content array');
    const healthText = (healthCallRes.result && healthCallRes.result.content[0]) ? healthCallRes.result.content[0].text : '';
    assert(healthText.includes('Offline ou Inacessível') || healthText.includes('Online'), 'Diagnóstico de saúde claro retornado');

    // -----------------------------------------------------------------
    // TESTE 6: `tools/call` para `n8n_listar_fluxos` (offline -> erro estruturado)
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 6: Chamada n8n_listar_fluxos com n8n offline');
    sendRpc({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'n8n_listar_fluxos',
        arguments: {}
      }
    });
    const listWorkflowsRes = await waitForResponse(5, 7000);
    assert(listWorkflowsRes.result && listWorkflowsRes.result.isError === true, 'isError marcado como true para falha de conexão');
    const listText = (listWorkflowsRes.result && listWorkflowsRes.result.content[0]) ? listWorkflowsRes.result.content[0].text : '';
    assert(listText.includes('Falha ao executar') || listText.includes('offline'), 'Mensagem informativa de erro retornada');

    // -----------------------------------------------------------------
    // TESTE 7: `tools/call` para `n8n_obter_fluxo` sem parâmetro obrigatório
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 7: Chamada n8n_obter_fluxo sem ID');
    sendRpc({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'n8n_obter_fluxo',
        arguments: {}
      }
    });
    const missingParamRes = await waitForResponse(6, 2000);
    assert(missingParamRes.result && missingParamRes.result.isError === true, 'Tratamento de parâmetro ausente com isError: true');

    // -----------------------------------------------------------------
    // TESTE 8: `tools/call` para `n8n_auditoria`
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 8: Chamada n8n_auditoria');
    sendRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'n8n_auditoria',
        arguments: {}
      }
    });
    const auditRes = await waitForResponse(7, 2000);
    assert(auditRes.result && !auditRes.result.isError, 'Auditoria executou com sucesso');
    const auditText = (auditRes.result && auditRes.result.content[0]) ? auditRes.result.content[0].text : '';
    assert(auditText.includes('Relatório de Auditoria'), 'Relatório em Markdown gerado corretamente');

    // -----------------------------------------------------------------
    // TESTE 9: Ferramenta desconhecida
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 9: Chamada para ferramenta desconhecida');
    sendRpc({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'ferramenta_inexistente',
        arguments: {}
      }
    });
    const unknownToolRes = await waitForResponse(8, 2000);
    assert(unknownToolRes.result && unknownToolRes.result.isError === true, 'Ferramenta inexistente tratada graciosamente');

    // -----------------------------------------------------------------
    // TESTE 10: Método JSON-RPC desconhecido
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 10: Método JSON-RPC inexistente');
    sendRpc({
      jsonrpc: '2.0',
      id: 9,
      method: 'metodo_nao_existente',
      params: {}
    });
    const unknownMethodRes = await waitForResponse(9, 2000);
    assert(unknownMethodRes.error && unknownMethodRes.error.code === -32601, 'Retornou erro -32601 Method not found');

    // -----------------------------------------------------------------
    // TESTE 11: Linha inválida não-JSON enviada ao stdin
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 11: Envio de string malformada / não-JSON');
    serverProcess.stdin.write('ESTOQUE_INVALIDO_NAO_JSON\n');
    await new Promise(r => setTimeout(r, 200));
    const parseErrorFrame = receivedFrames.find(f => f.parsed && f.parsed.error && f.parsed.error.code === -32700);
    assert(parseErrorFrame !== undefined, 'Parse Error -32700 retornado para entrada inválida');

    // -----------------------------------------------------------------
    // TESTE 12: Integridade de stdout (Zero poluição)
    // -----------------------------------------------------------------
    console.log('\n📌 Teste 12: Verificação de Integridade de stdout (Nenhuma linha inválida)');
    let nonJsonCount = 0;
    receivedFrames.forEach(f => {
      if (f.parseError || !f.parsed || f.parsed.jsonrpc !== '2.0') {
        nonJsonCount++;
      }
    });
    assert(nonJsonCount === 0, `Integridade total de stdout confirmada (todas as ${receivedFrames.length} mensagens são JSON-RPC 2.0 estritas)`);

  } catch (err) {
    console.error('❌ Erro inesperado durante execução da suíte:', err);
    testsFailed++;
  } finally {
    serverProcess.stdin.end();
    serverProcess.kill();
  }

  console.log('\n====================================================');
  console.log(`📊 RESUMO DOS TESTES: ${testsPassed} PASSOU | ${testsFailed} FALHOU`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runRobustnessSuite().catch((err) => {
    console.error('Erro fatal:', err);
    process.exit(1);
  });
}

module.exports = runRobustnessSuite;
