/**
 * Substitute ability [power]/[quality] tokens with bold trait names.
 * Used by the wizard preview and by stored ability gameText on the sheet.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/**
 * Fill bracket tokens in a plain-text ability template.
 * Filled trait names are wrapped in <strong>; everything else is HTML-escaped.
 *
 * @param {string|null|undefined} template
 * @param {Record<string, string|null|undefined>|Map<string, string>|null|undefined} tokenToName
 * @returns {string} HTML fragment (no wrapping <p>)
 */
export function fillAbilityTemplateHtml(template, tokenToName) {
    const raw = String(template ?? "");
    if (!raw) return "";

    let html = escapeHtml(raw);
    const entries = tokenToName instanceof Map
        ? tokenToName.entries()
        : Object.entries(tokenToName || {});

    for (const [token, name] of entries) {
        if (!token || !name) continue;
        const safeToken = escapeHtml(token);
        const safeName = escapeHtml(name);
        html = html.replaceAll(safeToken, `<strong>${safeName}</strong>`);
    }
    return html;
}

/**
 * @param {string|null|undefined} template
 * @param {Record<string, string|null|undefined>|Map<string, string>|null|undefined} tokenToName
 * @returns {string} `<p>…</p>` HTML for system.gameText / system.out
 */
export function fillAbilityGameTextHtml(template, tokenToName) {
    const inner = fillAbilityTemplateHtml(template, tokenToName);
    return inner ? `<p>${inner}</p>` : "";
}

/**
 * Resolve wizard slot selections (token → trait uuid) into a filled preview.
 *
 * @param {string|null|undefined} template
 * @param {Record<string, string>|null|undefined} slotSelections
 * @param {Map<string, string>|Record<string, string>|Array<{uuid:string,name:string}>} traitNames
 * @returns {string|null}
 */
export function filledAbilityPreviewHtml(template, slotSelections, traitNames) {
    if (!template) return null;
    const nameByUuid = toNameMap(traitNames);
    /** @type {Record<string, string>} */
    const tokenToName = {};
    for (const [token, uuid] of Object.entries(slotSelections || {})) {
        if (!uuid) continue;
        const name = nameByUuid.get(uuid);
        if (name) tokenToName[token] = name;
    }
    return fillAbilityTemplateHtml(template, tokenToName) || escapeHtml(template);
}

/**
 * @param {Map<string, string>|Record<string, string>|Array<{uuid:string,name:string}>|null|undefined} traitNames
 * @returns {Map<string, string>}
 */
function toNameMap(traitNames) {
    if (traitNames instanceof Map) return traitNames;
    const map = new Map();
    if (Array.isArray(traitNames)) {
        for (const row of traitNames) {
            if (row?.uuid && row?.name) map.set(row.uuid, row.name);
        }
        return map;
    }
    for (const [uuid, name] of Object.entries(traitNames || {})) {
        if (name) map.set(uuid, name);
    }
    return map;
}
