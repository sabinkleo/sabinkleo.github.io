#!/usr/bin/env bash
set -euo pipefail

runtime=$(mktemp -d)
trap 'rm -rf -- "$runtime"' EXIT
export GIT_INDEX_FILE="$runtime/index"
export GIT_WORK_TREE="$runtime/tree"
export GIT_DIR="$PWD/.git"
mkdir "$GIT_WORK_TREE"
export GIT_AUTHOR_NAME='github-actions[bot]' GIT_COMMITTER_NAME='github-actions[bot]'
export GIT_AUTHOR_EMAIL='41898282+github-actions[bot]@users.noreply.github.com'
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
branch=refs/heads/duelo-runtime
read_tip() { git ls-remote --refs origin "$branch" | cut -f1; }
stage_tree() { (cd "$GIT_WORK_TREE" && git add --all -- .) && git write-tree; }
parent=$(read_tip)
if [[ -n "$parent" ]]; then
  git fetch --depth=1 --no-tags origin "$branch"
  [[ "$parent" == "$(git rev-parse FETCH_HEAD)" ]] || exit 1
  git read-tree "$parent"
  (cd "$GIT_WORK_TREE" && git checkout-index --all)
  node bot/paper-runtime.mjs restore "$GIT_WORK_TREE"
else
  if [[ "${SEED_RUNTIME:-false}" != true ]]; then
    echo 'Runtime ausente. Inicialização exige execução manual com seed_runtime.' >&2
    exit 1
  fi
  git read-tree --empty
  node bot/paper-runtime.mjs seed "$GIT_WORK_TREE" "$(git rev-parse HEAD)"
  parent=$(git commit-tree "$(stage_tree)" -m 'Preserva checkpoint inicial do duelo')
  # A primeira cópia durável é publicada antes da primeira consulta ao mercado.
  git push origin "$parent:$branch"
fi

export DUELO_REQUIRE_STATE=1
time npm --prefix bot run paper
node bot/paper-runtime.mjs record "$GIT_WORK_TREE"
tree=$(stage_tree)
if [[ "$tree" == "$(git rev-parse "$parent^{tree}")" ]]; then exit 0; fi
commit=$(git commit-tree "$tree" -p "$parent" -m 'Atualiza carteiras simuladas da Bybit')
# Uma mudança concorrente mantém o checkpoint anterior; nenhum rebase automático do estado.
[[ "$(read_tip)" == "$parent" ]] || { echo 'Runtime avançou durante a execução; tente novamente.' >&2; exit 1; }
git push origin "$commit:$branch"
