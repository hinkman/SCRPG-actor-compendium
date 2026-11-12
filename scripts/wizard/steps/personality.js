/** Step 4 — Personality chart + status / Special / Out. */

import { diceSizesToFormula } from "../chartRoll.js";

export const PERSONALITY_STEP = {
    id: "personality",
    label: "Personality",
    index: 7
};

export const PERSONALITY_DETAILS_STEP = {
    id: "personalityDetails",
    label: "Pers Details",
    index: 8
};

/**
 * Guided personality roll uses the Archetype's personalityDice sizes.
 * @param {string[]} personalityDice
 */
export function personalityRollFormula(personalityDice = []) {
    return diceSizesToFormula(personalityDice);
}

export function isPersonalityChartComplete(draft) {
    return Boolean(draft?.personality?.selectedUuid && draft.personality.selectedNumber);
}

/**
 * @param {object} draft
 * @param {object|null} selectedWizard
 * @param {Array<{token:string}>} [outSlots]
 */
export function isPersonalityDetailsComplete(draft, selectedWizard = null, outSlots = []) {
    const pers = draft?.personality;
    if (!pers?.selectedUuid) return false;

    const name = String(pers.specialQualityName || "").trim();
    if (!name) return false;

    const notes = selectedWizard?.specialQuality?.notes || pers.specialNotes || [];
    if (notes.includes("upgradeOnePowerOrQualityDie") && !pers.upgradeTraitUuid) {
        return false;
    }

    for (const slot of outSlots) {
        if (!pers.outSlotSelections?.[slot.token]) return false;
    }

    return true;
}

/**
 * Collect power/quality assignment rows already chosen earlier in the wizard.
 * @param {object} draft
 * @returns {Array<{uuid:string,name:string,die:string,itemType:string,source:string}>}
 */
export function collectAssignedTraits(draft) {
    const out = [];
    const seen = new Set();

    const push = (row, itemType, source) => {
        if (!row?.uuid || !row?.die) return;
        if (seen.has(row.uuid)) return;
        seen.add(row.uuid);
        out.push({
            uuid: row.uuid,
            name: row.name || "Trait",
            die: row.die,
            itemType,
            source
        });
    };

    for (const q of draft?.background?.qualityAssignments || []) {
        push(q, "quality", "background");
    }
    for (const p of draft?.powerSource?.powerAssignments || []) {
        push(p, "power", "powerSource");
    }
    for (const t of draft?.archetype?.traitAssignments || []) {
        push(t, t.itemType || "power", "archetype");
    }

    return out;
}
