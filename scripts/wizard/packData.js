/**
 * Load chart / choice documents from this module's Item packs.
 */

import { expandWizardChoice, resolveCategoryItems } from "../categoryResolver.js";

const MODULE_ID = "scrpg-actor-compendium";

/**
 * @param {string} packName
 * @returns {Promise<Item[]>}
 */
export async function loadPackDocuments(packName) {
    const pack = game.packs.get(`${MODULE_ID}.${packName}`);
    if (!pack) {
        console.warn(`${MODULE_ID} | Missing pack ${packName}`);
        return [];
    }
    return pack.getDocuments();
}

/**
 * Background / power-source / archetype chart rows sorted by number.
 * @param {"backgrounds"|"powerSources"|"archetypes"|"personalities"} packName
 */
export async function loadChartRows(packName) {
    const docs = await loadPackDocuments(packName);
    return docs
        .map(doc => {
            const flags = doc.flags?.[MODULE_ID] || {};
            return {
                id: doc.id,
                uuid: doc.uuid,
                name: doc.name,
                number: Number(flags.number) || 0,
                flags,
                wizard: flags.wizard || {},
                doc
            };
        })
        .filter(row => row.number >= 1)
        .sort((a, b) => a.number - b.number);
}

/**
 * Expand item + category choices into a flat, de-duplicated picker list.
 * @param {Array<object>} choices
 * @returns {Promise<Array<{uuid:string,name:string,categoryKey?:string,required?:boolean}>>}
 */
export async function expandChoiceList(choices = []) {
    const seen = new Set();
    const out = [];
    for (const choice of choices) {
        const docs = await expandWizardChoice(choice);
        for (const doc of docs) {
            const uuid = doc.uuid;
            if (!uuid || seen.has(uuid)) continue;
            seen.add(uuid);
            const flags = doc.flags?.[MODULE_ID] || {};
            const pack = choice.pack || (doc.pack?.includes(".powers") ? "powers" : doc.pack?.includes(".qualities") ? "qualities" : null);
            const itemType = pack === "powers" || doc.type === "power"
                ? "power"
                : (pack === "qualities" || doc.type === "quality" ? "quality" : (doc.type || null));
            out.push({
                uuid,
                name: doc.name,
                categoryKey: flags.category || choice.categoryKey || null,
                required: Boolean(choice.required),
                itemType,
                pack: pack || null
            });
        }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Principles in a category folder key (e.g. "responsibility").
 * @param {string} categoryKey
 */
export async function loadPrinciplesForCategory(categoryKey) {
    if (!categoryKey) return [];
    const docs = await resolveCategoryItems("principles", categoryKey);
    return docs
        .map(doc => {
            const flags = doc.flags?.[MODULE_ID] || {};
            return {
                uuid: doc.uuid,
                name: doc.name,
                categoryKey: flags.category || categoryKey,
                greenAbilityUuid: flags.greenAbilityUuid || flags.greenAbility?.uuid || null
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Format a silent-roll payload for templates.
 * @param {object|null} rollResult
 */
export function formatRollSummary(rollResult) {
    if (!rollResult) return null;
    const diceBits = (rollResult.dice ?? [])
        .map(d => `d${d.faces}: [${(d.results ?? []).join(", ")}]`)
        .join(" · ");
    return {
        formula: rollResult.formula,
        total: rollResult.total,
        detail: diceBits || null
    };
}
