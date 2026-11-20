#!/usr/bin/env bash
set -euo pipefail
# Aggregate external interface counters for the duration of the wrapped command.
network() { awk 'NR > 2 && $1 != "lo:" {rx += $2; tx += $10} END {printf "%.0f %.0f\n", rx, tx}' /proc/net/dev; }
read -r rx tx < <(network)
started=$SECONDS
status=0
"$@" || status=$?
read -r end_rx end_tx < <(network)
printf 'Duelo runner: %s s; ingress %s bytes; egress %s bytes (all external interfaces)\n' \
  "$((SECONDS-started))" "$((end_rx-rx))" "$((end_tx-tx))"
exit "$status"
