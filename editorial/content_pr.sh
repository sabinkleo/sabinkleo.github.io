#!/usr/bin/env bash
# Runs only on the trusted default branch after QA. The bot never updates an existing ref.
set -euo pipefail
: "${BASE_BRANCH:?}" "${GITHUB_REPOSITORY:?}" "${GH_TOKEN:?}"
git add -- observatorio/
if git diff --cached --quiet; then
  echo "Generated edition already matches the reviewed site." >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  exit 0
fi
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git commit -m 'Atualiza a edição validada do Observatório'
tree=$(git rev-parse HEAD:observatorio)
branch="editorial/edicao-${tree:0:16}"
prior=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$branch" --base "$BASE_BRANCH" --state all --json url --jq '.[0].url // empty')
if [[ -n "$prior" ]]; then
  echo "This edition already has a review: $prior" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
  exit 0
fi
pending=$(gh pr list --repo "$GITHUB_REPOSITORY" --base "$BASE_BRANCH" --limit 100 --json headRefName,url --jq '.[] | select(.headRefName | startswith("editorial/edicao-")) | .url')
if [[ -n "$pending" ]]; then
  echo "Review the pending edition before preparing its successor: $pending" >&2
  exit 1
fi
if git ls-remote --exit-code --heads origin "$branch" > /dev/null; then
  git fetch --no-tags origin "refs/heads/$branch"
  [[ "$(git rev-parse FETCH_HEAD:observatorio)" == "$tree" ]] || { echo "Existing branch differs" >&2; exit 1; }
  # Do not adopt a branch carrying unrelated or user-authored changes.
  git diff --quiet "origin/$BASE_BRANCH...FETCH_HEAD" -- . ':(exclude)observatorio/**' || exit 1
else
  git push origin "HEAD:refs/heads/$branch"
fi
body=$(mktemp)
trap 'rm -f "$body"' EXIT
cat > "$body" <<EOF
Edição estática gerada a partir dos registros aprovados. Revise as fontes, o histórico e o pacote de mídia no run:
$GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID

O merge publica as páginas. Redes sociais e envios exigem autorização separada.
EOF
gh pr create --repo "$GITHUB_REPOSITORY" --head "$branch" --base "$BASE_BRANCH" \
  --title 'Observatório · edição revisada' --body-file "$body" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
