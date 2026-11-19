import { horarioUTC, numeroBR } from './leitura.js';
import { diaUTC, exibirData } from './eventos.js';

// SVG nativo mantém o gráfico nítido em telas de diferentes densidades, sem CDN.
const NS = 'http://www.w3.org/2000/svg';
function elemento(nome, atributos, texto) {
  const el = document.createElementNS(NS, nome);
  for (const [chave, valor] of Object.entries(atributos)) el.setAttribute(chave, valor);
  if (texto !== undefined) el.textContent = texto;
  return el;
}
const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function criarGrafico(svg, area, vazio, inspecao) {
  let mercado = null, indicadores = null, inspecionar = null, localizar = null;
  let selecionado = 0, quantidade = 0;
  let dias = new Map(), diaAlvo = null;
  const dica = document.getElementById('evento-tooltip'), janela = document.getElementById('janela-evento');
  const legenda = document.getElementById('legenda-eventos');

  function desenhar() {
    svg.replaceChildren();
    inspecionar = localizar = null;
    dica.hidden = true;
    const diarioBTC = mercado?.par === 'BTCUSDT' && mercado.periodo === 'D';
    legenda.hidden = !diarioBTC || !dias.size;
    janela.hidden = !diarioBTC || !diaAlvo;
    if (!mercado) return;
    const w = svg.clientWidth, h = svg.clientHeight;
    if (!w || !h) return;
    const todos = mercado.candles;
    const tamanho = Math.min(todos.length, w < 490 ? 32 : 64);
    const alvo = diarioBTC && diaAlvo ? todos.findIndex(c => diaUTC(c.t) === diaAlvo) : -1;
    const inicio = alvo < 0 ? todos.length - tamanho : Math.max(0, Math.min(todos.length - tamanho, alvo - Math.floor(tamanho / 2)));
    const fim = inicio + tamanho, candles = todos.slice(inicio, fim);
    if (!janela.hidden) document.getElementById('janela-texto').textContent = alvo < 0
      ? 'A Bybit não retornou um candle fechado para esse dia.' : 'Janela histórica de ' + exibirData(diaAlvo) + '. Indicadores do painel no fechamento mais recente.';
    const dominio = candles.flatMap(c => [c.low, c.high]);
    for (const serie of [indicadores.ema20, indicadores.ema50]) {
      dominio.push(...serie.slice(inicio, fim).filter(Number.isFinite));
    }
    let min = Math.min(...dominio), max = Math.max(...dominio);
    const folga = Math.max((max - min) * .08, max * .0002);
    min -= folga; max += folga;
    const esq = 8, dir = w - Math.max(56, numeroBR(max).length * 7.3 + 12), topo = diarioBTC && dias.size ? 25 : 12, base = h - 29;
    const passo = (dir - esq) / candles.length;
    const x = i => esq + (i + .5) * passo;
    const y = preco => topo + (max - preco) * (base - topo) / (max - min);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('aria-label', candles.length + ' candles fechados de ' + mercado.par + ' com EMA 20 e EMA 50');
    const grupo = document.createDocumentFragment();
    const linha = (x1, y1, x2, y2, stroke, extras = {}) =>
      elemento('line', { x1, y1, x2, y2, stroke, ...extras });
    const rotulo = (px, py, texto, ancora = 'start') => elemento('text', {
      x: px, y: py, fill: '#b0b5a8', 'font-size': 12, 'font-family': 'monospace', 'text-anchor': ancora,
    }, texto);
    for (let i = 0; i <= 4; i++) {
      const preco = max - i * (max - min) / 4;
      grupo.append(linha(esq, y(preco), dir, y(preco), '#30352b'), rotulo(dir + 6, y(preco) + 4, numeroBR(preco)));
    }
    // Datas intradiárias são longas. No celular bastam as extremidades do eixo.
    const larguraEixo = dir - esq;
    const marcas = larguraEixo < 350 ? 2 : larguraEixo < 560 ? 3 : 5;
    for (let i = 0; i < marcas; i++) {
      const indice = Math.round(i * (candles.length - 1) / (marcas - 1));
      const t = candles[indice].t;
      const texto = mercado.periodo === 'D' ? dia.format(t) : dia.format(t) + ' ' + hora.format(t);
      grupo.append(rotulo(x(indice), h - 8, texto, i === 0 ? 'start' : i === marcas - 1 ? 'end' : 'middle'));
    }
    // O pavio representa máxima/mínima. O corpo tem pelo menos um pixel para mostrar dojis.
    candles.forEach((c, i) => {
      const cor = c.close >= c.open ? '#65d8ad' : '#ff958b', largura = passo * .62;
      grupo.append(linha(x(i), y(c.high), x(i), y(c.low), cor),
        elemento('rect', { x: x(i) - largura / 2, y: Math.min(y(c.open), y(c.close)),
          width: largura, height: Math.max(1.1, Math.abs(y(c.open) - y(c.close))), fill: cor }));
    });
    function curva(serie, cor, tracejado) {
      let d = '', anteriorValido = false;
      serie.slice(inicio, fim).forEach((valor, i) => {
        if (valor === null) { anteriorValido = false; return; }
        d += (anteriorValido ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(valor).toFixed(2) + ' ';
        anteriorValido = true;
      });
      grupo.append(elemento('path', { d, fill: 'none', stroke: cor, 'stroke-width': 1.8, 'stroke-dasharray': tracejado }));
    }
    curva(indicadores.ema20, '#d3fa43', 'none');
    curva(indicadores.ema50, '#99b9ff', '6 3');
    if (diarioBTC) candles.forEach((c, i) => {
      const titulos = dias.get(diaUTC(c.t));
      if (!titulos) return;
      const px = x(i);
      const marca = elemento('path', { d: 'M' + px + ',3 l5,6 -5,6 -5,-6 Z', fill: '#ffcf71', 'data-evento': diaUTC(c.t) });
      marca.append(elemento('title', {}, titulos.join(' · '))); grupo.append(marca);
    });
    const cursor = linha(0, topo, 0, base, '#d8dad3', { 'stroke-dasharray': '2 4', opacity: 0 });
    grupo.append(cursor);
    svg.append(grupo);
    quantidade = candles.length;
    inspecionar = (i, mostrar = true) => {
      selecionado = Math.max(0, Math.min(quantidade - 1, i));
      const c = candles[selecionado];
      cursor.setAttribute('x1', x(selecionado)); cursor.setAttribute('x2', x(selecionado));
      cursor.setAttribute('opacity', mostrar ? .8 : 0);
      inspecao.textContent = 'Início ' + horarioUTC(c.t) + ' · Abertura ' + numeroBR(c.open) +
        ' · Máx. ' + numeroBR(c.high) + ' · Mín. ' + numeroBR(c.low) + ' · Fech. ' + numeroBR(c.close);
      const titulos = diarioBTC && mostrar ? dias.get(diaUTC(c.t)) : null;
      dica.hidden = !titulos;
      if (titulos) {
        dica.textContent = exibirData(diaUTC(c.t)) + ' · ' + titulos.join(' • ');
        inspecao.textContent += ' · ' + titulos.join(' • ');
      }
    };
    localizar = clientX => Math.floor((clientX - svg.getBoundingClientRect().left - esq) / passo);
    inspecionar(alvo < 0 ? quantidade - 1 : alvo - inicio, alvo >= 0);
  }

  function apontar(evento) {
    if (localizar) inspecionar(localizar(evento.clientX));
  }
  svg.addEventListener('pointermove', apontar);
  svg.addEventListener('pointerdown', apontar);
  svg.addEventListener('blur', () => inspecao.setAttribute('aria-live', 'off'));
  svg.addEventListener('keydown', evento => {
    if (!inspecionar || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key)) return;
    evento.preventDefault();
    inspecao.setAttribute('aria-live', 'polite');
    const posicoes = { ArrowLeft: selecionado - 1, ArrowRight: selecionado + 1, Home: 0, End: quantidade - 1 };
    inspecionar(posicoes[evento.key]);
  });
  new ResizeObserver(desenhar).observe(area);
  function atualizar(dados, series, mensagem = 'Aguardando candles.') {
    mercado = dados; indicadores = series;
    vazio.hidden = Boolean(dados); vazio.textContent = mensagem;
    if (!dados) {
      svg.setAttribute('aria-label', mensagem);
      inspecao.textContent = 'Os preços de abertura, máxima, mínima e fechamento aparecem aqui.';
    }
    desenhar();
  }
  function focarDia(data) { diaAlvo = data; desenhar(); }
  document.getElementById('grafico-recente').addEventListener('click', () => focarDia(null));
  return { atualizar, focarDia, marcar(novos) {
    dias = novos; if (!dias.has(diaAlvo)) diaAlvo = null;
    desenhar();
  } };
}
