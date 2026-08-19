/**
 * test_blocked_terms.js
 * Testes do verificador de termos bloqueados (dados 100% fictícios).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadTerms, findTermsInText } = require('../scripts/check-blocked-terms');

console.log('🧪 Testando verificador de termos bloqueados...');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blocked-terms-'));
const termsFile = path.join(tmp, '.blocked-terms');
fs.writeFileSync(termsFile, '# comentário ignorado\nORGAO FICTICIO\n\nexemplo-interno.test\n');

const terms = loadTerms({ BLOCKED_TERMS: ' Cliente Exemplo , ,orgao ficticio' }, termsFile);
assert.deepStrictEqual(terms.sort(), ['cliente exemplo', 'exemplo-interno.test', 'orgao ficticio'], 'Lê env + arquivo, ignora vazios/comentários e remove duplicatas');

assert.deepStrictEqual(findTermsInText('Relatório do ORGAO Ficticio', terms), ['orgao ficticio'], 'Busca sem diferenciar maiúsculas');
assert.deepStrictEqual(findTermsInText('https://api.exemplo-interno.test/v1', terms), ['exemplo-interno.test'], 'Encontra hosts');
assert.deepStrictEqual(findTermsInText('UC 0000000000 - ETE EXEMPLO', terms), [], 'Texto limpo passa');

assert.deepStrictEqual(loadTerms({}, path.join(tmp, 'inexistente')), [], 'Sem configuração, lista vazia');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('   ✅ Verificador de termos OK');
