# Duelo entre o bot e o buy-and-hold

O [painel público](https://verticelabs.me/duelo-bot/) compara duas carteiras spot em USDT. Cada uma começa com o mesmo saldo total, repartido igualmente entre os pares, sem rebalanceamento. As consultas à Bybit são GETs públicos de candles. O simulador mantém as ordens apenas em memória e nos arquivos locais.

## Rodar e testar

Na raiz do clone, com Node.js 24.5 ou mais recente, npm e Python 3 para servir o site:

```sh
npm ci --prefix bot --ignore-scripts
npm --prefix bot test
node --test tests/cripto.test.mjs tests/radar-eventos.test.mjs
npm --prefix bot run backtest
npm --prefix bot run paper
python -m http.server 8000 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8000/duelo-bot/`. A segunda execução de `paper` dentro da mesma hora reconstrói os arquivos derivados a partir do estado salvo. O clone já inclui um backtest e uma simulação iniciada. Para reproduzir o corte publicado em uma cópia de trabalho, defina `fim_utc` no `config.yaml` como o instante de `teste.fim` em ISO UTC. Com o valor nulo, o backtest avança até a última hora completa. O treino pode escolher outro limiar se o corte mudar. Preserve a versão publicada do backtest para acompanhar a simulação já iniciada.

## Dados, execução e avaliação

- `config.yaml` define pares, datas, intervalo, custos, saldo, fração de treino e fontes. Os padrões de 0,10% de taxa e 0,05% de slippage são hipóteses por execução. Confira a taxa taker spot na [tabela da Bybit](https://www.bybit.com/en/help-center/article/Trading-Fee-Structure). O slippage é uma hipótese independente da taxa.
- O coletor pagina `GET /v5/market/kline` com `category=spot` e janelas UTC limitadas. Se a v5 estiver indisponível, usa o endpoint público de candles que alimenta o gráfico spot da própria Bybit. Defina `mercado.grafico_spot: null` para exigir a v5 em novos downloads. Cada candle traz a fonte em `data/*.csv`. Na coleta inaugural a v5 respondeu HTTP 403 e os candles vieram do gráfico spot. A validação exige OHLCV coerente, horários alinhados e cobertura contínua para todos os pares. Somente candles fechados entram no cache.
- `strategy.yaml` define EMA rápida/lenta, período do RSI de Wilder e condições de entrada e saída. No cruzamento para cima, compra apenas se o RSI no mesmo fechamento atingir o limiar. No cruzamento para baixo, sai. Entre sinais, mantém a posição. No aquecimento, fica em caixa.
- O treino usa a parte inicial de 60% dos candles e escolhe o limiar de RSI com maior retorno líquido da carteira. Os candidatos e retornos ficam em `backtest.json`. No empate prevalece a ordem do YAML. Com o limiar congelado, o teste cobre os 40% finais uma única vez. As duas carteiras reiniciam com capital idêntico no corte, usando o passado disponível para aquecer os indicadores e conhecer o alvo. No backtest, os sinais só viram operações na próxima abertura. Compras pagam abertura × (1 + slippage) e vendas recebem abertura × (1 − slippage). O hold faz uma compra por par na abertura inicial de cada amostra. Posições abertas são marcadas ao preço público, sem venda fictícia no fim.
- O retorno e a diferença em pontos percentuais usam o saldo inicial de cada carteira. O drawdown é a maior queda percentual desde um pico, incluindo o capital inicial. O Sharpe usa retornos simples por intervalo, taxa livre de risco zero e desvio-padrão amostral, anualizado pelo número de intervalos do ano. Sem variância ou observações suficientes, aparece um travessão. Cada compra ou venda conta como uma operação. O tempo em posição é a média da fração de intervalos comprados nos pares. As taxas são somadas em USDT.
- No backtest, a curva registra fechamentos. No paper, a cada hora o motor lê o candle fechado e usa apenas o preço público de abertura do seguinte para a execução e a marcação. Esse é um preço simulado de preenchimento. O agendador pode iniciar minutos depois. O primeiro processamento estabelece a estreia. Uma falha posterior é recuperada pelas aberturas intermediárias em ordem. As premissas e a regra ajustada ficam vinculadas ao estado.
- `results/backtest.json`, `results/patrimonio.csv` e `results/veredito.txt` contêm o histórico, com datas em UTC. `state/paper_state.json` guarda saldos, quantidades, último candle, operações, curva e exposição. `state/trades.csv` identifica o livro de cada operação e `results/paper.json` alimenta a página. Os timestamps numéricos em JSON e no cache são milissegundos Unix. O painel exibe horários de Brasília.

## Agendamento e retomada

1. O arquivo `.github/workflows/duelo-paper.yml` na branch padrão habilita o agendamento no minuto 8 de cada hora UTC. A aba **Actions → Duelo spot simulado** mostra o histórico. Para uma execução imediata, selecione **Run workflow**, a branch padrão e **Run workflow**.
2. O job instala as dependências do lockfile, roda os testes do motor e consulta os candles. O próprio GitHub fornece um token temporário com `contents: write` para versionar o estado, o cache e o resultado em um único commit. Não há credenciais da Bybit para configurar. Se Actions estiver desativado em um fork, habilite-o na aba **Actions** e permita a escrita do workflow na branch padrão.
3. Uma falha gera mensagem com data UTC no log do comando e no job. O GitHub só recebe um commit após o processamento bem-sucedido. O estado local usa substituição atômica e bloqueio entre processos. Depois de corrigir uma indisponibilidade, reexecute o job ou aguarde o próximo horário. Outra máquina pode retomar com um clone atualizado.
4. O site lê o paper versionado diretamente da branch principal, pois um commit com o token do Actions pode não iniciar outro build do Pages. Se a consulta falhar, o painel identifica a cópia publicada e o horário da última atualização. O backtest de referência permanece fixo durante o acompanhamento horário.
