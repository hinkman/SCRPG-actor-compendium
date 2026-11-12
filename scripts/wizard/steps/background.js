/** Step 1 — Background chart: Guided 2d10 / Constructed pick. */

import { assignmentsComplete } from "../draftState.js";

export const BACKGROUND_STEP = {
    id: "background",
    label: "Background",
    index: 1
};

export const BACKGROUND_DETAILS_STEP = {
    id: "backgroundDetails",
    label: "BG Details",
    index: 2
};

export const BACKGROUND_ROLL_FORMULA = "2d10";

/**
 * @param {object} draft
 * @param {object|null} [selectedRow]
 */
export function isBackgroundChartComplete(draft) {
    return Boolean(draft?.background?.selectedUuid && draft.background.selectedNumber);
}

/**
 * @param {object} draft
 */
export function isBackgroundDetailsComplete(draft) {
    const bg = draft?.background;
    if (!bg?.selectedUuid) return false;
    if (!bg.principleUuid) return false;
    return assignmentsComplete(bg.qualityAssignments, bg.qualityDice);
}

/**
 * Build empty quality assignment slots for a background wizard blob.
 * @param {object} wizard
 */
export function buildQualitySlots(wizard = {}) {
    const required = Array.isArray(wizard.requiredQualities) ? wizard.requiredQualities : [];
    const pickCount = Number(wizard.qualityPickCount) || 0;
    const dice = Array.isArray(wizard.qualityDice) ? [...wizard.qualityDice] : [];
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

    for (let i = 0; i < pickCount; i++) {
        slots.push({
            slotIndex: required.length + i,
            required: false,
            lockedUuid: null,
            lockedName: null,
            uuid: null,
            name: null,
            die: null
        });
    }

    // Prefer dice length if metadata drifts.
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

    return slots.slice(0, Math.max(dice.length, slots.length));
}
