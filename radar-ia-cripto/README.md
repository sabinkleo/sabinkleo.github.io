# Radar IA + Cripto

O Vértice Labs é um catálogo de ferramentas técnicas independentes. O radar segue a hospedagem existente no GitHub Pages, com HTML, CSS e módulos JavaScript nativos. O painel consulta a Bybit à vista e desenha os candles em SVG. A linha do tempo lê `events.json` do próprio site e continua disponível se a bolsa falhar.

Endereço principal: `/radar-ia-cripto/`. O endereço `/analise-cripto/` leva diretamente ao painel técnico.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `index.html` | Página, controles, aviso fixo, data de corte e endereço opcional do proxy |
| `estilo.css` | Layout do site para celular e desktop |
| `js/mercado.js` | Duas consultas públicas, validação, relógio da bolsa e cancelamento |
| `js/indicadores.js` | Uma função por indicador |
| `js/leitura.js` | Interpretação, níveis e formatação |
| `js/grafico.js` | Candles, EMAs, janelas históricas e marcadores |
| `js/tela.js` | Renderização da cotação, dos indicadores e do resumo |
| `js/eventos.js` | Validação, ordenação, filtros, fontes e agrupamento de eventos por dia UTC |
| `js/app.js` | Atualização, cache por seleção, recuo em falhas e integração com a linha do tempo |
| `events.json` | Pesquisa publicada em português com sete campos por evento |
| `../index.html` | Cartão de entrada no catálogo |
| `../analise-cripto/index.html` | Endereço de compatibilidade do painel |
| `../infra/cripto-bybit/worker.mjs` e `wrangler.toml` | Proxy opcional e sua configuração para Cloudflare Workers |
| `../tests/cripto.test.mjs` e `radar-eventos.test.mjs` | Testes do cálculo, leitura de dados, proxy e curadoria |

## Como ler o painel

- O padrão é BTC/USDT em 1 hora. A tela também aceita ETH/USDT, SOL/USDT e os períodos de 15 minutos, 4 horas e 1 dia. Cada ciclo consulta `/v5/market/kline` e `/v5/market/tickers` com `category=spot`. O ticker informa o preço, a variação em 24 h, o volume na moeda-base e o giro em USDT.
- A API entrega até 300 candles solicitados em ordem inversa. O painel ordena os registros, descarta o candle em formação pelo relógio da resposta e usa o trecho contínuo mais recente. Exige ao menos 100 candles fechados para aquecer as séries e calcular a mediana histórica. O preço do ticker pode divergir do último fechamento.
- **Tendência.** Alta quando fechamento > EMA 20 > EMA 50. Baixa quando fechamento < EMA 20 < EMA 50. Os demais casos recebem a classificação lateral. A primeira EMA usa a média simples da janela.
- **Momento.** O RSI 14 usa a suavização de Wilder. Acima de 50 com histograma MACD positivo indica momento de alta. Abaixo de 50 com histograma negativo indica momento de baixa. A leitura passa a forte a partir de RSI 60 na alta ou até RSI 40 na baixa. Sinais divergentes ficam sem confirmação conjunta. O MACD usa EMAs 12/26 e sinal 9.
- **Volatilidade.** O ATR 14 usa true range e suavização de Wilder. O painel compara ATR/fechamento com a mediana dessa razão nos 50 candles anteriores. Acima de 125% da mediana, classifica a volatilidade como elevada. Abaixo de 75%, como baixa. As bandas de Bollinger usam média 20 e dois desvios-padrão populacionais.
- **Níveis e volume.** Suporte e resistência aproximados são o menor preço mínimo e o maior preço máximo dos últimos 20 candles fechados. A média de volume usa os mesmos 20 candles e a moeda-base do par.
- Com a aba visível, o ciclo normal inicia a cada 60 s. Uma troca cancela o pedido anterior. Falhas preservam a consulta válida da mesma seleção com aviso de dados anteriores. O recuo cresce de 60 s até 10 min, respeitando intervalos maiores enviados pela bolsa. Um HTTP 403 impõe ao menos 10 min de pausa. A aba oculta pausa as consultas.

Documentação oficial consultada em 19/11/2026. [Candles](https://bybit-exchange.github.io/docs/v5/market/kline) · [Tickers](https://bybit-exchange.github.io/docs/v5/market/tickers) · [Limites](https://bybit-exchange.github.io/docs/v5/rate-limit)

## Fontes e critérios

Cobertura inicial de **01/06/2026 a 19/11/2026**, inclusive. Pesquisamos em inglês, conferimos as datas nos documentos e redigimos os resumos em português. A data é a do fato descrito no título. Quando a divulgação é o fato, o resumo distingue o período a que ela se refere. A seleção é editorial. Alto indica mudança de amplo alcance ou episódio excepcional, médio indica efeito concentrado em uma plataforma, mercado ou produto e baixo indica mudança administrativa de alcance mais restrito.

Cada registro aponta diretamente à fonte. Para o preço intradiário de bitcoin em 5 de junho, duas redações independentes registraram o cruzamento de US$ 60 mil. A matéria da CoinDesk é o link principal. [CoinDesk](https://www.coindesk.com/markets/2026/06/05/bitcoin-loses-usd60-000-falls-to-weakest-price-since-october-2024) · [The Wall Street Journal](https://www.wsj.com/livecoverage/may-jobs-report-stock-market-06-05-2026/card/bitcoin-falls-below-60-000-Hw8s57xfgErSf1HaykZn)

Para a decisão do Fed em 16 de setembro, o comunicado fundamenta a variação da taxa e a cobertura de mercado documenta a oscilação de BTC e ETH na sessão. Os marcadores representam coincidência de data. [Federal Reserve](https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm) · [The Block](https://www.theblock.co/news/markets/2026-09-16-bitcoin-ether-swing-unanimous-quarter-point-fed-rate-hike-warsh-aim-inflation-415307)

Os filtros combinam categoria e impacto. No BTC/USDT diário, cada losango agrupa os títulos de alto impacto do dia que passaram pelos filtros. Use o ponteiro, toque ou as setas do teclado para ler os títulos. **Ver no gráfico** centraliza o evento histórico quando o candle fechado pertence aos últimos 299 dias. Os indicadores numéricos continuam mostrando o fechamento mais recente.

## Instalar no GitHub Pages existente

1. Abra o repositório `sabinkleo/sabinkleo.github.io` no GitHub.
2. Abra o pull request do Radar IA + Cripto. Se já estiver marcado como **Merged**, avance ao passo 5.
3. Na aba **Files changed**, confira a pasta `radar-ia-cripto/`, o cartão adicionado ao catálogo, a rota de compatibilidade, o Worker e os testes.
4. Na aba **Conversation**, selecione **Merge pull request** e confirme o merge em `main`.
5. Na aba **Actions**, abra a execução **pages build and deployment** correspondente ao commit e aguarde o sucesso do job de publicação.
6. Abra `https://verticelabs.me/` e selecione **Abrir Radar IA + Cripto**.
7. Na linha do tempo, filtre **Regulação** e **Alto**. Abra uma das fontes.
8. No painel, selecione **BTC/USDT** e **1d**. Com dados disponíveis, confira um losango e aguarde 60 segundos para ver o horário da próxima cotação. Se só o painel falhar, consulte a seção do proxy.

## Ativar o proxy em caso de CORS

O Worker recebe os mesmos dois GETs em um endereço próprio. Ele limita o host, as rotas, os pares, os intervalos e os parâmetros, aplica CORS às origens autorizadas e compartilha respostas válidas em cache por até 50 s por ponto de presença. A origem pública do Worker é a única configuração do front-end. Um erro HTTP ou uma restrição de acesso da própria bolsa continua sendo apresentado ao visitante.

1. Confirme na aba **Network** do navegador se o impedimento é CORS. Uma indisponibilidade transitória da Bybit pode se resolver na próxima consulta.
2. Entre na sua conta da Cloudflare pelo navegador e abra **Workers & Pages**.
3. Selecione **Create application** e o modelo **Hello World** para um novo Worker.
4. Dê ao Worker o nome `vertice-cripto-bybit` e selecione **Deploy**. Se a conta solicitar um subdomínio `workers.dev`, conclua essa configuração na mesma tela.
5. Abra **Edit code** no novo Worker.
6. Substitua o código do modelo pelo conteúdo integral de `infra/cripto-bybit/worker.mjs` do repositório.
7. Selecione **Deploy** para publicar o código do proxy.
8. Copie a origem HTTPS exibida no painel da Cloudflare, terminando em `.workers.dev`.
9. Abra essa origem seguida de `/v5/market/tickers?category=spot&symbol=BTCUSDT`. Confira `retCode: 0` e `result.list[0].lastPrice`.
10. Abra a mesma origem seguida de `/v5/market/kline?category=spot&symbol=BTCUSDT&interval=60&limit=300`. Confira `retCode: 0` e as linhas de `result.list`.
11. Em `radar-ia-cripto/index.html`, localize `<meta name="bybit-proxy" content="">` e cole a origem copiada entre as aspas de `content`, sem os caminhos de teste. A partir dessa alteração, o painel consulta o Worker diretamente.
12. Faça commit da alteração, integre-a em `main` e aguarde o novo deploy do Pages.
13. Recarregue o Radar e confirme na aba **Network** que os GETs de `kline` e `tickers` chegam ao Worker e retornam JSON.

O procedimento do painel Cloudflare funciona no Windows 10 e também dispensa instalação local. O diretório do Worker inclui `wrangler.toml` para quem faz deploy por CLI em um sistema compatível. [Cloudflare Workers](https://developers.cloudflare.com/workers/versions-and-deployments/gradual-deployments/#via-the-cloudflare-dashboard) · [Sistemas compatíveis com Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

## Testar no checkout local

1. Abra o PowerShell no clone existente do site que contém esta versão. Execute `git remote get-url origin` e confira se o repositório é `sabinkleo/sabinkleo.github.io`.
2. Execute `Set-Location (git rev-parse --show-toplevel)` para entrar na raiz do clone.
3. Com Node.js 22.12 ou mais recente, execute `node --test tests/cripto.test.mjs tests/radar-eventos.test.mjs`.
4. Com Python 3, execute `python -m http.server 8000 --bind 127.0.0.1` a partir da raiz.
5. Abra `http://127.0.0.1:8000/radar-ia-cripto/` no navegador. Use Ctrl+C no PowerShell para encerrar o servidor.

## Atualizar a curadoria

1. Confira o evento em fonte primária ou em duas fontes independentes. Preserve a distinção entre anúncio, vigência e conclusão.
2. Acrescente um objeto em `events.json` com `date` (AAAA-MM-DD), `category` (ia, cripto, regulacao, mercado), `title`, `summary` (até duas frases), `impact` (alto, medio, baixo), `source_name` e `source_url` (HTTPS). Em casos de dupla apuração, registre a segunda fonte nesta documentação.
3. Ao estender a cobertura, atualize o atributo `datetime` e o texto de `#corte-eventos` no HTML para a data até a qual a pesquisa foi feita.
4. Rode os testes locais e publique a alteração pelo fluxo do repositório. A revisão das notícias é editorial. A atualização de 60 segundos se aplica às cotações.
