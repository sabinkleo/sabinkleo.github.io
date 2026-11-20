# Evidence ledger — Crypto strategies, 19–20 Nov 2026

## Decision
**Donchian 60 days, long-only spot BTC/ETH/SOL, is a candidate for future forward testing, NOT validated profitability.** Only 69 historical test days and 6 fills; 2026 market observations were already used in prior research. Do not merge this rule into production paper trading.

## Research provenance

1. Swiss Finance Institute, *Catching Crypto Trends*, 25-80: ensemble Donchian, 25% volatility targeting, restricted rebalancing, dynamically rotated 20-asset universe. Reported Sharpe >1.5, alpha 10.8% a year after costs; **this lab does not reproduce the original 20-coin portfolio.** https://www.sfi.ch/en/publications/n-25-80-catching-crypto-trends-a-tactical-approach-for-bitcoin-and-altcoins
2. Reproducible negative replication with walk-forward and bootstrap: risk-reduced trend following did not significantly beat hold on Sharpe. https://github.com/pooriag/crypto-strategy-backtest
3. 2026 replication correction removes most claimed profit in a different crypto trend factor: https://arxiv.org/abs/2611.01951
4. 2026 microstructure ML short-horizon forecast signal does not survive trading costs: https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1811716/full
5. Funding carry alternative has observable funding payments but substantial margin risk and weaker 2026 returns: https://www.blofinx.com/learn/is-funding-rate-carry-still-profitable
6. Community reports cost drag and overfitting; such posts are leads, not audited performance: https://www.reddit.com/r/Trading/comments/1xkgxvh/backtested_100_popular_day_trading_strategies_on/
7. Bybit official VIP0 spot fees 0.10% per side (as listed November 2026); actual region/account may vary. Slippage 0.05% per side is a model assumption: https://www.bybit.com/pt-PT/help-center/article/Trading-Fee-Structure

## Verified Actions run

https://github.com/sabinkleo/sabinkleo.github.io/actions/runs/44646677252

Data: 171 full daily UTC candles aggregated from existing BTC/ETH/SOL Bybit spot hourly cache, June 1 – Nov 18, 2026. Initial 60 days for warmup. Training 42 days (Jul 31 – Sep 10), historical test 69 days (Sep 11 – Nov 18), continuous replay 111 days (Jul 31 – Nov 18). Capital is separately reset for training and historical test.

Fee 0.10% taker + 0.05% modeled slippage per side, with a scenario doubling both. Orders filled on the next daily opening after the previous completed close.

| Strategy | Training | Historical test | Continuous 111d | Max DD 111d |
|---|---:|---:|---:|---:|
| Cash | 0.00% | 0.00% | 0.00% | 0.00% |
| Hold 50%, Cash 50% | +12.85% | -11.74% | -1.94% | 20.73% |
| Full Hold | +25.70% | -23.48% | -3.87% | 34.93% |
| Donchian 20d | +14.24% | -5.20% | +8.28% | 10.93% |
| Donchian 60d | +11.23% | +3.84% | +15.78% | 11.04% |
| Ensemble 10/20/60 | +15.18% | -1.77% | +13.35% | 8.70% |
| Ensemble with vol-target | +9.74% | -1.79% | +7.84% | 5.22% |

Test 69-day Donchian60: six fills; 2.04 USDT in fees; average exposure 58.9%; drawdown 10.98%; +3.53% with doubled transaction costs.

### Concentration and one extra day of fill latency (69-day test)

| Instruments | Next-open return | +1 day additional latency |
|---|---:|---:|
| BTC | +5.32% | +4.37% |
| ETH | -1.43% | -1.52% |
| SOL | +7.64% | +8.10% |
| BTC + ETH | +1.94% | +1.42% |
| BTC + SOL | +6.48% | +6.23% |
| ETH + SOL | +3.11% | +3.29% |

Result is positive across two of three single-coin tests; ETH lost money. An extra day's execution delay did not erase the portfolio improvement. Six executions are statistically insufficient to prove a return premium.

## Mandatory limits

- These hypotheses were evaluated after already seeing 2026 outcomes, and the best-looking candidate was highlighted after checking seven variants. Selection bias exists. Future data must remain unobserved before formal acceptance.
- Some apparent benefit comes from **reduced exposure**. Compare against position-size-matched passive benchmarks, not just full hold.
- Survivorship bias from three preselected large liquid coins. No 20-coin rotating universe, no delistings, no transaction-impact model. Not a full reproduction of SFI.
- Execution fills at a modeled daily opening; actual maker/taker status, spread, latency, qty steps, order rejects and slippage may differ.
- Even a robust historical result is not a guarantee of future profit. No exchange credentials or live orders exist in this branch.
- Reproduce via node --test bot/research/donchian-study.test.mjs, then node bot/research/donchian-study.mjs. CI runs both automatically.

**Promotion gate**: a genuinely fresh future sample, multiple independent regimes, realistic execution, 2x cost stress, concentration constraints and matched-exposure benchmarks. Otherwise remain in research.
