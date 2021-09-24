import fs from "fs/promises";
import fsStream from "fs";
import crypto from "crypto";

import fetch from "node-fetch";
import {default as chalk} from "chalk";
import {default as JSZip} from "jszip";
import {default as tar} from "tar";
import {Octokit} from "@octokit/rest";
import {createActionAuth} from "@octokit/auth-action";

const auth = {};
if (process.env.GITHUB_WORKSPACE) auth.authStrategy = createActionAuth;
else if (process.env.GH_TOKEN) auth.auth = process.env.GH_TOKEN;
else {
  console.log(chalk`{red ERROR}: GH_TOKEN is not set, aborting.`);
  process.exit(1);
}

const isWindows = process.platform !== "win32";
const binaryType = isWindows ? "windows" : "linux";
const binarySuffix = isWindows ? "windows-amd64.zip" : "linux-amd64.tar.gz";

const octokit = new Octokit({
  ...auth,
  timeZone: "UTC"
});

const packageJson = JSON.parse(await fs.readFile("./package.json", "utf8"));
const currentVersion = packageJson.tx.version;

console.log(chalk`{blue INFO}: Using version ${currentVersion}.`);

const {data: currentRelease} = await octokit.rest.repos.getReleaseByTag({
  owner: "transifex",
  repo: "cli",
  tag: `v${currentVersion}`
});

const usedAsset = currentRelease.assets.find(item => item.name.endsWith(binarySuffix));
console.log(chalk`{blue INFO}: Downloading ${usedAsset.url}`);
const sha256 = packageJson.tx.sha256[binaryType];
const compressedBinaryResp = await fetch(usedAsset.url, {
  headers: {
    Accept: "application/octet-stream",
    Authorization: `token ${process.env.GITHUB_TOKEN || process.env.INPUT_GITHUB_TOKEN || process.env.INPUT_TOKEN || process.env.GH_TOKEN}`
  }
});
if (!compressedBinaryResp.ok) {
  console.log(chalk`{yellow WARN}: Download failed, aborting.`);
  process.exit(1);
}
const compressedBinary = await compressedBinaryResp.arrayBuffer();

const hash = crypto.createHash("sha256");
hash.update(Buffer.from(compressedBinary));
const calculatedHash = hash.digest("hex");
if (calculatedHash !== sha256) {
  console.log(chalk`{yellow WARN}: Hash value changed. Got ${calculatedHash}, expected ${sha256}`);
  process.exit(1);
}

try {
  await fs.mkdir("./.txbin");
} catch (_) {
}

if (isWindows) {
  const zip = new JSZip();
  await zip.loadAsync(compressedBinary);
  zip.file("tx.exe").nodeStream().pipe(fsStream.createWriteStream("./.txbin/tx.exe")).on("finish", () => {
    console.log(chalk`{blue INFO}: Download finished`);
  });
} else {
  tar.x({
    cwd: "./.txbin/"
  }, ["tx"]).end(Buffer.from(compressedBinary), () => {
    console.log(chalk`{blue INFO}: Download finished`);
  });
}