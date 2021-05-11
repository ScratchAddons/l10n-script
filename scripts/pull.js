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

// Require 90%> translation rate
const GENERAL_THRESHOLD = 0.9;
const ADDONS_THRESHOLD = 0.8;

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
    let c = 0;
    Object.keys(translation).forEach(key => {
        const addonId = key.includes("/") ? key.split("/")[0] : "_general";
        if (!result[addonId]) result[addonId] = {};
        if (translation[key] === source[key]) return;
        if (translation[key] === "") return;
        result[addonId][key] = translation[key];
        c++;
    });
    return [result, c];
};

const localesWithGeneral = [];
const localesWithAddons = [];

const writeLocale = async item => {
    const {locale, resource} = item;
    const saLocale = locale.replace("_", "-").toLowerCase();
    const translation = await promisify(tx.translationInstanceMethod.bind(tx))(
        "scratch-addons-extension",
        resource,
        locale,
        {mode: resource === "general-translation" ? "onlytranslated" : "default"}
    );
    const translationJSON = JSON.parse(translation);
    let path = "";
    let n, all;
    switch (resource) {
        case "general-translation":
            // Write on one file.
            console.log(chalk`Pulled General Translation (_locales): {cyan ${saLocale}}`);
            path = `${SA_ROOT}/_locales/${locale}/`;
            // Note: n is the number of **UN**AVAILABLE translations here
            n = 0;
            all = Object.keys(translationJSON).length;
            for (const key of Object.keys(translationJSON)) {
                if (translationJSON[key].message === "") {
                  delete translationJSON[key];
                  n++;
                }
            }
            if ((n / all) > (1 - GENERAL_THRESHOLD)) {
              try {
                await fs.access(`${path}messages.json`);
              } catch (e) {
                if (e.code === "ENOENT") {
                  const pct = 100 - Math.round(n / all * 100);
                  console.log(chalk`{yellow WARN}: Threshold not reached for general (${pct}% translated): ${saLocale}`);
                  break;
                }
                throw e;
              }
            }
            if (Object.keys(translationJSON).length && !translationJSON.extensionName) {
                translationJSON.extensionName = {
                    message: "Scratch Addons"
                };
            }
            const restringified = JSON.stringify(translationJSON);
            if (restringified === "{}") return;
            await mkdirp(path);
            await fs.writeFile(`${path}messages.json`, restringified, "utf8");
            localesWithGeneral.push(saLocale);
            break;
        case "addons-translation":
            // Addons translation is weird. We need to separate the addons by keys.
            console.log(chalk`Pulled Addons Translation (addons-l10n): {cyan ${saLocale}}`);
            path = `${SA_ROOT}/addons-l10n/${saLocale}/`;
            const [translations, available] = splitTranslation(translationJSON);
            n = available;
            all = Object.keys(source).length;
            // Note: n is the number of AVAILABLE translations here
            if ((n / all) < ADDONS_THRESHOLD) {
              try {
                await fs.access(`${path}_general.json`);
              } catch (e) {
                const pct = Math.round(n / all * 100);
                console.log(chalk`{yellow WARN}: Threshold not reached for addons (${pct}% translated): ${saLocale}`);
                break;
              }
            }
            const resolver = new Intl.DisplayNames([saLocale], {type: "language"});
            const generalTranslation = Object.assign({
                _locale: saLocale,
                _locale_name: resolver.of(saLocale)
            }, translations._general);
            let generated = false;
            let hasGeneral = false;
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
                localesWithAddons.push(saLocale);
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

// _locales: Merge pt-br to pt
// For addons-l10n this is handled on extension side
// Use IIFE for easy returning
await (async () => {
  let ptBRJSON;
  try {
    ptBRJSON = JSON.parse(await fs.readFile(`${SA_ROOT}/_locales/pt_BR/messages.json`, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }  
  console.log(chalk`{green NOTE}: Portuguese translation copied from Portuguese (Brazil)`);
  await mkdirp(`${SA_ROOT}/_locales/pt_PT/`);
  await fs.copyFile(
    `${SA_ROOT}/_locales/pt_BR/messages.json`,
    `${SA_ROOT}/_locales/pt_PT/messages.json`
  );
})();

await Promise.all(localesWithAddons.map(l => {
  if (localesWithGeneral.includes(l)) return;
  console.log(chalk`{yellow WARN}: Removed ${l} from addons-l10n as _locale is missing!`)
  return fs.rm(`${SA_ROOT}/addons-l10n/${l}`, {
    force: true,
    recursive: true
  });
}));