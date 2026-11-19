import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';

export const raiz = fileURLToPath(new URL('../', import.meta.url));
export const lerJson = caminho => JSON.parse(readFileSync(caminho, 'utf8'));

// Renomear no mesmo diretório impede que uma interrupção deixe meio JSON ou CSV gravado.
export function gravar(caminho, conteudo) {
  mkdirSync(dirname(caminho), { recursive: true });
  const tmp = caminho + '.' + randomUUID() + '.tmp';
  writeFileSync(tmp, conteudo, 'utf8');
  renameSync(tmp, caminho);
}
export const gravarJson = (caminho, valor) => gravar(caminho, JSON.stringify(valor) + '\n');

export function configuracao() {
  const cfg = parse(readFileSync(raiz + 'config.yaml', 'utf8'));
  const regras = parse(readFileSync(raiz + 'strategy.yaml', 'utf8'));
  const exigir = (ok, nome) => { if (!ok) throw Error('Configuração inválida em ' + nome); };
  exigir(Array.isArray(cfg.pares) && cfg.pares.length && new Set(cfg.pares).size === cfg.pares.length
    && cfg.pares.every(p => /^[A-Z0-9]+USDT$/.test(p)), 'pares spot em USDT');
  exigir([1, 3, 5, 15, 30, 60, 120, 240, 360, 720].includes(cfg.intervalo_minutos), 'intervalo_minutos');
  cfg.passo = cfg.intervalo_minutos * 60000;
  cfg.inicio = Date.parse(cfg.inicio_utc);
  exigir(Number.isFinite(cfg.inicio) && cfg.inicio % cfg.passo === 0, 'inicio_utc');
  exigir(cfg.fim_utc === null || Date.parse(cfg.fim_utc) > cfg.inicio, 'fim_utc (exclusivo)');
  exigir(cfg.saldo_inicial_usdt > 0 && Number.isFinite(cfg.saldo_inicial_usdt), 'saldo_inicial_usdt');
  for (const chave of ['taxa_por_execucao','slippage_por_execucao'])
    exigir(Number.isFinite(cfg[chave]) && cfg[chave] >= 0 && cfg[chave] < 1, chave);
  exigir(cfg.fracao_treino > 0 && cfg.fracao_treino < 1 && cfg.dias_por_ano > 0, 'divisão ou anualização');
  exigir(Number.isInteger(cfg.mercado.limite_pagina) && cfg.mercado.limite_pagina >= 1 && cfg.mercado.limite_pagina <= 1000, 'limite_pagina');
  exigir(Number.isInteger(cfg.mercado.tentativas) && cfg.mercado.tentativas > 0 && cfg.mercado.timeout_ms > 0, 'rede');
  exigir([regras.ema_rapida,regras.ema_lenta,regras.rsi_periodo].every(n => Number.isInteger(n) && n > 0)
    && regras.ema_rapida < regras.ema_lenta, 'janelas dos indicadores');
  exigir(['acima','abaixo'].includes(regras.entrada.cruzamento) && ['acima','abaixo'].includes(regras.saida.cruzamento)
    && regras.saida.cruzamento !== regras.entrada.cruzamento, 'cruzamentos');
  exigir(regras.candidatos_rsi_minimo.length && [regras.entrada.rsi_minimo,...regras.candidatos_rsi_minimo]
    .every(v => Number.isFinite(v) && v >= 0 && v <= 100), 'limiares de RSI');
  return {cfg, regras};
}
