/**
 * Create a playable hero Actor from the wizard draft (Steps 1–8).
 * Selective ability grants only — never dump-all drop hooks.
 * Actor.create runs after Finishing (Step 8).
 */

import { dieRank, upgradeDie } from "./draftState.js";
import { applyRetconToDraft } from "./steps/retcon.js";
import { refreshHealthComputation } from "./steps/health.js";

const MODULE_ID = "scrpg-actor-compendium";

/**
 * @param {object} draft
 * @param {{name:string, alias?:string}} [identityOverride]
 * @returns {Promise<Actor>}
 */
export async function createHeroFromDraft(draft, identityOverride = null) {
    // Work on a clone so a failed create does not corrupt the live wizard draft.
    const working = foundry.utils.deepClone(draft);
    applyRetconToDraft(working);
    refreshHealthComputation(working);

    const identity = {
        ...(working.identity || {}),
        ...(identityOverride || {})
    };
    const name = String(identity?.name || "").trim() || "New Hero";
    const alias = String(identity?.alias || "").trim();

    const status = working.personality?.statusDie || {};
    const firstPrinciple = await principleSystemData(working.background?.principleUuid);
    const secondPrinciple = await principleSystemData(working.archetype?.principleUuid);
    const outText = await resolveOutText(working);
    const health = working.health || {};
    const ranges = health.ranges || {
        greenLow: 0,
        yellowHigh: 0,
        yellowLow: 0,
        redHigh: 0,
        redLow: 1
    };
    const maxHealth = Number(health.max) || 0;
    const costume = String(identity.costume || "").trim();

    const actorData = {
        name,
        type: "hero",
        system: {
            alias,
            gender: String(identity.gender || "").trim(),
            age: String(identity.age || "").trim(),
            height: String(identity.height || "").trim(),
            eyes: String(identity.eyes || "").trim(),
            hair: String(identity.hair || "").trim(),
            skin: String(identity.skin || "").trim(),
            build: String(identity.build || "").trim(),
            costume: costume ? `<p>${escapeHtml(costume)}</p>` : "",
            background: working.background?.selectedName || "",
            powerSource: working.powerSource?.selectedName || "",
            archetype: working.archetype?.selectedName || "",
            personality: working.personality?.selectedName || "",
            statusDie: {
                green: status.green || "",
                yellow: status.yellow || "",
                red: status.red || ""
            },
            out: outText ? `<p>${escapeHtml(outText)}</p>` : "",
            firstPrinciple: firstPrinciple || emptyPrinciple(),
            secondPrinciple: secondPrinciple || emptyPrinciple(),
            wounds: { value: maxHealth, max: maxHealth },
            health: {
                greenLow: ranges.greenLow || 0,
                yellowHigh: ranges.yellowHigh || 0,
                yellowLow: ranges.yellowLow || 0,
                redHigh: ranges.redHigh || 0,
                redLow: ranges.redLow ?? 1
            }
        },
        flags: {
            [MODULE_ID]: {
                wizard: {
                    method: working.method,
                    createdAt: Date.now(),
                    slice: "F",
                    backgroundUuid: working.background?.selectedUuid || null,
                    powerSourceUuid: working.powerSource?.selectedUuid || null,
                    archetypeUuid: working.archetype?.selectedUuid || null,
                    personalityUuid: working.personality?.selectedUuid || null,
                    retconOption: working.retcon?.option || null,
                    health: {
                        max: maxHealth,
                        bonusTraitUuid: working.health?.bonusTraitUuid || null,
                        varianceMode: working.health?.varianceMode || null,
                        varianceRoll: working.health?.varianceRoll || null
                    }
                }
            }
        }
    };

    const actor = await Actor.create(actorData);
    if (!actor) throw new Error("Actor.create returned null");

    const items = [];
    const dieByUuid = new Map();

    for (const row of working.background?.qualityAssignments || []) {
        await pushClonedTrait(items, dieByUuid, row, "quality", {
            fromBackground: working.background?.selectedName
        });
    }

    for (const row of working.powerSource?.powerAssignments || []) {
        await pushClonedTrait(items, dieByUuid, row, "power", {
            fromPowerSource: working.powerSource?.selectedName
        });
    }

    for (const row of working.archetype?.traitAssignments || []) {
        const itemType = row.itemType === "quality" ? "quality" : "power";
        await pushClonedTrait(items, dieByUuid, row, itemType, {
            fromArchetype: working.archetype?.selectedName
        });
    }

    const specialName = String(working.personality?.specialQualityName || "").trim();
    if (specialName) {
        items.push({
            name: specialName,
            type: "quality",
            img: "icons/svg/aura.svg",
            system: {
                dieType: working.personality?.specialQualityDie || "d8",
                selected: false,
                description: "<p>Special roleplaying quality (Personality).</p>"
            },
            flags: {
                [MODULE_ID]: {
                    specialQuality: true,
                    fromPersonality: working.personality?.selectedName || null
                }
            }
        });
    }

    const upgradeUuid = working.personality?.upgradeTraitUuid;
    if (upgradeUuid && dieByUuid.has(upgradeUuid)) {
        const entry = dieByUuid.get(upgradeUuid);
        entry.die = upgradeDie(entry.die);
        if (items[entry.index]) {
            items[entry.index].system.dieType = entry.die;
        }
    }

    for (const uuids of Object.values(working.powerSource?.abilitySelections || {})) {
        for (const uuid of uuids || []) {
            await pushClonedAbility(items, uuid, {
                fromPowerSource: working.powerSource?.selectedName,
                pendingAbilitySlots: {
                    ...(working.powerSource?.abilitySlotSelections?.[uuid] || {})
                }
            });
        }
    }

    for (const uuids of Object.values(working.archetype?.abilitySelections || {})) {
        for (const uuid of uuids || []) {
            await pushClonedAbility(items, uuid, {
                fromArchetype: working.archetype?.selectedName,
                pendingAbilitySlots: {
                    ...(working.archetype?.abilitySlotSelections?.[uuid] || {})
                }
            });
        }
    }

    await pushPrincipleAbility(items, working.background?.principleUuid, "first");
    await pushPrincipleAbility(items, working.archetype?.principleUuid, "second");

    for (const uuid of working.red?.abilityUuids || []) {
        await pushClonedAbility(items, uuid, {
            fromRedAbilities: true,
            pendingAbilitySlots: { ...(working.red?.slotSelections?.[uuid] || {}) }
        });
    }

    if (working.retcon?.option === "extraRed" && working.retcon.extraRedUuid) {
        await pushClonedAbility(items, working.retcon.extraRedUuid, {
            fromRedAbilities: true,
            fromRetcon: "extraRed",
            pendingAbilitySlots: { ...(working.retcon.extraRedSlotSelections || {}) }
        });
    }

    const outAbilityUuid = working.personality?.outAbilityUuid;
    if (outAbilityUuid) {
        const pendingOutSlots = { ...(working.personality?.outSlotSelections || {}) };
        if (
            working.retcon?.option === "rebindAbility"
            && working.retcon.rebindAbilityUuid === outAbilityUuid
            && working.retcon.rebindToken
            && working.retcon.rebindTraitUuid
        ) {
            pendingOutSlots[working.retcon.rebindToken] = working.retcon.rebindTraitUuid;
        }
        await pushClonedAbility(items, outAbilityUuid, {
            fromPersonality: working.personality?.selectedName,
            pendingOutSlots
        });
    }

    if (
        working.retcon?.option === "rebindAbility"
        && working.retcon.rebindAbilityUuid
        && working.retcon.rebindToken
        && working.retcon.rebindTraitUuid
    ) {
        const target = items.find(i =>
            i.type === "ability"
            && i.flags?.[MODULE_ID]?.fromAbilityUuid === working.retcon.rebindAbilityUuid
        );
        if (target) {
            const meta = target.flags[MODULE_ID];
            meta.pendingAbilitySlots = {
                ...(meta.pendingAbilitySlots || {}),
                [working.retcon.rebindToken]: working.retcon.rebindTraitUuid
            };
        }
    }

    if (items.length) {
        const created = await actor.createEmbeddedDocuments("Item", items);
        await applyPendingOutSlots(actor, created, working);
        await applyPendingAbilitySlots(actor, created, working);
    }

    return actor;
}

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
    if (!uuid) return "";
    const ability = await fromUuid(uuid);
    const template = ability?.flags?.[MODULE_ID]?.gameTextTemplate
        || stripToPlain(ability?.system?.gameText)
        || "";
    if (!template) return "";

    let text = template;
    const selections = { ...(draft.personality?.outSlotSelections || {}) };
    if (
        draft.retcon?.option === "rebindAbility"
        && draft.retcon.rebindAbilityUuid === uuid
        && draft.retcon.rebindToken
        && draft.retcon.rebindTraitUuid
    ) {
        selections[draft.retcon.rebindToken] = draft.retcon.rebindTraitUuid;
    }
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
    const { pendingOutSlots, pendingAbilitySlots, ...flags } = extraFlags;
    dataObj.flags[MODULE_ID] = {
        ...(dataObj.flags[MODULE_ID] || {}),
        ...flags,
        fromAbilityUuid: uuid,
        selections: {},
        ...(pendingOutSlots ? { pendingOutSlots } : {}),
        ...(pendingAbilitySlots ? { pendingAbilitySlots } : {})
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
        const owned = resolveOwnedTrait(actor, draft, traitUuid);
        if (owned) {
            selections[token] = owned.id;
            text = text.replaceAll(token, owned.name);
        }
    }

    const update = {
        [`flags.${MODULE_ID}.selections`]: selections,
        [`flags.${MODULE_ID}.pendingOutSlots`]: foundry.data.operators.ForcedDeletion
    };
    if (template) {
        update["system.gameText"] = `<p>${escapeHtml(text)}</p>`;
    }
    await outItem.update(update);

    if (text) {
        await actor.update({ "system.out": `<p>${escapeHtml(text)}</p>` });
    }
}

async function applyPendingAbilitySlots(actor, createdItems, draft) {
    const targets = createdItems.filter(i =>
        i.type === "ability" && i.flags?.[MODULE_ID]?.pendingAbilitySlots
    );
    for (const item of targets) {
        const meta = item.flags[MODULE_ID];
        const pending = meta.pendingAbilitySlots || {};
        const template = meta.gameTextTemplate || stripToPlain(item.system?.gameText) || "";
        const selections = { ...(meta.selections || {}) };
        let text = template;

        for (const [token, traitUuid] of Object.entries(pending)) {
            const owned = resolveOwnedTrait(actor, draft, traitUuid);
            if (owned) {
                selections[token] = owned.id;
                text = text.replaceAll(token, owned.name);
            }
        }

        const update = {
            [`flags.${MODULE_ID}.selections`]: selections,
            [`flags.${MODULE_ID}.pendingAbilitySlots`]: foundry.data.operators.ForcedDeletion
        };
        if (template) {
            update["system.gameText"] = `<p>${escapeHtml(text)}</p>`;
        }
        await item.update(update);
    }
}

function resolveOwnedTrait(actor, draft, traitUuid) {
    if (!traitUuid) return null;
    if (traitUuid === "__special__") {
        const specialName = String(draft.personality?.specialQualityName || "").trim();
        return actor.items.find(i =>
            i.type === "quality"
            && i.flags?.[MODULE_ID]?.specialQuality
            && i.name === specialName
        ) || actor.items.find(i => i.flags?.[MODULE_ID]?.specialQuality) || null;
    }
    return actor.items.find(i =>
        (i.type === "power" || i.type === "quality")
        && i.flags?.[MODULE_ID]?.fromUuid === traitUuid
    ) || null;
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
