/**
 * Resolve wizard category choice lines / keys to pack items that carry a matching
 * `flags.scrpg-actor-compendium.category` value.
 *
 * Choice metadata uses:
 *   { kind: "category", pack: "qualities"|"powers", categoryKey, categoryLabel }
 *
 * Packed power/quality items store the same key under flags.scrpg-actor-compendium.category.
 */

const MODULE_ID = "scrpg-actor-compendium";

/**
 * @param {"powers"|"qualities"|"principles"} packName
 * @param {string} categoryKey e.g. "mental", "elemental-energy"
 * @param {object} [options]
 * @param {Collection|Map|Iterable} [options.documents] optional preloaded pack index docs
 * @returns {Promise<object[]>} Item documents (or index entries) in that category
 */
export async function resolveCategoryItems(packName, categoryKey, options = {}) {
    if (!categoryKey) return [];
    const pack = game.packs.get(`${MODULE_ID}.${packName}`);
    if (!pack) {
        console.warn(`${MODULE_ID} | Missing pack ${packName}`);
        return [];
    }

    const documents = options.documents
        ? [...options.documents]
        : await pack.getDocuments();

    return documents.filter(doc => {
        const flags = doc.flags?.[MODULE_ID] || doc.flags?.["scrpg-actor-compendium"];
        return flags?.category === categoryKey;
    });
}

/**
 * Expand a wizard choice option into concrete item candidates.
 * @param {{kind:string, pack?:string, categoryKey?:string, uuid?:string, name?:string}} choice
 * @returns {Promise<object[]>}
 */
export async function expandWizardChoice(choice) {
    if (!choice) return [];
    if (choice.kind === "item") {
        if (!choice.uuid) return [];
        const doc = await fromUuid(choice.uuid);
        return doc ? [doc] : [];
    }
    if (choice.kind === "category") {
        return resolveCategoryItems(choice.pack, choice.categoryKey);
    }
    return [];
}

/**
 * Map a human phrase like "Select from Mental qualities category" to a structured choice.
 * Prefer using precomputed wizard.qualityChoices / powerChoices on chart items instead.
 */
export function parseCategoryPhrase(phrase) {
    const match = String(phrase || "").match(/^Select from (.+?) (qualities|powers) category$/i);
    if (!match) return null;
    const label = match[1].trim();
    const pack = match[2].toLowerCase() === "powers" ? "powers" : "qualities";
    const qualityMap = {
        Information: "information",
        Mental: "mental",
        Physical: "physical",
        Social: "social"
    };
    const powerMap = {
        Athletic: "athletic",
        "Elemental/Energy": "elemental-energy",
        Hallmark: "hallmark",
        Intellectual: "intellectual",
        Materials: "materials",
        Mobility: "mobility",
        Psychic: "psychic",
        "Self Control": "self-control",
        Technological: "technological"
    };
    const categoryKey = (pack === "powers" ? powerMap : qualityMap)[label];
    if (!categoryKey) return null;
    return { kind: "category", pack, categoryKey, categoryLabel: label };
}
