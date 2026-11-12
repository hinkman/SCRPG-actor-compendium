/** Step 5 — Red Abilities: pick 2 from eligible category lists. */

import { collectAssignedTraits } from "./personality.js";
import { dieRank, upgradeDie } from "../draftState.js";

export const RED_ABILITIES_STEP = {
    id: "redAbilities",
    label: "Red Abilities",
    index: 9
};

export const RED_PICK_COUNT = 2;

/**
 * Traits with effective die sizes (applies Impulsive upgrade + Special quality).
 * @param {object} draft
 * @param {Map<string, string>|Record<string, string>} [categoryByUuid]
 */
export function collectEffectiveTraits(draft, categoryByUuid = null) {
    const traits = collectAssignedTraits(draft).map(t => ({ ...t }));
    const upgradeUuid = draft?.personality?.upgradeTraitUuid;
    if (upgradeUuid) {
        const hit = traits.find(t => t.uuid === upgradeUuid);
        if (hit) hit.die = upgradeDie(hit.die);
    }

    const specialName = String(draft?.personality?.specialQualityName || "").trim();
    if (specialName) {
        traits.push({
            uuid: "__special__",
            name: specialName,
            die: draft?.personality?.specialQualityDie || "d8",
            itemType: "quality",
            source: "personality",
            categoryKey: null
        });
    }

    const lookup = categoryByUuid instanceof Map
        ? categoryByUuid
        : new Map(Object.entries(categoryByUuid || {}));

    for (const t of traits) {
        if (t.uuid === "__special__") continue;
        t.categoryKey = lookup.get(t.uuid) || t.categoryKey || null;
    }
    return traits;
}

/**
 * Whether the hero qualifies for a Red ability category list.
 * Inherent abilities need d8+ in the source category.
 * @param {object} ability  pack ability summary
 * @param {Array<object>} traits
 */
export function isRedAbilityEligible(ability, traits) {
    const source = ability?.source;
    if (!source?.category || !source?.itemType) return false;
    if (source.itemType !== "power" && source.itemType !== "quality") return false;

    const inCategory = traits.filter(t =>
        t.itemType === source.itemType && t.categoryKey === source.category
    );
    if (!inCategory.length) return false;

    if (ability.abilityType === "I") {
        return inCategory.some(t => dieRank(t.die) >= dieRank("d8"));
    }
    return true;
}

/**
 * @param {object} draft
 * @param {Array<object>} [selectedAbilities] ability docs/summaries for slot validation
 */
export function isRedAbilitiesComplete(draft, selectedAbilities = []) {
    const picks = draft?.red?.abilityUuids || [];
    if (picks.length !== RED_PICK_COUNT) return false;

    for (const ability of selectedAbilities) {
        const slots = ability?.slots || [];
        for (const slot of slots) {
            if (!draft.red?.slotSelections?.[ability.uuid]?.[slot.token]) return false;
        }
    }
    return true;
}

/**
 * Slot options for a red ability given current traits.
 * @param {object} ability
 * @param {Array<object>} traits
 */
export function slotOptionsForAbility(ability, traits) {
    const slots = ability?.slots || [];
    return slots.map(slot => {
        const wantedType = slot.itemType || null;
        const wantedCategory = slot.category || null;
        const wantedCategories = Array.isArray(slot.categories) ? slot.categories : null;
        const options = traits.filter(t => {
            if (wantedType && t.itemType !== wantedType && t.uuid !== "__special__") return false;
            if (wantedCategory && t.categoryKey && t.categoryKey !== wantedCategory) return false;
            if (wantedCategories?.length && t.categoryKey && !wantedCategories.includes(t.categoryKey)) {
                return false;
            }
            return true;
        });
        return { token: slot.token, options };
    });
}
