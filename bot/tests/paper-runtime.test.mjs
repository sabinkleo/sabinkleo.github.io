import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { registrarCache, restaurarCache } from '../paper-runtime.mjs';

test('recria cache ausente e preserva bytes do seed, replay e limite diário', t => {
  const pasta = mkdtempSync(join(tmpdir(),'duelo-runtime-'));
  t.after(() => rmSync(pasta,{recursive:true,force:true}));
  const arquivo = 'XUSDT-60m.csv';
  const caminho = join(pasta,'seed',arquivo);
  const seed = 't,o,h,l,c,v,fonte\n0,1,1,1,1,1,v5\n';
  const atual = seed + '82800000,2,2,2,2,1,v5\n86400000,3,3,3,3,1,v5\n';
  mkdirSync(dirname(caminho),{recursive:true});
  writeFileSync(caminho,seed);
  const trabalho = join(pasta,'cache');
  assert.equal(restaurarCache(pasta,trabalho,arquivo),seed);
  registrarCache(pasta,arquivo,seed,atual);
  rmSync(trabalho,{recursive:true});
  assert.equal(restaurarCache(pasta,trabalho,arquivo),atual);
  registrarCache(pasta,arquivo,atual,atual);
  assert.equal(restaurarCache(pasta,trabalho,arquivo),atual);
  assert.throws(() => registrarCache(pasta,arquivo,atual,seed),/alterou/);
});
