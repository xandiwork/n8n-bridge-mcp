#!/usr/bin/env node
/**
 * check-blocked-terms.js
 * Barra termos proibidos (nomes de clientes, órgãos, hosts internos) em arquivos
 * e mensagens de commit. A lista NÃO fica no repositório: ela vem de
 *   - variável de ambiente BLOCKED_TERMS (separada por vírgula), ou
 *   - arquivo local .blocked-terms (um termo por linha, ignorado pelo Git).
 *
 * Uso:
 *   node scripts/check-blocked-terms.js              # verifica os arquivos versionados
 *   node scripts/check-blocked-terms.js --staged     # verifica só o que está no stage (pre-commit)
 *   node scripts/check-blocked-terms.js --message F  # verifica a mensagem de commit do arquivo F
 *   node scripts/check-blocked-terms.js --log        # verifica todas as mensagens de commit (CI)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TERMS_FILE = path.join(ROOT, '.blocked-terms');

function loadTerms(env = process.env, termsFile = TERMS_FILE) {
  const fromEnv = (env.BLOCKED_TERMS || '').split(',');
  const fromFile = fs.existsSync(termsFile) ? fs.readFileSync(termsFile, 'utf8').split(/\r?\n/) : [];
  const terms = [...fromEnv, ...fromFile]
    .map(t => t.trim())
    .filter(t => t && !t.startsWith('#'));
  return [...new Set(terms.map(t => t.toLowerCase()))];
}

function findTermsInText(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t));
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// git grep devolve código 1 quando não encontra nada — isso é sucesso aqui.
function gitGrep(extraArgs, terms) {
  const args = ['grep', '-n', '-I', '-i', '-F'];
  terms.forEach(t => args.push('-e', t));
  try {
    return git([...args, ...extraArgs]).trim();
  } catch (err) {
    if (err.status === 1) return '';
    throw err;
  }
}

function main(argv) {
  const terms = loadTerms();
  if (terms.length === 0) {
    console.warn('⚠️  Nenhum termo bloqueado configurado (BLOCKED_TERMS ou .blocked-terms). Verificação ignorada.');
    return 0;
  }

  const mode = argv[0] || '--tree';
  let hits = '';

  if (mode === '--staged') {
    hits = gitGrep(['--cached'], terms);
  } else if (mode === '--tree') {
    hits = gitGrep([], terms);
  } else if (mode === '--message') {
    const msg = fs.readFileSync(argv[1], 'utf8');
    const found = findTermsInText(msg, terms);
    if (found.length) hits = `mensagem de commit contém ${found.length} termo(s) bloqueado(s)`;
  } else if (mode === '--log') {
    const log = git(['log', '--all', '--format=%H%x00%B%x01']);
    hits = log.split('\x01')
      .map(entry => entry.trim())
      .filter(Boolean)
      .filter(entry => findTermsInText(entry.split('\x00')[1] || '', terms).length)
      .map(entry => `commit ${entry.split('\x00')[0].slice(0, 7)}: mensagem contém termo bloqueado`)
      .join('\n');
  } else {
    console.error(`Modo desconhecido: ${mode}`);
    return 2;
  }

  if (hits) {
    // Não imprime o termo em si, só onde ele aparece, para não vazar a lista no log do CI.
    console.error('❌ Termos bloqueados encontrados:');
    console.error(hits.split('\n').map(l => '   ' + l.replace(/^([^:]+:\d+):.*$/, '$1')).join('\n'));
    return 1;
  }
  console.log(`✅ Nenhum dos ${terms.length} termo(s) bloqueado(s) encontrado.`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { loadTerms, findTermsInText };
