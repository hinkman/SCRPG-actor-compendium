/**
 * Ability FILL uniqueness helpers for wizard constraint metadata
 * (differentPower, differentPowerOrQuality, differentFromGreen, etc.).
 */

/** Constraints that require distinct fills across abilities in a pick group. */
export const UNIQUE_WITHIN_GROUP = new Set([
    "differentPower",
    "differentQuality",
    "differentPowerOrQuality"
]);

/** Yellow (etc.) fills must differ from green ability fills. */
export const UNIQUE_FROM_GREEN = new Set([
    "differentFromGreenAbilities"
]);

/**
 * Human-readable note for a pick-group constraint.
 * @param {string|null|undefined} constraint
 */
export function constraintNote(constraint) {
    if (constraint === "differentPower") {
        return "Each chosen ability must use a different power (fill slots below each pick).";
    }
    if (constraint === "differentQuality") {
        return "Each chosen ability must use a different quality (fill slots below each pick).";
    }
    if (constraint === "differentPowerOrQuality") {
        return "Each chosen ability must use a different power or quality (fill slots below each pick).";
    }
    if (constraint === "differentFromGreenAbilities") {
        return "Use a different power or quality than any of your Green ability fills.";
    }
    if (constraint === "atLeastTwoDifferentPowers") {
        return "Use at least two different powers across the chosen abilities (fill slots below each pick).";
    }
    if (constraint === "includeFlightOrSignatureVehicle") {
        return "At least one chosen ability should use Flight or Signature Vehicle.";
    }
    if (constraint === "includeCloseCombatAndPower") {
        return "At least one ability must use Close Combat and another must use a power.";
    }
    return null;
}

/**
 * Trait uuids filled on the given abilities.
 * @param {string[]} abilityUuids
 * @param {Record<string, Record<string, string>>|null|undefined} slotSelections
 * @returns {Set<string>}
 */
export function collectFilledTraitUuids(abilityUuids, slotSelections) {
    const used = new Set();
    for (const uuid of abilityUuids || []) {
        const slots = slotSelections?.[uuid] || {};
        for (const traitUuid of Object.values(slots)) {
            if (traitUuid) used.add(traitUuid);
        }
    }
    return used;
}

/**
 * Filled trait uuids for all green ability picks in wizard abilityPicks.
 * @param {Array<{color?:string, count?:number}>} abilityPicks
 * @param {Record<string, string[]>|null|undefined} abilitySelections
 * @param {Record<string, Record<string, string>>|null|undefined} slotSelections
 * @returns {Set<string>}
 */
export function collectGreenFilledTraits(abilityPicks, abilitySelections, slotSelections) {
    const greenUuids = [];
    for (let i = 0; i < (abilityPicks || []).length; i++) {
        const group = abilityPicks[i];
        if (String(group?.color || "").toLowerCase() !== "green") continue;
        const selected = abilitySelections?.[String(i)] || [];
        greenUuids.push(...selected.filter(Boolean));
    }
    return collectFilledTraitUuids(greenUuids, slotSelections);
}

/**
 * Which item types a uniqueness constraint cares about.
 * @param {string|null|undefined} constraint
 * @returns {"power"|"quality"|"any"|null}
 */
export function uniquenessItemType(constraint) {
    if (constraint === "differentPower") return "power";
    if (constraint === "differentQuality") return "quality";
    if (
        constraint === "differentPowerOrQuality"
        || constraint === "differentFromGreenAbilities"
    ) {
        return "any";
    }
    return null;
}

/**
 * Mark FILL options taken by sibling (or green) abilities as disabled.
 * Currently-selected values stay selectable so the user can keep them.
 *
 * @param {Array<object>} options
 * @param {object} cfg
 * @param {Set<string>} cfg.takenUuids
 * @param {string|null|undefined} cfg.selectedUuid
 * @param {"power"|"quality"|"any"|null} [cfg.itemTypeFilter]
 */
export function annotateTakenFillOptions(options, {
    takenUuids,
    selectedUuid = null,
    itemTypeFilter = "any"
} = {}) {
    if (!takenUuids?.size || !itemTypeFilter) {
        return (options || []).map(opt => ({ ...opt, disabled: false }));
    }
    return (options || []).map(opt => {
        const matchesType = itemTypeFilter === "any"
            || opt.itemType === itemTypeFilter
            || opt.uuid === "__special__";
        const isTaken = matchesType
            && takenUuids.has(opt.uuid)
            && opt.uuid !== selectedUuid;
        return { ...opt, disabled: Boolean(isTaken) };
    });
}

/**
 * Build the set of trait uuids that should be blocked for this ability's fills.
 * @param {object} args
 * @param {string|null|undefined} args.constraint
 * @param {string} args.abilityUuid
 * @param {string[]} args.groupSelectedUuids
 * @param {Record<string, Record<string, string>>|null|undefined} args.slotSelections
 * @param {Set<string>|null|undefined} args.greenFilledUuids
 * @returns {{taken: Set<string>, itemTypeFilter: "power"|"quality"|"any"|null}}
 */
export function takenFillsForAbility({
    constraint,
    abilityUuid,
    groupSelectedUuids = [],
    slotSelections = null,
    greenFilledUuids = null
}) {
    if (UNIQUE_FROM_GREEN.has(constraint)) {
        return {
            taken: new Set(greenFilledUuids || []),
            itemTypeFilter: uniquenessItemType(constraint)
        };
    }
    if (!UNIQUE_WITHIN_GROUP.has(constraint)) {
        return { taken: new Set(), itemTypeFilter: null };
    }
    const siblings = (groupSelectedUuids || []).filter(u => u && u !== abilityUuid);
    return {
        taken: collectFilledTraitUuids(siblings, slotSelections),
        itemTypeFilter: uniquenessItemType(constraint)
    };
}

/**
 * Validate uniqueness constraints for one ability pick group.
 * @param {object} group  wizard abilityPicks entry
 * @param {string[]} selectedUuids
 * @param {Record<string, Record<string, string>>|null|undefined} slotSelections
 * @param {Map<string, {slots?: Array<{token:string}>}>|null} [abilityMeta]
 * @param {Set<string>|null} [greenFilledUuids]
 * @returns {string|null} error message or null if ok
 */
export function validateGroupFillConstraint(
    group,
    selectedUuids,
    slotSelections,
    abilityMeta = null,
    greenFilledUuids = null
) {
    const constraint = group?.constraint || null;
    if (!constraint) return null;

    const selected = (selectedUuids || []).filter(Boolean);
    if (!selected.length) return null;

    // Ensure slots are filled before uniqueness checks.
    if (abilityMeta) {
        for (const uuid of selected) {
            const meta = abilityMeta instanceof Map ? abilityMeta.get(uuid) : abilityMeta[uuid];
            for (const slot of meta?.slots || []) {
                if (!slotSelections?.[uuid]?.[slot.token]) {
                    return null; // incomplete fills handled elsewhere
                }
            }
        }
    }

    if (UNIQUE_WITHIN_GROUP.has(constraint)) {
        const filter = uniquenessItemType(constraint);
        const values = [];
        for (const uuid of selected) {
            const slots = slotSelections?.[uuid] || {};
            for (const traitUuid of Object.values(slots)) {
                if (!traitUuid) continue;
                // Only count fills that match the constraint's item type when we can.
                // Without per-token type here, count all filled traits for powerOrQuality;
                // for power/quality-only, prefer traits whose type matches if meta available.
                values.push(traitUuid);
            }
        }
        // Narrow by item type using abilityMeta slot definitions when possible.
        const typed = [];
        for (const uuid of selected) {
            const meta = abilityMeta instanceof Map ? abilityMeta.get(uuid) : abilityMeta?.[uuid];
            const slots = slotSelections?.[uuid] || {};
            for (const slot of meta?.slots || []) {
                const traitUuid = slots[slot.token];
                if (!traitUuid) continue;
                if (filter === "power" && slot.itemType && slot.itemType !== "power") continue;
                if (filter === "quality" && slot.itemType && slot.itemType !== "quality") continue;
                typed.push(traitUuid);
            }
            // Fallback when meta/slots missing: use all values for this ability
            if (!meta?.slots?.length) {
                for (const traitUuid of Object.values(slots)) {
                    if (traitUuid) typed.push(traitUuid);
                }
            }
        }
        const check = typed.length ? typed : values;
        if (new Set(check).size !== check.length) {
            if (constraint === "differentPower") {
                return "Each ability must use a different power";
            }
            if (constraint === "differentQuality") {
                return "Each ability must use a different quality";
            }
            return "Each ability must use a different power or quality";
        }
        return null;
    }

    if (UNIQUE_FROM_GREEN.has(constraint) && greenFilledUuids?.size) {
        for (const uuid of selected) {
            const slots = slotSelections?.[uuid] || {};
            for (const traitUuid of Object.values(slots)) {
                if (traitUuid && greenFilledUuids.has(traitUuid)) {
                    return "Yellow ability fills must differ from your Green ability fills";
                }
            }
        }
        return null;
    }

    if (constraint === "atLeastTwoDifferentPowers") {
        const powers = new Set();
        for (const uuid of selected) {
            const meta = abilityMeta instanceof Map ? abilityMeta.get(uuid) : abilityMeta?.[uuid];
            const slots = slotSelections?.[uuid] || {};
            for (const slot of meta?.slots || []) {
                const traitUuid = slots[slot.token];
                if (!traitUuid) continue;
                if (!slot.itemType || slot.itemType === "power") powers.add(traitUuid);
            }
            if (!meta?.slots?.length) {
                for (const traitUuid of Object.values(slots)) {
                    if (traitUuid) powers.add(traitUuid);
                }
            }
        }
        if (powers.size > 0 && powers.size < 2 && selected.length >= 2) {
            return "Use at least two different powers across chosen abilities";
        }
        return null;
    }

    return null;
}

/**
 * Validate all ability pick groups on a draft section (PS / archetype).
 * @param {Array<object>} abilityPicks
 * @param {Record<string, string[]>|null|undefined} abilitySelections
 * @param {Record<string, Record<string, string>>|null|undefined} slotSelections
 * @param {Map|object|null} abilityMeta
 * @returns {string[]}
 */
export function validateAbilityPickFillConstraints(
    abilityPicks,
    abilitySelections,
    slotSelections,
    abilityMeta = null
) {
    const errors = [];
    const greenFilled = collectGreenFilledTraits(abilityPicks, abilitySelections, slotSelections);
    for (let i = 0; i < (abilityPicks || []).length; i++) {
        const group = abilityPicks[i];
        const selected = abilitySelections?.[String(i)] || [];
        const msg = validateGroupFillConstraint(
            group,
            selected,
            slotSelections,
            abilityMeta,
            greenFilled
        );
        if (msg) errors.push(msg);
    }
    return errors;
}
