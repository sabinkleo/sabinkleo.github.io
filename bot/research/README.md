# Vértice Crypto Research — replicação exploratória (2026)

**Este módulo não opera dinheiro real, não consulta credenciais, não altera o paper trading público e não é um sinal de compra.**

## Origem das hipóteses

Fonte primária:
- Zarattini, Pagani e Barbon, *Catching Crypto Trends: A Tactical Approach for Bitcoin and Altcoins* (Swiss Finance Institute, série 25-80): https://www.sfi.ch/en/publications/n-25-80-catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins
- A pesquisa emprega breakout Donchian, stops monotônicos, volatilidade como sizing e limites para evitar rebalanceamento excessivo; resultados líquidos mais expressivos vieram de **20 moedas rotativas com filtros de liquidez**. Não estamos replicando o portfólio original.

Contraprovas:
- https://github.com/pooriag/crypto-strategy-backtest — backtest walk-forward de tendências, com custo, bootstrap e insignificância da diferença de Sharpe em relação ao buy-and-hold.
- https://arxiv.org/abs/2611.01951 — crítica de fator de tendência cripto cujos resultados desapareceram depois de corrigida a implementação.
- https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1811716/full — previsão intraday não supera custos de execução no estudo.

## Especificação congelada para pesquisa

- **Dados**: apenas cache de 1h do próprio repositório para BTCUSDT, ETHUSDT, SOLUSDT; agregar em dias UTC completos. Sem coleta live.
- **Entrada**: fechamento diário estritamente acima do maior fechamento dos últimos N dias **anteriores** (N=10,20,60). Sinal só é executado na abertura seguinte. Sem operações com candle inacabado.
- **Saída**: primeiro fechamento inferior ou igual ao trailing stop calculado com o ponto médio do canal; o stop nunca diminui enquanto a posição existir.
- **Políticas**: hold integral, hold metade/caixa metade, caixa integral, Donchian20, Donchian60, ensemble 10/20/60, ensemble com alvo de volatilidade anual de 25% com observação de 30 dias e teto de alocação de 100% por par.
- **Custos**: Bybit spot VIP0 como hipótese de 10 bps de taxa por lado + 5 bps de slippage por lado; sensibilidade com ambos dobrados. Sua conta efetiva não foi verificada.
- **Execução**: sem rebalancear continuamente os benchmarks. Ensemble vol só rebalanceia por mudança de sinal ou variação superior a 20 pontos percentuais. Sem empréstimo, short, staking ou funding.
- **Amostra**: começa após 60 dias de aquecimento de todos os indicadores. Divide o histórico disponível no marco 60% em calendário, reiniciando capital em cada trecho. Compara também o intervalo inteiro pós-aquecimento.
- **Métricas**: retorno líquido, drawdown, número de fills, taxas simuladas, exposição média. Uma saída parcial conta como fill.
- **Limitação severa**: toda a série de 2026 já foi inspecionada em experiências anteriores; esta análise é **exploratória**, mesmo se os parâmetros foram copiados da literatura de 2025. Aprovação financeira precisa de novos dados futuros não tocados, muitas janelas e cobertura ampla de moedas incluindo delistadas.
- **Limitação de benchmark**: 100% caixa, 50% hold e hold integral têm riscos diferentes. Nunca afirmar alfa a partir de retorno bruto ou drawdown menor isoladamente.
- **Diferente do paper**: apenas 3 ativos, canais de fechamento com confirmação estrita, sem a carteira rotativa de 20 moedas nem filtro de liquidez, sem otimização, spot sem alavancagem; logo este módulo é uma **adaptação inspirada**, não reprodução dos números do estudo.

## Reproduzir

    node --test bot/research/donchian-study.test.mjs
    node bot/research/donchian-study.mjs

As ações de CI fazem as verificações e publicam uma tabela no Summary da execução, sem exigir comandos locais.

**Critério de promoção**: positivo após custos e stress de 2x, benchmark de mesma exposição, diferentes regimes e períodos intocados, sem lookahead ou data snooping. Mesmo isso não garante lucro futuro. Não fazer merge de uma estratégia ao paper atual apenas por CI verde.
