import fs from "fs/promises";
import chalk from "chalk-template";
import TransifexClient from "./txapi.js";
import generateSource from "./generate-src.js";

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";

const logUpload = result => console.log(
    chalk`Added\t{cyan ${result.strings_created}} string(s)
Updated\t{green ${result.strings_updated}} string(s)
Removed\t{yellow ${result.strings_deleted}} string(s)`
);

const tx = new TransifexClient(process.env.TX_TOKEN);

const generalSource = await fs.readFile(`${SA_ROOT}/_locales/en/messages.json`, "utf8");

console.log("Uploading General Translation (_locales)");
logUpload(await tx.uploadSource(
    "o:scratch-addons:p:scratch-addons-extension:r:general-translation",
    generalSource
));

console.log("Uploading Addons Translation (addons-l10n)");
const addonsSource = JSON.stringify(await generateSource());
await fs.writeFile("addons-source.json", addonsSource, "utf8");
console.log(chalk`{gray NOTE}: English source file generated: addons-source.json`);
logUpload(await tx.uploadSource(
    "o:scratch-addons:p:scratch-addons-extension:r:addons-translation-new",
    addonsSource
));
