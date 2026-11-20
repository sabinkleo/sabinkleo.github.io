// Novo backtest historico de 12 meses para o Duelo Spot.
// Le CSVs versionados, NUNCA altera bot/config.yaml, paper_state.json ou paper.json.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {configuracao} from '../lib/arquivos.mjs';
import {backtest,iso} from '../lib/motor.mjs';
const {cfg,regras}=configuracao();
const first=Date.parse('2025-11-20T00:00:00.000Z');
const end=Date.parse('2026-11-20T00:00:00.000Z');
const expected=8760, data={};
for(const pair of cfg.pares) {
  const path=new URL('../history/'+pair+'-60m-2025-11-20_2026-11-19.csv',import.meta.url);
  const [header,...lines]=readFileSync(path,'utf8').trim().split(/\r?\n/);
  if(header!=='t,o,h,l,c,v,fonte'||lines.length!==expected)
    throw Error('Historico insuficiente para '+pair);
  data[pair]=lines.map((line,i)=>{
    const [t,o,h,l,c,v,fonte]=line.split(',');
    const b={t:Number(t),o:Number(o),h:Number(h),l:Number(l),c:Number(c),v:Number(v),fonte};
    if(b.t!==first+i*cfg.passo||![o,h,l,c,v].every(x=>x!=='')||
       ![b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)||
       b.l<=0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c))
      throw Error('Candle incorreto '+pair+' linha '+(i+2));
    return b;
  });
}
if(data[cfg.pares[0]].at(-1).t!==end-cfg.passo)throw Error('Fim inesperado');
const result=backtest(data,{...cfg,inicio:first},regras);
const out=new URL('../results/backtest-12m.json',import.meta.url);
const csv=new URL('../results/patrimonio-12m.csv',import.meta.url);
const trace=['amostra,instante_utc,bot_usdt,hold_usdt'];
for(const phase of ['treino','teste']) {
  for(const row of result[phase].curva) trace.push([phase,iso(row.t),row.bot,row.hold].join(','));
}
writeFileSync(fileURLToPath(out),JSON.stringify({
  ...result,janela_12m:{inicio:first,fim_exclusivo:end,candles_por_par:expected},
  aviso:'Historico de 12 meses, dados spot do grafico Bybit. Sem operacoes reais.'
})+'\n','utf8');
writeFileSync(fileURLToPath(csv),trace.join('\n')+'\n','utf8');
console.log(JSON.stringify({arquivo:'backtest-12m.json',
  candles:expected,periodo:{inicio:new Date(first).toISOString(),fim:new Date(end).toISOString()},
  estrategia:result.estrategia,treino:result.treino.metricas,
  teste:result.teste.metricas,veredito:result.veredito}));
