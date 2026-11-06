const MODULE_ID = "scrpg-actor-compendium";

Hooks.once("init", () => {
    console.log(`${MODULE_ID} | Initialising Sentinel Comics RPG compendium`);
});

/**
 * Capture drop events on SCRPG actor sheets so principle drops can detect
 * which principle column was targeted.
 */
Hooks.on("renderSCRPGCharacterSheet", (sheet, element) => {
    const root = element instanceof HTMLElement ? element : sheet.element;
    if (!root || root.dataset.scrpgCompendiumDropBound) return;
    root.dataset.scrpgCompendiumDropBound = "1";
    root.addEventListener("drop", event => {
        sheet._scrpgCompendiumDropEvent = event;
    }, true);
});

/**
 * When a principle from this module is dropped onto a principle column,
 * also create its Green ability on the actor.
 */
Hooks.on("dropActorSheetData", (actor, sheet, data) => {
    void handlePrincipleDrop(actor, sheet, data);
});

async function handlePrincipleDrop(actor, sheet, data) {
    try {
        if (!actor?.isOwner) return;
        if (actor.type !== "hero") return;
        if (data?.type !== "Item") return;

        const item = await foundry.documents.Item.fromDropData(data);
        if (item?.type !== "principles") return;

        const greenAbility = item.flags?.[MODULE_ID]?.greenAbility;
        if (!greenAbility) return;

        const event = sheet?._scrpgCompendiumDropEvent;
        const slot = principleSlotFromEvent(event);
        if (!slot) return;

        const existing = actor.items.filter(owned =>
            owned.type === "ability"
            && owned.flags?.[MODULE_ID]?.principleSlot === slot
        );
        if (existing.length) {
            await actor.deleteEmbeddedDocuments("Item", existing.map(owned => owned.id));
        }

        await actor.createEmbeddedDocuments("Item", [{
            name: greenAbility.name || item.name,
            type: "ability",
            img: item.img || "icons/svg/upgrade.svg",
            system: {
                aux: "green",
                icon: {
                    attack: !!greenAbility.icon?.attack,
                    defend: !!greenAbility.icon?.defend,
                    overcome: greenAbility.icon?.overcome !== false,
                    hinder: !!greenAbility.icon?.hinder,
                    boost: !!greenAbility.icon?.boost,
                    recover: !!greenAbility.icon?.recover
                },
                type: greenAbility.type || "A",
                gameText: greenAbility.gameText || ""
            },
            flags: {
                [MODULE_ID]: {
                    principleSlot: slot,
                    fromPrinciple: item.name
                }
            }
        }]);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to create principle Green ability`, err);
    }
}

function principleSlotFromEvent(event) {
    if (!event) return null;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
        const className = node?.className;
        if (!className || typeof className !== "string") continue;
        if (className.includes("DroppableFirstPrinciple")) return "first";
        if (className.includes("DroppableSecondPrinciple")) return "second";
    }
    return null;
}
