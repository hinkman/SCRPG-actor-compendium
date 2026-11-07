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
 * including when browsing the compendium. Also inject power/quality slot pickers
 * for abilities that use bracket placeholders.
 */
Hooks.on("renderSCRPGItemSheet", (sheet, element) => {
    void renderPrincipleGreenAbility(sheet, element);
    void renderAbilitySlotPickers(sheet, element);
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
 * On actor-owned abilities from this module, show dropdowns for [power]/[quality]
 * (and similar) placeholders so the chosen trait fills the game text.
 */
async function renderAbilitySlotPickers(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "ability") return;

        const meta = item.flags?.[MODULE_ID];
        const slots = meta?.slots;
        if (!Array.isArray(slots) || !slots.length) return;

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        const host = root.querySelector(".ability-content") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-ability-slots")?.remove();

        const actor = item.actor;
        const section = document.createElement("div");
        section.className = "scrpg-compendium-ability-slots";

        if (!actor) {
            section.innerHTML = `
                <h4>Linked Traits</h4>
                <p class="hint">Drop this ability onto a hero to choose which power or quality fills each placeholder.</p>
                <ul>${slots.map(slot => `<li><code>${escapeHtml(slot.token)}</code></li>`).join("")}</ul>
            `;
            host.append(section);
            return;
        }

        const selections = meta.selections || {};
        const rows = slots.map(slot => {
            const options = matchingActorItems(actor, slot);
            const selectedId = selections[slot.token] || "";
            const optionHtml = [
                `<option value="">${escapeHtml(slot.token)}</option>`,
                ...options.map(opt => {
                    const selected = opt.id === selectedId ? " selected" : "";
                    return `<option value="${escapeHtml(opt.id)}"${selected}>${escapeHtml(opt.name)}</option>`;
                })
            ].join("");
            return `
                <label class="scrpg-compendium-ability-slot">
                    <span class="label">${escapeHtml(slotLabel(slot))}</span>
                    <select data-slot-token="${escapeHtml(slot.token)}">${optionHtml}</select>
                </label>
            `;
        }).join("");

        section.innerHTML = `<h4>Linked Traits</h4><div class="scrpg-compendium-ability-slot-list">${rows}</div>`;
        host.append(section);

        section.querySelectorAll("select[data-slot-token]").forEach(select => {
            select.addEventListener("change", async event => {
                const token = event.currentTarget.dataset.slotToken;
                const chosenId = event.currentTarget.value || null;
                await applyAbilitySlotSelection(item, token, chosenId);
            });
        });
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to render ability slot pickers`, err);
    }
}

function slotLabel(slot) {
    if (slot.itemType === "power") return "Power";
    if (slot.itemType === "quality") return "Quality";
    return slot.token;
}

function matchingActorItems(actor, slot) {
    const itemType = slot.itemType;
    if (!itemType) return [];

    let items = actor.items.filter(owned => owned.type === itemType);
    const categories = Array.isArray(slot.categories)
        ? slot.categories
        : (slot.category ? [slot.category] : null);

    if (categories?.length) {
        const categorized = items.filter(owned => {
            const category = owned.flags?.[MODULE_ID]?.category;
            return category && categories.includes(category);
        });
        if (categorized.length) items = categorized;
    }

    if (Array.isArray(slot.names) && slot.names.length) {
        const named = items.filter(owned => slot.names.includes(owned.name));
        if (named.length) items = named;
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function applyAbilitySlotSelection(item, token, chosenId) {
    const meta = item.flags?.[MODULE_ID] || {};
    const template = meta.gameTextTemplate;
    if (!template) return;

    const selections = { ...(meta.selections || {}) };
    if (chosenId) selections[token] = chosenId;
    else delete selections[token];

    let text = template;
    for (const slot of meta.slots || []) {
        const selectedId = selections[slot.token];
        const chosen = selectedId ? item.actor?.items.get(selectedId) : null;
        if (chosen) text = text.replaceAll(slot.token, chosen.name);
    }

    await item.update({
        "system.gameText": `<p>${escapeHtml(text)}</p>`,
        [`flags.${MODULE_ID}.selections`]: selections
    });
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
