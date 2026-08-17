class AuditTrail {
  constructor() {
    this.sessionStartTime = Date.now();
    this.logs = [];
    this.maxLogs = 200; // Limite para evitar vazamento de memória em sessões longas
    this.totals = {
      operations: 0,
      tokensResponse: 0,
      apiCalls: 0,
      errors: 0
    };
  }

  log({ operation = 'unknown', tokensResponse = 0, apiCalls = 1, status = 'success', error = null }) {
    const entry = {
      operation,
      timestamp: new Date().toISOString(),
      tokensResponse: Number(tokensResponse) || 0,
      apiCalls: Number(apiCalls) || 1,
      status: status === 'error' ? 'error' : 'success',
      error: error ? (error.message || String(error)) : null
    };

    if (this.logs.length >= this.maxLogs) {
      this.logs.shift(); // Remove o mais antigo
    }
    this.logs.push(entry);

    this.totals.operations++;
    this.totals.tokensResponse += entry.tokensResponse;
    this.totals.apiCalls += entry.apiCalls;
    if (entry.status === 'error') {
      this.totals.errors++;
    }

    if (process.env.MCP_DEBUG === 'true' || process.env.DEBUG === 'true') {
      if (process.stderr && process.stderr.write) {
        process.stderr.write(`[n8n-bridge-audit] ${entry.timestamp} | ${entry.operation} | ${entry.status} ${entry.error ? `(${entry.error})` : ''}\n`);
      }
    }

    return entry;
  }

  getReport() {
    let report = '## 📊 Relatório de Auditoria — Sessão Atual\n\n';
    report += '| # | Operação | Hora | Status | Tokens Resp. | API Calls |\n';
    report += '|---|---|---|---|---|---|\n';
    
    if (this.logs.length === 0) {
      report += '| - | *(Nenhuma operação registrada)* | - | - | - | - |\n';
    } else {
      this.logs.forEach((log, index) => {
        const time = (log.timestamp && log.timestamp.includes('T')) 
          ? log.timestamp.split('T')[1].split('.')[0] 
          : '00:00:00';
        const statusIcon = log.status === 'success' ? '✅' : '❌';
        report += `| ${index + 1} | \`${log.operation}\` | ${time} | ${statusIcon} | ~${log.tokensResponse} | ${log.apiCalls} |\n`;
      });
    }

    report += `\n**Totais**: ${this.totals.operations} operações | ~${this.totals.tokensResponse} tokens | ${this.totals.apiCalls} chamadas API | ${this.totals.errors} erros\n`;
    try {
      report += `**Sessão iniciada em**: ${new Date(this.sessionStartTime).toLocaleString()}`;
    } catch {
      report += `**Sessão iniciada em**: ${new Date(this.sessionStartTime).toISOString()}`;
    }
    
    return report;
  }
}

module.exports = new AuditTrail();

