// Comparação reprodutível dos mesmos dados: NÃO promove estratégias.
import {readFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const reference=JSON.parse(readFileSync(new URL('../results/backtest.json',import.meta.url),'utf8'));
const comando=fileURLToPath(new URL('./risk-lab.mjs',import.meta.url));
const executado=spawnSync(process.execPath,[comando],{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
if(executado.error) throw executado.error;
if(executado.status!==0) throw Error('Simulador falhou: '+(executado.stderr||executado.stdout).slice(-2000));
const lab=JSON.parse(executado.stdout);

const arred=(v,n=2)=>Number(v.toFixed(n));
function drawdown(curva,capital) {
  let pico=capital,dd=0;
  for(const valor of curva) {
    if(!Number.isFinite(valor) || valor<0) throw Error('Patrimônio inválido na curva');
    pico=Math.max(pico,valor);
    dd=Math.max(dd,1-valor/pico);
  }
  return dd*100;
}
const fases={};
for(const fase of ['treino','teste']) {
  const b=reference[fase], novo=lab[fase], capital=reference.capital;
  if(!Array.isArray(b.curva)||b.curva.length<2 ||
    !novo || !Number.isFinite(novo.retorno_pct)) throw Error('Dados insuficientes em '+fase);
  const meio=b.curva.map(p => capital/2+p.hold/2);
  const ultimo=meio.at(-1);
  const dados=[
    ['Caixa 100%',0,0,0,0],
    ['Hold 50% / Caixa 50%',(ultimo/capital-1)*100,drawdown(meio,capital),b.metricas.hold.trades,b.metricas.hold.taxas_usdt/2],
    ['Hold 100%',b.metricas.hold.retorno_pct,b.metricas.hold.drawdown_max_pct,b.metricas.hold.trades,b.metricas.hold.taxas_usdt],
    ['Bot original',b.metricas.bot.retorno_pct,b.metricas.bot.drawdown_max_pct,b.metricas.bot.trades,b.metricas.bot.taxas_usdt],
    ['Bot com gestão de risco',novo.retorno_pct,novo.drawdown_max_pct,novo.operacoes,novo.taxas]
  ];
  fases[fase]=dados.map(([nome,retorno,drawdown,operacoes,taxas])=>({
    estrategia:nome,retorno_pct:arred(retorno),drawdown_max_pct:arred(drawdown),
    operacoes, taxas_usdt:arred(taxas)
  }));
}
const qualificado=['treino','teste'].every(f=>{
  const r=fases[f];
  return r[4].retorno_pct > 0 && r[4].retorno_pct > r[1].retorno_pct;
});
const resultado={
  aviso:'Dados historicos. Teste reservado original ja foi visto: nao e validacao fora da amostra para novas estrategias.',
  premissas:'Comparacoes com exposicoes de risco diferentes; sem alavancagem, spot simulado.',
  qualificacao:qualificado?'CRITERIO PRELIMINAR - ainda requer novo periodo futuro':'NAO QUALIFICADO - sem evidencia de lucro ajustado ao benchmark',
  fases
};
console.log(JSON.stringify(resultado,null,2));
const summary=process.env.GITHUB_STEP_SUMMARY;
if(summary) {
  let md='# Risk Lab — comparacao historica\n\n'+resultado.aviso+'\n\n';
  for(const fase of ['treino','teste']) {
    md+='## '+fase+'\n\n| Estrategia | Retorno | Drawdown | Operacoes | Taxas (USDT) |\n|---|---:|---:|---:|---:|\n';
    for(const r of fases[fase]) md+='| '+r.estrategia+' | '+r.retorno_pct.toFixed(2)+'% | '+r.drawdown_max_pct.toFixed(2)+'% | '+r.operacoes+' | '+r.taxas_usdt.toFixed(2)+' |\n';
    md+='\n';
  }
  md+='**Resultado:** '+resultado.qualificacao+'\n\n*Nao alterar o paper trading ou operar dinheiro real a partir deste relatorio.*\n';
  appendFileSync(summary,md);
}
