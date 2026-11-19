import { createHash } from 'node:crypto';
import { estrategia, marcar, negociar, novoDuelo, passarIntervalo, resumo, veredito } from './motor.mjs';

// Uma alteração nas premissas precisa de um novo histórico, pois muda o significado das operações antigas.
export function assinatura(cfg,regras) {
  const contrato = [cfg.pares,cfg.inicio,cfg.intervalo_minutos,cfg.saldo_inicial_usdt,
    cfg.taxa_por_execucao,cfg.slippage_por_execucao,cfg.fracao_treino,cfg.dias_por_ano,regras];
  return createHash('sha256').update(JSON.stringify(contrato)).digest('hex');
}
export function atualizarPaper(anterior, dados, aberturas, agora, cfg, regras, contrato) {
  if (anterior && (anterior.versao !== 1 || anterior.contrato !== contrato
    || JSON.stringify(anterior.estrategia) !== JSON.stringify(regras)))
    throw Error('O estado e as regras divergem. Restaure a configuração da simulação em curso.');
  if (anterior?.ultima_abertura > agora) throw Error('Relógio anterior ao último processamento.');
  if (anterior?.ultima_abertura === agora) return anterior;
  const estado = anterior ? structuredClone(anterior) : {versao:1,contrato,estrategia:regras,...novoDuelo(cfg)};
  const primeiro = anterior ? anterior.ultima_abertura+cfg.passo : agora;
  const alvo = estrategia(regras);
  if (!anterior) estado.curva.push({t:agora,bot:cfg.saldo_inicial_usdt,hold:cfg.saldo_inicial_usdt});
  // Após uma interrupção, reproduz cada abertura perdida em ordem; nunca cria histórico anterior à estreia.
  for (let t=primeiro; t<=agora; t+=cfg.passo) {
    const i = (t-cfg.inicio)/cfg.passo, precos = {}, sinais = {}, fontes = {};
    for (const par of cfg.pares) {
      const vela = t === agora ? aberturas[par] : dados[par][i];
      if (vela?.t !== t || dados[par][i-1]?.t !== t-cfg.passo) throw Error('Falta a abertura ou seu candle anterior em ' + par);
      precos[par] = vela.o;
      sinais[par] = alvo(dados[par].slice(0,i));
      fontes[par] = vela.fonte;
    }
    if (estado.ultima_abertura !== undefined) passarIntervalo(estado,cfg);
    negociar(estado,cfg,t,precos,sinais);
    marcar(estado,cfg,t,precos);
    estado.ultima_abertura = t;
    estado.ultimo_candle_fechado = t-cfg.passo;
    estado.ultimas_fontes = fontes;
  }
  return estado;
}
export function painelPaper(estado,cfg) {
  const r = resumo(estado,cfg);
  return {versao:1,pares:cfg.pares,intervalo_minutos:cfg.intervalo_minutos,capital:cfg.saldo_inicial_usdt,
    fontes:estado.ultimas_fontes,...r,veredito:r.intervalos ? veredito(r,'na simulação ao vivo')
      : 'Carteiras iniciadas. O primeiro intervalo completo permitirá comparar o desempenho.'};
}
