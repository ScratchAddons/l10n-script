import fs from "fs/promises";
import chalk from "chalk-template";
import {eachLimit} from "async";
import TransifexClient from "./txapi.js";
import generateSource, {fixFormat} from "./generate-src.js";

if (!process.env.TX_TOKEN) {
    console.error(chalk`{red ERROR}: TX_TOKEN is not set.`);
    process.exit(1);
}

const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";

// Number of API requests it can make at the same time
const API_CONCURRENCY = 30;

// Require 90%> translation rate
const GENERAL_THRESHOLD = 0.9;
const ADDONS_THRESHOLD = 0.8;

const PROJECT_SLUG = "o:scratch-addons:p:scratch-addons-extension";

const tx = new TransifexClient(process.env.TX_TOKEN);

const languages = await tx.listLanguages(PROJECT_SLUG);

let source = {};
try {
    // push.js should create the file
    const sourceFile = await fs.readFile("addons-source.json", "utf8");
    source = JSON.parse(sourceFile);
} catch (e) {
    if (e.code !== "ENOENT") throw e;
    source = await generateSource();
}

const getTranslation = key => source[key]?.string || source[key];

const splitTranslation = translation => {
    const result = {};
    let c = 0;
    Object.keys(translation).forEach(key => {
        const addonId = key.includes("/") ? key.split("/")[0] : "_general";
        if (!result[addonId]) result[addonId] = {};
        if (translation[key] === getTranslation(key)) return;
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
    const saLocale = locale.replace("_", "-").replace("l:", "").toLowerCase();
    console.log(chalk`Downloading {cyan ${saLocale}} for {cyan ${resource}}`);
    const translation = await tx.downloadTranslation(
        resource,
        locale,
        {mode: resource === "o:scratch-addons:p:scratch-addons-extension:r:general-translation" ? "onlytranslated" : "default"}
    );
    const translationJSON = JSON.parse(translation.toString("utf8"));
    let path = "";
    let n, all;
    switch (resource) {
        case "o:scratch-addons:p:scratch-addons-extension:r:general-translation":
            // Write on one file.
            console.log(chalk`Pulled General Translation (_locales): {cyan ${saLocale}}`);
            path = `${SA_ROOT}/_locales/${locale.replace("l:", "")}.json`;
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
                await fs.access(path);
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
            await fs.writeFile(path, restringified, "utf8");
            localesWithGeneral.push(saLocale);
            break;
        case "o:scratch-addons:p:scratch-addons-extension:r:addons-translation-new":
            // Addons translation is weird. We need to separate the addons by keys.
            console.log(chalk`Pulled Addons Translation (addons-l10n): {cyan ${saLocale}}`);
            path = `${SA_ROOT}/addons-l10n/${saLocale}.json`;
            fixFormat("keyvaluejson", translationJSON);
            const [translations, available] = splitTranslation(translationJSON);
            n = available;
            all = Object.keys(source).length;
            // Note: n is the number of AVAILABLE translations here
            if ((n / all) < ADDONS_THRESHOLD) {
              try {
                await fs.access(path);
              } catch (e) {
                const pct = Math.round(n / all * 100);
                console.log(chalk`{yellow WARN}: Threshold not reached for addons (${pct}% translated): ${saLocale}`);
                break;
              }
            }
            const resolver = new Intl.DisplayNames([saLocale], {type: "language"});
            const addonTranslations = Object.assign({
                _locale: saLocale,
                _locale_name: resolver.of(saLocale)
            }, translations);

            await fs.writeFile(path, addonTranslations.stringify(), "utf8");
            localesWithAddons.push(saLocale);
            break;
    }
};

const mapResources = resources => resources.map(
    resource => resource.id === "o:scratch-addons:p:scratch-addons-extension:r:addons-translation" ? [] : languages.map(
        language => ({resource: resource.id, locale: language.id})
    )
).flat();

const resources = await tx.listResources(PROJECT_SLUG);
const mappedResources = mapResources(resources);
await eachLimit(mappedResources, API_CONCURRENCY, writeLocale);

// _locales: Merge pt-br to pt
// For addons-l10n this is handled on extension side
// Use IIFE for easy returning
await (async () => {
  let ptBRJSON;
  try {
    ptBRJSON = JSON.parse(await fs.readFile(`${SA_ROOT}/_locales/pt_BR.json`, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  console.log(chalk`{green NOTE}: Portuguese translation copied from Portuguese (Brazil)`);
  await fs.copyFile(
    `${SA_ROOT}/_locales/pt_BR.json`,
    `${SA_ROOT}/_locales/pt_PT.json`
  );
})();

await Promise.all(localesWithAddons.map(l => {
  if (localesWithGeneral.includes(l)) return;
  console.log(chalk`{yellow WARN}: Removed ${l} from addons-l10n as _locale is missing!`)
  return fs.rm(`${SA_ROOT}/${l}.json`, {
    force: true,
    recursive: true
  });
}));
