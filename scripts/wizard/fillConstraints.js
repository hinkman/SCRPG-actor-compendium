/**
 * Ability FILL uniqueness + mix-include helpers for wizard constraint metadata
 * (differentPower, includeCloseCombatAndPower, signatureWeaponryAndQuality, etc.).
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

/** Canonical trait document ids used by mix-include rules. */
export const TRAIT_IDS = {
    closeCombat: "JbpF0zq2JHhwxVHD",
    signatureWeaponry: "fubw8CJu2mXFZJUD",
    flight: "5GDEdsr0jrDmWApP",
    signatureVehicle: "hQIArnjTuOBxYoPT"
};

/**
 * "At least one … and another …" (and single at-least-one) FILL constraints.
 * Each rule must be covered by at least one selected ability's fill(s).
 * With multiple rules, different abilities cover different rules in practice
 * (matchers are mutually exclusive for current archetype text).
 *
 * @type {Record<string, {rules: Array<{id:string, match: object}>, message: string}>}
 */
export const MIX_INCLUDE_CONSTRAINTS = {
    includeCloseCombatAndPower: {
        rules: [
            { id: "closeCombat", match: { ids: [TRAIT_IDS.closeCombat] } },
            { id: "power", match: { itemTypes: ["power"] } }
        ],
        message: "At least one ability must use Close Combat and another must use a power"
    },
    signatureWeaponryAndQuality: {
        rules: [
            { id: "signatureWeaponry", match: { ids: [TRAIT_IDS.signatureWeaponry] } },
            { id: "quality", match: { itemTypes: ["quality"] } }
        ],
        message: "One ability must use Signature Weaponry and another must use a quality"
    },
    includeFlightOrSignatureVehicle: {
        rules: [
            {
                id: "flightOrVehicle",
                match: { ids: [TRAIT_IDS.flight, TRAIT_IDS.signatureVehicle] }
            }
        ],
        message: "At least one chosen ability must use Flight or Signature Vehicle"
    }
};

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
    if (constraint === "signatureWeaponryAndQuality") {
        return "One ability must use Signature Weaponry and another must use a quality.";
    }
    return null;
}

/**
 * @param {string|null|undefined} uuid
 * @param {string} id
 */
export function uuidHasTraitId(uuid, id) {
    if (!uuid || !id) return false;
    return uuid === id || uuid.endsWith(`.${id}`) || uuid.endsWith(`Item.${id}`);
}

/**
 * Infer power vs quality from a Foundry pack uuid when possible.
 * @param {string|null|undefined} uuid
 * @returns {"power"|"quality"|null}
 */
export function itemTypeFromTraitUuid(uuid) {
    if (!uuid || typeof uuid !== "string") return null;
    if (uuid === "__special__") return "quality";
    if (/\.powers\.Item\./i.test(uuid)) return "power";
    if (/\.qualities\.Item\./i.test(uuid)) return "quality";
    return null;
}

/**
 * @param {string|null|undefined} traitUuid
 * @param {{ids?: string[], itemTypes?: string[]}} match
 * @param {{itemType?: string|null}} [hint]
 */
export function traitMatchesMixRule(traitUuid, match, hint = null) {
    if (!traitUuid || !match) return false;
    for (const id of match.ids || []) {
        if (uuidHasTraitId(traitUuid, id)) return true;
    }
    const types = match.itemTypes || [];
    if (types.length) {
        const type = hint?.itemType || itemTypeFromTraitUuid(traitUuid);
        if (type && types.includes(type)) return true;
    }
    return false;
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
        return (options || []).map(opt => ({ ...opt, disabled: Boolean(opt.disabled) }));
    }
    return (options || []).map(opt => {
        const matchesType = itemTypeFilter === "any"
            || opt.itemType === itemTypeFilter
            || opt.uuid === "__special__";
        const isTaken = matchesType
            && takenUuids.has(opt.uuid)
            && opt.uuid !== selectedUuid;
        return { ...opt, disabled: Boolean(opt.disabled) || Boolean(isTaken) };
    });
}

/**
 * Disable FILL options that would make a mix-include constraint unsatisfiable
 * given sibling fills (e.g. last slot cannot be another Close Combat when a power is still required).
 * Currently-selected values stay selectable so the control can show them.
 *
 * @param {Array<object>} options
 * @param {object} cfg
 * @param {string|null|undefined} cfg.constraint
 * @param {string} cfg.abilityUuid
 * @param {string[]} cfg.groupSelectedUuids
 * @param {Record<string, Record<string, string>>|null|undefined} cfg.slotSelections
 * @param {string|null|undefined} cfg.selectedUuid
 */
export function annotateMixConstraintOptions(options, {
    constraint,
    abilityUuid,
    groupSelectedUuids = [],
    slotSelections = null,
    selectedUuid = null
} = {}) {
    const def = constraint ? MIX_INCLUDE_CONSTRAINTS[constraint] : null;
    if (!def) return options || [];

    return (options || []).map(opt => {
        if (opt.disabled || opt.uuid === selectedUuid) return opt;
        const keep = mixChoiceKeepsSatisfiable(
            def,
            opt.uuid,
            opt.itemType || itemTypeFromTraitUuid(opt.uuid),
            abilityUuid,
            groupSelectedUuids,
            slotSelections
        );
        return keep ? opt : { ...opt, disabled: true };
    });
}

/**
 * @param {object} def
 * @param {string|null|undefined} chosenTraitUuid
 * @param {string|null|undefined} chosenItemType
 * @param {string} abilityUuid
 * @param {string[]} groupSelectedUuids
 * @param {Record<string, Record<string, string>>|null|undefined} slotSelections
 */
export function mixChoiceKeepsSatisfiable(
    def,
    chosenTraitUuid,
    chosenItemType,
    abilityUuid,
    groupSelectedUuids,
    slotSelections
) {
    const selected = (groupSelectedUuids || []).filter(Boolean);
    if (!selected.length) return true;

    for (const rule of def.rules) {
        let covered = false;
        let flexible = 0;
        for (const uuid of selected) {
            if (uuid === abilityUuid) {
                if (!chosenTraitUuid) {
                    flexible++;
                    continue;
                }
                if (traitMatchesMixRule(chosenTraitUuid, rule.match, { itemType: chosenItemType })) {
                    covered = true;
                }
                continue;
            }
            const fills = Object.values(slotSelections?.[uuid] || {}).filter(Boolean);
            if (!fills.length) {
                flexible++;
                continue;
            }
            if (fills.some(fu => traitMatchesMixRule(fu, rule.match))) {
                covered = true;
            }
        }
        if (!covered && flexible === 0) return false;
    }
    return true;
}

/**
 * Build the set of trait uuids that should be blocked for this ability's fills.
 * @param {object} args
 * @param {string|null|undefined} args.constraint
 * @param {string} args.abilityUuid
 * @param {string[]} args.groupSelectedUuids
 * @param {Record<string, Record<string, string>>|null|undefined} args.slotSelections
 * @param {Set<string>|null|undefined} args.greenFilledUuids
 * @returns {{
 *   taken: Set<string>,
 *   itemTypeFilter: "power"|"quality"|"any"|null,
 *   mixConstraint: string|null,
 *   abilityUuid: string,
 *   groupSelectedUuids: string[],
 *   slotSelections: Record<string, Record<string, string>>|null|undefined
 * }}
 */
export function takenFillsForAbility({
    constraint,
    abilityUuid,
    groupSelectedUuids = [],
    slotSelections = null,
    greenFilledUuids = null
}) {
    const mixConstraint = constraint && MIX_INCLUDE_CONSTRAINTS[constraint]
        ? constraint
        : null;
    const base = {
        mixConstraint,
        abilityUuid,
        groupSelectedUuids,
        slotSelections
    };

    if (UNIQUE_FROM_GREEN.has(constraint)) {
        return {
            ...base,
            taken: new Set(greenFilledUuids || []),
            itemTypeFilter: uniquenessItemType(constraint)
        };
    }
    if (!UNIQUE_WITHIN_GROUP.has(constraint)) {
        return { ...base, taken: new Set(), itemTypeFilter: null };
    }
    const siblings = (groupSelectedUuids || []).filter(u => u && u !== abilityUuid);
    return {
        ...base,
        taken: collectFilledTraitUuids(siblings, slotSelections),
        itemTypeFilter: uniquenessItemType(constraint)
    };
}

/**
 * @param {object} def
 * @param {string[]} selected
 * @param {Record<string, Record<string, string>>|null|undefined} slotSelections
 * @returns {string|null}
 */
function validateMixIncludeConstraint(def, selected, slotSelections) {
    for (const rule of def.rules) {
        const covered = selected.some(uuid => {
            const fills = Object.values(slotSelections?.[uuid] || {}).filter(Boolean);
            return fills.some(fu => traitMatchesMixRule(fu, rule.match));
        });
        if (!covered) return def.message;
    }
    return null;
}

/**
 * Validate uniqueness / mix-include constraints for one ability pick group.
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

    // Ensure slots are filled before uniqueness / mix checks.
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
                const type = itemTypeFromTraitUuid(traitUuid);
                if (type === "power" || (!type && (!slot.itemType || slot.itemType === "power"))) {
                    powers.add(traitUuid);
                }
            }
            if (!meta?.slots?.length) {
                for (const traitUuid of Object.values(slots)) {
                    if (traitUuid && itemTypeFromTraitUuid(traitUuid) === "power") {
                        powers.add(traitUuid);
                    }
                }
            }
        }
        if (powers.size > 0 && powers.size < 2 && selected.length >= 2) {
            return "Use at least two different powers across chosen abilities";
        }
        return null;
    }

    const mixDef = MIX_INCLUDE_CONSTRAINTS[constraint];
    if (mixDef) {
        return validateMixIncludeConstraint(mixDef, selected, slotSelections);
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
