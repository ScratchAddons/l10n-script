#!/bin/bash
cd $GITHUB_WORKSPACE

git config user.email "33279053+apple502j@users.noreply.github.com"
git config user.name "apple502j"

if git status | grep -q "git add"; then
    echo New strings available. Pushing to GitHub...
    BRANCH=tx-$(date +"%Y%m%d%H%M%S")
    git checkout -b $BRANCH
    git add _locales/*
    git add addons-l10n/*
    git commit --no-gpg-sign -m "New strings from Transifex"
    git push origin $BRANCH
    echo Pushed as $BRANCH
fi