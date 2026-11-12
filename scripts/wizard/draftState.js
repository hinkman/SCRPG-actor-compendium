/**
 * In-memory wizard draft through Steps 1–4 (Actor.create in apply.js).
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
        },
        archetype: {
            roll: null,
            selectedNumber: null,
            selectedUuid: null,
            selectedName: null,
            personalityDice: [],
            principleUuid: null,
            principleName: null,
            principleCategory: null,
            /** @type {Array<object>} power/quality die assignments */
            traitAssignments: [],
            /** @type {Record<string, string[]>} */
            abilitySelections: {}
        },
        personality: {
            roll: null,
            selectedNumber: null,
            selectedUuid: null,
            selectedName: null,
            statusDie: { green: null, yellow: null, red: null },
            specialQualityName: null,
            specialQualityDie: "d8",
            outAbilityUuid: null,
            /** @type {Record<string, string>} out ability slot token → trait uuid */
            outSlotSelections: {},
            /** Impulsive: uuid of power/quality to upgrade one step */
            upgradeTraitUuid: null,
            specialNotes: []
        },
        identity: {
            name: null,
            alias: null
        }
    };
}

/**
 * Reset downstream state when an earlier chart choice changes.
 * @param {ReturnType<typeof createEmptyDraft>} draft
 * @param {"method"|"background"|"backgroundDetails"|"powerSource"|"powerSourceDetails"|"archetype"|"archetypeDetails"|"personality"} from
 */
export function invalidateFrom(draft, from) {
    const empty = createEmptyDraft();

    if (from === "method") {
        Object.assign(draft.background, empty.background);
        Object.assign(draft.powerSource, empty.powerSource);
        Object.assign(draft.archetype, empty.archetype);
        Object.assign(draft.personality, empty.personality);
        Object.assign(draft.identity, empty.identity);
        return;
    }
    if (from === "background") {
        draft.background.qualityAssignments = [];
        draft.background.principleUuid = null;
        draft.background.principleName = null;
        Object.assign(draft.powerSource, empty.powerSource);
        Object.assign(draft.archetype, empty.archetype);
        Object.assign(draft.personality, empty.personality);
        return;
    }
    if (from === "backgroundDetails") {
        Object.assign(draft.powerSource, empty.powerSource);
        Object.assign(draft.archetype, empty.archetype);
        Object.assign(draft.personality, empty.personality);
        return;
    }
    if (from === "powerSource") {
        draft.powerSource.powerAssignments = [];
        draft.powerSource.abilitySelections = {};
        Object.assign(draft.archetype, empty.archetype);
        Object.assign(draft.personality, empty.personality);
        return;
    }
    if (from === "powerSourceDetails") {
        Object.assign(draft.archetype, empty.archetype);
        Object.assign(draft.personality, empty.personality);
        return;
    }
    if (from === "archetype") {
        draft.archetype.traitAssignments = [];
        draft.archetype.abilitySelections = {};
        draft.archetype.principleUuid = null;
        draft.archetype.principleName = null;
        Object.assign(draft.personality, empty.personality);
        return;
    }
    if (from === "archetypeDetails") {
        Object.assign(draft.personality, empty.personality);
        return;
    }
    if (from === "personality") {
        draft.personality.specialQualityName = null;
        draft.personality.outSlotSelections = {};
        draft.personality.upgradeTraitUuid = null;
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

const DIE_RANK = { d4: 1, d6: 2, d8: 3, d10: 4, d12: 5 };

/**
 * @param {string} die
 * @returns {number}
 */
export function dieRank(die) {
    return DIE_RANK[String(die || "").toLowerCase()] || 0;
}

/**
 * Upgrade a die one step (max d12).
 * @param {string} die
 */
export function upgradeDie(die) {
    const order = ["d4", "d6", "d8", "d10", "d12"];
    const key = String(die || "").toLowerCase();
    const idx = order.indexOf(key);
    if (idx === -1) return die;
    return order[Math.min(idx + 1, order.length - 1)];
}
