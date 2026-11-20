# Laboratório de gerenciamento de risco — EXPERIMENTAL

Ferramenta exploratória de simulação. **Não envia ordens e não altera o paper trading atual.** Reutiliza dados de candles, parâmetros de taxas e slippage e sinais EMA/RSI do motor existente, mas experimenta:

- duas entradas escalonadas condicionadas ao movimento favorável;
- posição dimensionada por orçamento de risco e ATR, com limite de exposição;
- stop-loss intrabar, alvo de realização parcial e trailing stop atualizado apenas após candle fechado;
- cooldown para evitar reentradas imediatas; filtro mínimo de retorno potencial em relação ao custo;
- contabilização de taxa e slippage a cada execução.

## Execução

Na raiz do mesmo repositório, com Node.js compatível:

    node --test bot/tests/risk-lab.test.mjs
    node bot/lab/risk-lab.mjs

O script apenas lê os resultados do backtest, os CSVs históricos e o arquivo de parâmetros deste laboratório, e escreve o resultado no stdout. Não requer chave API.

Parâmetros editáveis ficam em params.json; taxas e slippage são **hipóteses do backtest original**, não taxas autenticadas da conta. Para taxas reais da Bybit, consultar GET /v5/account/fee-rate?category=spot&symbol=... autenticado e checar taxas maker/taker, região e promoções. Não inserir chaves no repositório.

## Limitações importantes

- O experimento usa candles de uma hora. OHLC não informa a sequência intrabar de máxima e mínima. Se stop e alvo forem tocados na mesma hora, assume stop primeiro, de forma pessimista; gaps além do stop são preenchidos na abertura, piorada por slippage.
- É um simulador idealizado. Não modela livro de ofertas, preenchimentos parciais, arredondamento de lote, mínimo por ordem, latência ou ordens recusadas. Não serve para operar dinheiro real.
- O risco nominal por trade não é perda máxima garantida: gaps podem superar stops e adições podem aumentar exposição. Sem alavancagem nem short.
- A antiga amostra "teste reservado" já foi examinada durante a discussão do robô. Portanto, resultados dessa nova hipótese no mesmo trecho são exploratórios, não prova fora da amostra. Necessário um novo período futuro intocado e múltiplas janelas walk-forward.
- Compare com hold integral, 50% hold + 50% caixa, uma política de caixa de exposição semelhante e cenários de maior taxa/slippage. Mais controles não implicam mais lucro.

Inspiração metodológica, não alegação de lucro comprovado: [Freqtrade (protections)](https://www.freqtrade.io/en/stable/plugins/), [TrendRider](https://github.com/darkvolg/Trading) e [Bybit fee structure](https://www.bybit.com/en/help-center/article/Bybit-Spot-Fees-Explained).
