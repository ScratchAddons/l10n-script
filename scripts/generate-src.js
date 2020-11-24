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
            
            if (addonManifest.l10n) {
                // Addon name, description, notice, warning
                addonMessages[`${addonId}/@name`] = addonManifest.name;
                addonMessages[`${addonId}/@description`] = addonManifest.description;
                for (const optionalProp of ["notice", "warning"]) {
                    if (addonManifest[optionalProp]) {
                        addonMessages[`${addonId}/@${optionalProp}`] = addonManifest[optionalProp];
                    }
                }
                
                // Presets
                for (const preset of (addonManifest.presets || [])) {
                    for (const prop of ["name", "description"]) {
                        if (preset[prop]) {
                            addonMessages[`${addonId}/@preset-${prop}-${preset.id}`] = preset[prop];
                        }
                    }
                }
                
                // Settings
                for (const setting of (addonManifest.settings || [])) {
                    addonMessages[`${addonId}/@settings-name-${setting.id}`] = iconify(setting.name);
                    
                    switch (setting.type) {
                        case "string":
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
                }
            }
        }
        
        messages = Object.assign(addonMessages, messages);
    }
    return messages;
};