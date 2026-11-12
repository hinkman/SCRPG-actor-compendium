/** Step 6 — Retcon: exactly one option. */

import { dieRank, upgradeDie } from "../draftState.js";
import { collectEffectiveTraits } from "./redAbilities.js";

export const RETCON_STEP = {
    id: "retcon",
    label: "Retcon",
    index: 10
};

export const RETCON_OPTIONS = [
    {
        id: "extraRed",
        label: "Extra Red ability",
        summary: "Gain one additional Red ability from an eligible list."
    },
    {
        id: "swapDice",
        label: "Swap two dice",
        summary: "Swap the die sizes of any two powers and/or qualities."
    },
    {
        id: "rebindAbility",
        label: "Rebind an ability",
        summary: "Change which power or quality an ability uses."
    },
    {
        id: "bumpRedStatus",
        label: "Increase Red status die",
        summary: "Increase your Red status die one size (max d12)."
    },
    {
        id: "addD6",
        label: "Add a d6 power or quality",
        summary: "Gain any power or quality at d6."
    },
    {
        id: "swapPrinciple",
        label: "Swap a principle",
        summary: "Replace one principle with any other principle."
    }
];

export function isValidRetconOption(id) {
    return RETCON_OPTIONS.some(o => o.id === id);
}

/**
 * @param {object} draft
 * @param {object} [ctx]
 * @param {Array<object>} [ctx.extraRedAbility]
 * @param {Array<object>} [ctx.rebindSlots]
 */
export function isRetconComplete(draft, ctx = {}) {
    const retcon = draft?.retcon;
    if (!retcon?.option || !isValidRetconOption(retcon.option)) return false;

    switch (retcon.option) {
        case "extraRed": {
            if (!retcon.extraRedUuid) return false;
            const ability = ctx.extraRedAbility || null;
            for (const slot of ability?.slots || []) {
                if (!retcon.extraRedSlotSelections?.[slot.token]) return false;
            }
            return true;
        }
        case "swapDice":
            return Boolean(
                retcon.swapUuidA
                && retcon.swapUuidB
                && retcon.swapUuidA !== retcon.swapUuidB
            );
        case "rebindAbility":
            return Boolean(
                retcon.rebindAbilityUuid
                && retcon.rebindToken
                && retcon.rebindTraitUuid
            );
        case "bumpRedStatus": {
            const red = draft?.personality?.statusDie?.red;
            return Boolean(red) && dieRank(red) < dieRank("d12");
        }
        case "addD6":
            return Boolean(retcon.addD6Uuid && retcon.addD6ItemType);
        case "swapPrinciple":
            return Boolean(
                (retcon.principleSlot === "first" || retcon.principleSlot === "second")
                && retcon.newPrincipleUuid
            );
        default:
            return false;
    }
}

/**
 * Apply retcon mutations onto the draft before Actor.create.
 * Mutates draft in place; call once at create time (or preview).
 * @param {object} draft
 */
export function applyRetconToDraft(draft) {
    const retcon = draft?.retcon;
    if (!retcon?.option) return draft;

    if (retcon.option === "swapDice" && retcon.swapUuidA && retcon.swapUuidB) {
        const a = findAssignment(draft, retcon.swapUuidA);
        const b = findAssignment(draft, retcon.swapUuidB);
        if (a && b) {
            const tmp = a.die;
            a.die = b.die;
            b.die = tmp;
        }
    }

    if (retcon.option === "bumpRedStatus") {
        const status = draft.personality?.statusDie;
        if (status?.red) status.red = upgradeDie(status.red);
    }

    if (retcon.option === "addD6" && retcon.addD6Uuid) {
        const row = {
            slotIndex: -1,
            uuid: retcon.addD6Uuid,
            name: retcon.addD6Name || "Trait",
            die: "d6",
            required: false,
            lockedUuid: null,
            lockedName: null,
            itemType: retcon.addD6ItemType || "power"
        };
        if (row.itemType === "quality") {
            draft.background.qualityAssignments = [
                ...(draft.background.qualityAssignments || []),
                row
            ];
        } else {
            draft.powerSource.powerAssignments = [
                ...(draft.powerSource.powerAssignments || []),
                row
            ];
        }
    }

    if (retcon.option === "swapPrinciple" && retcon.newPrincipleUuid) {
        if (retcon.principleSlot === "first") {
            draft.background.principleUuid = retcon.newPrincipleUuid;
            draft.background.principleName = retcon.newPrincipleName || null;
        } else if (retcon.principleSlot === "second") {
            draft.archetype.principleUuid = retcon.newPrincipleUuid;
            draft.archetype.principleName = retcon.newPrincipleName || null;
        }
    }

    return draft;
}

function findAssignment(draft, uuid) {
    const pools = [
        draft.background?.qualityAssignments,
        draft.powerSource?.powerAssignments,
        draft.archetype?.traitAssignments
    ];
    for (const pool of pools) {
        const hit = (pool || []).find(r => r.uuid === uuid);
        if (hit) return hit;
    }
    return null;
}

/**
 * Abilities available for the rebind retcon (Out + Red picks that have slots).
 * @param {object} draft
 * @param {Array<object>} abilitySummaries  uuid/slots/name
 */
export function rebindableAbilities(draft, abilitySummaries = []) {
    const uuids = new Set([
        ...(draft?.red?.abilityUuids || []),
        draft?.personality?.outAbilityUuid
    ].filter(Boolean));
    if (draft?.retcon?.option === "extraRed" && draft.retcon.extraRedUuid) {
        uuids.add(draft.retcon.extraRedUuid);
    }
    return abilitySummaries.filter(a => uuids.has(a.uuid) && (a.slots || []).length);
}

export { collectEffectiveTraits };
