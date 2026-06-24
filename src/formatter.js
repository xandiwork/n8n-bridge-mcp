class ResponseFormatter {
  // Estima os tokens (tamanho / 4 como aproximação heurística do NeuralVault)
  static estimateTokens(obj) {
    const size = Buffer.byteLength(JSON.stringify(obj), 'utf8');
    return Math.max(1, Math.round(size / 4));
  }

  static formatWorkflowsList(workflows) {
    let md = '## 📋 Fluxos n8n Encontrados\n\n';
    md += '| # | Nome | ID | Status | ~Peso | Tags |\n';
    md += '|---|---|---|---|---|---|\n';
    
    workflows.forEach((wf, index) => {
      const status = wf.active ? '✅ Ativo' : '⏸️ Inativo';
      const weight = this.estimateTokens(wf);
      const tags = (wf.tags || []).map(t => t.name).join(', ') || '-';
      md += `| ${index + 1} | ${wf.name} | ${wf.id} | ${status} | ~${weight} | ${tags} |\n`;
    });

    md += '\n💡 Use `n8n_obter_fluxo <ID>` para um resumo estruturado, ou `n8n_obter_fluxo <ID> completo` para o JSON integral.';
    return md;
  }

  static formatWorkflowSummary(workflow) {
    const nodes = workflow.nodes || [];
    const connections = workflow.connections || {};
    
    let connectionCount = 0;
    Object.values(connections).forEach(nodeConns => {
      Object.values(nodeConns).forEach(connArray => {
        connectionCount += connArray.length;
      });
    });

    const nodeTypes = {};
    let triggerCount = 0;
    nodes.forEach(node => {
      const type = node.type.split('.').pop(); // e.g. n8n-nodes-base.httpRequest -> httpRequest
      nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      if (node.type.includes('trigger') || node.type.includes('Webhook')) {
        triggerCount++;
      }
    });

    const typesStr = Object.entries(nodeTypes).map(([type, count]) => `${type}(${count})`).join(', ');
    const weight = this.estimateTokens(workflow);
    const status = workflow.active ? '✅ Ativo' : '⏸️ Inativo';

    let md = `## 🧩 Fluxo: "${workflow.name}" (ID: ${workflow.id})\n`;
    md += `- **Status**: ${status} | **Criado**: ${new Date(workflow.createdAt).toISOString().split('T')[0]}\n`;
    md += `- **Nós**: ${nodes.length} | **Conexões**: ${connectionCount} | **Peso bruto**: ~${weight} tokens\n`;
    md += `- **Tipos de nó presentes**: ${typesStr}\n`;
    
    if (triggerCount > 0) {
      md += `- **Possui Triggers/Webhooks**: Sim (${triggerCount})\n`;
    }

    md += `\n💡 Use \`n8n_obter_fluxo ${workflow.id} completo\` se precisar ler ou modificar a definição inteira dos nós.`;
    return md;
  }

  static formatExecutionsList(executions) {
    if (!executions || executions.length === 0) {
      return 'Nenhuma execução encontrada para os filtros aplicados.';
    }

    let md = '## ⏱️ Últimas Execuções\n\n';
    md += '| ID | Fluxo | Iniciado Em | Duração | Status |\n';
    md += '|---|---|---|---|---|\n';

    executions.forEach(ex => {
      const statusIcon = ex.finished ? (ex.status === 'success' ? '✅ Sucesso' : '❌ Erro') : '⏳ Rodando';
      const durationStr = ex.stoppedAt 
        ? `${Math.round((new Date(ex.stoppedAt) - new Date(ex.startedAt)) / 1000)}s` 
        : '-';
        
      const time = new Date(ex.startedAt).toLocaleString();
      
      // Alguns n8n retornam o workflow no objeto, outros apenas o ID
      const workflowName = ex.workflowData ? ex.workflowData.name : ex.workflowId;
      
      md += `| ${ex.id} | ${workflowName} | ${time} | ${durationStr} | ${statusIcon} |\n`;
    });

    md += '\n💡 Use `n8n_obter_execucao <ID>` para ver detalhes dos dados de entrada, saída e mensagens de erro.';
    return md;
  }
}

module.exports = ResponseFormatter;
