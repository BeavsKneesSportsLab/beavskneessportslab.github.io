#!/bin/bash
# Bring this local clone up to date with the live site repo before pushing code.
# The cloud bot pushes data daily, and squash-site.yml rewrites history on the 1st of each month.
# After a squash a normal pull can't work (no shared history), so reset to the remote -- but only if
# that wouldn't throw away local code changes (data/ is the bot's, so differences there don't count).
set -e
cd "$(dirname "$0")"
git fetch -q origin
# data/ is published ONLY by the cloud build. Anything built locally is throwaway: drop it so it can never
# conflict with (or overwrite) the bot's data. Code changes are untouched.
git restore --staged --worktree --source=HEAD -- data 2>/dev/null || true
git clean -fdq -- data
if git merge-base HEAD origin/main >/dev/null 2>&1; then
  git pull -q --rebase --autostash origin main
  # an autostash that re-applies with conflicts leaves marker-filled files behind; never report success
  if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
    echo "SYNC CONFLICT in: $(git diff --name-only --diff-filter=U | tr '\n' ' ')"
    echo "Local changes are in 'git stash list'. Resolve (for data/ files, rebuild them) before committing."
    exit 1
  fi
  echo "up to date"
  exit 0
fi
if [ -n "$(git status --porcelain -- . ':!data')" ] || [ -n "$(git diff --name-only HEAD origin/main -- . ':!data')" ]; then
  echo "History was squashed upstream AND this clone has code that differs from it:"
  git diff --stat HEAD origin/main -- . ':!data'
  echo "Save those changes elsewhere, then: git fetch origin && git reset --hard origin/main"
  exit 1
fi
git reset -q --hard origin/main && echo "resynced after the monthly squash"
