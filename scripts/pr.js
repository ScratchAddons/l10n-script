import {default as chalk} from "chalk";
import {Octokit} from "@octokit/rest";
import {createActionAuth} from "@octokit/auth-action";

const DEFAULT_BRANCH = "master";

if (process.argv.length !== 3) {
    console.error(chalk`{red ERROR}: Branch is not set.`);
    process.exit(1);
}
const branch = process.argv[2];

const octokit = new Octokit({
    authStrategy: createActionAuth,
    userAgent: "ScratchAddons/l10n-script Pull Request maker",
    timeZone: "UTC"
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, "0");
const date = String(now.getDate()).padStart(2, "0");

await octokit.rest.pulls.create({
    owner,
    repo,
    title: `Translation update: ${year}/${month}/${date}`,
    head: `${owner}:${branch}`,
    base: DEFAULT_BRANCH,
    body: "Daily translation update (via GitHub Actions)."
});

console.log("Created Pull Request.");