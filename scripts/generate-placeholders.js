export const getPlaceholders = messages => {
    const placeholders = new Set();
    for (const value of Object.values(messages)) {
        if (!value) continue;
        for (const matches of value.matchAll(/({[\w-]+})/g)) {
            if (matches[1]) placeholders.add(matches[1]);
        }
    }
    return placeholders;
};

export const makeJS = placeholders => {
    return `await fetch("https://www.transifex.com/_/userspace/ajax/custom_variable_markers/scratch-addons/", {
    "credentials": "include",
    "headers": {
        "Accept": "*/*",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        "Content-Type": "application/json",
        "X-CSRFToken": /csrftoken=([\\w]+)/.exec(document.cookie)[1],
        "X-Requested-With": "XMLHttpRequest"
    },
    "body": JSON.stringify({i18n_type:"KEYVALUEJSON",variables:${
        JSON.stringify(Array.from(placeholders).map(p => ({string: p})))
    }}),
    "method": "POST",
    "mode": "cors"
});`;
};