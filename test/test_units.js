/**
 * test_units.js
 * Testes unitários para Config, AuditTrail, ResponseFormatter e N8nClient.
 */

const assert = require('assert');
const config = require('../src/config');
const audit = require('../src/audit');
const ResponseFormatter = require('../src/formatter');
const N8nClient = require('../src/n8n-client');

console.log('🧪 Executando Testes Unitários de Módulos...');

// 1. Config Test
console.log('1. Testando Config...');
assert.strictEqual(typeof config.baseUrl, 'string', 'baseUrl deve ser string');
assert.strictEqual(typeof config.timeout, 'number', 'timeout deve ser number');
assert(config.timeout >= 500 && config.timeout <= 60000, 'timeout deve estar nos limites');
assert.strictEqual(typeof config.required, 'object', 'required deve retornar objeto');
console.log('   ✅ Config OK');

// 2. ResponseFormatter Test
console.log('2. Testando ResponseFormatter...');
const emptyWfList = ResponseFormatter.formatWorkflowsList([]);
assert(emptyWfList.includes('Nenhum fluxo encontrado'), 'Lista vazia tratada corretamente');

const sampleWfs = [
  { id: '1', name: 'Fluxo Teste', active: true, tags: [{ name: 'mcp-tool' }] }
];
const formattedWfs = ResponseFormatter.formatWorkflowsList(sampleWfs);
assert(formattedWfs.includes('Fluxo Teste') && formattedWfs.includes('mcp-tool'), 'Formatação de fluxos correta');

const sampleWfDetail = {
  id: '1',
  name: 'Fluxo Teste',
  active: true,
  createdAt: '2026-08-17T12:00:00Z',
  nodes: [{ name: 'Webhook', type: 'n8n-nodes-base.webhook' }],
  connections: { Webhook: { main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]] } }
};
const formattedSummary = ResponseFormatter.formatWorkflowSummary(sampleWfDetail);
assert(formattedSummary.includes('Fluxo: "Fluxo Teste"'), 'Resumo de fluxo correto');
assert(formattedSummary.includes('Possui Triggers/Webhooks'), 'Identificação de triggers correta');

const emptyExecs = ResponseFormatter.formatExecutionsList([]);
assert(emptyExecs.includes('Nenhuma execução'), 'Lista vazia de execuções tratada');
console.log('   ✅ ResponseFormatter OK');

// 3. AuditTrail Test
console.log('3. Testando AuditTrail...');
audit.log({ operation: 'unit_test_op', tokensResponse: 50 });
assert(audit.totals.operations > 0, 'Operações incrementadas no audit');
assert(audit.totals.tokensResponse >= 50, 'Tokens somados no audit');
const report = audit.getReport();
assert(report.includes('Relatório de Auditoria') && report.includes('unit_test_op'), 'Relatório contém operação registrada');
console.log('   ✅ AuditTrail OK');

// 4. N8nClient Error Handling Test
console.log('4. Testando N8nClient com conexão offline...');
const offlineClient = new N8nClient('http://127.0.0.1:59998', 'dummy_key', 500);
offlineClient.healthCheck(500).then((health) => {
  assert.strictEqual(health.ok, false, 'Health check deve retornar ok: false para servidor offline');
  assert(health.error !== undefined, 'Health check deve ter mensagem de erro');
  console.log('   ✅ N8nClient offline handling OK');
  console.log('\n🎉 Todos os testes unitários passaram com sucesso!');
}).catch((err) => {
  console.error('❌ Falha nos testes unitários:', err);
  process.exit(1);
});
