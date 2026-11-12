import { legalChartNumbers, rollChart, rerollChart } from "./chartRoll.js";
import { createEmptyDraft, invalidateFrom } from "./draftState.js";
import {
    expandChoiceList,
    formatRollSummary,
    loadChartRows,
    loadPrinciplesForCategory
} from "./packData.js";
import { METHOD_STEP, METHODS, isValidMethod } from "./steps/method.js";
import {
    BACKGROUND_STEP,
    BACKGROUND_DETAILS_STEP,
    BACKGROUND_ROLL_FORMULA,
    buildQualitySlots,
    isBackgroundChartComplete,
    isBackgroundDetailsComplete
} from "./steps/background.js";
import {
    POWER_SOURCE_STEP,
    POWER_SOURCE_DETAILS_STEP,
    buildPowerSlots,
    isPowerSourceChartComplete,
    isPowerSourceDetailsComplete,
    powerSourceRollFormula
} from "./steps/powerSource.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "scrpg-actor-compendium";
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/wizard`;

const PLACEHOLDER_STEP = {
    id: "placeholder",
    label: "Coming soon",
    index: 5
};

const STEPS = [
    METHOD_STEP,
    BACKGROUND_STEP,
    BACKGROUND_DETAILS_STEP,
    POWER_SOURCE_STEP,
    POWER_SOURCE_DETAILS_STEP,
    PLACEHOLDER_STEP
];

/**
 * AppV2 SCRPG hero creation wizard.
 * Slice C: Method + Background + Power Source (selective abilities). No Actor.create.
 */
export default class CharacterCreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "scrpg-character-creation-wizard",
        classes: ["scrpg-wizard", "scrpg-actor-compendium"],
        tag: "form",
        position: { width: 720, height: 680 },
        window: {
            title: "Create SCRPG Hero",
            resizable: true,
            contentClasses: ["standard-form"]
        },
        form: {
            handler: CharacterCreationWizard.#onFormSubmit,
            submitOnChange: true,
            closeOnSubmit: false
        },
        actions: {
            next: CharacterCreationWizard.#onNext,
            back: CharacterCreationWizard.#onBack,
            cancel: CharacterCreationWizard.#onCancel,
            chartRoll: CharacterCreationWizard.#onChartRoll,
            chartReroll: CharacterCreationWizard.#onChartReroll
        }
    };

    static PARTS = {
        body: {
            template: `${TEMPLATE_ROOT}/wizard.hbs`,
            templates: [
                `${TEMPLATE_ROOT}/steps/method.hbs`,
                `${TEMPLATE_ROOT}/steps/background.hbs`,
                `${TEMPLATE_ROOT}/steps/backgroundDetails.hbs`,
                `${TEMPLATE_ROOT}/steps/powerSource.hbs`,
                `${TEMPLATE_ROOT}/steps/powerSourceDetails.hbs`,
                `${TEMPLATE_ROOT}/steps/placeholder.hbs`
            ],
            scrollable: [".scrpg-wizard-step"]
        }
    };

    /**
     * @param {object} [options]
     * @param {"create"} [options.mode]
     */
    constructor(options = {}) {
        super(options);
        /** @type {ReturnType<typeof createEmptyDraft>} */
        this.wizardState = createEmptyDraft();
        /** @type {Map<string, object[]>} */
        this._chartCache = new Map();
        /** @type {object|null} */
        this._selectedBackgroundRow = null;
        /** @type {object|null} */
        this._selectedPowerSourceRow = null;
        /** @type {Array<{uuid:string,name:string}>} */
        this._qualityOptions = [];
        /** @type {Array<{uuid:string,name:string}>} */
        this._powerOptions = [];
        /** @type {Array<object>} */
        this._principles = [];
    }

    /** Open a create-mode wizard (focus if already open). */
    static async openCreate() {
        const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
        if (existing) {
            existing.bringToFront();
            return existing;
        }
        const app = new this({ mode: "create" });
        await app.render({ force: true });
        return app;
    }

    get currentStep() {
        return STEPS[this.wizardState.stepIndex] ?? STEPS[0];
    }

    get canGoBack() {
        return this.wizardState.stepIndex > 0;
    }

    get canGoNext() {
        const step = this.currentStep;
        const draft = this.wizardState;
        switch (step.id) {
            case "method":
                return isValidMethod(draft.method);
            case "background":
                return isBackgroundChartComplete(draft);
            case "backgroundDetails":
                return isBackgroundDetailsComplete(draft);
            case "powerSource":
                return isPowerSourceChartComplete(draft);
            case "powerSourceDetails":
                return isPowerSourceDetailsComplete(draft, this._selectedPowerSourceRow?.wizard);
            case "placeholder":
                return false;
            default:
                return false;
        }
    }

    get isGuided() {
        return this.wizardState.method === "guided";
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const step = this.currentStep;
        const draft = this.wizardState;
        const method = draft.method;

        await this.#ensureStepData(step.id);

        const base = {
            moduleId: MODULE_ID,
            steps: STEPS.map(s => ({
                ...s,
                active: s.id === step.id,
                done: s.index < step.index
            })),
            step,
            isMethodStep: step.id === "method",
            isBackgroundStep: step.id === "background",
            isBackgroundDetailsStep: step.id === "backgroundDetails",
            isPowerSourceStep: step.id === "powerSource",
            isPowerSourceDetailsStep: step.id === "powerSourceDetails",
            isPlaceholderStep: step.id === "placeholder",
            isGuided: this.isGuided,
            methods: METHODS.map(m => ({
                ...m,
                selected: m.id === method
            })),
            method,
            methodLabel: METHODS.find(m => m.id === method)?.label ?? null,
            selectedBackgroundName: draft.background.selectedName,
            selectedPowerSourceName: draft.powerSource.selectedName,
            canGoBack: this.canGoBack,
            canGoNext: this.canGoNext
        };

        if (step.id === "background") {
            Object.assign(base, this.#backgroundChartContext());
        } else if (step.id === "backgroundDetails") {
            Object.assign(base, this.#backgroundDetailsContext());
        } else if (step.id === "powerSource") {
            Object.assign(base, this.#powerSourceChartContext());
        } else if (step.id === "powerSourceDetails") {
            Object.assign(base, this.#powerSourceDetailsContext());
        }

        return Object.assign(context, base);
    }

    async #ensureStepData(stepId) {
        if (stepId === "background" || stepId === "backgroundDetails") {
            await this.#loadBackgrounds();
            this.#syncSelectedBackgroundRow();
        }
        if (stepId === "backgroundDetails") {
            await this.#loadBackgroundDetailsOptions();
        }
        if (stepId === "powerSource" || stepId === "powerSourceDetails") {
            await this.#loadPowerSources();
            this.#syncSelectedPowerSourceRow();
        }
        if (stepId === "powerSourceDetails") {
            await this.#loadPowerSourceDetailsOptions();
        }
    }

    async #loadBackgrounds() {
        if (!this._chartCache.has("backgrounds")) {
            this._chartCache.set("backgrounds", await loadChartRows("backgrounds"));
        }
    }

    async #loadPowerSources() {
        if (!this._chartCache.has("powerSources")) {
            this._chartCache.set("powerSources", await loadChartRows("powerSources"));
        }
    }

    #syncSelectedBackgroundRow() {
        const uuid = this.wizardState.background.selectedUuid;
        const rows = this._chartCache.get("backgrounds") || [];
        this._selectedBackgroundRow = rows.find(r => r.uuid === uuid) || null;
    }

    #syncSelectedPowerSourceRow() {
        const uuid = this.wizardState.powerSource.selectedUuid;
        const rows = this._chartCache.get("powerSources") || [];
        this._selectedPowerSourceRow = rows.find(r => r.uuid === uuid) || null;
    }

    async #loadBackgroundDetailsOptions() {
        const wizard = this._selectedBackgroundRow?.wizard || {};
        const choices = [
            ...(wizard.requiredQualities || []),
            ...(wizard.qualityChoices || [])
        ];
        this._qualityOptions = await expandChoiceList(choices);
        const category = wizard.principleCategory
            || this.wizardState.background.principleCategory
            || null;
        this._principles = category ? await loadPrinciplesForCategory(category) : [];
    }

    async #loadPowerSourceDetailsOptions() {
        const wizard = this._selectedPowerSourceRow?.wizard || {};
        const choices = [
            ...(wizard.requiredPowers || []),
            ...(wizard.powerChoices || [])
        ];
        this._powerOptions = await expandChoiceList(choices);
    }

    #backgroundChartContext() {
        const draft = this.wizardState.background;
        const legal = this.isGuided ? legalChartNumbers(draft.roll) : null;
        const rows = (this._chartCache.get("backgrounds") || []).map(row => {
            const available = !this.isGuided || (legal?.includes(row.number) ?? false);
            return {
                number: row.number,
                uuid: row.uuid,
                name: row.name,
                available,
                selected: draft.selectedUuid === row.uuid,
                powerSourceDiceLabel: (row.wizard.powerSourceDice || row.flags.powerSourceDice || []).join(", ") || "—",
                principleLabel: row.wizard.principleCategoryLabel
                    || row.flags.principleCategory
                    || row.wizard.principleCategory
                    || "—"
            };
        });
        return {
            chartRows: rows,
            rollSummary: formatRollSummary(draft.roll),
            legalNumbers: legal || []
        };
    }

    #backgroundDetailsContext() {
        const draft = this.wizardState.background;
        const wizard = this._selectedBackgroundRow?.wizard || {};
        const qualityDice = draft.qualityDice?.length
            ? draft.qualityDice
            : (wizard.qualityDice || []);

        if (!draft.qualityAssignments?.length) {
            draft.qualityAssignments = buildQualitySlots(wizard).map(s => ({
                slotIndex: s.slotIndex,
                uuid: s.uuid,
                name: s.name,
                die: s.die,
                required: s.required,
                lockedUuid: s.lockedUuid,
                lockedName: s.lockedName
            }));
        }

        const slots = draft.qualityAssignments.map(slot => ({
            ...slot,
            traitOptions: this._qualityOptions.map(opt => ({
                ...opt,
                selected: opt.uuid === slot.uuid
            })),
            dieOptions: qualityDice.map(die => ({
                value: die,
                label: die,
                selected: die === slot.die
            }))
        }));

        return {
            qualitiesIntro: wizard.qualitiesIntro || null,
            qualityDiceLabel: qualityDice.join(", ") || "—",
            principleCategoryLabel: wizard.principleCategoryLabel
                || draft.principleCategory
                || "—",
            qualitySlots: slots,
            principles: this._principles.map(p => ({
                ...p,
                selected: p.uuid === draft.principleUuid
            }))
        };
    }

    #powerSourceChartContext() {
        const draft = this.wizardState.powerSource;
        const psDice = this.wizardState.background.powerSourceDice || [];
        const legal = this.isGuided ? legalChartNumbers(draft.roll) : null;
        const rows = (this._chartCache.get("powerSources") || []).map(row => {
            const available = !this.isGuided || (legal?.includes(row.number) ?? false);
            return {
                number: row.number,
                uuid: row.uuid,
                name: row.name,
                available,
                selected: draft.selectedUuid === row.uuid,
                archetypeDiceLabel: (row.wizard.archetypeDice || row.flags.archetypeDice || []).join(", ") || "—"
            };
        });
        return {
            chartRows: rows,
            rollSummary: formatRollSummary(draft.roll),
            legalNumbers: legal || [],
            powerSourceDiceLabel: psDice.join(", ") || "—",
            selectedBackgroundName: this.wizardState.background.selectedName
        };
    }

    #powerSourceDetailsContext() {
        const draft = this.wizardState.powerSource;
        const bgDice = this.wizardState.background.powerSourceDice || [];
        const wizard = this._selectedPowerSourceRow?.wizard || {};

        if (!draft.powerAssignments?.length) {
            draft.powerAssignments = buildPowerSlots(bgDice, wizard).map(s => ({
                slotIndex: s.slotIndex,
                uuid: s.uuid,
                name: s.name,
                die: s.die,
                required: s.required,
                lockedUuid: s.lockedUuid,
                lockedName: s.lockedName
            }));
        }

        const slots = draft.powerAssignments.map(slot => ({
            ...slot,
            traitOptions: this._powerOptions.map(opt => ({
                ...opt,
                selected: opt.uuid === slot.uuid
            })),
            dieOptions: bgDice.map(die => ({
                value: die,
                label: die,
                selected: die === slot.die
            }))
        }));

        const abilityPickGroups = (wizard.abilityPicks || []).map((group, index) => {
            const selected = draft.abilitySelections?.[String(index)] || [];
            const count = Number(group.count) || 0;
            const atLimit = selected.length >= count;
            return {
                index,
                color: group.color,
                title: `${capitalize(group.color)} abilities`,
                grantText: group.grantText || null,
                constraint: group.constraint || null,
                constraintNote: constraintNote(group.constraint),
                count,
                selectedCount: selected.length,
                abilities: (group.abilities || []).map(ab => {
                    const isSelected = selected.includes(ab.uuid);
                    return {
                        uuid: ab.uuid,
                        name: ab.name,
                        selected: isSelected,
                        disabled: atLimit && !isSelected
                    };
                })
            };
        });

        return {
            powersIntro: wizard.powersIntro || null,
            powerSourceDiceLabel: bgDice.join(", ") || "—",
            powerSlots: slots,
            abilityPickGroups
        };
    }

    /**
     * Persist form field changes into draft state.
     * @this {CharacterCreationWizard}
     */
    static async #onFormSubmit(_event, _form, formData) {
        const data = foundry.utils.expandObject(formData?.object ?? {});
        const step = this.currentStep;
        let changed = false;

        if (step.id === "method" && isValidMethod(data.method)) {
            if (this.wizardState.method !== data.method) {
                this.wizardState.method = data.method;
                invalidateFrom(this.wizardState, "method");
                changed = true;
            }
        }

        if (step.id === "background" && data.backgroundNumber != null) {
            changed = this.#applyBackgroundSelection(Number(data.backgroundNumber)) || changed;
        }

        if (step.id === "backgroundDetails") {
            changed = this.#applyBackgroundDetails(data) || changed;
        }

        if (step.id === "powerSource" && data.powerSourceNumber != null) {
            changed = this.#applyPowerSourceSelection(Number(data.powerSourceNumber)) || changed;
        }

        if (step.id === "powerSourceDetails") {
            changed = this.#applyPowerSourceDetails(data) || changed;
        }

        if (changed) await this.render();
    }

    #applyBackgroundSelection(number) {
        const rows = this._chartCache.get("backgrounds") || [];
        const row = rows.find(r => r.number === number);
        if (!row) return false;
        if (this.isGuided) {
            const legal = legalChartNumbers(this.wizardState.background.roll);
            if (!legal.includes(number)) return false;
        }
        if (this.wizardState.background.selectedUuid === row.uuid) return false;

        invalidateFrom(this.wizardState, "background");
        const wizard = row.wizard || {};
        this.wizardState.background.selectedNumber = row.number;
        this.wizardState.background.selectedUuid = row.uuid;
        this.wizardState.background.selectedName = row.name;
        this.wizardState.background.powerSourceDice = [
            ...(wizard.powerSourceDice || row.flags.powerSourceDice || [])
        ];
        this.wizardState.background.qualityDice = [...(wizard.qualityDice || [])];
        this.wizardState.background.principleCategory = wizard.principleCategory || null;
        this.wizardState.background.qualityAssignments = buildQualitySlots(wizard).map(s => ({
            slotIndex: s.slotIndex,
            uuid: s.uuid,
            name: s.name,
            die: s.die,
            required: s.required,
            lockedUuid: s.lockedUuid,
            lockedName: s.lockedName
        }));
        this._selectedBackgroundRow = row;
        return true;
    }

    #applyBackgroundDetails(data) {
        const draft = this.wizardState.background;
        const slots = draft.qualityAssignments || [];
        let changed = false;

        const uuidMap = data.qualityUuid || {};
        const dieMap = data.qualityDie || {};
        for (const slot of slots) {
            const key = String(slot.slotIndex);
            const nextUuid = slot.lockedUuid || uuidMap[key] || null;
            const nextDie = dieMap[key] || null;
            const opt = this._qualityOptions.find(o => o.uuid === nextUuid);
            const nextName = slot.lockedName || opt?.name || null;
            if (slot.uuid !== nextUuid || slot.die !== nextDie) {
                slot.uuid = nextUuid;
                slot.name = nextName;
                slot.die = nextDie;
                changed = true;
            }
        }

        if (data.principleUuid && data.principleUuid !== draft.principleUuid) {
            const principle = this._principles.find(p => p.uuid === data.principleUuid);
            draft.principleUuid = data.principleUuid;
            draft.principleName = principle?.name || null;
            changed = true;
        }

        if (changed) invalidateFrom(this.wizardState, "backgroundDetails");
        return changed;
    }

    #applyPowerSourceSelection(number) {
        const rows = this._chartCache.get("powerSources") || [];
        const row = rows.find(r => r.number === number);
        if (!row) return false;
        if (this.isGuided) {
            const legal = legalChartNumbers(this.wizardState.powerSource.roll);
            if (!legal.includes(number)) return false;
        }
        if (this.wizardState.powerSource.selectedUuid === row.uuid) return false;

        invalidateFrom(this.wizardState, "powerSource");
        const wizard = row.wizard || {};
        this.wizardState.powerSource.selectedNumber = row.number;
        this.wizardState.powerSource.selectedUuid = row.uuid;
        this.wizardState.powerSource.selectedName = row.name;
        this.wizardState.powerSource.archetypeDice = [
            ...(wizard.archetypeDice || row.flags.archetypeDice || [])
        ];
        this.wizardState.powerSource.powerAssignments = buildPowerSlots(
            this.wizardState.background.powerSourceDice,
            wizard
        ).map(s => ({
            slotIndex: s.slotIndex,
            uuid: s.uuid,
            name: s.name,
            die: s.die,
            required: s.required,
            lockedUuid: s.lockedUuid,
            lockedName: s.lockedName
        }));
        this.wizardState.powerSource.abilitySelections = {};
        this._selectedPowerSourceRow = row;
        return true;
    }

    #applyPowerSourceDetails(data) {
        const draft = this.wizardState.powerSource;
        const wizard = this._selectedPowerSourceRow?.wizard || {};
        const slots = draft.powerAssignments || [];
        let changed = false;

        const uuidMap = data.powerUuid || {};
        const dieMap = data.powerDie || {};
        for (const slot of slots) {
            const key = String(slot.slotIndex);
            const nextUuid = slot.lockedUuid || uuidMap[key] || null;
            const nextDie = dieMap[key] || null;
            const opt = this._powerOptions.find(o => o.uuid === nextUuid);
            const nextName = slot.lockedName || opt?.name || null;
            if (slot.uuid !== nextUuid || slot.die !== nextDie) {
                slot.uuid = nextUuid;
                slot.name = nextName;
                slot.die = nextDie;
                changed = true;
            }
        }

        const pickMap = data.abilityPick || {};
        const groups = wizard.abilityPicks || [];
        for (let i = 0; i < groups.length; i++) {
            const key = String(i);
            let selected = pickMap[key];
            if (selected == null) selected = [];
            if (!Array.isArray(selected)) selected = [selected];
            selected = selected.filter(Boolean);
            const need = Number(groups[i].count) || 0;
            if (selected.length > need) selected = selected.slice(0, need);
            const prev = draft.abilitySelections[key] || [];
            if (prev.join("|") !== selected.join("|")) {
                draft.abilitySelections[key] = selected;
                changed = true;
            }
        }

        return changed;
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onNext(_event, _target) {
        if (!this.canGoNext) return;
        const nextIndex = this.wizardState.stepIndex + 1;
        if (nextIndex >= STEPS.length) return;
        this.wizardState.stepIndex = nextIndex;
        await this.render();
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onBack(_event, _target) {
        if (!this.canGoBack) return;
        this.wizardState.stepIndex = Math.max(0, this.wizardState.stepIndex - 1);
        await this.render();
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onCancel(_event, _target) {
        await this.close();
    }

    /**
     * Guided chart roll for the current step.
     * @this {CharacterCreationWizard}
     */
    static async #onChartRoll(_event, _target) {
        if (!this.isGuided) return;
        const step = this.currentStep;
        if (step.id === "background") {
            this.wizardState.background.roll = await rollChart(BACKGROUND_ROLL_FORMULA);
            if (this.wizardState.background.selectedNumber != null) {
                const legal = legalChartNumbers(this.wizardState.background.roll);
                if (!legal.includes(this.wizardState.background.selectedNumber)) {
                    invalidateFrom(this.wizardState, "background");
                    this.wizardState.background.selectedNumber = null;
                    this.wizardState.background.selectedUuid = null;
                    this.wizardState.background.selectedName = null;
                    this._selectedBackgroundRow = null;
                }
            }
            await this.render();
            return;
        }
        if (step.id === "powerSource") {
            const formula = powerSourceRollFormula(this.wizardState.background.powerSourceDice);
            if (!formula) {
                ui.notifications?.warn("Background has no power-source dice to roll.");
                return;
            }
            this.wizardState.powerSource.roll = await rollChart(formula);
            if (this.wizardState.powerSource.selectedNumber != null) {
                const legal = legalChartNumbers(this.wizardState.powerSource.roll);
                if (!legal.includes(this.wizardState.powerSource.selectedNumber)) {
                    invalidateFrom(this.wizardState, "powerSource");
                    this.wizardState.powerSource.selectedNumber = null;
                    this.wizardState.powerSource.selectedUuid = null;
                    this.wizardState.powerSource.selectedName = null;
                    this._selectedPowerSourceRow = null;
                }
            }
            await this.render();
        }
    }

    /**
     * Re-roll the current Guided chart step.
     * @this {CharacterCreationWizard}
     */
    static async #onChartReroll(_event, _target) {
        if (!this.isGuided) return;
        const step = this.currentStep;
        if (step.id === "background") {
            const prior = this.wizardState.background.roll;
            this.wizardState.background.roll = prior?.formula
                ? await rerollChart(prior)
                : await rollChart(BACKGROUND_ROLL_FORMULA);
            const legal = legalChartNumbers(this.wizardState.background.roll);
            if (
                this.wizardState.background.selectedNumber != null
                && !legal.includes(this.wizardState.background.selectedNumber)
            ) {
                invalidateFrom(this.wizardState, "background");
                this.wizardState.background.selectedNumber = null;
                this.wizardState.background.selectedUuid = null;
                this.wizardState.background.selectedName = null;
                this._selectedBackgroundRow = null;
            }
            await this.render();
            return;
        }
        if (step.id === "powerSource") {
            const formula = powerSourceRollFormula(this.wizardState.background.powerSourceDice);
            const prior = this.wizardState.powerSource.roll;
            this.wizardState.powerSource.roll = prior?.formula
                ? await rerollChart(prior)
                : await rollChart(formula);
            const legal = legalChartNumbers(this.wizardState.powerSource.roll);
            if (
                this.wizardState.powerSource.selectedNumber != null
                && !legal.includes(this.wizardState.powerSource.selectedNumber)
            ) {
                invalidateFrom(this.wizardState, "powerSource");
                this.wizardState.powerSource.selectedNumber = null;
                this.wizardState.powerSource.selectedUuid = null;
                this.wizardState.powerSource.selectedName = null;
                this._selectedPowerSourceRow = null;
            }
            await this.render();
        }
    }
}

function capitalize(value) {
    const s = String(value || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function constraintNote(constraint) {
    if (constraint === "differentPower") {
        return "Each chosen ability should use a different power (enforced when the hero is created).";
    }
    return null;
}
