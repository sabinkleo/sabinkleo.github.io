# Bot vs Hold — Etapa 0

Este diretório abriga exclusivamente o experimento **Duelo: Bot vs Hold** da Vértice Labs.

## Reconhecimento do repositório

- Hospedagem do site: GitHub Pages, com HTML, CSS e JavaScript nativo, sem etapa de build.
- Painel de mercado existente: `../radar-ia-cripto/`, com candles spot da Bybit e indicadores técnicos.
- Proxy existente: `../infra/cripto-bybit/`. É destinado ao painel interativo e **não** suporta paginação histórica por `start`/`end`; não deve ser alterado para o experimento.
- Testes do site: `../tests/` (Node.js).

## Arquitetura reservada para as próximas etapas

- `bot/config.yaml`: pares, datas, granularidade, custos, slippage, capital inicial e demais parâmetros.
- `bot/strategy.yaml`: regras declarativas da estratégia; nenhum parâmetro operacional fixo no motor.
- `bot/data/`: cache histórico de candles horários obtidos apenas da API pública spot da Bybit.
- `bot/results/`: relatórios JSON, curvas de patrimônio CSV e vereditos.
- `bot/state/`: estado persistente e operações da simulação (sem ordens reais).
- `bot/tests/`: testes de execução no candle seguinte, taxas e idempotência.

O backtest e a simulação serão implementados em **Python**, executados fora do navegador. O GitHub Pages servirá apenas arquivos estáticos e lerá os JSON gerados pelo motor. O agendamento futuro poderá usar GitHub Actions.

## Limites do experimento

Somente operações spot simuladas, sem alavancagem, short, ordens reais, autenticação ou chaves de API. Nenhuma funcionalidade do site atual foi modificada nesta etapa.

**Estado atual:** somente reconhecimento e criação do diretório. A implementação começa apenas após confirmação da Etapa 1.
