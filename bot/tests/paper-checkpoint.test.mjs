import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { atualizarPaper, painelPaper } from '../lib/paper.mjs';
import { arquivosPaper, csvPaper, sha256, verificarCheckpoint } from '../lib/paper-checkpoint.mjs';

const cfg = { pares:['XUSDT'], inicio:0, passo:3600000, intervalo_minutos:60,
  saldo_inicial_usdt:100, taxa_por_execucao:0.001, slippage_por_execucao:0.0005, dias_por_ano:365 };
const regras = { ema_rapida:2, ema_lenta:3, rsi_periodo:2,
  entrada:{cruzamento:'acima', rsi_minimo:50}, saida:{cruzamento:'abaixo'} };
const velas = [5,4,3,2,5,8,9,2,1].map((o,i) => ({o,c:o,t:i*cfg.passo,fonte:'v5'}));
const rodar = (estado, i) =>
  atualizarPaper(estado,{XUSDT:velas.slice(0,i)},{XUSDT:velas[i]},velas[i].t,cfg,regras,'contrato');
const inicial = rodar(null, 4);
const dados = [JSON.stringify(inicial), csvPaper(inicial), JSON.stringify(painelPaper(inicial,cfg))];
const hashes = Object.fromEntries(arquivosPaper.map((nome, i) => [nome, sha256(dados[i])]));

test('restaura checkpoint e reproduz três aberturas com as mesmas carteiras e operações', t => {
  const pasta = mkdtempSync(join(tmpdir(), 'duelo-checkpoint-'));
  t.after(() => rmSync(pasta, {recursive:true, force:true}));
  const caminho = nome => join(pasta, nome.replace('/', '-'));
  arquivosPaper.forEach((nome, i) => writeFileSync(caminho(nome), dados[i]));
  const restaurado = verificarCheckpoint(nome => readFileSync(caminho(nome)), hashes, cfg, 'contrato');
  assert.deepEqual(restaurado, inicial);
  assert.deepEqual(rodar(restaurado, 8), rodar(rodar(rodar(rodar(inicial, 5), 6), 7), 8));
  assert.deepEqual(rodar(restaurado, 4), inicial);
});

test('rejeita estado corrompido, contrato divergente e publicação inconsistente', () => {
  const ler = nome => Buffer.from(dados[arquivosPaper.indexOf(nome)]);
  assert.throws(() => verificarCheckpoint(ler, hashes, cfg, 'outro'), /incompatível/);
  for (const nome of arquivosPaper) {
    assert.throws(() => verificarCheckpoint(p => p === nome ? Buffer.from('corrompido') : ler(p),
      hashes, cfg, 'contrato'), /SHA-256/);
  }
  const publico = arquivosPaper[2];
  assert.throws(() => verificarCheckpoint(p => p === publico ? Buffer.from('{}') : ler(p),
    {...hashes, [publico]:sha256('{}')}, cfg, 'contrato'), /diverge/);
  const alterado = structuredClone(inicial);
  alterado.estrategia.ema_rapida++;
  assert.throws(() => atualizarPaper(alterado, {}, {}, inicial.ultima_abertura, cfg, regras, 'contrato'), /divergem/);
});
