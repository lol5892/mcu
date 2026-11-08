#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repo=lol5892/mcu
gh auth status
npm ci
npm test
npm run build
if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  git init -b main
  git add .
  git -c user.name='Our Marvel' -c user.email='our-marvel@users.noreply.github.com' commit -m 'Build Наш Marvel offline family watchlist'
fi
if ! gh repo view "$repo" >/dev/null 2>&1; then
  gh repo create "$repo" --public --description 'Наш Marvel — семейный офлайн PWA-дневник MCU'
fi
if ! git remote get-url origin >/dev/null 2>&1; then git remote add origin "https://github.com/$repo.git"; fi
gh auth setup-git
git push -u origin main
# A new, empty repository only. Enable GitHub Actions as its Pages source.
gh api --method POST "repos/$repo/pages" -f build_type=workflow || gh api --method PUT "repos/$repo/pages" -f build_type=workflow
printf '\nGitHub Pages URL: https://lol5892.github.io/mcu/\n'
