#!/bin/bash
cd $GITHUB_WORKSPACE

if git status | grep -q "Changes not staged for commit"; then
    echo New strings available. Pushing to GitHub...
    BRANCH=tx-$(date +"%Y%m%d%H%M%S")
    git checkout -b $BRANCH
    git add _locales/*
    git add addons-l10n/*
    git commit --no-gpg-sign -m "New strings from Transifex"
    git push origin $BRANCH
    echo Pushed as $BRANCH
fi