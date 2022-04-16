/*
    Basic Transifex API
    This file is licensed under 3-clause BSD license:

    Copyright 2021 apple502j

    Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

    1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

    2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

    3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

import {setTimeout} from "node:timers/promises";
import fetch, {Blob, FormData} from "node-fetch";

export default class TransifexClient {
    /**
     * Constructs a client.
     * @param {string} token the Bearer token
     * @param {=object} opts the options
     * @param {=number} opts.maxRetries the maximum number of retries
     * @param {=number} opts.interval the interval between retries
     * @param {=string} opts.endpoint the base API endpoint
     */
    constructor (token, opts = {}) {
        this._token = token;
        this.endpoint = opts.endpoint || "https://rest.api.transifex.com";
        this.maxRetries = opts.maxRetries || 20;
        this.interval = opts.interval || 15000;
    }

    _getHeaders (headers = {}) {
        return Object.assign({}, headers, {
            Authorization: `Bearer ${this._token}`,
            "User-Agent": "TransifexClient/apple502j"
        });
    }

    async _asyncProcess (url, fetchOpts) {
        const resp = await fetch(this.endpoint + url, Object.assign({}, fetchOpts, {
            headers: this._getHeaders(fetchOpts.headers || {}),
            method: "POST"
        }));
        if (resp.status >= 400) {
            const errors = await resp.json().then(r => {
                return r.errors;
            });
            throw new Error(
                `Status code: ${resp.status}\nErrors: ${errors.map(e => `${e.title} (${e.detail})`).join("\n")}`
            );
        }
        const location = resp.headers.get("Content-Location") || resp.headers.get("Location");
        let i = 0;
        while (true) {
            i++;
            if (i > this.maxRetries) throw new Error("Max retry reached");
            const jobResp = await fetch(location, {
                headers: this._getHeaders(),
                redirect: "manual"
            });
            if (jobResp.status === 303) {
                const downloadResp = await fetch(jobResp.headers.get("Location"), {
                    headers: this._getHeaders(),
                });
                return downloadResp.text();
            }
            const json = await jobResp.json();
            // TX doc says "succeeded" isn't real value and it returns status 303
            // which is incorrect
            if (json?.data?.attributes?.status === "succeeded") {
                return json;
            }
            if (json?.data?.attributes?.status === "failed") {
                const errors = json.data.attributes.errors;
                throw new Error(
                    `Errors: ${errors.map(e => `${e.code} (${e.detail})`).join("\n")}`
                );
            }
            await setTimeout(this.interval);
        }
    }

    /**
     * Uploads a source file.
     * @param {string} slug the slug identifying the resource
     * @param {ArrayBuffer|Buffer|string} source the source
     * @returns {Promise<object>} the details
     */
    async uploadSource (slug, source) {
        const formData = new FormData();
        formData.append("resource", slug);
        formData.append("content", new Blob([source]));

        const json = await this._asyncProcess(
            "/resource_strings_async_uploads",
            {
                body: formData
            }
        );
        const details = json?.data?.attributes?.details || {};
        // Fix bugs in the deleted string detection
        if (details.strings_deleted) details.strings_updated -= details.strings_deleted;
        return details;
    }

    /**
     * Uploads a translation file.
     * @param {string} slug the slug identifying the resource
     * @param {string} lang the language code with prefix l:
     * @param {ArrayBuffer|Buffer|string} content the content
     * @returns {Promise<object>} the details
     */
    async uploadTranslation(slug, lang, content) {
        const formData = new FormData();
        formData.append("resource", slug);
        formData.append("content", new Blob([content]));
        formData.append("language", lang);

        const json = await this._asyncProcess(
            "/resource_translations_async_uploads",
            {
                body: formData
            }
        );
        const details = json?.data?.attributes?.details || {};
        // Fix bugs in the deleted string detection
        if (details.translations_deleted) details.translations_updated -= details.translations_deleted;
        return details;
    }

    /**
     * Downloads a translation file.
     * @param {string} slug the slug identifying the resource
     * @param {string} lang the language code with prefix l:
     * @param {=object} opts the options
     * @param {=string} mode the download mode
     * @returns {Promise<Buffer>} the buffer containing the result
     */
    async downloadTranslation (slug, lang, opts = {}) {
        const body = {
            data: {
                attributes: {
                    content_encoding: "base64",
                    mode: opts.mode || "default"
                },
                relationships: {
                    language: {
                        data: {
                            id: lang,
                            type: "languages"
                        }
                    },
                    resource: {
                        data: {
                            id: slug,
                            type: "resources"
                        }
                    }
                },
                type: "resource_translations_async_downloads"
            }
        };
        const resp = await this._asyncProcess(
            "/resource_translations_async_downloads",
            {
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/vnd.api+json"
                }
            }
        );
        return Buffer.from(resp, "base64");
    }

    /**
     * Lists project language IDs.
     * @param {string} slug the project slug.
     * @returns {Promise<object[]>} the languages.
     */
    listLanguages (slug) {
        return fetch(`${this.endpoint}/projects/${slug}/languages`, {
            headers: this._getHeaders()
        }).then(resp => resp.json()).then(
            d => d.data.map(item => Object.assign({ id: item.id }, item.attributes))
        );
    }

    /**
     * Lists resources.
     * @param {string} slug the project slug.
     * @returns {Promise<object[]>} the resources.
     */
    listResources (slug) {
        return fetch(`${this.endpoint}/resources?filter[project]=${slug}`, {
            headers: this._getHeaders()
        }).then(resp => resp.json()).then(
            d => d.data.map(item => Object.assign({ id: item.id }, item.attributes))
        );
    }
}
