class AuditTrail {
  constructor() {
    this.sessionStartTime = Date.now();
    this.logs = [];
    this.totals = {
      operations: 0,
      tokensResponse: 0,
      apiCalls: 0,
      errors: 0
    };
  }

  log({ operation, tokensResponse = 0, apiCalls = 1, status = 'success', error = null }) {
    const entry = {
      operation,
      timestamp: new Date().toISOString(),
      tokensResponse,
      apiCalls,
      status,
      error: error ? error.message : null
    };

    this.logs.push(entry);
    this.totals.operations++;
    this.totals.tokensResponse += tokensResponse;
    this.totals.apiCalls += apiCalls;
    if (status === 'error') {
      this.totals.errors++;
    }

    return entry;
  }

  getReport() {
    let report = '## 📊 Relatório de Auditoria — Sessão Atual\n\n';
    report += '| # | Operação | Hora | Status | Tokens Resp. | API Calls |\n';
    report += '|---|---|---|---|---|---|\n';
    
    this.logs.forEach((log, index) => {
      const time = log.timestamp.split('T')[1].split('.')[0]; // HH:MM:SS
      const statusIcon = log.status === 'success' ? '✅' : '❌';
      report += `| ${index + 1} | \`${log.operation}\` | ${time} | ${statusIcon} | ~${log.tokensResponse} | ${log.apiCalls} |\n`;
    });

    report += `\n**Totais**: ${this.totals.operations} operações | ~${this.totals.tokensResponse} tokens | ${this.totals.apiCalls} chamadas API | ${this.totals.errors} erros\n`;
    report += `**Sessão iniciada em**: ${new Date(this.sessionStartTime).toLocaleString()}`;
    
    return report;
  }
}

module.exports = new AuditTrail();
