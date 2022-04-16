import fs from "fs/promises";
import path from "path";
import chalk from "chalk-template";
import { eachLimit } from "async";
import TransifexClient from "./txapi.js";
import { fixFormat } from "./generate-src.js";

if (process.env.PUSH_TRANSLATION !== "true") {
    console.error(chalk`{red ERROR}: To confirm that you want to overwrite existing translations, set PUSH_TRANSLATION to true.`);
    process.exit(1);
}

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

// Number of API requests it can make at the same time
const API_CONCURRENCY = 10;
const PROJECT_SLUG = "o:scratch-addons:p:scratch-addons-extension";
const UPLOAD_TO = `${PROJECT_SLUG}:r:addons-translation-new`;
const SOURCE = "en";
const SOURCE_MODE = "structuredjson";

const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";
const ADDONS_L10N = path.resolve(SA_ROOT, "addons-l10n");

const logUpload = result => console.log(
    chalk`Added\t{cyan ${result.translations_created}} string(s)
Updated\t{green ${result.translations_updated}} string(s)
Removed\t{yellow ${result.translations_deleted}} string(s)`
);

const toTxLocale = saLocale => {
    const [a, b] = saLocale.split("-");
    if (!b) return `l:${a}`;
    return `l:${a}_${b.toUpperCase()}`;
}

const tx = new TransifexClient(process.env.TX_TOKEN);

const pending = [];

for (const saLocale of (await fs.readdir(ADDONS_L10N))) {
    if (!/^[\w-]+$/.test(saLocale) || saLocale === SOURCE) continue;
    console.log(chalk`Merging addons-l10n: {cyan ${saLocale}}`);
    const txLocale = toTxLocale(saLocale);
    const messages = {};
    const dir = path.resolve(ADDONS_L10N, saLocale);
    for (const file of (await fs.readdir(dir))) {
        if (!file.endsWith(".json")) continue;
        const content = JSON.parse(await fs.readFile(path.resolve(dir, file), "utf8"));
        Object.assign(messages, content);
    }
    fixFormat(SOURCE_MODE, messages);
    pending.push({ saLocale, txLocale, messages });
}

await eachLimit(pending, API_CONCURRENCY, async item => {
    console.log(chalk`Pushed addons-l10n: {cyan ${item.saLocale}}`);
    logUpload(await tx.uploadTranslation(
        UPLOAD_TO,
        item.txLocale,
        JSON.stringify(item.messages)
    ));
})
