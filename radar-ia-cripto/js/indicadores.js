// As séries mantêm os índices dos candles. null identifica o período de aquecimento.
export function mediaMovel(valores, periodo) {
  let soma = 0;
  return valores.map((valor, i) => {
    soma += valor;
    if (i >= periodo) soma -= valores[i - periodo];
    return i >= periodo - 1 ? soma / periodo : null;
  });
}

// A média simples inicial evita que o primeiro fechamento receba peso excessivo.
// O MACD também usa esta função, mas sua série começa com posições nulas.
export function ema(valores, periodo) {
  const peso = 2 / (periodo + 1);
  let soma = 0, contagem = 0, anterior = null;
  return valores.map(valor => {
    if (valor === null) return null;
    if (anterior === null) {
      soma += valor;
      if (++contagem < periodo) return null;
      anterior = soma / periodo;
    } else {
      anterior += peso * (valor - anterior);
    }
    return anterior;
  });
}

// Wilder dá peso 1/período às novas variações. Uma série constante recebe RSI neutro.
export function rsi(fechamentos, periodo = 14) {
  let ganho = 0, perda = 0;
  return fechamentos.map((preco, i) => {
    if (i === 0) return null;
    const delta = preco - fechamentos[i - 1];
    const alta = Math.max(delta, 0), baixa = Math.max(-delta, 0);
    if (i <= periodo) {
      ganho += alta;
      perda += baixa;
      if (i < periodo) return null;
      ganho /= periodo;
      perda /= periodo;
    } else {
      ganho += (alta - ganho) / periodo;
      perda += (baixa - perda) / periodo;
    }
    if (perda === 0) return ganho === 0 ? 50 : 100;
    return 100 - 100 / (1 + ganho / perda);
  });
}

// A linha de sinal só é inicializada depois de nove valores válidos da linha MACD.
export function macd(fechamentos, rapida = 12, lenta = 26, sinal = 9) {
  const curta = ema(fechamentos, rapida), longa = ema(fechamentos, lenta);
  const linha = longa.map((valor, i) => valor === null ? null : curta[i] - valor);
  const referencia = ema(linha, sinal);
  const histograma = referencia.map((valor, i) => valor === null ? null : linha[i] - valor);
  return { linha, sinal: referencia, histograma };
}

// As bandas usam o desvio populacional dos fechamentos da própria janela.
export function bollinger(fechamentos, periodo = 20, multiplicador = 2) {
  const meio = mediaMovel(fechamentos, periodo);
  return meio.map((media, i) => {
    if (media === null) return null;
    let quadrados = 0;
    for (let j = i - periodo + 1; j <= i; j++) quadrados += (fechamentos[j] - media) ** 2;
    const largura = multiplicador * Math.sqrt(quadrados / periodo);
    return { inferior: media - largura, meio: media, superior: media + largura };
  });
}

// O fechamento anterior inclui saltos de preço no true range. No primeiro candle
// só há máxima e mínima disponíveis. Depois da média inicial usamos Wilder.
export function atr(candles, periodo = 14) {
  let soma = 0, anterior = 0;
  return candles.map((candle, i) => {
    const fechamentoAnterior = i ? candles[i - 1].close : candle.open;
    const faixa = Math.max(candle.high - candle.low, Math.abs(candle.high - fechamentoAnterior),
      Math.abs(candle.low - fechamentoAnterior));
    if (i < periodo) {
      soma += faixa;
      if (i < periodo - 1) return null;
      anterior = soma / periodo;
    } else {
      anterior += (faixa - anterior) / periodo;
    }
    return anterior;
  });
}

// O volume de cada candle está na moeda-base. A janela acompanha o período do gráfico.
export function mediaVolume(candles, periodo = 20) {
  return mediaMovel(candles.map(candle => candle.volume), periodo);
}

export function calcularIndicadores(candles) {
  const fechamentos = candles.map(candle => candle.close);
  return {
    ema20: ema(fechamentos, 20), ema50: ema(fechamentos, 50),
    rsi: rsi(fechamentos), macd: macd(fechamentos), bandas: bollinger(fechamentos),
    atr: atr(candles), volume: mediaVolume(candles),
  };
}
