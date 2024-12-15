#!/bin/bash
cd $GITHUB_WORKSPACE

git config user.email "73682299+scratchaddons-bot[bot]@users.noreply.github.com"
git config user.name "scratchaddons-bot[bot]"

if git status | grep -q "git add"; then
    echo New strings available. Pushing to GitHub...
    BRANCH=tx

    git show-ref --verify --quiet refs/heads/$BRANCH && BRANCH_EXISTS=true
    if [ -n "$BRANCH_EXISTS" ]; then
        git checkout $BRANCH
    else
        git checkout -b $BRANCH
    fi

    git add _locales/*
    git add addons-l10n/*
    git commit --no-gpg-sign -m "New strings from Transifex"
    git push origin $BRANCH
    echo Pushed as $BRANCH

    if [ -n "$BRANCH_EXISTS" ]; then
        echo "Skipping PR creation"
    else
        echo "Creating a pull request..."
        node $GITHUB_ACTION_PATH/scripts/pr.js "$BRANCH"
    fi
fi
