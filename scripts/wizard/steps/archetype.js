/** Step 3 — Archetype chart + powers/qualities / selective abilities / Principle₂. */

import { assignmentsComplete } from "../draftState.js";
import { diceSizesToFormula } from "../chartRoll.js";

export const ARCHETYPE_STEP = {
    id: "archetype",
    label: "Archetype",
    index: 5
};

export const ARCHETYPE_DETAILS_STEP = {
    id: "archetypeDetails",
    label: "Arch Details",
    index: 6
};

/**
 * Guided archetype roll uses the Power Source's archetypeDice sizes.
 * @param {string[]} archetypeDice
 */
export function archetypeRollFormula(archetypeDice = []) {
    return diceSizesToFormula(archetypeDice);
}

/**
 * Complex archetypes are blocked in v1 (Modular / Divided / Form-Changer / Minion-Maker).
 * @param {object} row chart row from packData.loadChartRows
 */
export function isArchetypeBlocked(row) {
    const wizard = row?.wizard || {};
    const flags = row?.flags || {};
    if (wizard.wizardBlocked || wizard.complex) return true;
    if (flags.wizardBlocked || flags.complex) return true;
    const key = wizard.complexKey || flags.complexKey;
    return Boolean(key);
}

export function isArchetypeChartComplete(draft) {
    return Boolean(draft?.archetype?.selectedUuid && draft.archetype.selectedNumber);
}

/**
 * @param {object} draft
 * @param {object|null} selectedWizard
 */
export function isArchetypeDetailsComplete(draft, selectedWizard = null) {
    const arch = draft?.archetype;
    const ps = draft?.powerSource;
    if (!arch?.selectedUuid) return false;
    if (!arch.principleUuid) return false;

    const dicePool = Array.isArray(ps?.archetypeDice) ? ps.archetypeDice : [];
    if (!assignmentsComplete(arch.traitAssignments, dicePool)) return false;

    const picks = selectedWizard?.abilityPicks;
    if (!Array.isArray(picks) || !picks.length) return true;

    for (let i = 0; i < picks.length; i++) {
        const need = Number(picks[i].count) || 0;
        const selected = arch.abilitySelections?.[String(i)] ?? [];
        if (selected.length !== need) return false;
        if (new Set(selected).size !== selected.length) return false;
    }
    return true;
}

/**
 * Build trait assignment slots from PS archetype dice + required traits.
 * @param {string[]} archetypeDice
 * @param {object} wizard
 */
export function buildTraitSlots(archetypeDice = [], wizard = {}) {
    const required = Array.isArray(wizard.requiredTraits) ? wizard.requiredTraits : [];
    const dice = [...archetypeDice];
    const slots = [];

    required.forEach((req, i) => {
        const itemType = req.pack === "qualities" ? "quality" : "power";
        slots.push({
            slotIndex: i,
            required: true,
            lockedUuid: req.uuid || null,
            lockedName: req.name || null,
            uuid: req.uuid || null,
            name: req.name || null,
            itemType,
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
            itemType: null,
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
            itemType: null,
            die: null
        });
    }

    return slots.slice(0, dice.length);
}

/**
 * Prefill auto-granted ability pick groups (e.g. Armored's fixed Green).
 * @param {object} wizard
 * @returns {Record<string, string[]>}
 */
export function defaultAbilitySelections(wizard = {}) {
    const out = {};
    const picks = wizard.abilityPicks || [];
    for (let i = 0; i < picks.length; i++) {
        const group = picks[i];
        if (group.autoGranted) {
            out[String(i)] = (group.abilities || []).map(a => a.uuid).filter(Boolean);
        } else {
            out[String(i)] = [];
        }
    }
    return out;
}

/**
 * Human hints from unstructured assignment steps (Flyer / Blaster, etc.).
 * @param {object} wizard
 */
export function assignmentHints(wizard = {}) {
    const steps = wizard.assignmentSteps || [];
    return steps
        .filter(s => s?.unstructured || s?.instruction)
        .map(s => s.instruction)
        .filter(Boolean);
}
