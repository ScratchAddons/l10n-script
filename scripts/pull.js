import fs from "fs/promises";
import {promisify} from "util";
import {eachLimit} from "async";
import {default as chalk} from "chalk";
import {default as mkdirp} from "mkdirp";
import {default as Transifex} from "transifex";
import generateSource from "./generate-src.js";

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";

// Number of files it can write at the same time
const WRITE_CONCURRENCY = 10;
// Number of API requests it can make at the same time
const API_CONCURRENCY = 5;

const tx = new Transifex({
    project_slug: "scratch-addons-extension",
    credential: `api:${process.env.TX_TOKEN}`
});

const metadata = await promisify(tx.projectInstanceMethods.bind(tx))("scratch-addons-extension");
const languages = metadata.teams;

let source = {};
try {
    // push.js should create the file
    const sourceFile = await fs.readFile("addons-source.json", "utf8");
    source = JSON.parse(sourceFile);
} catch (e) {
    if (e.code !== "ENOENT") throw e;
    source = await generateSource();
}

const splitTranslation = translation => {
    const result = {};
    Object.keys(translation).forEach(key => {
        const addonId = key.includes("/") ? key.split("/")[0] : "_general";
        if (!result[addonId]) result[addonId] = {};
        if (translation[key] === source[key]) return;
        result[addonId][key] = translation[key];
    });
    return result;
};

const writeLocale = async item => {
    const {locale, resource} = item;
    const saLocale = locale.replace("_", "-");
    const translation = await promisify(tx.translationInstanceMethod.bind(tx))(
        "scratch-addons-extension",
        resource,
        locale,
        {mode: "developer"}
    );
    const translationJSON = JSON.parse(translation);
    let path = "";
    switch (resource) {
        case "general-translation":
            // Write on one file.
            console.log(chalk`Pulled General Translation (_locales): {cyan ${saLocale}}`);
            path = `${SA_ROOT}/_locales/${locale}/`;
            for (const key of Object.keys(translationJSON)) {
                if (translationJSON[key].message === "") {
                    delete translationJSON[key];
                }
            }
            const restringified = JSON.stringify(translationJSON);
            if (restringified === "{}") return;
            await mkdirp(path);
            await fs.writeFile(`${path}messages.json`, restringified, "utf8");
            break;
        case "addons-translation":
            // Addons translation is weird. We need to separate the addons by keys.
            console.log(chalk`Pulled Addons Translation (addons-l10n): {cyan ${saLocale}}`);
            const translations = splitTranslation(translationJSON);
            const resolver = new Intl.DisplayNames([saLocale], {type: "language"});
            const generalTranslation = Object.assign({
                _locale: saLocale,
                _locale_name: resolver.of(saLocale)
            }, translations._general);
            let generated = false;
            let hasGeneral = false;
            path = `${SA_ROOT}/addons-l10n/${saLocale}/`;
            await eachLimit(Object.keys(translations), WRITE_CONCURRENCY, async addonId => {
                const restringified = JSON.stringify(translations[addonId]);
                if (restringified === "{}") return;
                if (addonId === "_general") {
                    hasGeneral = true;
                    return;
                }
                await mkdirp(path);
                await fs.writeFile(`${path}${addonId}.json`, restringified, "utf8");
                generated = true;
            });
            // Generate _general.json if
            // 1) _general.json has translation (excluding _locale/_locale_name), OR
            // 2) other parts are translated
            if (generated || hasGeneral) {
                const restringified = JSON.stringify(generalTranslation);
                await mkdirp(path);
                await fs.writeFile(`${path}_general.json`, restringified, "utf8");
            }
            break;
    }
};

const mapResources = resources => resources.map(
    resource => languages.map(
        language => ({resource: resource.slug, locale: language})
    )
).flat();

const resources = await promisify(tx.resourcesSetMethod.bind(tx))("scratch-addons-extension");
const mappedResources = mapResources(resources);
await eachLimit(mappedResources, API_CONCURRENCY, writeLocale);