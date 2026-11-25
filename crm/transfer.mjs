const columns = ['lead', 'state'];

export function encodeCsv(records) {
  const cell = value => '"' + JSON.stringify(value).replaceAll('"', '""') + '"';
  return columns.join(',') + '\r\n' +
    records.map(record => columns.map(key => cell(record[key])).join(',')).join('\r\n');
}

function decodeCsv(source) {
  const lines = source.split(/\r?\n/);
  if (lines.shift() !== columns.join(',')) throw new Error('Cabeçalho CSV esperado: lead,state.');
  return lines.filter(Boolean).map(line => {
    const match = /^"((?:[^"]|"")*)","((?:[^"]|"")*)"$/.exec(line);
    if (!match) throw new Error('Linha CSV inválida.');
    return {lead: JSON.parse(match[1].replaceAll('""', '"')), state: JSON.parse(match[2].replaceAll('""', '"'))};
  });
}

const validList = (value, valid) => value === undefined || (Array.isArray(value) && value.every(valid));
const validText = entry => entry && typeof entry.text === 'string';

export function decode(source, filename) {
  source = source.replace(/^\uFEFF/, '');
  let records;
  try {
    records = filename.toLowerCase().endsWith('.csv') ? decodeCsv(source) : JSON.parse(source);
  } catch {
    throw new Error('Formato inválido. Use JSON ou CSV no formato de exportação do CRM.');
  }
  if (!Array.isArray(records)) throw new Error('O arquivo deve conter uma lista de leads.');
  const seen = new Set();
  return records.map(record => {
    const lead = record?.lead;
    const state = record?.state ?? {};
    if (!lead || typeof lead.id !== 'string' || !lead.id.trim() || typeof lead.name !== 'string' || !lead.name.trim() ||
        !['city', 'segment', 'phone', 'whatsapp'].every(key => lead[key] === undefined || typeof lead[key] === 'string') ||
        !validList(lead.evidence, validText) || !validList(lead.hypotheses, validText) ||
        typeof state !== 'object' || Array.isArray(state) ||
        !['stage', 'nextAction', 'followUp'].every(key => state[key] == null || typeof state[key] === 'string') ||
        !['proposal', 'monthly', 'received'].every(key => state[key] == null ||
          (typeof state[key] === 'number' && state[key] >= 0 && Number.isSafeInteger(Math.round(state[key] * 100)))) ||
        !validList(state.history, entry => validText(entry) && typeof entry.at === 'string')) {
      throw new Error('Registro inválido. Confira ID, empresa, evidências e histórico.');
    }
    if (seen.has(lead.id)) throw new Error('ID repetido no arquivo de importação.');
    seen.add(lead.id);
    return {lead, state};
  });
}

export async function rowId(sourceId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceId));
  return Array.from(new Uint8Array(digest).slice(0, 18), byte => byte.toString(16).padStart(2, '0')).join('');
}
