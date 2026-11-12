/**
 * Place the creation wizard and live hero sheet side-by-side.
 * Re-apply after open/render — Foundry may reset window positions.
 */

const PADDING = 12;
const GAP = 12;
const MIN_WIZARD_W = 520;
const MIN_SHEET_W = 480;
const DEFAULT_WIZARD_W = 760;
const DEFAULT_SHEET_W = 720;

/**
 * @param {Application|null|undefined} wizardApp
 * @param {Application|null|undefined} sheetApp
 */
export function layoutWizardAndSheet(wizardApp, sheetApp) {
    if (!wizardApp && !sheetApp) return;

    const screenW = window.innerWidth || 1400;
    const screenH = window.innerHeight || 900;
    const usableW = Math.max(640, screenW - PADDING * 2 - GAP);
    const usableH = Math.max(400, screenH - PADDING * 2);

    let wizardW = Math.min(DEFAULT_WIZARD_W, Math.floor(usableW * 0.5));
    let sheetW = Math.min(DEFAULT_SHEET_W, usableW - wizardW);
    if (sheetW < MIN_SHEET_W && usableW >= MIN_WIZARD_W + MIN_SHEET_W) {
        sheetW = MIN_SHEET_W;
        wizardW = usableW - sheetW;
    }
    wizardW = Math.max(MIN_WIZARD_W, Math.min(wizardW, usableW - MIN_SHEET_W));
    sheetW = Math.max(MIN_SHEET_W, usableW - wizardW);

    const height = Math.min(720, usableH);
    const top = PADDING;
    const wizardLeft = PADDING;
    const sheetLeft = PADDING + wizardW + GAP;

    if (wizardApp && typeof wizardApp.setPosition === "function") {
        try {
            wizardApp.setPosition({
                left: wizardLeft,
                top,
                width: wizardW,
                height
            });
        } catch (err) {
            console.warn("scrpg-actor-compendium | Failed to position wizard", err);
        }
    }

    if (sheetApp && typeof sheetApp.setPosition === "function") {
        try {
            sheetApp.setPosition({
                left: sheetLeft,
                top,
                width: sheetW,
                height: Math.min(680, usableH)
            });
        } catch (err) {
            console.warn("scrpg-actor-compendium | Failed to position sheet", err);
        }
    }
}

/**
 * After a sheet render, re-assert side-by-side layout vs the live wizard.
 * @param {Actor|null|undefined} actor
 * @param {Application|null|undefined} wizardApp
 */
export function relayoutSheetBesideWizard(actor, wizardApp) {
    const sheet = actor?.sheet;
    if (!sheet?.rendered && !sheet?.element) return;
    layoutWizardAndSheet(wizardApp, sheet);
}
