/** Step 2 — Power Source chart + powers / selective abilities. */

import { assignmentsComplete } from "../draftState.js";
import { diceSizesToFormula } from "../chartRoll.js";

export const POWER_SOURCE_STEP = {
    id: "powerSource",
    label: "Power Source",
    index: 3
};

export const POWER_SOURCE_DETAILS_STEP = {
    id: "powerSourceDetails",
    label: "PS Details",
    index: 4
};

/**
 * Guided PS roll uses the Background's powerSourceDice sizes.
 * @param {string[]} powerSourceDice
 */
export function powerSourceRollFormula(powerSourceDice = []) {
    return diceSizesToFormula(powerSourceDice);
}

export function isPowerSourceChartComplete(draft) {
    return Boolean(draft?.powerSource?.selectedUuid && draft.powerSource.selectedNumber);
}

/**
 * @param {object} draft
 * @param {object|null} selectedWizard  power source wizard flags
 */
export function isPowerSourceDetailsComplete(draft, selectedWizard = null) {
    const ps = draft?.powerSource;
    const bg = draft?.background;
    if (!ps?.selectedUuid) return false;

    const dicePool = Array.isArray(bg?.powerSourceDice) ? bg.powerSourceDice : [];
    if (!assignmentsComplete(ps.powerAssignments, dicePool)) return false;

    const picks = selectedWizard?.abilityPicks;
    if (!Array.isArray(picks) || !picks.length) return true;

    for (let i = 0; i < picks.length; i++) {
        const need = Number(picks[i].count) || 0;
        const selected = ps.abilitySelections?.[String(i)] ?? [];
        if (selected.length !== need) return false;
        if (new Set(selected).size !== selected.length) return false;
    }
    return true;
}

/**
 * Build empty power assignment slots from BG dice + required powers.
 * @param {string[]} powerSourceDice
 * @param {object} wizard
 */
export function buildPowerSlots(powerSourceDice = [], wizard = {}) {
    const required = Array.isArray(wizard.requiredPowers) ? wizard.requiredPowers : [];
    const dice = [...powerSourceDice];
    const slots = [];

    required.forEach((req, i) => {
        slots.push({
            slotIndex: i,
            required: true,
            lockedUuid: req.uuid || null,
            lockedName: req.name || null,
            uuid: req.uuid || null,
            name: req.name || null,
            die: null
        });
    });

    const remaining = Math.max(0, dice.length - slots.length);
    for (let i = 0; i < remaining; i++) {
        slots.push({
            slotIndex: slots.length,
            required: false,
            lockedUuid: null,
            lockedName: null,
            uuid: null,
            name: null,
            die: null
        });
    }

    while (slots.length < dice.length) {
        slots.push({
            slotIndex: slots.length,
            required: false,
            lockedUuid: null,
            lockedName: null,
            uuid: null,
            name: null,
            die: null
        });
    }

    return slots.slice(0, dice.length);
}
