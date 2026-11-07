const MODULE_ID = "scrpg-actor-compendium";

const ACTION_ICONS = {
    attack: { title: "Attack", cls: "fas fa-hand-rock" },
    defend: { title: "Defend", cls: "fas fa-shield-alt" },
    overcome: { title: "Overcome", cls: "fas fa-share" },
    hinder: { title: "Hinder", cls: "fas fa-angle-double-down" },
    boost: { title: "Boost", cls: "fas fa-angle-double-up" },
    recover: { title: "Recover", cls: "fas fa-plus-square" }
};

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
 * Show each principle's Green ability (type, icons, game text) on the item sheet,
 * including when browsing the compendium.
 */
Hooks.on("renderSCRPGItemSheet", (sheet, element) => {
    void renderPrincipleGreenAbility(sheet, element);
});

async function renderPrincipleGreenAbility(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "principles") return;

        const greenAbility = item.flags?.[MODULE_ID]?.greenAbility;
        if (!greenAbility?.gameText) return;

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        const host = root.querySelector(".principle") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-green-ability")?.remove();

        const typeKey = greenAbility.type || "A";
        const typeLabel = CONFIG.SCRPG?.abilityType?.[typeKey]?.desc
            ? game.i18n.localize(CONFIG.SCRPG.abilityType[typeKey].desc)
            : typeKey;
        const typeTooltip = CONFIG.SCRPG?.abilityType?.[typeKey]?.tooltip
            ? game.i18n.localize(CONFIG.SCRPG.abilityType[typeKey].tooltip)
            : "";

        const icon = greenAbility.icon || {};
        const iconHtml = Object.entries(ACTION_ICONS)
            .filter(([key]) => icon[key])
            .map(([, meta]) => `<i class="${meta.cls}" title="${meta.title}"></i>`)
            .join("");

        const TextEditor = foundry.applications.ux.TextEditor.implementation;
        const enriched = await TextEditor.enrichHTML(greenAbility.gameText ?? "", {
            secrets: item.isOwner,
            relativeTo: item
        });

        const section = document.createElement("div");
        section.className = "scrpg-compendium-green-ability";
        section.innerHTML = `
            <h4 class="principle-section">Green Ability</h4>
            <div class="scrpg-compendium-green-ability-meta">
                <div><span class="label">Name</span> ${escapeHtml(greenAbility.name || item.name)}</div>
                <div title="${escapeHtml(typeTooltip)}"><span class="label">Type</span> ${escapeHtml(typeLabel)}</div>
                ${iconHtml ? `<div class="scrpg-compendium-green-ability-icons"><span class="label">Icon</span> ${iconHtml}</div>` : ""}
            </div>
            <div class="scrpg-compendium-green-ability-text">${enriched}</div>
        `;
        host.append(section);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to render principle Green ability`, err);
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

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
