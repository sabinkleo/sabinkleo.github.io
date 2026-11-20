import assert from 'node:assert/strict';
import test from 'node:test';
import { carregarPaper } from '../../duelo-bot/paper-read.js';

const resultado = {versao:1,fim:1,curva:[{}],metricas:{bot:{},hold:{}}};
test('prioriza a publicação runtime e mantém os downloads na mesma fonte', async () => {
  const ler = async url => {
    assert.equal(url,'runtime/results/paper.json');
    return resultado;
  };
  const r = await carregarPaper(ler,'runtime/','git/','local/');
  assert.equal(r.resultado,resultado);
  assert.equal(r.raizDados,'runtime/');
  assert.equal(r.aviso,'');
});

test('sinaliza fallback e rejeita todas as fontes quando inválidas', async () => {
  const faltando = async url => url.startsWith('git/') ? resultado : {};
  const r = await carregarPaper(faltando,'runtime/','git/','local/');
  assert.equal(r.raizDados,'git/');
  assert.match(r.aviso,/indisponível/);
  await assert.rejects(carregarPaper(async () => ({}),'runtime/','git/','local/'), /Nenhuma publicação/);
});
