import fs from "fs/promises";
import {promisify} from "util";
import {execFile} from "child_process";
import {default as chalk} from "chalk";
import {default as mkdirp} from "mkdirp";
import generateSource from "./generate-src.js";

const TX_BIN = process.platform === "win32" ? "./.txbin/tx.exe" : "./.txbin/tx";

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";

await mkdirp("./.locale/general");
await mkdirp("./.locale/addons");

await fs.copyFile(`${SA_ROOT}/_locales/en/messages.json`, "./.locale/general/en.json");

const addonsSource = JSON.stringify(await generateSource());
await fs.writeFile("addons-source.json", addonsSource, "utf8");
await fs.writeFile("./.locale/addons/en.json", addonsSource, "utf8");
console.log(chalk`{gray NOTE}: English source file generated: addons-source.json`);

throw 1;

const {stdout, stderr} = await promisify(execFile)(TX_BIN, ["push"], {
  windowsHide: true
});

await promisify(process.stdout.write.bind(process.stdout))(stdout);
await promisify(process.stderr.write.bind(process.stderr))(stderr);
console.log(chalk`{gray NOTE}: Uploaded translations`);