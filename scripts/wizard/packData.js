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

/**
 * Category-based Red abilities (excludes complex archetype-only reds).
 * @returns {Promise<Array<object>>}
 */
export async function loadRedAbilities() {
    const docs = await loadPackDocuments("abilities");
    return docs
        .filter(doc => {
            if (doc.type !== "ability") return false;
            const flags = doc.flags?.[MODULE_ID] || {};
            if (flags.color !== "red" && doc.system?.aux !== "red") return false;
            const source = flags.source;
            if (!source?.category) return false;
            if (source.itemType !== "power" && source.itemType !== "quality") return false;
            return true;
        })
        .map(doc => {
            const flags = doc.flags?.[MODULE_ID] || {};
            return {
                uuid: doc.uuid,
                name: doc.name,
                abilityType: doc.system?.type || "A",
                categoryKey: flags.category || null,
                categoryLabel: labelFromCategoryKey(flags.category),
                source: flags.source || null,
                slots: Array.isArray(flags.slots) ? flags.slots : [],
                preview: flags.gameTextTemplate || stripHtml(doc.system?.gameText) || null,
                doc
            };
        })
        .sort((a, b) => {
            const cat = String(a.categoryLabel || "").localeCompare(String(b.categoryLabel || ""));
            if (cat) return cat;
            return a.name.localeCompare(b.name);
        });
}

/**
 * All principles across categories (Retcon swap).
 */
export async function loadAllPrinciples() {
    const docs = await loadPackDocuments("principles");
    return docs
        .filter(doc => doc.type === "principles")
        .map(doc => {
            const flags = doc.flags?.[MODULE_ID] || {};
            return {
                uuid: doc.uuid,
                name: doc.name,
                categoryKey: flags.category || null,
                greenAbilityUuid: flags.greenAbilityUuid || flags.greenAbility?.uuid || null
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Flat power + quality picker list (Retcon add-d6).
 */
export async function loadAllPowersAndQualities() {
    const [powers, qualities] = await Promise.all([
        loadPackDocuments("powers"),
        loadPackDocuments("qualities")
    ]);
    const out = [];
    for (const doc of powers) {
        if (doc.type !== "power") continue;
        const flags = doc.flags?.[MODULE_ID] || {};
        out.push({
            uuid: doc.uuid,
            name: doc.name,
            itemType: "power",
            categoryKey: flags.category || null
        });
    }
    for (const doc of qualities) {
        if (doc.type !== "quality") continue;
        const flags = doc.flags?.[MODULE_ID] || {};
        out.push({
            uuid: doc.uuid,
            name: doc.name,
            itemType: "quality",
            categoryKey: flags.category || null
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve category flags for a list of trait UUIDs.
 * @param {string[]} uuids
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveTraitCategories(uuids = []) {
    const map = new Map();
    await Promise.all(uuids.map(async uuid => {
        if (!uuid || uuid === "__special__" || map.has(uuid)) return;
        const doc = await fromUuid(uuid);
        const flags = doc?.flags?.[MODULE_ID] || {};
        if (flags.category) map.set(uuid, flags.category);
    }));
    return map;
}

function labelFromCategoryKey(key) {
    const labels = {
        "athletic-powers": "Athletic Powers",
        "elemental-energy-powers": "Elemental/Energy Powers",
        "hallmark-powers": "Hallmark Powers",
        "intellectual-powers": "Intellectual Powers",
        "materials-powers": "Materials Powers",
        "mobility-powers": "Mobility Powers",
        "psychic-powers": "Psychic Powers",
        "self-control-powers": "Self Control Powers",
        "technological-powers": "Technological Powers",
        "information-qualities": "Information Qualities",
        "mental-qualities": "Mental Qualities",
        "physical-qualities": "Physical Qualities",
        "social-qualities": "Social Qualities"
    };
    return labels[key] || String(key || "Red").replace(/-/g, " ");
}

function stripHtml(html) {
    return String(html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
