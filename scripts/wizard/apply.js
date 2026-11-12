/**
 * Create a playable hero Actor from the wizard draft (Steps 1–4).
 * Selective ability grants only — never dump-all drop hooks.
 */

import { dieRank, upgradeDie } from "./draftState.js";

const MODULE_ID = "scrpg-actor-compendium";

/**
 * @param {object} draft
 * @param {{name:string, alias?:string}} identity
 * @returns {Promise<Actor>}
 */
export async function createHeroFromDraft(draft, identity) {
    const name = String(identity?.name || "").trim() || "New Hero";
    const alias = String(identity?.alias || "").trim();

    const status = draft.personality?.statusDie || {};
    const firstPrinciple = await principleSystemData(draft.background?.principleUuid);
    const secondPrinciple = await principleSystemData(draft.archetype?.principleUuid);
    const outText = await resolveOutText(draft);

    const actorData = {
        name,
        type: "hero",
        system: {
            alias,
            background: draft.background?.selectedName || "",
            powerSource: draft.powerSource?.selectedName || "",
            archetype: draft.archetype?.selectedName || "",
            personality: draft.personality?.selectedName || "",
            statusDie: {
                green: status.green || "",
                yellow: status.yellow || "",
                red: status.red || ""
            },
            out: outText ? `<p>${escapeHtml(outText)}</p>` : "",
            firstPrinciple: firstPrinciple || emptyPrinciple(),
            secondPrinciple: secondPrinciple || emptyPrinciple(),
            wounds: { value: 0, max: 0 },
            health: {
                greenLow: 0,
                yellowHigh: 0,
                yellowLow: 0,
                redHigh: 0,
                redLow: 1
            }
        },
        flags: {
            [MODULE_ID]: {
                wizard: {
                    method: draft.method,
                    createdAt: Date.now(),
                    slice: "D",
                    backgroundUuid: draft.background?.selectedUuid || null,
                    powerSourceUuid: draft.powerSource?.selectedUuid || null,
                    archetypeUuid: draft.archetype?.selectedUuid || null,
                    personalityUuid: draft.personality?.selectedUuid || null
                }
            }
        }
    };

    const actor = await Actor.create(actorData);
    if (!actor) throw new Error("Actor.create returned null");

    const items = [];
    const dieByUuid = new Map();

    // Background qualities
    for (const row of draft.background?.qualityAssignments || []) {
        await pushClonedTrait(items, dieByUuid, row, "quality", {
            fromBackground: draft.background?.selectedName
        });
    }

    // Power Source powers
    for (const row of draft.powerSource?.powerAssignments || []) {
        await pushClonedTrait(items, dieByUuid, row, "power", {
            fromPowerSource: draft.powerSource?.selectedName
        });
    }

    // Archetype powers / qualities
    for (const row of draft.archetype?.traitAssignments || []) {
        const itemType = row.itemType === "quality" ? "quality" : "power";
        await pushClonedTrait(items, dieByUuid, row, itemType, {
            fromArchetype: draft.archetype?.selectedName
        });
    }

    // Special quality (custom)
    const specialName = String(draft.personality?.specialQualityName || "").trim();
    if (specialName) {
        items.push({
            name: specialName,
            type: "quality",
            img: "icons/svg/aura.svg",
            system: {
                dieType: draft.personality?.specialQualityDie || "d8",
                selected: false,
                description: "<p>Special roleplaying quality (Personality).</p>"
            },
            flags: {
                [MODULE_ID]: {
                    specialQuality: true,
                    fromPersonality: draft.personality?.selectedName || null
                }
            }
        });
    }

    // Impulsive: upgrade one existing trait die before embedding
    const upgradeUuid = draft.personality?.upgradeTraitUuid;
    if (upgradeUuid && dieByUuid.has(upgradeUuid)) {
        const entry = dieByUuid.get(upgradeUuid);
        entry.die = upgradeDie(entry.die);
        if (items[entry.index]) {
            items[entry.index].system.dieType = entry.die;
        }
    }

    // Selective PS abilities
    for (const uuids of Object.values(draft.powerSource?.abilitySelections || {})) {
        for (const uuid of uuids || []) {
            await pushClonedAbility(items, uuid, {
                fromPowerSource: draft.powerSource?.selectedName
            });
        }
    }

    // Selective archetype abilities
    for (const uuids of Object.values(draft.archetype?.abilitySelections || {})) {
        for (const uuid of uuids || []) {
            await pushClonedAbility(items, uuid, {
                fromArchetype: draft.archetype?.selectedName
            });
        }
    }

    // Principle Green abilities
    await pushPrincipleAbility(items, draft.background?.principleUuid, "first");
    await pushPrincipleAbility(items, draft.archetype?.principleUuid, "second");

    // Out ability with slot selections (tokens resolved after traits exist)
    const outAbilityUuid = draft.personality?.outAbilityUuid;
    if (outAbilityUuid) {
        await pushClonedAbility(items, outAbilityUuid, {
            fromPersonality: draft.personality?.selectedName,
            pendingOutSlots: { ...(draft.personality?.outSlotSelections || {}) }
        });
    }

    if (items.length) {
        const created = await actor.createEmbeddedDocuments("Item", items);
        await applyPendingOutSlots(actor, created, draft);
    }

    return actor;
}

/**
 * @param {string|null} uuid
 */
async function principleSystemData(uuid) {
    if (!uuid) return null;
    const doc = await fromUuid(uuid);
    if (!doc || doc.type !== "principles") return null;
    return {
        name: doc.name,
        roleplaying: stripToPlain(doc.system?.roleplaying) || "",
        minorTwist: stripToPlain(doc.system?.minorTwist) || "",
        majorTwist: stripToPlain(doc.system?.majorTwist) || ""
    };
}

function emptyPrinciple() {
    return { name: "", roleplaying: "", minorTwist: "", majorTwist: "" };
}

async function resolveOutText(draft) {
    const uuid = draft.personality?.outAbilityUuid;
    if (!uuid) return draft.personality?.selectedName ? "" : "";
    const ability = await fromUuid(uuid);
    const template = ability?.flags?.[MODULE_ID]?.gameTextTemplate
        || stripToPlain(ability?.system?.gameText)
        || "";
    if (!template) return "";

    let text = template;
    const selections = draft.personality?.outSlotSelections || {};
    for (const [token, traitUuid] of Object.entries(selections)) {
        const name = await traitNameFromDraft(draft, traitUuid);
        if (name) text = text.replaceAll(token, name);
    }
    return text;
}

async function traitNameFromDraft(draft, traitUuid) {
    if (!traitUuid) return null;
    if (traitUuid === "__special__") {
        return String(draft.personality?.specialQualityName || "").trim() || "Special";
    }
    const pools = [
        ...(draft.background?.qualityAssignments || []),
        ...(draft.powerSource?.powerAssignments || []),
        ...(draft.archetype?.traitAssignments || [])
    ];
    const hit = pools.find(r => r.uuid === traitUuid);
    if (hit?.name) return hit.name;
    const doc = await fromUuid(traitUuid);
    return doc?.name || null;
}

/**
 * Merge duplicate traits by uuid, keeping the larger die.
 */
async function pushClonedTrait(items, dieByUuid, row, itemType, extraFlags = {}) {
    if (!row?.uuid || !row?.die) return;

    if (dieByUuid.has(row.uuid)) {
        const existing = dieByUuid.get(row.uuid);
        if (dieRank(row.die) > dieRank(existing.die)) {
            existing.die = row.die;
            items[existing.index].system.dieType = row.die;
        }
        return;
    }

    const src = await fromUuid(row.uuid);
    if (!src) {
        console.warn(`${MODULE_ID} | Missing ${itemType} ${row.uuid}`);
        return;
    }

    const dataObj = src.toObject();
    delete dataObj._id;
    delete dataObj.folder;
    dataObj.type = itemType;
    dataObj.system = dataObj.system || {};
    dataObj.system.dieType = row.die;
    dataObj.flags = dataObj.flags || {};
    dataObj.flags[MODULE_ID] = {
        ...(dataObj.flags[MODULE_ID] || {}),
        ...extraFlags,
        fromUuid: row.uuid
    };

    dieByUuid.set(row.uuid, { die: row.die, index: items.length, itemType });
    items.push(dataObj);
}

async function pushClonedAbility(items, uuid, extraFlags = {}) {
    if (!uuid) return;
    const ability = await fromUuid(uuid);
    if (!ability) {
        console.warn(`${MODULE_ID} | Missing ability ${uuid}`);
        return;
    }
    const dataObj = ability.toObject();
    delete dataObj._id;
    delete dataObj.folder;
    dataObj.flags = dataObj.flags || {};
    const { pendingOutSlots, ...flags } = extraFlags;
    dataObj.flags[MODULE_ID] = {
        ...(dataObj.flags[MODULE_ID] || {}),
        ...flags,
        fromAbilityUuid: uuid,
        selections: {},
        ...(pendingOutSlots ? { pendingOutSlots } : {})
    };
    items.push(dataObj);
}

async function pushPrincipleAbility(items, principleUuid, slot) {
    if (!principleUuid) return;
    const principle = await fromUuid(principleUuid);
    if (!principle) return;
    const meta = principle.flags?.[MODULE_ID] || {};
    const abilityUuid = meta.greenAbilityUuid || meta.greenAbility?.uuid || null;
    if (!abilityUuid) return;

    await pushClonedAbility(items, abilityUuid, {
        principleSlot: slot,
        fromPrinciple: principle.name
    });
}

/**
 * After embed, resolve Out ability slot selections to owned item ids + gameText.
 */
async function applyPendingOutSlots(actor, createdItems, draft) {
    const outItem = createdItems.find(i =>
        i.type === "ability"
        && i.flags?.[MODULE_ID]?.fromPersonality
        && i.flags?.[MODULE_ID]?.pendingOutSlots
    );
    if (!outItem) return;

    const meta = outItem.flags[MODULE_ID];
    const pending = meta.pendingOutSlots || {};
    const template = meta.gameTextTemplate || stripToPlain(outItem.system?.gameText) || "";
    const selections = {};
    let text = template;

    for (const [token, traitUuid] of Object.entries(pending)) {
        let owned = null;
        if (traitUuid === "__special__") {
            const specialName = String(draft.personality?.specialQualityName || "").trim();
            owned = actor.items.find(i =>
                i.type === "quality"
                && i.flags?.[MODULE_ID]?.specialQuality
                && i.name === specialName
            ) || actor.items.find(i => i.flags?.[MODULE_ID]?.specialQuality);
        } else {
            owned = actor.items.find(i =>
                (i.type === "power" || i.type === "quality")
                && i.flags?.[MODULE_ID]?.fromUuid === traitUuid
            );
        }
        if (owned) {
            selections[token] = owned.id;
            text = text.replaceAll(token, owned.name);
        }
    }

    const update = {
        [`flags.${MODULE_ID}.selections`]: selections,
        [`flags.${MODULE_ID}.-=pendingOutSlots`]: null
    };
    if (template) {
        update["system.gameText"] = `<p>${escapeHtml(text)}</p>`;
    }
    await outItem.update(update);

    if (text) {
        await actor.update({ "system.out": `<p>${escapeHtml(text)}</p>` });
    }
}

function stripToPlain(html) {
    return String(html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
