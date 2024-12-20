#!/bin/bash
cd $GITHUB_WORKSPACE

git config user.email "73682299+scratchaddons-bot[bot]@users.noreply.github.com"
git config user.name "scratchaddons-bot[bot]"

if git status | grep -q "git add"; then
    echo New strings available. Pushing to GitHub...
    BRANCH=tx

    if git ls-remote -q --exit-code --heads origin $BRANCH; then
        BRANCH_EXISTS=true
        git checkout $BRANCH
    else
        BRANCH_EXISTS=false
        git branch -D $BRANCH
        git checkout -b $BRANCH
    fi

    git add _locales/*
    git add addons-l10n/*
    git commit --no-gpg-sign -m "New strings from Transifex"
    git push origin $BRANCH
    echo Pushed as $BRANCH

    if [ "$BRANCH_EXISTS" = "false" ]; then
        echo "Creating a pull request..."
        node $GITHUB_ACTION_PATH/scripts/pr.js "$BRANCH"
    else
        echo "Skipping PR creation"
    fi
fi
