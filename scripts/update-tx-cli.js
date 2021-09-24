import fs from "fs/promises";
import fetch from "node-fetch";
import {default as chalk} from "chalk";
import {Octokit} from "@octokit/rest";

if (!process.env.GH_TOKEN) {
  console.log(chalk`{red ERROR}: GH_TOKEN is not set, aborting.`);
  process.exit(1);
}

const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
  timeZone: "UTC"
});

const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
const currentVersion = packageJson.tx.version;

console.log(chalk`{blue INFO}: Current version is ${currentVersion}.`);

const {data: latestRelease} = await octokit.rest.repos.getLatestRelease({
  owner: "transifex",
  repo: "cli",
});
const latestVersion = /\d+\.\d+\.\d+/.exec(latestRelease.name)[0];
console.log(chalk`{blue INFO}: Latest version is ${latestVersion}.`);
if (latestVersion === currentVersion) {
  console.log(chalk`{blue INFO}: No update found.`);
  process.exit(0);
}
const checksumFile = latestRelease.assets.find(asset => asset.name === "checksums.txt");
if (!checksumFile) {
  console.log(chalk`{yellow WARN}: Checksum file not found, aborting.`);
  process.exit(1);
}
const checksumFileUrl = checksumFile.url;
const resp = await fetch(checksumFileUrl, {
  headers: {
    Accept: "application/octet-stream",
    Authorization: `token ${process.env.GH_TOKEN}`
  }
});
if (!resp.ok) {
  console.log(chalk`{yellow WARN}: Checksum fetching failed, aborting.`);
  process.exit(1);
}
const checksum = await resp.text();
const checksums = {};
for (const item of checksum.matchAll(/^([a-f0-9]+)\s*(.+)$/mg)) {
  const [_, hash, fn] = item;
  if (fn.endsWith("windows-amd64.zip")) checksums.windows = hash;
  if (fn.endsWith("linux-amd64.tar.gz")) checksums.linux = hash;
}

packageJson.tx = {
  version: latestVersion,
  sha256: checksums
};
await fs.writeFile("./package.json", JSON.stringify(packageJson, undefined, 4), "utf8");
console.log(chalk`{blue INFO}: Version info updated.`);