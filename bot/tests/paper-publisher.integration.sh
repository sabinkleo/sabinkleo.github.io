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

# A remote write rejection leaves no partial publication.
git clone --quiet --bare "$sandbox/origin" "$sandbox/measurement"
(cd "$sandbox/measurement" && bash "$source_dir/bot/prepare-paper-compaction.sh" "$ref" "$sandbox/recovery")
(cd "$sandbox/recovery" && sha256sum -c SHA256SUMS)
[[ "$(cat "$sandbox/recovery/source.txt")" == "$latest" ]]

git remote set-url origin "$sandbox/rejected"
if SEED_RUNTIME=true bash bot/paper-runtime.sh; then exit 1; fi
[[ -z "$(tip)" ]]
