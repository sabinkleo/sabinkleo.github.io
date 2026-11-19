import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validarEventos, filtrarEventos, agruparMarcadores, diaUTC, exibirData } from '../radar-ia-cripto/js/eventos.js';

const dados = JSON.parse(await readFile(new URL('../radar-ia-cripto/events.json', import.meta.url), 'utf8'));
const pagina = await readFile(new URL('../radar-ia-cripto/index.html', import.meta.url), 'utf8');
const corte = /id="corte-eventos" datetime="([\d-]+)"/.exec(pagina)[1];
const todos = validarEventos(dados, corte);

// O teste lê o arquivo real para detectar registros fora do contrato antes de publicar.
test('curadoria tem sete campos, resumos curtos, fontes HTTPS e datas dentro da cobertura', () => {
  const campos = ['date', 'category', 'title', 'summary', 'impact', 'source_name', 'source_url'];
  const frases = new Intl.Segmenter('pt-BR', { granularity: 'sentence' });
  for (const e of todos) {
    assert.deepEqual(Object.keys(e).sort(), [...campos].sort());
    assert.ok([...frases.segment(e.summary)].length <= 2, e.title);
  }
  assert.ok(new Set(todos.map(e => e.date.slice(0, 7))).size >= 6);
  assert.equal(todos.at(-1).date, '2026-06-01');
  assert.equal(new Set(todos.map(e => e.category)).size, 4);
});
test('ordena independentemente da ordem do arquivo e combina categoria e impacto', () => {
  const ordenados = validarEventos([...dados].reverse(), corte);
  assert.ok(ordenados.every((x, i) => !i || x.date <= ordenados[i - 1].date));
  const filtrados = filtrarEventos(ordenados, 'regulacao', 'alto');
  assert.ok(filtrados.length);
  assert.ok(filtrados.every(e => e.category === 'regulacao' && e.impact === 'alto'));
  assert.equal(filtrarEventos([], '', '').length, 0);
  assert.equal(filtrarEventos(todos, '', '').length, todos.length);
});
test('dois eventos altos no mesmo dia geram um único marcador com os dois títulos', () => {
  const a = { ...dados[0], impact: 'alto' }, b = { ...a, title: 'Outro título' };
  const marcadores = agruparMarcadores([a, b, { ...a, impact: 'baixo' }]);
  assert.equal(marcadores.size, 1); assert.deepEqual(marcadores.get(a.date), [a.title, b.title]);
  assert.equal(diaUTC(Date.parse('2026-11-18T23:59:59Z')), '2026-11-18');
  assert.equal(exibirData('2026-11-18'), '18/11/2026');
});
test('rejeita data impossível, duplicação, fonte insegura e impacto desconhecido', () => {
  for (const alteracao of [{ date: '2026-06-31' }, { date: '2026-05-31' }, { date: '2099-01-01' },
    { impact: 'urgente' }, { category: 'constructor' }, { source_url: 'javascript:alert(1)' }, { source_name: '' }]) {
    assert.throws(() => validarEventos([{ ...dados[0], ...alteracao }], corte));
  }
  assert.throws(() => validarEventos([dados[0], dados[0]], corte), /duplicado/);
});
