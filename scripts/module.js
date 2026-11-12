import { escapeHtml, fillAbilityGameTextHtml } from "./abilityFill.js";
import * as categoryResolver from "./categoryResolver.js";
import { promptAndGrantSelectedAbilities } from "./selectiveAbilityDrop.js";
import * as apply from "./wizard/apply.js";
import * as chartRoll from "./wizard/chartRoll.js";
import { canCreateScrpgHero, openCreateWizard } from "./wizard/openWizard.js";
import * as silentRoll from "./wizard/silentRoll.js";

const MODULE_ID = "scrpg-actor-compendium";
const { loadTemplates } = foundry.applications.handlebars;

const WIZARD_TEMPLATES = [
    `modules/${MODULE_ID}/templates/wizard/wizard.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/method.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/background.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/backgroundDetails.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/powerSource.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/powerSourceDetails.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/archetype.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/archetypeDetails.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/personality.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/personalityDetails.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/redAbilities.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/retcon.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/health.hbs`,
    `modules/${MODULE_ID}/templates/wizard/steps/finishing.hbs`
];

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
    loadTemplates(WIZARD_TEMPLATES);
});

Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
        mod.api = {
            ...(mod.api || {}),
            categoryResolver,
            chartRoll,
            silentRoll,
            apply,
            promptAndGrantSelectedAbilities,
            openCreateWizard,
            canCreateScrpgHero
        };
    }
});

/**
 * Actors Directory entry: "Create SCRPG Hero…"
 * Visible only for scrpg-foundry + users who can create hero Actors.
 */
Hooks.on("renderActorDirectory", (app, html) => {
    try {
        if (!canCreateScrpgHero()) return;

        const root = html instanceof HTMLElement
            ? html
            : (html?.[0] instanceof HTMLElement ? html[0] : app?.element);
        if (!(root instanceof HTMLElement)) return;
        if (root.querySelector("#scrpg-create-hero-btn")) return;

        const footer =
            root.querySelector(".directory-footer")
            || root.querySelector("footer.directory-footer")
            || root.querySelector(".action-buttons")
            || root.querySelector("footer")
            || null;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "scrpg-create-hero-btn";
        btn.className = "scrpg-create-hero-btn";
        btn.innerHTML = `<i class="fas fa-mask"></i> Create SCRPG Hero…`;
        btn.addEventListener("click", event => {
            event.preventDefault();
            void openCreateWizard();
        });

        if (footer) footer.prepend(btn);
        else root.append(btn);
    } catch (err) {
        console.warn(`${MODULE_ID} | Failed to inject Actors Directory wizard button`, err);
    }
});

/**
 * Preferred path: scrpg-foundry fires these after a successful sheet drop.
 * Create linked abilities from the resolved Item document.
 */
Hooks.on("scrpgDropPrinciple", (actor, item, slot) => {
    void createPrincipleAbility(actor, item, slot);
});
Hooks.on("scrpgDropPersonality", (actor, item) => {
    void createPersonalityAbility(actor, item);
});
Hooks.on("scrpgDropArchetype", (actor, item) => {
    void promptAndGrantSelectedAbilities(actor, item, "fromArchetype");
});
Hooks.on("scrpgDropPowerSource", (actor, item) => {
    void promptAndGrantSelectedAbilities(actor, item, "fromPowerSource");
});

/**
 * Show linked abilities on principle/personality sheets, and inject
 * power/quality slot pickers for abilities that use bracket placeholders.
 */
Hooks.on("renderSCRPGItemSheet", (sheet, element) => {
    void renderPrincipleGreenAbility(sheet, element);
    void renderPersonalityOutAbility(sheet, element);
    void renderArchetypeAbilities(sheet, element);
    void renderPowerSourceExtras(sheet, element);
    void renderBackgroundExtras(sheet, element);
    void renderAbilitySlotPickers(sheet, element);
});

async function renderPrincipleGreenAbility(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "principles") return;

        const uuid = principleGreenAbilityUuid(item);
        if (!uuid) return;

        const ability = await fromUuid(uuid);
        if (!ability) {
            console.warn(`${MODULE_ID} | Missing linked Green ability ${uuid}`);
            return;
        }

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        const host = root.querySelector(".principle") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-green-ability")?.remove();

        const typeKey = ability.system?.type || "A";
        const typeLabel = CONFIG.SCRPG?.abilityType?.[typeKey]?.desc
            ? game.i18n.localize(CONFIG.SCRPG.abilityType[typeKey].desc)
            : typeKey;
        const typeTooltip = CONFIG.SCRPG?.abilityType?.[typeKey]?.tooltip
            ? game.i18n.localize(CONFIG.SCRPG.abilityType[typeKey].tooltip)
            : "";

        const icon = ability.system?.icon || {};
        const iconHtml = Object.entries(ACTION_ICONS)
            .filter(([key]) => icon[key])
            .map(([, meta]) => `<i class="${meta.cls}" title="${meta.title}"></i>`)
            .join("");

        const TextEditor = foundry.applications.ux.TextEditor.implementation;
        const linkHtml = await TextEditor.enrichHTML(`@UUID[${uuid}]{${ability.name}}`, {
            secrets: item.isOwner,
            relativeTo: item
        });
        const enriched = await TextEditor.enrichHTML(ability.system?.gameText ?? "", {
            secrets: item.isOwner,
            relativeTo: ability
        });

        const section = document.createElement("div");
        section.className = "scrpg-compendium-green-ability";
        section.innerHTML = `
            <h4 class="principle-section">Green Ability</h4>
            <div class="scrpg-compendium-green-ability-meta">
                <div><span class="label">Name</span> ${linkHtml}</div>
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

function principleGreenAbilityUuid(item) {
    const meta = item.flags?.[MODULE_ID];
    return meta?.greenAbilityUuid || meta?.greenAbility?.uuid || null;
}

function personalityOutAbilityUuid(item) {
    const meta = item.flags?.[MODULE_ID];
    return meta?.outAbilityUuid || meta?.outAbility?.uuid || null;
}

async function renderPersonalityOutAbility(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "personality") return;

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        const host = root.querySelector(".personality") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-personality-meta")?.remove();
        host.querySelector(".scrpg-compendium-out-ability")?.remove();

        const number = item.flags?.[MODULE_ID]?.number;
        if (number) {
            const meta = document.createElement("div");
            meta.className = "scrpg-compendium-personality-meta";
            meta.innerHTML = `<span class="label">Number</span> ${escapeHtml(String(number))}`;
            host.prepend(meta);
        }

        const uuid = personalityOutAbilityUuid(item);
        if (!uuid) return;

        const ability = await fromUuid(uuid);
        if (!ability) {
            console.warn(`${MODULE_ID} | Missing linked Out ability ${uuid}`);
            return;
        }

        const icon = ability.system?.icon || {};
        const iconHtml = Object.entries(ACTION_ICONS)
            .filter(([key]) => icon[key])
            .map(([, meta]) => `<i class="${meta.cls}" title="${meta.title}"></i>`)
            .join("");

        const TextEditor = foundry.applications.ux.TextEditor.implementation;
        const linkHtml = await TextEditor.enrichHTML(`@UUID[${uuid}]{${ability.name}}`, {
            secrets: item.isOwner,
            relativeTo: item
        });
        const enriched = await TextEditor.enrichHTML(ability.system?.gameText ?? "", {
            secrets: item.isOwner,
            relativeTo: ability
        });

        const section = document.createElement("div");
        section.className = "scrpg-compendium-out-ability";
        section.innerHTML = `
            <h4>Out Ability</h4>
            <div class="scrpg-compendium-green-ability-meta">
                <div><span class="label">Name</span> ${linkHtml}</div>
                ${iconHtml ? `<div class="scrpg-compendium-green-ability-icons"><span class="label">Icon</span> ${iconHtml}</div>` : ""}
            </div>
            <div class="scrpg-compendium-green-ability-text">${enriched}</div>
        `;
        host.append(section);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to render personality Out ability`, err);
    }
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

        const wizardLocked = Boolean(actor.getFlag?.(MODULE_ID, "wizardLocked")
            ?? actor.flags?.[MODULE_ID]?.wizardLocked);
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
            const disabled = wizardLocked ? " disabled" : "";
            return `
                <label class="scrpg-compendium-ability-slot">
                    <span class="label">${escapeHtml(slotLabel(slot))}</span>
                    <select data-slot-token="${escapeHtml(slot.token)}"${disabled}>${optionHtml}</select>
                </label>
            `;
        }).join("");

        section.innerHTML = `<h4>Linked Traits</h4><div class="scrpg-compendium-ability-slot-list">${rows}</div>`;
        host.append(section);

        if (wizardLocked) return;

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
    const types = Array.isArray(slot.itemTypes)
        ? slot.itemTypes
        : (slot.itemType ? [slot.itemType] : []);
    if (types.length === 2 && types.includes("power") && types.includes("quality")) {
        return "Power/Quality";
    }
    if (types[0] === "power") return "Power";
    if (types[0] === "quality") return "Quality";
    return slot.token;
}

function matchingActorItems(actor, slot) {
    const types = Array.isArray(slot.itemTypes)
        ? slot.itemTypes
        : (slot.itemType ? [slot.itemType] : []);
    if (!types.length) return [];

    let items = actor.items.filter(owned => types.includes(owned.type));
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

    /** @type {Record<string, string>} */
    const tokenToName = {};
    for (const slot of meta.slots || []) {
        const selectedId = selections[slot.token];
        const chosen = selectedId ? item.actor?.items.get(selectedId) : null;
        if (chosen) tokenToName[slot.token] = chosen.name;
    }

    await item.update({
        "system.gameText": fillAbilityGameTextHtml(template, tokenToName),
        [`flags.${MODULE_ID}.selections`]: selections
    });
}

async function renderArchetypeAbilities(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "archetypes") return;

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        // Default item sheets are 480px tall; give archetypes more room once.
        if (!sheet._scrpgArchetypeSized && typeof sheet.setPosition === "function") {
            sheet._scrpgArchetypeSized = true;
            const height = sheet.position?.height ?? 0;
            const width = sheet.position?.width ?? 0;
            if (height <= 480 || width <= 520) {
                sheet.setPosition({
                    width: Math.max(width, 560),
                    height: Math.max(height, 640)
                });
            }
        }

        const host = root.querySelector(".archetype") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-archetype-meta")?.remove();
        host.querySelector(".scrpg-compendium-archetype-abilities")?.remove();

        const meta = item.flags?.[MODULE_ID] || {};
        if (meta.number) {
            const numberEl = document.createElement("div");
            numberEl.className = "scrpg-compendium-archetype-meta";
            numberEl.innerHTML = `<span class="label">Number</span> ${escapeHtml(String(meta.number))}`;
            host.prepend(numberEl);
        }

        // Ability UUID links live inline in system.description under their grant text.
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to render archetype sheet extras`, err);
    }
}

async function renderPowerSourceExtras(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "powerSources") return;

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        if (!sheet._scrpgPowerSourceSized && typeof sheet.setPosition === "function") {
            sheet._scrpgPowerSourceSized = true;
            const height = sheet.position?.height ?? 0;
            const width = sheet.position?.width ?? 0;
            if (height <= 480 || width <= 520) {
                sheet.setPosition({
                    width: Math.max(width, 560),
                    height: Math.max(height, 640)
                });
            }
        }

        const host = root.querySelector(".power-source") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-archetype-meta")?.remove();

        const meta = item.flags?.[MODULE_ID] || {};
        if (meta.number) {
            const numberEl = document.createElement("div");
            numberEl.className = "scrpg-compendium-archetype-meta";
            numberEl.innerHTML = `<span class="label">Number</span> ${escapeHtml(String(meta.number))}`;
            host.prepend(numberEl);
        }
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to render power source sheet extras`, err);
    }
}

async function renderBackgroundExtras(sheet, element) {
    try {
        const item = sheet.document ?? sheet.item;
        if (!item || item.type !== "backgrounds") return;

        const root = element instanceof HTMLElement ? element : sheet.element;
        if (!root) return;

        // Backgrounds are short (flavor + qualities); prefer a tall narrow frame so
        // default entries like Unremarkable do not need an outer scrollbar.
        if (!sheet._scrpgBackgroundSized && typeof sheet.setPosition === "function") {
            sheet._scrpgBackgroundSized = true;
            sheet.setPosition({ width: 420, height: 640 });
        }

        const host = root.querySelector(".background") || root.querySelector(".sheet-content") || root;
        host.querySelector(".scrpg-compendium-archetype-meta")?.remove();

        const meta = item.flags?.[MODULE_ID] || {};
        if (meta.number) {
            const numberEl = document.createElement("div");
            numberEl.className = "scrpg-compendium-archetype-meta";
            numberEl.innerHTML = `<span class="label">Number</span> ${escapeHtml(String(meta.number))}`;
            host.prepend(numberEl);
        }
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to render background sheet extras`, err);
    }
}

async function createPersonalityAbility(actor, item) {
    try {
        if (!actor?.isOwner) return;
        if (actor.type !== "hero") return;
        if (item?.type !== "personality") return;

        const uuid = personalityOutAbilityUuid(item);
        if (!uuid) return;

        const ability = await fromUuid(uuid);
        if (!ability) {
            console.warn(`${MODULE_ID} | Missing linked Out ability ${uuid}`);
            return;
        }

        const existing = actor.items.filter(owned =>
            owned.type === "ability"
            && owned.flags?.[MODULE_ID]?.fromPersonality
        );
        if (existing.length) {
            await actor.deleteEmbeddedDocuments("Item", existing.map(owned => owned.id));
        }

        const created = ability.toObject();
        delete created._id;
        delete created.folder;
        created.flags = created.flags || {};
        created.flags[MODULE_ID] = {
            ...(created.flags[MODULE_ID] || {}),
            fromPersonality: item.name,
            fromAbilityUuid: uuid,
            selections: {}
        };

        await actor.createEmbeddedDocuments("Item", [created]);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to create personality Out ability`, err);
    }
}

async function createPrincipleAbility(actor, item, slot) {
    try {
        if (!actor?.isOwner) return;
        if (actor.type !== "hero") return;
        if (item?.type !== "principles") return;
        if (!slot) return;

        const uuid = principleGreenAbilityUuid(item);
        if (!uuid) return;

        const ability = await fromUuid(uuid);
        if (!ability) {
            console.warn(`${MODULE_ID} | Missing linked Green ability ${uuid}`);
            return;
        }

        const existing = actor.items.filter(owned =>
            owned.type === "ability"
            && owned.flags?.[MODULE_ID]?.principleSlot === slot
        );
        if (existing.length) {
            await actor.deleteEmbeddedDocuments("Item", existing.map(owned => owned.id));
        }

        const created = ability.toObject();
        delete created._id;
        delete created.folder;
        created.flags = created.flags || {};
        created.flags[MODULE_ID] = {
            ...(created.flags[MODULE_ID] || {}),
            principleSlot: slot,
            fromPrinciple: item.name,
            fromAbilityUuid: uuid,
            selections: {}
        };

        await actor.createEmbeddedDocuments("Item", [created]);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to create principle Green ability`, err);
    }
}
