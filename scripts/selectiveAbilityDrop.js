/**
 * Manual sheet drops for archetype / power source: prompt for abilityPicks
 * (same selective grants as the wizard). Never dump-all linked abilities.
 */

const MODULE_ID = "scrpg-actor-compendium";

/**
 * @param {Actor} actor
 * @param {Item} item  dropped archetypes | powerSources document
 * @param {"fromArchetype"|"fromPowerSource"} sourceFlag
 */
export async function promptAndGrantSelectedAbilities(actor, item, sourceFlag) {
    try {
        if (!actor?.isOwner) return;
        if (actor.type !== "hero") return;
        if (!item) return;

        const expectedType = sourceFlag === "fromArchetype" ? "archetypes" : "powerSources";
        if (item.type !== expectedType) return;

        const meta = item.flags?.[MODULE_ID] || {};
        const wizard = meta.wizard || {};
        const picks = Array.isArray(wizard.abilityPicks) ? wizard.abilityPicks : [];

        if (!picks.length) {
            ui.notifications?.warn(
                `${item.name}: no abilityPicks metadata — abilities were not auto-granted (selective drops only).`
            );
            return;
        }

        const groups = picks.map((group, index) => normalizePickGroup(group, index));
        const needsPrompt = groups.some(g => !g.autoGranted && g.count > 0);

        let selectionsByGroup;
        if (needsPrompt) {
            selectionsByGroup = await openAbilityPickDialog(item, groups);
            if (!selectionsByGroup) return; // cancelled
        } else {
            selectionsByGroup = Object.fromEntries(
                groups.map(g => [String(g.index), g.abilities.map(a => a.uuid)])
            );
        }

        const selectedUuids = [];
        for (const group of groups) {
            const chosen = selectionsByGroup[String(group.index)] || [];
            for (const uuid of chosen) {
                if (uuid && !selectedUuids.includes(uuid)) selectedUuids.push(uuid);
            }
        }

        await replaceSourceAbilities(actor, item, sourceFlag, selectedUuids);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed selective ability drop`, err);
        ui.notifications?.error(`Failed to grant abilities from ${item?.name || "item"}.`);
    }
}

function normalizePickGroup(group, index) {
    const abilities = (group.abilities || [])
        .map(a => ({
            uuid: a.uuid,
            name: a.name || "Ability",
            color: a.color || group.color || null
        }))
        .filter(a => a.uuid);

    const autoGranted = Boolean(group.autoGranted);
    const count = autoGranted
        ? abilities.length
        : Math.max(0, Number(group.count) || 0);

    return {
        index,
        color: group.color || "ability",
        title: `${capitalize(group.color || "Ability")} abilities`,
        grantText: group.grantText || null,
        constraintNote: constraintNote(group.constraint),
        autoGranted,
        count,
        abilities
    };
}

class SelectiveAbilityDialog extends foundry.applications.api.DialogV2 {
    /** @override */
    _onRender(context, options) {
        super._onRender?.(context, options);
        bindPickLimits(this);
    }
}

/**
 * @returns {Promise<Record<string, string[]>|null>}
 */
async function openAbilityPickDialog(item, groups) {
    const content = buildDialogHtml(item, groups);

    const result = await SelectiveAbilityDialog.wait({
        window: {
            title: `Choose abilities — ${item.name}`,
            icon: "fas fa-hand-fist"
        },
        content,
        modal: true,
        rejectClose: false,
        classes: ["scrpg-ability-pick-dialog"],
        position: { width: 480 },
        buttons: [
            {
                action: "grant",
                label: "Grant Selected",
                icon: "fas fa-check",
                default: true,
                callback: (_event, _button, dialog) => collectSelections(dialog, groups)
            },
            {
                action: "cancel",
                label: "Skip Abilities",
                icon: "fas fa-times"
            }
        ]
    });

    if (result == null || result === "cancel") return null;
    if (result === false) return null;
    return result;
}

function buildDialogHtml(item, groups) {
    const sections = groups.map(group => {
        if (group.autoGranted) {
            const list = group.abilities
                .map(a => `<li>${escapeHtml(a.name)}</li>`)
                .join("");
            return `
                <section class="scrpg-ability-pick-group" data-group-index="${group.index}" data-auto-granted="true">
                    <h3>${escapeHtml(group.title)}</h3>
                    ${group.grantText ? `<p class="hint">${escapeHtml(group.grantText)}</p>` : ""}
                    <p class="hint">Auto-granted by this ${escapeHtml(item.type === "archetypes" ? "archetype" : "power source")}.</p>
                    <ul class="scrpg-ability-pick-auto">${list}</ul>
                </section>
            `;
        }

        const options = group.abilities.map(a => `
            <label class="scrpg-ability-pick-option">
                <input type="checkbox" name="abilityPick.${group.index}" value="${escapeHtml(a.uuid)}">
                <span class="scrpg-ability-pick-name">${escapeHtml(a.name)}</span>
                ${group.color ? `<span class="scrpg-ability-pick-color">${escapeHtml(group.color)}</span>` : ""}
            </label>
        `).join("");

        return `
            <section
                class="scrpg-ability-pick-group"
                data-group-index="${group.index}"
                data-count="${group.count}"
            >
                <h3>${escapeHtml(group.title)}</h3>
                ${group.grantText ? `<p class="hint">${escapeHtml(group.grantText)}</p>` : ""}
                ${group.constraintNote ? `<p class="hint">${escapeHtml(group.constraintNote)}</p>` : ""}
                <div class="scrpg-ability-pick-list">${options}</div>
                <p class="scrpg-ability-pick-count">Selected <span data-selected-count>0</span> / ${group.count}</p>
            </section>
        `;
    }).join("");

    return `
        <form class="scrpg-ability-pick-form">
            <p class="hint">
                Grant <strong>${escapeHtml(item.name)}</strong> abilities selectively
                (same counts as character creation — not dump-all).
            </p>
            ${sections}
        </form>
    `;
}

function bindPickLimits(dialog) {
    const root = dialog?.element ?? dialog;
    if (!(root instanceof HTMLElement)) return;

    root.querySelectorAll(".scrpg-ability-pick-group:not([data-auto-granted])").forEach(section => {
        const need = Number(section.dataset.count) || 0;
        const boxes = [...section.querySelectorAll('input[type="checkbox"]')];
        const countEl = section.querySelector("[data-selected-count]");

        const refresh = () => {
            const selected = boxes.filter(b => b.checked);
            if (countEl) countEl.textContent = String(selected.length);
            const atLimit = selected.length >= need;
            boxes.forEach(box => {
                const label = box.closest(".scrpg-ability-pick-option");
                box.disabled = atLimit && !box.checked;
                label?.classList.toggle("is-selected", box.checked);
                label?.classList.toggle("is-disabled", box.disabled);
            });
        };

        boxes.forEach(box => box.addEventListener("change", refresh));
        refresh();
    });
}

/**
 * @returns {Record<string, string[]>|false}
 */
function collectSelections(dialog, groups) {
    const root = dialog?.element ?? dialog;
    if (!(root instanceof HTMLElement)) return false;

    const form = root.querySelector("form.scrpg-ability-pick-form") || root;
    const out = {};

    for (const group of groups) {
        if (group.autoGranted) {
            out[String(group.index)] = group.abilities.map(a => a.uuid);
            continue;
        }

        const checked = [...form.querySelectorAll(
            `input[name="abilityPick.${group.index}"]:checked`
        )].map(el => el.value).filter(Boolean);

        if (checked.length !== group.count) {
            ui.notifications?.warn(
                `Select exactly ${group.count} for ${group.title} (currently ${checked.length}).`
            );
            return false;
        }
        if (new Set(checked).size !== checked.length) {
            ui.notifications?.warn(`Duplicate picks in ${group.title}.`);
            return false;
        }
        out[String(group.index)] = checked;
    }

    return out;
}

async function replaceSourceAbilities(actor, item, sourceFlag, uuids) {
    const existing = actor.items.filter(owned =>
        owned.type === "ability"
        && owned.flags?.[MODULE_ID]?.[sourceFlag]
    );
    if (existing.length) {
        await actor.deleteEmbeddedDocuments("Item", existing.map(owned => owned.id));
    }

    if (!uuids.length) return;

    const created = [];
    for (const uuid of uuids) {
        const ability = await fromUuid(uuid);
        if (!ability) {
            console.warn(`${MODULE_ID} | Missing linked ability ${uuid}`);
            continue;
        }
        const dataObj = ability.toObject();
        delete dataObj._id;
        delete dataObj.folder;
        dataObj.flags = dataObj.flags || {};
        dataObj.flags[MODULE_ID] = {
            ...(dataObj.flags[MODULE_ID] || {}),
            [sourceFlag]: item.name,
            fromAbilityUuid: uuid,
            selections: {}
        };
        created.push(dataObj);
    }

    if (created.length) {
        await actor.createEmbeddedDocuments("Item", created);
        ui.notifications?.info(
            `Granted ${created.length} abilit${created.length === 1 ? "y" : "ies"} from ${item.name}.`
        );
    }
}

function constraintNote(constraint) {
    if (constraint === "differentPower") {
        return "Each chosen ability should use a different power.";
    }
    if (constraint === "differentQuality") {
        return "Each chosen ability should use a different quality.";
    }
    if (constraint === "differentPowerOrQuality") {
        return "Each chosen ability should use a different power or quality.";
    }
    if (constraint === "differentFromGreenAbilities") {
        return "Use a different power or quality than any of your Green ability fills.";
    }
    if (constraint === "atLeastTwoDifferentPowers") {
        return "Use at least two different powers across the chosen abilities.";
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

function capitalize(value) {
    const s = String(value || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
