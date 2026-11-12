const MODULE_ID = "scrpg-actor-compendium";

let _wizardClassPromise = null;

/**
 * True when the active system is SCRPG and the user may create hero Actors.
 * @param {User} [user]
 * @returns {boolean}
 */
export function canCreateScrpgHero(user = game.user) {
    if (game.system?.id !== "scrpg-foundry") return false;
    if (!user) return false;
    if (typeof user.can === "function" && !user.can("ACTOR_CREATE")) return false;

    // Prefer document-class check when available (Foundry 12+).
    const ActorDoc = CONFIG.Actor?.documentClass ?? globalThis.Actor;
    if (typeof ActorDoc?.canUserCreate === "function" && !ActorDoc.canUserCreate(user)) {
        return false;
    }

    const types = game.system?.documentTypes?.Actor
        ?? CONFIG.Actor?.typeLabels
        ?? {};
    if (types && Object.keys(types).length && !Object.prototype.hasOwnProperty.call(types, "hero")) {
        return false;
    }

    return true;
}

async function loadWizardClass() {
    if (!_wizardClassPromise) {
        _wizardClassPromise = import("./CharacterCreationWizard.js")
            .then(mod => mod.default)
            .catch(err => {
                _wizardClassPromise = null;
                throw err;
            });
    }
    return _wizardClassPromise;
}

/** Lazy-open the create wizard (templates should already be preloaded on init). */
export async function openCreateWizard() {
    if (!canCreateScrpgHero()) {
        ui.notifications?.warn("You do not have permission to create SCRPG heroes.");
        return null;
    }
    try {
        const Wizard = await loadWizardClass();
        return Wizard.openCreate();
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to open character creation wizard`, err);
        ui.notifications?.error("Failed to open the SCRPG hero wizard.");
        return null;
    }
}
