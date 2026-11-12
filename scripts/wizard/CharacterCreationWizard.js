import { silentRoll, rerollSilent } from "./silentRoll.js";
import { METHOD_STEP, METHODS, isValidMethod } from "./steps/method.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "scrpg-actor-compendium";
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/wizard`;

/** Later steps land in Slices C–F; keep a single placeholder for now. */
const PLACEHOLDER_STEP = {
    id: "placeholder",
    label: "Coming soon",
    index: 1
};

const STEPS = [METHOD_STEP, PLACEHOLDER_STEP];

/**
 * AppV2 shell for SCRPG hero creation.
 * Slice B: method step + navigation + silent-roll demo. No Actor.create.
 */
export default class CharacterCreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "scrpg-character-creation-wizard",
        classes: ["scrpg-wizard", "scrpg-actor-compendium"],
        tag: "form",
        position: { width: 640, height: 560 },
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
            demoRoll: CharacterCreationWizard.#onDemoRoll,
            reroll: CharacterCreationWizard.#onReroll
        }
    };

    static PARTS = {
        body: {
            template: `${TEMPLATE_ROOT}/wizard.hbs`,
            templates: [
                `${TEMPLATE_ROOT}/steps/method.hbs`,
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
        /** @type {{stepIndex: number, method: string|null, demoRoll: object|null}} */
        this.wizardState = {
            stepIndex: 0,
            method: null,
            demoRoll: null
        };
    }

    /** Open a create-mode wizard (singleton-ish: focus if already open). */
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
        if (step.id === "method") return isValidMethod(this.wizardState.method);
        // Placeholder is terminal for Slice B.
        return false;
    }

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const step = this.currentStep;
        const method = this.wizardState.method;
        const demoRoll = this.wizardState.demoRoll;

        return Object.assign(context, {
            moduleId: MODULE_ID,
            steps: STEPS.map(s => ({
                ...s,
                active: s.id === step.id,
                done: s.index < step.index
            })),
            step,
            isMethodStep: step.id === "method",
            isPlaceholderStep: step.id === "placeholder",
            methods: METHODS.map(m => ({
                ...m,
                selected: m.id === method
            })),
            method,
            methodLabel: METHODS.find(m => m.id === method)?.label ?? null,
            demoRoll,
            demoRollSummary: formatDemoRoll(demoRoll),
            canGoBack: this.canGoBack,
            canGoNext: this.canGoNext,
            showRollDemo: Boolean(method)
        });
    }

    /**
     * Persist radio / form field changes into wizard state.
     * @this {CharacterCreationWizard}
     */
    static async #onFormSubmit(_event, _form, formData) {
        const data = foundry.utils.expandObject(formData?.object ?? {});
        if (isValidMethod(data.method)) {
            this.wizardState.method = data.method;
            await this.render();
        }
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onNext(_event, _target) {
        if (!this.canGoNext) return;
        const nextIndex = this.wizardState.stepIndex + 1;
        if (nextIndex >= STEPS.length) return;

        this.wizardState.stepIndex = nextIndex;

        // Seed a silent-roll demo when leaving Method so Steps 1–2 can reuse the same control.
        if (!this.wizardState.demoRoll) {
            const formula = this.wizardState.method === "guided" ? "2d10" : "1d10";
            this.wizardState.demoRoll = await silentRoll(formula);
        }

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
     * Manual demo roll from the method step (Guided preview).
     * @this {CharacterCreationWizard}
     */
    static async #onDemoRoll(_event, _target) {
        const formula = this.wizardState.method === "constructed" ? "1d10" : "2d10";
        this.wizardState.demoRoll = await silentRoll(formula);
        await this.render();
    }

    /**
     * Re-roll using the last silent-roll formula.
     * @this {CharacterCreationWizard}
     */
    static async #onReroll(_event, _target) {
        if (!this.wizardState.demoRoll?.formula) {
            const formula = this.wizardState.method === "constructed" ? "1d10" : "2d10";
            this.wizardState.demoRoll = await silentRoll(formula);
        } else {
            this.wizardState.demoRoll = await rerollSilent(this.wizardState.demoRoll);
        }
        await this.render();
    }
}

function formatDemoRoll(demoRoll) {
    if (!demoRoll) return null;
    const diceBits = (demoRoll.dice ?? [])
        .map(d => `d${d.faces}: [${(d.results ?? []).join(", ")}]`)
        .join(" · ");
    return {
        formula: demoRoll.formula,
        total: demoRoll.total,
        detail: diceBits || null
    };
}
