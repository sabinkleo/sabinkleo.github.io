import {decode, encodeCsv, rowId} from './transfer.mjs';

const $ = id => document.getElementById(id);
const status = message => { $('status').textContent = message; };
const currency = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
const moneyFields = ['proposal', 'monthly', 'received'];
for (const option of $('pipeline').elements.namedItem('stage').options) {
  $('stage-filter').append(option.cloneNode(true));
}
let config, rows = [], activeId, editingId, busy = false;

async function api(path, method = 'GET', body) {
  const response = await fetch(config.endpoint + path, {
    method, credentials: 'include', cache: 'no-store', redirect: 'error',
    headers: {'X-Appwrite-Project': config.project, 'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw Object.assign(new Error('Falha de comunicação com o CRM.'), {status: response.status});
  return response.status === 204 ? null : response.json();
}

function collection() {
  return '/tablesdb/' + encodeURIComponent(config.database) + '/tables/' + encodeURIComponent(config.table) + '/rows';
}

function readRow(row) {
  const data = row.data ?? row;
  return {id: row.$id, lead: JSON.parse(data.lead), state: JSON.parse(data.state)};
}

function displayList() {
  const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const stage = $('stage-filter').value;
  const receivedCents = rows.reduce((total, {state}) => total + Math.round((state.received ?? 0) * 100), 0);
  $('revenue').textContent = 'Total recebido: ' + currency.format(receivedCents / 100);
  const records = rows.filter(({lead, state}) => {
    const currentStage = state.stage || 'Prospecção';
    return (!stage || stage === currentStage) &&
      [lead.name, lead.city, lead.segment, currentStage].some(value => value?.toLocaleLowerCase('pt-BR').includes(term));
  });
  $('leads').replaceChildren(...records.map(({id, lead, state}) => {
    const tr = document.createElement('tr');
    const button = document.createElement('button');
    button.textContent = lead.name;
    button.onclick = () => openProfile(id);
    tr.insertCell().append(button);
    tr.insertCell().textContent = state.stage || 'Prospecção';
    tr.insertCell().textContent = state.followUp || '—';
    return tr;
  }));
}

function item(text, url) {
  const li = document.createElement('li');
  li.textContent = text;
  try {
    const link = new URL(url);
    if (link.protocol !== 'https:' && link.protocol !== 'http:') return li;
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Abrir fonte';
    li.append(' ', a);
  } catch {}
  return li;
}

function openProfile(id, focus = true) {
  const {lead, state} = rows.find(row => row.id === id);
  activeId = id;
  $('company').textContent = lead.name;
  $('lead-details').textContent = [
    lead.segment, lead.city, lead.confirmed ? 'Contato confirmado' : 'Contato a verificar',
    lead.decisionGroup ? 'Grupo decisor candidato: ' + lead.decisionGroup : '',
  ].filter(Boolean).join(' · ');
  $('contacts').replaceChildren();
  for (const [label, value, prefix] of [['Ligar', lead.phone, 'tel:+'], ['WhatsApp', lead.whatsapp, 'https://wa.me/']]) {
    const number = String(value || '').replace(/\D/g, '');
    if (!/^55\d{10,11}$/.test(number)) continue;
    const a = document.createElement('a');
    a.href = prefix + number;
    a.textContent = label;
    $('contacts').append(a);
  }
  $('evidence').replaceChildren(...(lead.evidence || []).map(fact => item([fact.text, fact.date].filter(Boolean).join(' · '), fact.url)));
  $('hypotheses').replaceChildren(...(lead.hypotheses || []).map(h => item(['Hipótese', h.provider, h.text].filter(Boolean).join(' · '))));
  $('history').replaceChildren(...(state.history || []).map(entry => item(entry.at + ' · ' + entry.text)));
  const fields = $('pipeline').elements;
  for (const name of ['stage', 'nextAction', 'followUp', ...moneyFields]) fields.namedItem(name).value = state[name] ?? (name === 'stage' ? 'Prospecção' : '');
  fields.namedItem('note').value = '';
  $('profile').hidden = false;
  if (focus) $('company').focus();
}

async function refresh() {
  const next = [];
  const limit = JSON.stringify({method: 'limit', values: [100]});
  let cursor;
  do {
    const query = new URLSearchParams({'queries[]': limit, total: 'false'});
    if (cursor) query.append('queries[]', JSON.stringify({method: 'cursorAfter', values: [cursor]}));
    const page = await api(collection() + '?' + query);
    next.push(...page.rows.map(readRow));
    cursor = page.rows.length === 100 ? page.rows.at(-1).$id : null;
  } while (cursor);
  rows = next.sort((a, b) => Number(b.lead.confirmed === true) - Number(a.lead.confirmed === true) || a.lead.name.localeCompare(b.lead.name, 'pt-BR'));
  displayList();
}

function locked() {
  rows = [];
  activeId = undefined;
  $('leads').replaceChildren();
  for (const id of ['company', 'lead-details', 'contacts', 'evidence', 'hypotheses', 'history']) $(id).replaceChildren();
  $('pipeline').reset();
  closeLeadForm();
  $('search').value = '';
  $('stage-filter').value = '';
  $('revenue').textContent = '';
  $('profile').hidden = true;
  $('workspace').hidden = true;
  $('login').hidden = false;
}

function run(action) {
  return async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    $('workspace').inert = true;
    $('login').inert = true;
    try {
      await action(event);
    } catch (error) {
      if (error.status === 401 || error.status === 403) locked();
      status(error.status === 401 || error.status === 403 ? 'Sessão ou acesso indisponível.' : error.message);
    } finally {
      $('workspace').inert = false;
      $('login').inert = false;
      busy = false;
    }
  };
}

async function showWorkspace() {
  await refresh();
  $('login').hidden = true;
  $('workspace').hidden = false;
  status(rows.length + ' leads');
}

$('login').onsubmit = run(async event => {
  const form = event.currentTarget;
  const fields = new FormData(form);
  try {
    await api('/account/sessions/email', 'POST', {email: fields.get('email'), password: fields.get('password')});
    try {
      await showWorkspace();
    } catch (error) {
      if (error.status === 401 || error.status === 403) await api('/account/sessions/current', 'DELETE');
      throw error;
    }
  } finally {
    form.reset();
  }
});

$('logout').onclick = run(async () => {
  await api('/account/sessions/current', 'DELETE');
  locked();
  status('Sessão encerrada.');
});
$('search').oninput = displayList;
$('stage-filter').onchange = displayList;

const leadFields = ['name', 'segment', 'city', 'phone', 'whatsapp'];

function closeLeadForm() {
  editingId = undefined;
  $('lead-form').reset();
  $('lead-form').hidden = true;
}

function showLeadForm(id) {
  closeLeadForm();
  editingId = id;
  const lead = rows.find(row => row.id === id)?.lead;
  $('lead-form-title').textContent = lead ? 'Editar lead' : 'Novo lead';
  const fields = $('lead-form').elements;
  for (const key of leadFields) fields.namedItem(key).value = lead?.[key] ?? '';
  $('lead-form').hidden = false;
  fields.namedItem('name').focus();
}

function contactNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (!value) return '';
  const normalized = digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
  if (!/^55[1-9]\d{9,10}$/.test(normalized)) throw new Error('Informe o número com DDD.');
  return normalized;
}

$('new-lead').onclick = () => showLeadForm();
$('edit-lead').onclick = () => showLeadForm(activeId);
$('cancel-lead').onclick = closeLeadForm;
$('lead-form').onsubmit = run(async event => {
  const input = new FormData(event.currentTarget);
  const fields = Object.fromEntries(leadFields.map(key => [key, input.get(key).trim()]));
  if (!fields.name) throw new Error('Informe o nome da empresa.');
  fields.phone = contactNumber(fields.phone);
  fields.whatsapp = contactNumber(fields.whatsapp);
  const sourceId = editingId ? undefined : crypto.randomUUID();
  const id = editingId ?? await rowId(sourceId);
  const path = collection() + '/' + id;
  const previous = editingId ? readRow(await api(path)).lead : {id: sourceId, confirmed: false};
  const lead = {...previous, ...fields};
  if (['phone', 'whatsapp'].some(key => (previous[key] || '') !== fields[key])) lead.confirmed = false;
  const data = {lead: JSON.stringify(lead)};
  if (editingId) {
    await api(path, 'PATCH', {data});
  } else {
    await api(collection(), 'POST', {rowId: id, data: {...data, state: '{}'}});
  }
  closeLeadForm();
  await refresh();
  openProfile(id);
  status('Dados do lead salvos.');
});

$('pipeline').onsubmit = run(async event => {
  const input = new FormData(event.currentTarget);
  const id = activeId;
  const path = collection() + '/' + id;
  const persisted = await api(path);
  const {state} = readRow(persisted);
  for (const field of ['stage', 'nextAction', 'followUp']) state[field] = input.get(field);
  for (const field of moneyFields) state[field] = input.get(field) === '' ? null : Number(input.get(field));
  const note = input.get('note').trim();
  if (note) state.history = [...(state.history || []), {at: new Date().toISOString(), text: note}];
  await api(path, 'PATCH', {data: {state: JSON.stringify(state)}});
  rows.find(row => row.id === id).state = state;
  displayList();
  openProfile(id);
  status('Lead atualizado.');
});

$('import').onchange = run(async event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  if (file.size > 5_000_000) throw new Error('Arquivo acima de 5 MB.');
  const imported = decode(await file.text(), file.name);
  let created = 0, existing = 0;
  for (const {lead, state} of imported) {
    const id = await rowId(lead.id);
    try {
      await api(collection(), 'POST', {rowId: id, data: {lead: JSON.stringify(lead), state: JSON.stringify(state)}});
      created++;
    } catch (error) {
      if (error.status === 409) {
        const persisted = await api(collection() + '/' + id);
        if (readRow(persisted).lead.id === lead.id) {
          existing++;
          continue;
        }
      }
      if (error.status === 401 || error.status === 403) throw error;
      await refresh();
      throw new Error(`Importação parcial: ${created} novos · ${existing} existentes · ${imported.length - created - existing} pendentes. Reimporte o arquivo para continuar.`);
    }
  }
  await refresh();
  status(created + ' novos · ' + existing + ' existentes preservados');
});

function download(format) {
  const values = rows.map(({lead, state}) => ({lead, state}));
  const data = format === 'json' ? JSON.stringify(values, null, 2) : encodeCsv(values);
  const url = URL.createObjectURL(new Blob([data], {type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vertice-crm.' + format;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-json').onclick = () => download('json');
$('export-csv').onclick = () => download('csv');

try {
  const response = await fetch('./config.json', {cache: 'no-store'});
  config = await response.json();
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      endpoint.pathname !== '/v1' || !endpoint.hostname.endsWith('.verticelabs.me') ||
      ![config.project, config.database, config.table].every(value => typeof value === 'string' && value.trim())) {
    throw new Error('Configuração pendente.');
  }
  try {
    await api('/account');
    await showWorkspace();
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) throw error;
    locked();
    status('Entre com sua conta autorizada.');
  }
} catch {
  status('CRM indisponível. Confira a configuração do serviço.');
}
