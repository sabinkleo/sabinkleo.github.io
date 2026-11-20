#!/usr/bin/env bash
set -euo pipefail
sandbox=$(mktemp -d)
trap 'rm -rf -- "$sandbox"' EXIT
source_dir=$PWD
git init --quiet --bare "$sandbox/origin"
git init --quiet --initial-branch=main "$sandbox/local"
git init --quiet --bare "$sandbox/rejected"
printf '#!/usr/bin/env bash\nexit 1\n' > "$sandbox/rejected/hooks/pre-receive"
chmod +x "$sandbox/rejected/hooks/pre-receive"
cp -a bot radar-ia-cripto "$sandbox/local/"
cd "$sandbox/local"
git add -- bot/cli.mjs
git -c user.name=Test -c user.email=test@example.invalid commit --quiet -m fixture
git remote add origin "$sandbox/origin"
git push --quiet origin HEAD:main
main=$(git rev-parse HEAD)
ref=refs/heads/duelo-runtime
tip() { git ls-remote origin "$ref" | cut -f1; }
mkdir "$sandbox/bin"
printf '#!/usr/bin/env bash\nexit 143\n' > "$sandbox/bin/npm"
chmod +x "$sandbox/bin/npm"

# A missing runtime requires explicit staged seeding in this disposable fixture.
if bash bot/paper-runtime.sh; then exit 1; fi
[[ -z "$(tip)" ]]

# Cancellation immediately after the migration must leave its authoritative checkpoint.
if SEED_RUNTIME=true PATH="$sandbox/bin:$PATH" bash bot/paper-runtime.sh; then exit 1; fi
seed=$(tip)
[[ -n "$seed" ]]
git --git-dir="$sandbox/origin" show "$seed:checkpoint.json"
[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$main" ]]

# A disposable checkout missing cache reconstructs it and repeats the last hour without market access.
rm -r -- bot/data
printf 'Date.now = () => %s; globalThis.fetch = () => { throw Error("unexpected network"); };\n' \
  "$(node -p "require('./bot/state/paper_state.json').ultima_abertura")" > "$sandbox/clock.mjs"
NODE_OPTIONS="--import=$sandbox/clock.mjs" bash bot/paper-runtime.sh
latest=$(tip)
NODE_OPTIONS="--import=$sandbox/clock.mjs" bash bot/paper-runtime.sh
[[ "$(tip)" == "$latest" ]]
for archive in bot/data/*.csv; do cmp "$archive" "$source_dir/$archive"; done

# A normal run with one unavailable pair must preserve its durable checkpoint.
export PAPER_TEST_NOW=$(node -p "require('./bot/state/paper_state.json').ultima_abertura + 3600000")
fixture="--import=$source_dir/bot/tests/fixtures/paper-bybit.mjs"
if NODE_OPTIONS="$fixture" PAPER_TEST_OUTAGE=1 bash bot/paper-runtime.sh; then exit 1; fi
[[ "$(tip)" == "$latest" ]]

# Two runners with the same opening may race, but publish only one successor.
git clone --quiet --branch main "$sandbox/origin" "$sandbox/racer"
cp -a "$source_dir/bot" "$source_dir/radar-ia-cripto" "$sandbox/racer/"
NODE_OPTIONS="$fixture" bash bot/paper-runtime.sh > "$sandbox/runner-a.log" 2>&1 &
first=$!
(cd "$sandbox/racer" && NODE_OPTIONS="$fixture" bash bot/paper-runtime.sh) > "$sandbox/runner-b.log" 2>&1 &
second=$!
status_a=0
status_b=0
wait "$first" || status_a=$?
wait "$second" || status_b=$?
cat "$sandbox/runner-a.log" "$sandbox/runner-b.log"
((status_a == 0 || status_b == 0))
successor=$(tip)
[[ "$successor" != "$latest" ]]
[[ "$(git --git-dir="$sandbox/origin" rev-parse "$successor^")" == "$latest" ]]
git --git-dir="$sandbox/origin" show "$successor:bot/state/paper_state.json" > "$sandbox/next.json"
git --git-dir="$sandbox/origin" show "$latest:bot/state/paper_state.json" > "$sandbox/previous.json"
node -e '
  const assert = require("node:assert/strict");
  const [previous, next] = process.argv.slice(1).map(require);
  assert.equal(next.ultima_abertura, Number(process.env.PAPER_TEST_NOW));
  assert.equal(next.intervalos, previous.intervalos + 1);
  assert.equal(next.contrato, previous.contrato);
  assert.deepEqual(next.estrategia, previous.estrategia);
  assert.deepEqual(next.trades.slice(0,previous.trades.length), previous.trades);
' "$sandbox/previous.json" "$sandbox/next.json"
latest=$successor
# Restore the advanced checkpoint before trying another seed against the rejected remote.
NODE_OPTIONS="$fixture" bash bot/paper-runtime.sh
[[ "$(tip)" == "$latest" ]]

# A remote write rejection leaves no partial publication.
git clone --quiet --bare "$sandbox/origin" "$sandbox/measurement"
(cd "$sandbox/measurement" && bash "$source_dir/bot/prepare-paper-compaction.sh" "$ref" "$sandbox/recovery")
(cd "$sandbox/recovery" && sha256sum -c SHA256SUMS)
[[ "$(cat "$sandbox/recovery/source.txt")" == "$latest" ]]

git remote set-url origin "$sandbox/rejected"
if SEED_RUNTIME=true bash bot/paper-runtime.sh; then exit 1; fi
[[ -z "$(tip)" ]]
