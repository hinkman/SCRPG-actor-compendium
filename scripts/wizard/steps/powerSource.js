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
 * Human-readable leftovers for the PS Details Next button.
 * Relic and similar sources need Yellow AND Green picks — not Yellow alone.
 * @param {object} draft
 * @param {object|null} selectedWizard  power source wizard flags
 * @returns {string[]}
 */
export function powerSourceDetailsRemaining(draft, selectedWizard = null) {
    const ps = draft?.powerSource;
    const bg = draft?.background;
    const remaining = [];
    if (!ps?.selectedUuid) {
        remaining.push("Select a power source first");
        return remaining;
    }

    const dicePool = Array.isArray(bg?.powerSourceDice) ? bg.powerSourceDice : [];
    if (!assignmentsComplete(ps.powerAssignments, dicePool)) {
        remaining.push(`Assign all power dice (${dicePool.join(", ") || "—"})`);
    }

    const picks = selectedWizard?.abilityPicks;
    if (!Array.isArray(picks) || !picks.length) return remaining;

    for (let i = 0; i < picks.length; i++) {
        const need = Number(picks[i].count) || 0;
        const selected = ps.abilitySelections?.[String(i)] ?? [];
        const have = Array.isArray(selected) ? new Set(selected.filter(Boolean)).size : 0;
        if (have !== need) {
            const color = String(picks[i].color || "ability").replace(/^\w/, c => c.toUpperCase());
            const left = Math.max(0, need - have);
            remaining.push(
                left === need
                    ? `Pick ${need} ${color} abilit${need === 1 ? "y" : "ies"}`
                    : `Pick ${left} more ${color} abilit${left === 1 ? "y" : "ies"} (${have}/${need})`
            );
        }
    }
    return remaining;
}

/**
 * @param {object} draft
 * @param {object|null} selectedWizard  power source wizard flags
 */
export function isPowerSourceDetailsComplete(draft, selectedWizard = null) {
    return powerSourceDetailsRemaining(draft, selectedWizard).length === 0;
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
