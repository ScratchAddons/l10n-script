import fs from "fs/promises";
import {promisify} from "util";
import {eachLimit} from "async";
import {default as chalk} from "chalk";
import {default as mkdirp} from "mkdirp";
import {default as Transifex} from "transifex";

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

const SA_ROOT = process.env.SA_ROOT || "./clone";

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

const splitTranslation = translation => {
    const result = {};
    Object.keys(translation).forEach(key => {
        const addonId = key.includes("/") ? key.split("/")[0] : "_general";
        if (!result[addonId]) result[addonId] = {};
        if (translation[key] === "") return;
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
        {mode: "onlytranslated"}
    );
    const translationJSON = JSON.parse(translation);
    switch (resource) {
        case "general-translation":
            // Write on one file.
            console.log(chalk`Pulled General Translation (_locales): {cyan ${saLocale}}`);
            const path = `${SA_ROOT}/_locales/${locale}/`;
            for (const key of Object.keys(translationJSON)) {
                if (translationJSON[key].message === "") {
                    delete translationJSON[key];
                }
            }
            const prettier = JSON.stringify(translationJSON, null, 2);
            if (prettier === "{}") return;
            await mkdirp(path);
            await fs.writeFile(`${path}messages.json`, prettier, "utf8");
            break;
        case "addons-translation":
            // Addons translation is weird. We need to separate the addons by keys.
            console.log(chalk`Pulled Addons Translation (addons-l10n): {cyan ${saLocale}}`);
            const translations = splitTranslation(translationJSON);
            await eachLimit(Object.keys(translations), WRITE_CONCURRENCY, async addonId => {
                const path = `${SA_ROOT}/addons-l10n/${saLocale}/`;
                const prettier = JSON.stringify(translations[addonId], null, 2);
                if (prettier === "{}") return;
                await mkdirp(path);
                await fs.writeFile(`${path}${addonId}.json`, prettier, "utf8");
            });
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