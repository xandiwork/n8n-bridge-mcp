class ResponseFormatter {
  // Estima os tokens (tamanho / 4 como aproximação heurística)
  static estimateTokens(obj) {
    if (obj === null || obj === undefined) return 1;
    try {
      const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
      const size = Buffer.byteLength(str, 'utf8');
      return Math.max(1, Math.round(size / 4));
    } catch {
      return 1;
    }
  }

  static formatWorkflowsList(workflows) {
    if (!Array.isArray(workflows) || workflows.length === 0) {
      return 'Nenhum fluxo encontrado no n8n.';
    }

    let md = '## 📋 Fluxos n8n Encontrados\n\n';
    md += '| # | Nome | ID | Status | ~Peso | Tags |\n';
    md += '|---|---|---|---|---|---|\n';
    
    workflows.forEach((wf, index) => {
      if (!wf) return;
      const name = wf.name || '(Sem nome)';
      const id = wf.id || '(Sem ID)';
      const status = wf.active ? '✅ Ativo' : '⏸️ Inativo';
      const weight = this.estimateTokens(wf);
      const tags = (Array.isArray(wf.tags) ? wf.tags : []).map(t => (t && t.name) ? t.name : String(t)).join(', ') || '-';
      md += `| ${index + 1} | ${name} | ${id} | ${status} | ~${weight} | ${tags} |\n`;
    });

    md += '\n💡 Use `n8n_obter_fluxo <ID>` para um resumo estruturado, ou `n8n_obter_fluxo <ID> detalhe: true` para o JSON integral.';
    return md;
  }

  static formatWorkflowSummary(workflow) {
    if (!workflow || typeof workflow !== 'object') {
      return 'Fluxo não encontrado ou resposta vazia.';
    }

    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    const connections = (workflow.connections && typeof workflow.connections === 'object') ? workflow.connections : {};
    
    let connectionCount = 0;
    Object.values(connections).forEach(nodeConns => {
      if (nodeConns && typeof nodeConns === 'object') {
        Object.values(nodeConns).forEach(connArray => {
          if (Array.isArray(connArray)) {
            connectionCount += connArray.length;
          }
        });
      }
    });

    const nodeTypes = {};
    let triggerCount = 0;
    nodes.forEach(node => {
      if (!node) return;
      const rawType = String(node.type || 'unknown');
      const type = rawType.split('.').pop() || rawType;
      nodeTypes[type] = (nodeTypes[type] || 0) + 1;
      if (rawType.toLowerCase().includes('trigger') || rawType.toLowerCase().includes('webhook')) {
        triggerCount++;
      }
    });

    const typesStr = Object.entries(nodeTypes).map(([type, count]) => `${type}(${count})`).join(', ') || 'Nenhum nó';
    const weight = this.estimateTokens(workflow);
    const status = workflow.active ? '✅ Ativo' : '⏸️ Inativo';
    const createdAtStr = workflow.createdAt ? (String(workflow.createdAt).split('T')[0] || String(workflow.createdAt)) : '-';
    const wfName = workflow.name || '(Sem nome)';
    const wfId = workflow.id || '-';

    let md = `## 🧩 Fluxo: "${wfName}" (ID: ${wfId})\n`;
    md += `- **Status**: ${status} | **Criado**: ${createdAtStr}\n`;
    md += `- **Nós**: ${nodes.length} | **Conexões**: ${connectionCount} | **Peso bruto**: ~${weight} tokens\n`;
    md += `- **Tipos de nó presentes**: ${typesStr}\n`;
    
    if (triggerCount > 0) {
      md += `- **Possui Triggers/Webhooks**: Sim (${triggerCount})\n`;
    }

    md += `\n💡 Use \`n8n_obter_fluxo ${wfId} detalhe: true\` se precisar ler ou modificar a definição inteira dos nós.`;
    return md;
  }

  static formatExecutionsList(executions) {
    if (!Array.isArray(executions) || executions.length === 0) {
      return 'Nenhuma execução encontrada para os filtros aplicados.';
    }

    let md = '## ⏱️ Últimas Execuções\n\n';
    md += '| ID | Fluxo | Iniciado Em | Duração | Status |\n';
    md += '|---|---|---|---|---|\n';

    executions.forEach(ex => {
      if (!ex) return;
      const statusIcon = ex.finished ? (ex.status === 'success' ? '✅ Sucesso' : '❌ Erro') : '⏳ Rodando';
      let durationStr = '-';
      if (ex.stoppedAt && ex.startedAt) {
        try {
          const diffMs = new Date(ex.stoppedAt) - new Date(ex.startedAt);
          if (!isNaN(diffMs)) {
            durationStr = `${Math.max(0, Math.round(diffMs / 1000))}s`;
          }
        } catch {
          durationStr = '-';
        }
      }
        
      let time = '-';
      if (ex.startedAt) {
        try {
          time = new Date(ex.startedAt).toLocaleString();
        } catch {
          time = String(ex.startedAt);
        }
      }
      
      const workflowName = (ex.workflowData && ex.workflowData.name) ? ex.workflowData.name : (ex.workflowId || '-');
      const exId = ex.id || '-';
      
      md += `| ${exId} | ${workflowName} | ${time} | ${durationStr} | ${statusIcon} |\n`;
    });

    md += '\n💡 Use `n8n_obter_execucao <ID>` para ver detalhes dos dados de entrada, saída e mensagens de erro.';
    return md;
  }

  static formatCredentialsList(credentials) {
    if (!Array.isArray(credentials) || credentials.length === 0) {
      return 'Nenhuma credencial configurada encontrada no n8n.';
    }

    let md = '## 🔑 Credenciais e Conectores Configurados no n8n\n\n';
    md += '| # | Nome | Tipo | ID |\n';
    md += '|---|---|---|---|\n';

    credentials.forEach((c, idx) => {
      const name = c.name || '(Sem nome)';
      const type = c.type || '-';
      const id = c.id || '-';
      md += `| ${idx + 1} | ${name} | \`${type}\` | ${id} |\n`;
    });

    md += '\n🔒 *Nota de Segurança: Valores de tokens e senhas nunca são trafegados ou expostos via MCP.*';
    return md;
  }
}

module.exports = ResponseFormatter;
