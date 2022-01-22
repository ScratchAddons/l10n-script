import fs from "fs/promises";

const iconify = settingName => settingName.replace(
    /@([\w-]+)\.svg/g,
    (_, iconName) => `{${iconName === "studio-add" ? "studioAdd" : iconName}Icon}`
);

/*
 * Generate Key-Value JSON source file from addons-l10n folder JSON.
*/

export default async () => {
    const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";

    let messages = {};

    const addonIdsFile = await fs.readFile(`${SA_ROOT}/addons/addons.json`, "utf8");
    const addonIds = ["_general"].concat(JSON.parse(addonIdsFile));

    for (const addonId of addonIds) {
        // Ignore comments
        if (!addonId || addonId.startsWith("//")) continue;
        let addonMessages = {};
        try {
            const addonMessagesFile = await fs.readFile(`${SA_ROOT}/addons-l10n/en/${addonId}.json`, "utf8");
            addonMessages = JSON.parse(addonMessagesFile);
        } catch (e) {
            // Only catch ENOENT
            if (e.code !== "ENOENT") throw e;
        }

        // Delete fields that are not pushed to Transifex
        delete addonMessages._locale;
        delete addonMessages._locale_name;

        if (addonId !== "_general") {
            const addonManifestFile = await fs.readFile(`${SA_ROOT}/addons/${addonId}/addon.json`, "utf8");
            const addonManifest = JSON.parse(addonManifestFile);

            // Addon name, description
            addonMessages[`${addonId}/@name`] = addonManifest.name;
            addonMessages[`${addonId}/@description`] = addonManifest.description;

            // info (including warnings and notices)
            for (const optionalInfo of (addonManifest.info || [])) {
                addonMessages[`${addonId}/@info-${optionalInfo.id}`] = optionalInfo.text;
            }

            // update
            if (addonManifest.latestUpdate?.temporaryNotice) {
              addonMessages[`${addonId}/@update`] = addonManifest.latestUpdate.temporaryNotice;
            }

            // popup
            if (addonManifest.popup) {
                addonMessages[`${addonId}/@popup-name`] = addonManifest.popup.name;
            }

            // Presets
            for (const preset of (addonManifest.presets || [])) {
                for (const prop of ["name", "description"]) {
                    if (preset[prop]) {
                        addonMessages[`${addonId}/@preset-${prop}-${preset.id}`] = preset[prop];
                    }
                }
            }

            // Credits
            for (const credit of (addonManifest.credits || [])) {
                if (credit.note) {
                    addonMessages[`${addonId}/@credits-${credit.id}`] = credit.note;
                }
            }


            const generateSettings = (setting, tableId) => {
                const settingId = tableId ? `${tableId}-${setting.id}` : setting.id;
                addonMessages[`${addonId}/@settings-name-${settingId}`] = iconify(setting.name);

                switch (setting.type) {
                    case "string":
                        if (!setting.default) break;
                        addonMessages[`${addonId}/@settings-default-${setting.id}`] = setting.default;
                        break;
                    case "select":
                        setting.potentialValues.forEach(potential => {
                            if (!potential || !potential.id) return;
                            addonMessages[
                                `${addonId}/@settings-select-${setting.id}-${potential.id}`
                            ] = potential.name;
                        });
                        break;
                }
            };
            
            const localizedSettings = [];
            
            // Settings
            for (const setting of (addonManifest.settings || [])) {
                generateSettings(setting);
                if (setting.type === "string") localizedSettings.push(setting.id);
                else if (setting.type === "table") {
                    const localizedRows = [];
                    setting.row.forEach(row => {
                        generateSettings(row, setting.id);
                        if (row.type === "string") localizedRows.push(row.id);
                    });
                    for (let i = 0; i < (setting.default || []).length; i++) {
                        const defaultValues = setting.default[i];
                        for (const localizedRow of localizedRows) {
                            if (!defaultValues[localizedRow]) continue;
                            addonMessages[`${addonId}/@settings-default-${setting.id}-${i}-${localizedRows}`] = defaultValues[localizedRow];
                        }
                    }
                    for (let i = 0; i < (setting.presets || []).length; i++) {
                        const preset = setting.presets[i];
                        addonMessages[`${addonId}/@preset-${setting.id}-${i}`] = preset.name;
                        for (const localizedRow of localizedRows) {
                            addonMessages[`${addonId}/@preset-value-${setting.id}-${i}-${localizedRows}`] = preset.values[localizedRow];
                        }
                    }
                }
            }
        }

        messages = Object.assign(addonMessages, messages);
    }
    return messages;
};
