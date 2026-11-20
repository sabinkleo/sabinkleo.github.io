# Vértice Labs · Perps Lab v0 (educacional)

Este modulo e um simulador puro, sem API keys, POSTs de trading, conta da Bybit, ordens, alavancagem real ou integracoes autenticadas. Nada compra ou vende dinheiro real.

## Abrir

Rota publica apos merge: https://verticelabs.me/perps/

No clone, rode Python HTTP server na raiz (porta 8000) e abra http://127.0.0.1:8000/perps/.

O site importa bot/perps/engine.mjs e carrega somente CSVs fechados de bot/history/, versionados para 20/11/2025 a 20/11/2026 UTC exclusivo. Os arquivos contem 8.760 candles horarios por par e um manifesto SHA256 com proveniencia.

## O que modela

- Tendencia por EMA20/50 no fechamento horario ou rompimento Donchian pelos ultimos 60 dias completos, executado somente na abertura posterior.
- Long, short e filtro direcional; entrada com limite de margem e dimensionamento por percentual de risco teorico.
- 1 a 10 vezes de alavancagem, margem isolada **simplificada**.
- Stop, take-profit parcial de 50%, segundo lote opcional e trailing stop atualizado no fechamento.
- Liquidacao aproximada pela margem e taxa de manutencao fixa (0,5%). Em gap alem do preco liquidavel, execucao na abertura. Se duas barreiras adversas forem tocadas no mesmo candle, assume a primeira na trajetoria adversa.
- Taxas em ambas as pontas, slippage hipotetico e funding fixo por intervalo de oito horas: taxa positiva debita long e credita short; taxa negativa faz o contrario.
- Spot buy-and-hold sem alavancagem no mesmo periodo como referencia; drawdown, taxas, funding, eventos e curva reagem a alteracoes nos controles.

### Limitacoes obrigatorias

**Os OHLCV sao SPOT, NAO precos de contrato perpetuo.** O motor nao baixa mark price, index price, book depth, regras reais de margem, funding historico nem eventos de liquidacao da Bybit. A taxa de funding por 8h e uma HIPOTESE EDITAVEL, nao um dado observado. A frequencia de funding depende de cada instrumento e pode mudar. A taxa de manutencao fixada nao considera faixas de risco, taxas de fechamento, dados de tier ou ADL. Slippage fixo nao captura spread real ou gaps.

Em uma hora, OHLC nao indica a sequencia exata dos precos. Assumimos que barreiras adversas sao atingidas antes do take-profit quando o candle cobre ambos, e garantimos que o trailing stop so influencia o proximo candle. Isso ainda nao substitui simulacao por trades/ticks nem eventos de mark price.

**Alavancagem e tamanho de posicao nao sao sinonimos.** Quando o risco porcentual e o limitante principal, aumentar a alavancagem diminui margem necessaria, mas pode manter o nocional e o PnL praticamente constantes. Controle riscoPct e marginPct para simular tamanhos diferentes.

Um stop nao garante perda maxima (gaps, slippage e liquidacoes podem superar a distancia prevista). A estrategia EMA pode gerar excesso de trades. Nenhum resultado deste painel foi aprovado como alpha.

Referencias oficiais:
- Candles spot: https://bybit-exchange.github.io/docs/v5/market/kline
- Funding historico REAL (nao usado): https://bybit-exchange.github.io/docs/v5/market/history-fund-rate
- Metadados e intervalo de funding: https://bybit-exchange.github.io/docs/v5/market/instrument
- Manutencao de margem: https://www.bybit.com/help-center/article/Maintenance-Margin-USDT-Contract

## Reproduzir e verificar

Use Node 22+:
    node --test bot/perps/tests/*.test.mjs
    node bot/perps/cli.mjs BTCUSDT
    node bot/perps/cli.mjs ETHUSDT
    node bot/perps/cli.mjs SOLUSDT

GitHub Actions: workflow Vértice Perps. Faz 3 replays, verifica os CSVs, testa o motor e preserva todo o paper original. A CI prova que o calculo roda e cumpre invariantes basicas; nao certifica desempenho financeiro ou realismo de execucao.

O backtest spot de 12 meses e calculado separadamente em bot/research/backtest-12m.mjs e publicado em bot/results/backtest-12m.json. O paper spot original permanece em bot/state/ e bot/results/paper.json, sem reset da carteira.
