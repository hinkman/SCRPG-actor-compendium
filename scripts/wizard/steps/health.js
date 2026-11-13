/** Step 7 — Health: formula + range chart → wounds/health fields. */

import { dieRank } from "../draftState.js";
import { collectEffectiveTraits } from "./redAbilities.js";
import { applyRetconToDraft } from "./retcon.js";
import { silentRoll } from "../silentRoll.js";

export const HEALTH_STEP = {
    id: "health",
    label: "Health",
    index: 11
};

/**
 * Deep-clone the wizard draft for retcon preview (plain JSON data only).
 * @param {object} draft
 */
function cloneDraft(draft) {
    return JSON.parse(JSON.stringify(draft ?? {}));
}

/**
 * Clone with retcon mutations applied (Red status bump, die swaps, etc.).
 * Does not mutate the live wizard draft.
 * @param {object} draft
 */
export function draftWithRetconApplied(draft) {
    const working = cloneDraft(draft);
    applyRetconToDraft(working);
    return working;
}

/** Max Health → [greenLow, yellowHigh, yellowLow, redHigh]; redLow is always 1. */
export const HEALTH_RANGES = {
    40: [30, 29, 15, 14],
    39: [30, 29, 15, 14],
    38: [29, 28, 14, 13],
    37: [29, 28, 14, 13],
    36: [28, 27, 14, 13],
    35: [27, 26, 13, 12],
    34: [26, 25, 13, 12],
    33: [26, 25, 13, 12],
    32: [25, 24, 12, 11],
    31: [24, 23, 12, 11],
    30: [23, 22, 12, 11],
    29: [23, 22, 11, 10],
    28: [22, 21, 11, 10],
    27: [21, 20, 11, 10],
    26: [21, 20, 10, 9],
    25: [20, 19, 10, 9],
    24: [19, 18, 10, 9],
    23: [19, 18, 9, 8],
    22: [18, 17, 9, 8],
    21: [17, 16, 9, 8],
    20: [16, 15, 8, 7],
    19: [15, 14, 8, 7],
    18: [15, 14, 8, 7],
    17: [14, 13, 7, 6]
};

/**
 * Face value of a die size string (d8 → 8).
 * @param {string|null} die
 */
export function dieFaces(die) {
    const m = String(die || "").toLowerCase().match(/^d(\d+)$/);
    return m ? Number(m[1]) : 0;
}

/**
 * Traits usable for the Athletic/Mental (or any, if Mischievous) Health contribution.
 * @param {object} draft
 * @param {Array<object>} traits
 */
export function healthTraitOptions(draft, traits) {
    const notes = draft?.personality?.specialNotes || [];
    const any = notes.includes("healthMayUseAnyPowerOrQuality");
    if (any) {
        return traits.filter(t => t.uuid !== "__special__" || t.die);
    }
    return traits.filter(t =>
        (t.itemType === "power" && t.categoryKey === "athletic")
        || (t.itemType === "quality" && t.categoryKey === "mental")
    );
}

/**
 * Red status die size for Health (includes Increase Red status retcon).
 * Safe on the live wizard draft — does not mutate personality.statusDie.
 * @param {object} draft
 * @returns {string|null}
 */
export function redStatusDieForHealth(draft) {
    const working = draftWithRetconApplied(draft);
    return working?.personality?.statusDie?.red || null;
}

/**
 * @param {object} draft  post-retcon draft (or live draft if bonusDieFaces already set)
 */
export function computeHealthMax(draft) {
    const redStatus = dieFaces(draft?.personality?.statusDie?.red);
    const bonusDie = draft?.health?.bonusDieFaces;
    const bonus = Number.isFinite(bonusDie) && bonusDie > 0 ? bonusDie : 4;
    const variance = draft?.health?.varianceMode === "roll"
        ? (Number(draft?.health?.varianceRoll) || 0)
        : 4;
    return 8 + redStatus + bonus + variance;
}

/**
 * @param {number} max
 * @returns {{greenLow:number,yellowHigh:number,yellowLow:number,redHigh:number,redLow:number}|null}
 */
export function rangesForMax(max) {
    const row = HEALTH_RANGES[max];
    if (!row) return null;
    return {
        greenLow: row[0],
        yellowHigh: row[1],
        yellowLow: row[2],
        redHigh: row[3],
        redLow: 1
    };
}

/**
 * @param {object} draft
 * @param {Array<object>} [traits] effective traits with categoryKey
 */
export function isHealthComplete(draft, traits = []) {
    const health = draft?.health;
    if (!health) return false;
    if (health.varianceMode !== "roll" && health.varianceMode !== "take4") return false;
    if (health.varianceMode === "roll" && !Number(health.varianceRoll)) return false;

    const options = healthTraitOptions(draft, traits);
    // If no athletic/mental (and not Mischievous-any), d4 default is fine without a pick.
    if (options.length && !health.bonusTraitUuid) return false;
    if (!Number(health.max) || !health.ranges) return false;
    return true;
}

/**
 * Refresh computed max + ranges on the draft health bucket.
 * Uses a retcon-applied clone for Red status / trait dice so the live
 * personality.statusDie and assignments stay unchanged until Actor sync.
 * @param {object} draft
 * @param {Map|Record} categoryByUuid
 */
export function refreshHealthComputation(draft, categoryByUuid = null) {
    const working = draftWithRetconApplied(draft);
    // Keep the caller's health picks (bonus trait / variance) on the clone.
    working.health = { ...(draft.health || {}), ...(working.health || {}) };
    if (draft.health) {
        working.health.bonusTraitUuid = draft.health.bonusTraitUuid;
        working.health.varianceMode = draft.health.varianceMode;
        working.health.varianceRoll = draft.health.varianceRoll;
        working.health.varianceRollDetail = draft.health.varianceRollDetail;
    }

    const traits = collectEffectiveTraits(working, categoryByUuid);
    const options = healthTraitOptions(working, traits);
    const picked = options.find(t => t.uuid === working.health?.bonusTraitUuid);
    const bonusDieFaces = picked ? dieFaces(picked.die) : 4;

    working.health.bonusDieFaces = bonusDieFaces;
    working.health.bonusTraitName = picked?.name || null;
    working.health.max = computeHealthMax(working);
    working.health.ranges = rangesForMax(working.health.max);

    draft.health = draft.health || {};
    draft.health.bonusDieFaces = working.health.bonusDieFaces;
    draft.health.bonusTraitName = working.health.bonusTraitName;
    draft.health.max = working.health.max;
    draft.health.ranges = working.health.ranges;
    return draft.health;
}

/**
 * Silent d8 for the Health variance term.
 */
export async function rollHealthVariance() {
    const result = await silentRoll("1d8");
    return {
        total: result.total,
        formula: result.formula,
        detail: result.dice.map(d => `d${d.faces}: [${d.results.join(", ")}]`).join(" · ")
    };
}

export { collectEffectiveTraits, dieRank };
