#!/bin/bash
cd $GITHUB_WORKSPACE

git config user.email "73682299+scratchaddons-bot[bot]@users.noreply.github.com"
git config user.name "scratchaddons-bot[bot]"

if git status | grep -q "git add"; then
    echo New strings available. Pushing to GitHub...
    BRANCH=tx
    git branch -D $BRANCH
    git push origin --delete $BRANCH
    git checkout -b $BRANCH
    git add _locales/*
    git add addons-l10n/*
    git commit --no-gpg-sign -m "New strings from Transifex"
    git push origin $BRANCH
    echo Pushed as $BRANCH
    
    node $GITHUB_ACTION_PATH/scripts/pr.js "$BRANCH"
fi
