#!/usr/bin/env bash
set -euo pipefail
ref=${1:?Pass the full runtime ref}
dest=${2:?Pass an empty directory for the recovery bundles}
[[ "$ref" == refs/heads/* ]] || { echo 'An explicit branch ref is required.' >&2; exit 1; }
[[ $(git rev-parse --is-shallow-repository) == false ]] || { echo 'Fetch full history first.' >&2; exit 1; }
mkdir -p "$dest"
dest=$(cd "$dest" && pwd)
[[ -z "$(ls -A "$dest")" ]] || { echo 'The output directory must be empty.' >&2; exit 1; }

tip=$(git rev-parse --verify "$ref^{commit}")
tree=$(git rev-parse "$tip^{tree}")
git show "$tip:checkpoint.json" > "$dest/checkpoint.json"
git bundle create "$dest/history.bundle" "$ref"
verify=$(mktemp -d)
trap 'rm -rf -- "$verify"' EXIT
git init --quiet --bare "$verify"
git -C "$verify" bundle verify "$dest/history.bundle"
git -C "$verify" fetch --quiet "$dest/history.bundle" "$ref:refs/heads/recovered"
[[ "$(git -C "$verify" rev-parse refs/heads/recovered)" == "$tip" ]]

root=$(git -C "$verify" -c user.name='Duelo recovery' -c user.email='recovery@example.invalid' \
  commit-tree "$tree" -m "Compact runtime snapshot from $tip")
git -C "$verify" update-ref refs/heads/candidate "$root"
git -C "$verify" bundle create "$dest/candidate.bundle" refs/heads/candidate
fresh=$(mktemp -d "$verify/fresh.XXXXXX")
git init --quiet --bare "$fresh"
git -C "$fresh" bundle verify "$dest/candidate.bundle"
git -C "$fresh" fetch --quiet "$dest/candidate.bundle" refs/heads/candidate:refs/heads/recovered
[[ "$(git -C "$fresh" rev-parse refs/heads/recovered^{tree})" == "$tree" ]]
[[ "$(git -C "$fresh" rev-list --count refs/heads/recovered)" == 1 ]]
printf '%s\n' "$tip" > "$dest/source.txt"
printf '%s\n' "$root" > "$dest/candidate.txt"
(cd "$dest" && sha256sum history.bundle candidate.bundle checkpoint.json source.txt candidate.txt > SHA256SUMS)
printf 'Reachable Git objects before: %s bytes\n' "$(git rev-list --disk-usage --objects "$tip")"
printf 'Reachable Git objects in candidate: %s bytes\n' "$(git -C "$fresh" rev-list --disk-usage --objects refs/heads/recovered)"
