#!/usr/bin/env bash
set -euo pipefail

# Edit this list before running. Every local branch not listed here is removed.
KEEP_BRANCHES=(
  main
)

repository_root="$(git rev-parse --show-toplevel)"
current_branch="$(git branch --show-current)"

is_kept_branch() {
  local branch="$1"
  local kept_branch
  for kept_branch in "${KEEP_BRANCHES[@]}"; do
    if [[ "$branch" == "$kept_branch" ]]; then
      return 0
    fi
  done
  return 1
}

if [[ -z "$current_branch" ]] || ! is_kept_branch "$current_branch"; then
  echo "The current branch must be in KEEP_BRANCHES: ${current_branch:-detached HEAD}" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "The primary worktree must be clean before pruning branches." >&2
  exit 1
fi

while IFS= read -r worktree; do
  [[ "$worktree" == "$repository_root" ]] && continue
  git worktree remove --force "$worktree"
done < <(git worktree list --porcelain | awk '/^worktree / { print substr($0, 10) }')

while IFS= read -r branch; do
  is_kept_branch "$branch" && continue
  git branch --delete --force "$branch"
done < <(git for-each-ref --format='%(refname:short)' refs/heads)
