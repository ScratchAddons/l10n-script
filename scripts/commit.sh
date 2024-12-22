#!/bin/bash
cd $GITHUB_WORKSPACE

git config user.email "73682299+scratchaddons-bot[bot]@users.noreply.github.com"
git config user.name "scratchaddons-bot[bot]"

if git status | grep -q "git add"; then
    echo New strings available. Pushing to GitHub...
    BRANCH=tx

    git fetch

    if git ls-remote -q --exit-code --heads origin $BRANCH; then
        BRANCH_EXISTS=true
        git checkout --track origin/$BRANCH
    else
        BRANCH_EXISTS=false
        git branch -D $BRANCH
        git checkout -b $BRANCH
    fi

    git add _locales/*
    git add addons-l10n/*
    git commit --no-gpg-sign -m "New strings from Transifex"
    echo Pushing as $BRANCH

    if [ "$BRANCH_EXISTS" = "false" ]; then
        echo "Creating a pull request..."
        git push origin $BRANCH
        node $GITHUB_ACTION_PATH/scripts/pr.js "$BRANCH"
    else
        git push
        echo "Skipping PR creation"
    fi
fi
