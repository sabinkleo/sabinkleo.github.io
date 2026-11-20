import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { iso } from './motor.mjs';
import { painelPaper } from './paper.mjs';

export const arquivosPaper = ['state/paper_state.json', 'state/trades.csv', 'results/paper.json'];

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function csvPaper(estado) {
  const linhas = estado.trades.map(op =>
    [iso(op.t), op.lado, op.par, op.acao, op.quantidade, op.preco, op.taxa].join(','));
  return ['abertura_utc,carteira,par,acao,quantidade,preco_usdt,taxa_usdt', ...linhas].join('\n') + '\n';
}

export function verificarEstado(estado, cfg, contrato) {
  const abertura = estado?.ultima_abertura;
  if (estado?.versao !== 1 || estado.contrato !== contrato || !estado.estrategia
    || !Number.isSafeInteger(abertura) || abertura % cfg.passo || abertura < cfg.inicio
    || estado.ultimo_candle_fechado !== abertura - cfg.passo
    || !Array.isArray(estado.curva) || estado.curva.at(-1)?.t !== abertura
    || !Array.isArray(estado.trades) || !estado.carteiras?.bot || !estado.carteiras?.hold) {
    throw Error('Checkpoint paper inválido ou incompatível com a configuração.');
  }
}

export function verificarCheckpoint(ler, hashes, cfg, contrato) {
  const arquivos = Object.fromEntries(arquivosPaper.map(caminho => {
    const bytes = ler(caminho);
    if (sha256(bytes) !== hashes[caminho]) throw Error('SHA-256 divergente: ' + caminho);
    return [caminho, bytes.toString('utf8')];
  }));
  const estado = JSON.parse(arquivos['state/paper_state.json']);
  verificarEstado(estado, cfg, contrato);
  if (!isDeepStrictEqual(JSON.parse(arquivos['results/paper.json']), painelPaper(estado, cfg))
    || arquivos['state/trades.csv'].replaceAll('\r\n', '\n') !== csvPaper(estado)) {
    throw Error('Painel ou CSV diverge do estado paper.');
  }
  return estado;
}
