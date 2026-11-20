// Reproduzir no Node as mesmas regras usadas pelo navegador.
// Sem conexoes com corretora. Somente dados locais versionados.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {simulate,parseCsv,defaults} from './engine.mjs';
const sym=process.argv[2]||'BTCUSDT';
if(!['BTCUSDT','ETHUSDT','SOLUSDT'].includes(sym))throw Error('Par nao aceito');
const src=new URL('../history/'+sym+'-60m-2025-11-20_2026-11-19.csv',import.meta.url);
const bars=parseCsv(readFileSync(src,'utf8'));
if(bars.length!==8760)throw Error('Esperados 8760 candles, recebidos '+bars.length);
const variants=[
  {...defaults,strategy:'donchian',direction:'both',leverage:1,periodDays:365},
  {...defaults,strategy:'donchian',direction:'both',leverage:3,periodDays:365},
  {...defaults,strategy:'ema',direction:'both',leverage:2,periodDays:180},
  {...defaults,strategy:'donchian',direction:'both',leverage:5,periodDays:180}
];
for(const v of variants){
  const r=simulate(bars,v);
  if(!Number.isFinite(r.summary.patrimonio)||
    !Number.isFinite(r.summary.retornoPct)||
    !Number.isFinite(r.summary.drawdownPct)||
    r.summary.drawdownPct<0||r.summary.drawdownPct>100)
    throw Error('Metrica invalida');
  console.log(JSON.stringify({par:sym,strategy:v.strategy,leverage:v.leverage,periodDays:v.periodDays,...r.summary}));
}
