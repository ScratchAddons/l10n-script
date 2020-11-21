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
    
    IFS="/"
    read -ra REPONAME <<< "$GITHUB_REPOSITORY"
    
    DEFAULT_BRANCH="master"
    curl --request POST --url https://api.github.com/repos/$GITHUB_REPOSITORY/pulls --header 'Authorization: Bearer $INPUT_GHTOKEN' --header 'Content-Type: application/json' --data '{"title": "Automated translation update", "head": "${REPO[1]}/$BRANCH", "base": "${REPO[1]}/$DEFAULT_BRANCH", "maintainer_can_modify": true, "body": "Daily translation update via Transifex."}'
fi