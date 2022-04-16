import fs from "fs/promises";

const iconify = settingName => settingName.replace(
    /@([\w-]+)\.svg/g,
    (_, iconName) => `{${iconName === "studio-add" ? "studioAdd" : iconName}Icon}`
);

const hasNoValue = value => !value || (typeof value === "object" && "string" in value && !value.string);

export const fixFormat = (format, addonMessages, { ignoreEmpty = false } = {}) => {
    switch (format) {
        case "keyvaluejson": {
            for (const [key, value] of Object.entries(addonMessages)) {
                if (hasNoValue(value) && ignoreEmpty) {
                    delete addonMessages[key];
                    continue;
                }
                addonMessages[key] = value.string || value;
            }
            break;
        }
        default: {
            for (const [key, value] of Object.entries(addonMessages)) {
                if (hasNoValue(value) && ignoreEmpty) {
                    delete addonMessages[key];
                } else if (typeof value.string === "undefined") addonMessages[key] = {
                    string: value
                };
            }
        }
    }
};

/*
 * Generate Key-Value JSON source file from addons-l10n folder JSON.
*/

export default async () => {
    const SA_ROOT = process.env.SA_ROOT || process.env.GITHUB_WORKSPACE || "./clone";
    const SOURCE_MODE = process.env.SOURCE_MODE;

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
            addonMessages[`${addonId}/@name`] = {
                string: addonManifest.name,
                developer_comment: "Name of an addon"
            };
            addonMessages[`${addonId}/@description`] = {
                string: addonManifest.description,
                developer_comment: `Description of addon "${addonManifest.name}"`
            };

            // info (including warnings and notices)
            for (const optionalInfo of (addonManifest.info || [])) {
                addonMessages[`${addonId}/@info-${optionalInfo.id}`] = {
                    string: optionalInfo.text,
                    developer_comment: `Information displayed on settings for addon "${addonManifest.name}"`
                };
            }

            // update
            if (addonManifest.latestUpdate?.temporaryNotice) {
              addonMessages[`${addonId}/@update`] = {
                  string: addonManifest.latestUpdate.temporaryNotice,
                  developer_comment: `Update information for addon "${addonManifest.name}"`
                };
            }

            // popup
            if (addonManifest.popup) {
                addonMessages[`${addonId}/@popup-name`] = {
                    string: addonManifest.popup.name,
                    developer_comment: `Name displayed on the popup for addon "${addonManifest.name}"`
                }
            }

            // Presets
            for (const preset of (addonManifest.presets || [])) {
                if (preset.name) {
                    addonMessages[`${addonId}/@preset-name-${preset.id}`] = {
                        string: preset.name,
                        developer_comment: `Preset name for addon "${addonManifest.name}"`
                    };
                }
                if (preset.description) {
                    addonMessages[`${addonId}/@preset-description-${preset.id}`] = {
                        string: preset.description,
                        developer_comment: `Preset description for addon "${addonManifest.name}"'s preset "${preset.name}"`
                    };
                }
            }

            // Credits
            for (const credit of (addonManifest.credits || [])) {
                if (credit.note) {
                    addonMessages[`${addonId}/@credits-${credit.id}`] = {
                        string: credit.note,
                        developer_comment: `Credits note displayed on settings for addon "${addonManifest.name}"`
                    };
                }
            }


            const generateSettings = (setting, tableId) => {
                const settingId = tableId ? `${tableId}-${setting.id}` : setting.id;
                addonMessages[`${addonId}/@settings-name-${settingId}`] = {
                    string: iconify(setting.name),
                    developer_comment: `Setting name for addon "${addonManifest.name}"`
                };

                switch (setting.type) {
                    case "string":
                        if (!setting.default) break;
                        addonMessages[`${addonId}/@settings-default-${setting.id}`] = {
                            string: setting.default,
                            developer_comment: `Default value for addon "${addonManifest.name}"'s setting "${setting.name}"`
                        };
                        break;
                    case "select":
                        setting.potentialValues.forEach(potential => {
                            if (!potential || !potential.id) return;
                            addonMessages[
                                `${addonId}/@settings-select-${setting.id}-${potential.id}`
                            ] = {
                                string: potential.name,
                                developer_comment: `Dropdown option value for addon "${addonManifest.name}"'s setting "${setting.name}"`
                            };
                        });
                        break;
                }
            };

            // Settings
            for (const setting of (addonManifest.settings || [])) {
                generateSettings(setting);
                if (setting.type === "table") {
                    const localizedRows = {};
                    setting.row.forEach(row => {
                        generateSettings(row, setting.id);
                        if (row.type === "string") localizedRows[row.id] = row.name;
                    });
                    for (let i = 0; i < (setting.default || []).length; i++) {
                        const defaultValues = setting.default[i];
                        for (const [localizedRow, rowName] of Object.entries(localizedRows)) {
                            if (!defaultValues[localizedRow]) continue;
                            addonMessages[`${addonId}/@settings-default-${setting.id}-${i}-${localizedRow}`] = {
                                string: defaultValues[localizedRow],
                                developer_comment: `Default value for addon "${addonManifest.name}"'s setting "${setting.name}"'s table row "${rowName}"`
                            };
                        }
                    }
                    for (let i = 0; i < (setting.presets || []).length; i++) {
                        const preset = setting.presets[i];
                        addonMessages[`${addonId}/@preset-${setting.id}-${i}`] = {
                            string: preset.name,
                            developer_comment: `Preset name for addon "${addonManifest.name}"'s setting "${setting.name}"`
                        };
                        for (const [localizedRow, rowName] of Object.entries(localizedRows)) {
                            addonMessages[`${addonId}/@preset-value-${setting.id}-${i}-${localizedRow}`] = {
                                string: preset.values[localizedRow],
                                developer_comment: `Preset value for addon "${addonManifest.name}"'s setting "${setting.name}"'s table row "${rowName}"`
                            };
                        }
                    }
                }
            }
        }

        fixFormat(SOURCE_MODE, addonMessages);

        messages = Object.assign(addonMessages, messages);
    }
    return messages;
};
