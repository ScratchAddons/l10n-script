import fs from "fs/promises";
import {promisify} from "util";
import {default as chalk} from "chalk";
import {default as Transifex} from "transifex";
import generateSource from "./generate-src.js";

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

let x = Object.assign({}, process.env);
delete x.TX_TOKEN;
Object.keys(x).forEach(key => key.startsWith("GITHUB") && delete x[key]);
console.log(x);

const SA_ROOT = process.env.SA_ROOT || process.env.INPUT_CHECKOUTDIR || "./clone";

const logUpload = result => console.log(
    chalk`Added\t{cyan ${result.strings_added}} string(s)
Updated\t{green ${result.strings_updated}} string(s)
Removed\t{yellow ${result.strings_delete}} string(s)`
);

const tx = new Transifex({
    project_slug: "scratch-addons-extension",
    credential: `api:${process.env.TX_TOKEN}`
});

const generalSource = await fs.readFile(`${SA_ROOT}/_locales/en/messages.json`, "utf8");

console.log("Uploading General Translation (_locales)");
logUpload(await promisify(tx.uploadSourceLanguageMethod.bind(tx))(
    "scratch-addons-extension",
    "general-translation",
    {content: generalSource}
));

console.log("Uploading Addons Translation (addons-l10n)");
const addonsSource = JSON.stringify(await generateSource());
await fs.writeFile("addons-source.json", addonsSource, "utf8");
console.log(chalk`{gray NOTE}: English source file generated: addons-source.json`);
logUpload(await promisify(tx.uploadSourceLanguageMethod.bind(tx))(
    "scratch-addons-extension",
    "addons-translation",
    {content: addonsSource}
));