/**
 * In-memory wizard draft (no Actor.create until Slice D).
 */

export function createEmptyDraft() {
    return {
        stepIndex: 0,
        method: null,
        background: {
            roll: null,
            selectedNumber: null,
            selectedUuid: null,
            selectedName: null,
            powerSourceDice: [],
            qualityDice: [],
            qualityAssignments: [],
            principleUuid: null,
            principleName: null,
            principleCategory: null
        },
        powerSource: {
            roll: null,
            selectedNumber: null,
            selectedUuid: null,
            selectedName: null,
            archetypeDice: [],
            powerAssignments: [],
            /** @type {Record<string, string[]>} abilityPicks index → selected uuids */
            abilitySelections: {}
        }
    };
}

/**
 * Reset downstream state when an earlier chart choice changes.
 * @param {ReturnType<typeof createEmptyDraft>} draft
 * @param {"method"|"background"|"backgroundDetails"|"powerSource"} from
 */
export function invalidateFrom(draft, from) {
    if (from === "method") {
        Object.assign(draft.background, createEmptyDraft().background);
        Object.assign(draft.powerSource, createEmptyDraft().powerSource);
        return;
    }
    if (from === "background") {
        draft.background.qualityAssignments = [];
        draft.background.principleUuid = null;
        draft.background.principleName = null;
        Object.assign(draft.powerSource, createEmptyDraft().powerSource);
        return;
    }
    if (from === "backgroundDetails") {
        Object.assign(draft.powerSource, createEmptyDraft().powerSource);
        return;
    }
    if (from === "powerSource") {
        draft.powerSource.powerAssignments = [];
        draft.powerSource.abilitySelections = {};
    }
}

/**
 * Unique non-empty die assignments covering every die exactly once.
 * @param {Array<{uuid?:string|null, die?:string|null}>} assignments
 * @param {string[]} dicePool
 */
export function assignmentsComplete(assignments, dicePool) {
    if (!Array.isArray(assignments) || !Array.isArray(dicePool)) return false;
    if (assignments.length !== dicePool.length) return false;

    const usedDice = [];
    const usedUuids = new Set();
    for (const row of assignments) {
        if (!row?.uuid || !row?.die) return false;
        if (usedUuids.has(row.uuid)) return false;
        usedUuids.add(row.uuid);
        usedDice.push(row.die);
    }

    const remaining = [...dicePool];
    for (const die of usedDice) {
        const idx = remaining.indexOf(die);
        if (idx === -1) return false;
        remaining.splice(idx, 1);
    }
    return remaining.length === 0;
}
