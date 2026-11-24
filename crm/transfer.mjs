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
  return records.map(record => {
    const lead = record?.lead;
    const state = record?.state ?? {};
    if (!lead || typeof lead.id !== 'string' || !lead.id.trim() || typeof lead.name !== 'string' || !lead.name.trim() ||
        !['city', 'segment', 'phone', 'whatsapp'].every(key => lead[key] === undefined || typeof lead[key] === 'string') ||
        !validList(lead.evidence, validText) || !validList(lead.hypotheses, validText) ||
        typeof state !== 'object' || Array.isArray(state) || !validList(state.history, entry => validText(entry) && typeof entry.at === 'string')) {
      throw new Error('Registro inválido. Confira ID, empresa, evidências e histórico.');
    }
    return {lead, state};
  });
}

export async function rowId(sourceId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceId));
  return Array.from(new Uint8Array(digest).slice(0, 18), byte => byte.toString(16).padStart(2, '0')).join('');
}
