// Exporta exatamente 365 dias de candles SPOT fechados, sem credenciais.
// Não altera o paper trading: os downloads e atualizações do cache são efêmeros no runner CI.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { configuracao } from '../lib/arquivos.mjs';
import { coletor } from '../lib/mercado.mjs';

const from='2025-11-20T00:00:00.000Z';
const to='2026-11-20T00:00:00.000Z';
const first=Date.parse(from), end=Date.parse(to);
const pairs=['BTCUSDT','ETHUSDT','SOLUSDT'];
const expected=(end-first)/3600000;
const {cfg}=configuracao();
if(cfg.intervalo_minutos!==60)throw Error('Somente intervalo de 60 minutos permitido');
if(expected!==8760)throw Error('Janela UTC não equivale a 365 dias');
if(Date.now()<end)throw Error('Janela ainda não concluída: há candles abertos');
cfg.inicio=first;
cfg.fim_utc=to;
cfg.pares=pairs;
const output=join(new URL('.',import.meta.url).pathname,'downloads');
// Use fileURLToPath no Windows, embora workflow rode em Linux.
import {fileURLToPath} from 'node:url';
const dest=fileURLToPath(new URL('./downloads/',import.meta.url));
mkdirSync(dest,{recursive:true});
const market=coletor(cfg);
const manifest={
  fonte:'Bybit spot candles via /v5/market/kline, fallback gráfico spot oficial',
  inicio_inclusivo_utc:from,fim_exclusivo_utc:to,
  intervalo_minutos:60,
  esperado_por_par:expected,
  pares:{},
  observacao:'Dados históricos de mercado, sem chave, ordens ou saldo real. Fonte registrada em cada linha.'
};
for(const pair of pairs){
  console.log('COLETANDO',pair,expected,'candles');
  const arr=await market.historico(pair,end);
  if(arr.length!==expected)throw Error(pair+' retornou '+arr.length+' candles; esperado '+expected);
  if(arr[0].t!==first||arr.at(-1).t!==end-3600000)throw Error('Janela inesperada '+pair);
  for(let i=0;i<arr.length;i++){
    const b=arr[i],t=first+i*3600000;
    if(b.t!==t||!['v5','grafico_spot'].includes(b.fonte)||
      ![b.o,b.h,b.l,b.c,b.v].every(Number.isFinite) ||
      b.o<=0||b.c<=0||b.l<=0||b.v<0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))
      throw Error('Candles ausentes, inconsistentes ou duplicados '+pair+' '+new Date(t).toISOString());
  }
  const file=pair+'-60m-2025-11-20_2026-11-19.csv';
  const csv='t,o,h,l,c,v,fonte\n'+arr.map(b=>[b.t,b.o,b.h,b.l,b.c,b.v,b.fonte].join(',')).join('\n')+'\n';
  writeFileSync(join(dest,file),csv,{encoding:'utf8',flag:'w'});
  const sha256=createHash('sha256').update(csv).digest('hex');
  const sources=arr.reduce((a,b)=>(a[b.fonte]=(a[b.fonte]||0)+1,a),{});
  manifest.pares[pair]={arquivo:file,linhas:arr.length,fontes:sources,sha256};
  console.log('VALIDADO',pair,arr.length,'SHA256',sha256);
}
writeFileSync(join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log('EXPORT_OK',JSON.stringify(manifest.pares));
