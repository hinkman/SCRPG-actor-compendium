import { createHeroFromDraft } from "./apply.js";
import { legalChartNumbers, rollChart, rerollChart } from "./chartRoll.js";
import { createEmptyDraft, invalidateFrom, upgradeDie } from "./draftState.js";
import {
    expandChoiceList,
    formatRollSummary,
    loadAllPowersAndQualities,
    loadAllPrinciples,
    loadChartRows,
    loadPrinciplesForCategory,
    loadRedAbilities,
    resolveTraitCategories
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
    powerSourceDetailsRemaining,
    powerSourceRollFormula
} from "./steps/powerSource.js";
import {
    ARCHETYPE_STEP,
    ARCHETYPE_DETAILS_STEP,
    assignmentHints,
    archetypeRollFormula,
    buildTraitSlots,
    defaultAbilitySelections,
    isArchetypeBlocked,
    isArchetypeChartComplete,
    isArchetypeDetailsComplete
} from "./steps/archetype.js";
import {
    PERSONALITY_STEP,
    PERSONALITY_DETAILS_STEP,
    collectAssignedTraits,
    isPersonalityChartComplete,
    isPersonalityDetailsComplete,
    personalityRollFormula
} from "./steps/personality.js";
import {
    RED_ABILITIES_STEP,
    RED_PICK_COUNT,
    collectEffectiveTraits,
    isRedAbilitiesComplete,
    isRedAbilityEligible,
    slotOptionsForAbility
} from "./steps/redAbilities.js";
import {
    RETCON_STEP,
    RETCON_OPTIONS,
    isRetconComplete,
    isValidRetconOption,
    rebindableAbilities
} from "./steps/retcon.js";
import {
    HEALTH_STEP,
    dieFaces,
    healthTraitOptions,
    isHealthComplete,
    refreshHealthComputation,
    rollHealthVariance
} from "./steps/health.js";
import {
    FINISHING_STEP,
    PHYSICAL_FIELDS,
    isFinishingComplete
} from "./steps/finishing.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "scrpg-actor-compendium";
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/wizard`;

const STEPS = [
    METHOD_STEP,
    BACKGROUND_STEP,
    BACKGROUND_DETAILS_STEP,
    POWER_SOURCE_STEP,
    POWER_SOURCE_DETAILS_STEP,
    ARCHETYPE_STEP,
    ARCHETYPE_DETAILS_STEP,
    PERSONALITY_STEP,
    PERSONALITY_DETAILS_STEP,
    RED_ABILITIES_STEP,
    RETCON_STEP,
    HEALTH_STEP,
    FINISHING_STEP
];

/**
 * AppV2 SCRPG hero creation wizard.
 * Slice F: Steps 1–8; Actor.create after Finishing.
 */
export default class CharacterCreationWizard extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "scrpg-character-creation-wizard",
        classes: ["scrpg-wizard", "scrpg-actor-compendium"],
        // Keep the window chrome outside the <form> so header controls are not
        // implicit form participants; submit/change still bind via contentTag.
        tag: "div",
        position: { width: 760, height: 720 },
        window: {
            title: "Create SCRPG Hero",
            resizable: true,
            contentTag: "form",
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
            chartReroll: CharacterCreationWizard.#onChartReroll,
            healthRoll: CharacterCreationWizard.#onHealthRoll,
            createHero: CharacterCreationWizard.#onCreateHero,
            previewChartItem: CharacterCreationWizard.#onPreviewChartItem
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
                `${TEMPLATE_ROOT}/steps/archetype.hbs`,
                `${TEMPLATE_ROOT}/steps/archetypeDetails.hbs`,
                `${TEMPLATE_ROOT}/steps/personality.hbs`,
                `${TEMPLATE_ROOT}/steps/personalityDetails.hbs`,
                `${TEMPLATE_ROOT}/steps/redAbilities.hbs`,
                `${TEMPLATE_ROOT}/steps/retcon.hbs`,
                `${TEMPLATE_ROOT}/steps/health.hbs`,
                `${TEMPLATE_ROOT}/steps/finishing.hbs`
            ],
            // Nested chart lists overflow themselves; preserve their scroll across selection re-renders.
            scrollable: [".scrpg-wizard-step", ".scrpg-wizard-chart-list"]
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
        /** @type {object|null} */
        this._selectedArchetypeRow = null;
        /** @type {object|null} */
        this._selectedPersonalityRow = null;
        /** @type {Array<{uuid:string,name:string,itemType?:string}>} */
        this._qualityOptions = [];
        /** @type {Array<{uuid:string,name:string,itemType?:string}>} */
        this._powerOptions = [];
        /** @type {Array<{uuid:string,name:string,itemType?:string}>} */
        this._traitOptions = [];
        /** @type {Array<object>} */
        this._principles = [];
        /** @type {Array<object>} */
        this._outSlots = [];
        /** @type {Array<object>} */
        this._redAbilities = [];
        /** @type {Map<string, string>} */
        this._traitCategories = new Map();
        /** @type {Array<object>} */
        this._allPrinciples = [];
        /** @type {Array<object>} */
        this._allTraitsCatalog = [];
        /** @type {Map<string, {uuid:string,name:string,slots:Array<object>,preview:string|null,abilityType?:string}>} */
        this._abilityMeta = new Map();
        /** @type {boolean} */
        this._creating = false;
        /** @type {boolean} */
        this._stepTransitioning = false;
    }

    /**
     * Open a create-mode wizard (focus if already open).
     * AppV2 removes the DOM node and sets ERROR on failed re-renders but leaves a
     * fixed-id singleton registered; close() then no-ops without deregistering when
     * element is already null — so dead instances must be dropped here.
     */
    static async openCreate() {
        const id = this.DEFAULT_OPTIONS.id;
        const existing = foundry.applications.instances.get(id);
        if (existing) {
            const states = ApplicationV2.RENDER_STATES;
            const alive = Boolean(existing.element)
                && existing.state === states.RENDERED;
            if (alive) {
                existing.bringToFront();
                return existing;
            }
            foundry.applications.instances.delete(id);
            try {
                await existing.close({ animate: false });
            } catch (err) {
                console.warn(`${MODULE_ID} | Discarding dead wizard instance`, err);
            }
            foundry.applications.instances.delete(id);
        }
        const app = new this({ mode: "create" });
        await app.render({ force: true });
        return app;
    }

    /**
     * Ensure ERROR/empty-element closes still drop the fixed-id singleton.
     * @param {object} [options]
     */
    async close(options = {}) {
        const id = this.id;
        try {
            return await super.close(options);
        } finally {
            if (foundry.applications.instances.get(id) === this) {
                foundry.applications.instances.delete(id);
            }
        }
    }

    get currentStep() {
        return STEPS[this.wizardState.stepIndex] ?? STEPS[0];
    }

    get canGoBack() {
        return this.wizardState.stepIndex > 0 && !this._creating;
    }

    get canGoNext() {
        if (this._creating) return false;
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
                return isPowerSourceDetailsComplete(
                    draft,
                    this._selectedPowerSourceRow?.wizard,
                    this._abilityMeta
                );
            case "archetype":
                return isArchetypeChartComplete(draft);
            case "archetypeDetails":
                return isArchetypeDetailsComplete(
                    draft,
                    this._selectedArchetypeRow?.wizard,
                    this._abilityMeta
                );
            case "personality":
                return isPersonalityChartComplete(draft);
            case "personalityDetails":
                return isPersonalityDetailsComplete(
                    draft,
                    this._selectedPersonalityRow?.wizard,
                    this._outSlots
                );
            case "redAbilities": {
                const selected = (draft.red?.abilityUuids || [])
                    .map(uuid => this._redAbilities.find(a => a.uuid === uuid))
                    .filter(Boolean);
                return isRedAbilitiesComplete(draft, selected);
            }
            case "retcon": {
                const extra = draft.retcon?.extraRedUuid
                    ? this._redAbilities.find(a => a.uuid === draft.retcon.extraRedUuid)
                    : null;
                return isRetconComplete(draft, { extraRedAbility: extra });
            }
            case "health":
                return isHealthComplete(
                    draft,
                    collectEffectiveTraits(draft, this._traitCategories)
                );
            case "finishing":
                return isFinishingComplete(draft);
            default:
                return false;
        }
    }

    get isGuided() {
        return this.wizardState.method === "guided";
    }

    get isLastStep() {
        return this.currentStep.id === "finishing";
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
            isArchetypeStep: step.id === "archetype",
            isArchetypeDetailsStep: step.id === "archetypeDetails",
            isPersonalityStep: step.id === "personality",
            isPersonalityDetailsStep: step.id === "personalityDetails",
            isRedAbilitiesStep: step.id === "redAbilities",
            isRetconStep: step.id === "retcon",
            isHealthStep: step.id === "health",
            isFinishingStep: step.id === "finishing",
            isLastStep: this.isLastStep,
            isGuided: this.isGuided,
            methods: METHODS.map(m => ({
                ...m,
                selected: m.id === method
            })),
            method,
            methodLabel: METHODS.find(m => m.id === method)?.label ?? null,
            selectedBackgroundName: draft.background.selectedName,
            selectedPowerSourceName: draft.powerSource.selectedName,
            selectedArchetypeName: draft.archetype.selectedName,
            selectedPersonalityName: draft.personality.selectedName,
            canGoBack: this.canGoBack,
            canGoNext: this.canGoNext,
            nextRequirements: []
        };

        if (step.id === "background") {
            Object.assign(base, this.#backgroundChartContext());
        } else if (step.id === "backgroundDetails") {
            Object.assign(base, this.#backgroundDetailsContext());
        } else if (step.id === "powerSource") {
            Object.assign(base, this.#powerSourceChartContext());
        } else if (step.id === "powerSourceDetails") {
            Object.assign(base, this.#powerSourceDetailsContext());
            base.nextRequirements = powerSourceDetailsRemaining(
                draft,
                this._selectedPowerSourceRow?.wizard,
                this._abilityMeta
            );
        } else if (step.id === "archetype") {
            Object.assign(base, this.#archetypeChartContext());
        } else if (step.id === "archetypeDetails") {
            Object.assign(base, this.#archetypeDetailsContext());
        } else if (step.id === "personality") {
            Object.assign(base, this.#personalityChartContext());
        } else if (step.id === "personalityDetails") {
            Object.assign(base, await this.#personalityDetailsContext());
        } else if (step.id === "redAbilities") {
            Object.assign(base, this.#redAbilitiesContext());
        } else if (step.id === "retcon") {
            Object.assign(base, await this.#retconContext());
        } else if (step.id === "health") {
            Object.assign(base, this.#healthContext());
        } else if (step.id === "finishing") {
            Object.assign(base, this.#finishingContext());
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
        if (stepId === "archetype" || stepId === "archetypeDetails") {
            await this.#loadArchetypes();
            this.#syncSelectedArchetypeRow();
        }
        if (stepId === "archetypeDetails") {
            await this.#loadArchetypeDetailsOptions();
        }
        if (stepId === "personality" || stepId === "personalityDetails") {
            await this.#loadPersonalities();
            this.#syncSelectedPersonalityRow();
        }
        if (stepId === "personalityDetails") {
            await this.#loadPersonalityDetailsOptions();
        }
        if (stepId === "redAbilities" || stepId === "retcon" || stepId === "health") {
            await this.#loadRedStepData();
        }
        if (stepId === "retcon") {
            await this.#loadRetconOptions();
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

    async #loadArchetypes() {
        if (!this._chartCache.has("archetypes")) {
            this._chartCache.set("archetypes", await loadChartRows("archetypes"));
        }
    }

    async #loadPersonalities() {
        if (!this._chartCache.has("personalities")) {
            this._chartCache.set("personalities", await loadChartRows("personalities"));
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

    #syncSelectedArchetypeRow() {
        const uuid = this.wizardState.archetype.selectedUuid;
        const rows = this._chartCache.get("archetypes") || [];
        this._selectedArchetypeRow = rows.find(r => r.uuid === uuid) || null;
    }

    #syncSelectedPersonalityRow() {
        const uuid = this.wizardState.personality.selectedUuid;
        const rows = this._chartCache.get("personalities") || [];
        this._selectedPersonalityRow = rows.find(r => r.uuid === uuid) || null;
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
        const required = Array.isArray(wizard.requiredPowers) ? wizard.requiredPowers : [];
        const choices = Array.isArray(wizard.powerChoices) ? wizard.powerChoices : [];
        try {
            this._powerOptions = await expandChoiceList([...required, ...choices]);
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to expand power source choices`, err);
            this._powerOptions = [];
            ui.notifications?.warn("Could not load power choices for this power source.");
        }
        await this.#ensureAbilityMeta(abilityUuidsFromPicks(wizard.abilityPicks));
    }

    async #loadArchetypeDetailsOptions() {
        const wizard = this._selectedArchetypeRow?.wizard || {};
        const choices = [
            ...(wizard.requiredTraits || []),
            ...(wizard.powerChoices || []),
            ...(wizard.qualityChoices || [])
        ];
        this._traitOptions = await expandChoiceList(choices);
        const category = wizard.principleCategory
            || this.wizardState.archetype.principleCategory
            || null;
        this._principles = category ? await loadPrinciplesForCategory(category) : [];
        await this.#ensureAbilityMeta(abilityUuidsFromPicks(wizard.abilityPicks));
    }

    /**
     * Cache ability slot / preview metadata for inline FILL controls.
     * @param {string[]} uuids
     */
    async #ensureAbilityMeta(uuids = []) {
        for (const uuid of uuids) {
            if (!uuid || this._abilityMeta.has(uuid)) continue;
            const doc = await fromUuid(uuid);
            if (!doc) {
                this._abilityMeta.set(uuid, {
                    uuid,
                    name: uuid,
                    slots: [],
                    preview: null
                });
                continue;
            }
            const flags = doc.flags?.[MODULE_ID] || {};
            this._abilityMeta.set(uuid, {
                uuid,
                name: doc.name,
                slots: Array.isArray(flags.slots) ? flags.slots : [],
                preview: flags.gameTextTemplate || stripHtml(doc.system?.gameText) || null,
                abilityType: doc.system?.type || "A"
            });
        }
    }

    async #loadPersonalityDetailsOptions() {
        const wizard = this._selectedPersonalityRow?.wizard || {};
        const outUuid = wizard.outAbilityUuid
            || this.wizardState.personality.outAbilityUuid
            || null;
        this._outSlots = [];
        if (!outUuid) return;
        const ability = await fromUuid(outUuid);
        const slots = ability?.flags?.[MODULE_ID]?.slots;
        if (Array.isArray(slots)) this._outSlots = slots;
    }

    async #loadRedStepData() {
        if (!this._redAbilities.length) {
            this._redAbilities = await loadRedAbilities();
        }
        const assigned = collectAssignedTraits(this.wizardState);
        const uuids = assigned.map(t => t.uuid).filter(Boolean);
        this._traitCategories = await resolveTraitCategories(uuids);
    }

    async #loadRetconOptions() {
        if (!this._allPrinciples.length) {
            this._allPrinciples = await loadAllPrinciples();
        }
        if (!this._allTraitsCatalog.length) {
            this._allTraitsCatalog = await loadAllPowersAndQualities();
        }
        if (!this._redAbilities.length) {
            this._redAbilities = await loadRedAbilities();
        }
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

        const slotTraits = collectAssignedTraits(this.wizardState);
        const abilityPickGroups = (wizard.abilityPicks || []).map((group, index) => {
            const selected = draft.abilitySelections?.[String(index)] || [];
            const count = Number(group?.count) || 0;
            const atLimit = selected.length >= count;
            const color = group?.color || "yellow";
            const incomplete = selected.length !== count;
            return {
                index,
                color,
                title: `${capitalize(color)} abilities`,
                grantText: group?.grantText || null,
                constraint: group?.constraint || null,
                constraintNote: constraintNote(group?.constraint),
                count,
                selectedCount: selected.length,
                incomplete,
                abilities: (group?.abilities || [])
                    .filter(ab => ab?.uuid)
                    .map(ab => {
                        const isSelected = selected.includes(ab.uuid);
                        const meta = this._abilityMeta.get(ab.uuid);
                        return {
                            uuid: ab.uuid,
                            name: ab.name || meta?.name || ab.uuid,
                            selected: isSelected,
                            disabled: atLimit && !isSelected,
                            preview: isSelected ? (meta?.preview || null) : null,
                            slotRows: isSelected
                                ? buildInlineSlotRows(
                                    meta,
                                    slotTraits,
                                    draft.abilitySlotSelections?.[ab.uuid]
                                )
                                : []
                        };
                    })
            };
        });

        return {
            selectedPowerSourceName: draft.selectedName,
            powersIntro: wizard.powersIntro || null,
            powerSourceDiceLabel: bgDice.join(", ") || "—",
            powerSlots: slots,
            abilityPickGroups
        };
    }

    #archetypeChartContext() {
        const draft = this.wizardState.archetype;
        const archDice = this.wizardState.powerSource.archetypeDice || [];
        const legal = this.isGuided ? legalChartNumbers(draft.roll) : null;
        const rows = (this._chartCache.get("archetypes") || []).map(row => {
            const blocked = isArchetypeBlocked(row);
            const rollOk = !this.isGuided || (legal?.includes(row.number) ?? false);
            const available = !blocked && rollOk;
            return {
                number: row.number,
                uuid: row.uuid,
                name: row.name,
                blocked,
                available,
                selected: draft.selectedUuid === row.uuid,
                personalityDiceLabel: (
                    row.wizard.personalityDice || row.flags.personalityDice || []
                ).join(", ") || "—",
                principleLabel: row.wizard.principleCategoryLabel
                    || row.wizard.principleCategory
                    || "—"
            };
        });
        return {
            chartRows: rows,
            rollSummary: formatRollSummary(draft.roll),
            legalNumbers: legal || [],
            archetypeDiceLabel: archDice.join(", ") || "—",
            selectedPowerSourceName: this.wizardState.powerSource.selectedName
        };
    }

    #archetypeDetailsContext() {
        const draft = this.wizardState.archetype;
        const archDice = this.wizardState.powerSource.archetypeDice || [];
        const wizard = this._selectedArchetypeRow?.wizard || {};

        if (!draft.traitAssignments?.length) {
            draft.traitAssignments = buildTraitSlots(archDice, wizard).map(s => ({ ...s }));
        }

        const slots = draft.traitAssignments.map(slot => ({
            ...slot,
            traitOptions: this._traitOptions.map(opt => ({
                ...opt,
                selected: opt.uuid === slot.uuid
            })),
            dieOptions: archDice.map(die => ({
                value: die,
                label: die,
                selected: die === slot.die
            }))
        }));

        const slotTraits = collectAssignedTraits(this.wizardState);
        const abilityPickGroups = (wizard.abilityPicks || []).map((group, index) => {
            const selected = draft.abilitySelections?.[String(index)] || [];
            const count = Number(group.count) || 0;
            const atLimit = selected.length >= count;
            const autoGranted = Boolean(group.autoGranted);
            return {
                index,
                color: group.color,
                title: `${capitalize(group.color)} abilities`,
                grantText: group.grantText || null,
                constraint: group.constraint || null,
                constraintNote: constraintNote(group.constraint),
                autoGranted,
                count,
                selectedCount: selected.length,
                abilities: (group.abilities || []).map(ab => {
                    const isSelected = selected.includes(ab.uuid);
                    const meta = this._abilityMeta.get(ab.uuid);
                    return {
                        uuid: ab.uuid,
                        name: ab.name || meta?.name || ab.uuid,
                        selected: isSelected,
                        disabled: autoGranted || (atLimit && !isSelected),
                        preview: isSelected ? (meta?.preview || null) : null,
                        slotRows: isSelected
                            ? buildInlineSlotRows(
                                meta,
                                slotTraits,
                                draft.abilitySlotSelections?.[ab.uuid]
                            )
                            : []
                    };
                })
            };
        });

        return {
            selectedArchetypeName: draft.selectedName,
            archetypeDiceLabel: archDice.join(", ") || "—",
            assignmentHints: assignmentHints(wizard),
            traitSlots: slots,
            abilityPickGroups,
            principleCategoryLabel: wizard.principleCategoryLabel
                || draft.principleCategory
                || "—",
            principles: this._principles.map(p => ({
                ...p,
                selected: p.uuid === draft.principleUuid
            }))
        };
    }

    #personalityChartContext() {
        const draft = this.wizardState.personality;
        const persDice = this.wizardState.archetype.personalityDice || [];
        const legal = this.isGuided ? legalChartNumbers(draft.roll) : null;
        const rows = (this._chartCache.get("personalities") || []).map(row => {
            const available = !this.isGuided || (legal?.includes(row.number) ?? false);
            const status = row.wizard.statusDie || row.flags.statusDie || row.doc?.system?.statusDie || {};
            return {
                number: row.number,
                uuid: row.uuid,
                name: row.name,
                available,
                selected: draft.selectedUuid === row.uuid,
                statusLabel: `${status.green || "—"} / ${status.yellow || "—"} / ${status.red || "—"}`
            };
        });
        return {
            chartRows: rows,
            rollSummary: formatRollSummary(draft.roll),
            legalNumbers: legal || [],
            personalityDiceLabel: persDice.join(", ") || "—",
            selectedArchetypeName: this.wizardState.archetype.selectedName
        };
    }

    async #personalityDetailsContext() {
        const draft = this.wizardState.personality;
        const wizard = this._selectedPersonalityRow?.wizard || {};
        const special = wizard.specialQuality || {};
        const notes = special.notes || [];
        const needsUpgrade = notes.includes("upgradeOnePowerOrQualityDie");
        const assigned = collectAssignedTraits(this.wizardState);

        const outAbility = draft.outAbilityUuid ? await fromUuid(draft.outAbilityUuid) : null;
        const outPreview = outAbility?.flags?.[MODULE_ID]?.gameTextTemplate
            || stripHtml(outAbility?.system?.gameText)
            || this._selectedPersonalityRow?.doc?.system?.out
            || null;

        const traitOptionsForOut = [
            ...assigned.map(t => ({
                uuid: t.uuid,
                name: t.name,
                die: t.die,
                itemType: t.itemType
            })),
            {
                uuid: "__special__",
                name: draft.specialQualityName?.trim() || "Special quality (this step)",
                die: draft.specialQualityDie || "d8",
                itemType: "quality"
            }
        ];

        const outSlots = this._outSlots.map(slot => {
            const token = slot.token;
            const tokenKey = tokenKeyFromToken(token);
            const selectedUuid = draft.outSlotSelections?.[token] || "";
            const wantedTypes = Array.isArray(slot.itemTypes)
                ? slot.itemTypes
                : (slot.itemType ? [slot.itemType] : null);
            const options = traitOptionsForOut
                .filter(opt => !wantedTypes || wantedTypes.includes(opt.itemType) || opt.uuid === "__special__")
                .map(opt => ({
                    ...opt,
                    selected: opt.uuid === selectedUuid
                }));
            return { token, tokenKey, options };
        });

        return {
            selectedPersonalityName: draft.selectedName,
            statusDie: draft.statusDie || {},
            specialDie: special.dieType || draft.specialQualityDie || "d8",
            specialPrompt: special.namePrompt || "Make up a quality based on your hero's backstory.",
            specialQualityName: draft.specialQualityName || "",
            needsUpgrade,
            upgradeOptions: assigned.map(t => ({
                ...t,
                selected: t.uuid === draft.upgradeTraitUuid
            })),
            healthAnyNote: notes.includes("healthMayUseAnyPowerOrQuality")
                ? "Note for Health: you may use any power or quality when determining Max Health."
                : null,
            outAbilityUuid: draft.outAbilityUuid || null,
            outAbilityName: outAbility?.name || "Out ability",
            outPreview,
            outSlots
        };
    }

    #redAbilitiesContext() {
        const draft = this.wizardState.red;
        const traits = collectEffectiveTraits(this.wizardState, this._traitCategories);
        const selected = new Set(draft.abilityUuids || []);
        const atLimit = selected.size >= RED_PICK_COUNT;

        const groupsMap = new Map();
        for (const ability of this._redAbilities) {
            if (!isRedAbilityEligible(ability, traits)) continue;
            const key = ability.categoryKey || "other";
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key,
                    label: ability.categoryLabel || key,
                    sourceItemType: ability.source?.itemType || "",
                    sourceCategory: ability.source?.category || "",
                    needsD8: true,
                    abilities: []
                });
            }
            const isSelected = selected.has(ability.uuid);
            groupsMap.get(key).abilities.push({
                uuid: ability.uuid,
                name: ability.name,
                abilityType: ability.abilityType,
                selected: isSelected,
                disabled: atLimit && !isSelected,
                preview: isSelected ? (ability.preview || null) : null,
                slotRows: isSelected
                    ? buildInlineSlotRows(ability, traits, draft.slotSelections?.[ability.uuid])
                    : []
            });
        }

        return {
            selectedCount: selected.size,
            eligibleGroups: [...groupsMap.values()]
        };
    }

    async #retconContext() {
        const retcon = this.wizardState.retcon;
        const traits = collectEffectiveTraits(this.wizardState, this._traitCategories)
            .filter(t => t.uuid !== "__special__");
        const redStatus = this.wizardState.personality?.statusDie?.red;
        const canBumpRed = Boolean(redStatus) && String(redStatus).toLowerCase() !== "d12";

        const alreadyPicked = new Set(this.wizardState.red?.abilityUuids || []);
        const effectiveTraits = collectEffectiveTraits(this.wizardState, this._traitCategories);
        const eligibleExtra = this._redAbilities.filter(a =>
            !alreadyPicked.has(a.uuid) && isRedAbilityEligible(a, effectiveTraits)
        );

        const outSummary = this.wizardState.personality?.outAbilityUuid
            ? [{
                uuid: this.wizardState.personality.outAbilityUuid,
                name: "Out ability",
                slots: this._outSlots
            }]
            : [];
        const redSummaries = (this.wizardState.red?.abilityUuids || [])
            .map(uuid => this._redAbilities.find(a => a.uuid === uuid))
            .filter(Boolean);
        const rebindList = rebindableAbilities(this.wizardState, [...redSummaries, ...outSummary]);
        const selectedRebind = rebindList.find(a => a.uuid === retcon.rebindAbilityUuid) || null;

        const options = RETCON_OPTIONS.map(opt => {
            let disabled = false;
            let disabledNote = null;
            if (opt.id === "bumpRedStatus" && !canBumpRed) {
                disabled = true;
                disabledNote = "Red status is already d12.";
            }
            if (opt.id === "extraRed" && !eligibleExtra.length) {
                disabled = true;
                disabledNote = "No additional eligible Red abilities.";
            }
            if (opt.id === "rebindAbility" && !rebindList.length) {
                disabled = true;
                disabledNote = "No selected abilities with power/quality slots to rebind.";
            }
            if (opt.id === "swapDice" && traits.length < 2) {
                disabled = true;
                disabledNote = "Need at least two powers/qualities to swap.";
            }
            return {
                ...opt,
                selected: retcon.option === opt.id,
                disabled,
                disabledNote
            };
        });

        return {
            options,
            isExtraRed: retcon.option === "extraRed",
            isSwapDice: retcon.option === "swapDice",
            isRebind: retcon.option === "rebindAbility",
            isBumpRed: retcon.option === "bumpRedStatus",
            isAddD6: retcon.option === "addD6",
            isSwapPrinciple: retcon.option === "swapPrinciple",
            extraRedChoices: eligibleExtra.map(a => {
                const isSelected = a.uuid === retcon.extraRedUuid;
                return {
                    uuid: a.uuid,
                    name: a.name,
                    categoryLabel: a.categoryLabel,
                    selected: isSelected,
                    preview: isSelected ? (a.preview || null) : null,
                    slotRows: isSelected
                        ? buildInlineSlotRows(a, effectiveTraits, retcon.extraRedSlotSelections)
                        : []
                };
            }),
            traitOptions: traits.map(t => ({
                ...t,
                selectedA: t.uuid === retcon.swapUuidA,
                selectedB: t.uuid === retcon.swapUuidB
            })),
            rebindAbilities: rebindList.map(a => ({
                uuid: a.uuid,
                name: a.name,
                selected: a.uuid === retcon.rebindAbilityUuid
            })),
            rebindTokens: (selectedRebind?.slots || []).map(s => ({
                token: s.token,
                selected: s.token === retcon.rebindToken
            })),
            rebindTraitOptions: traits.map(t => ({
                ...t,
                selected: t.uuid === retcon.rebindTraitUuid
            })),
            currentRedStatus: redStatus || "—",
            nextRedStatus: redStatus ? upgradeDie(redStatus) : "—",
            addD6Options: this._allTraitsCatalog.map(t => ({
                ...t,
                selected: t.uuid === retcon.addD6Uuid
            })),
            firstPrincipleName: this.wizardState.background.principleName || "Principle 1",
            secondPrincipleName: this.wizardState.archetype.principleName || "Principle 2",
            principleSlotFirst: retcon.principleSlot === "first",
            principleSlotSecond: retcon.principleSlot === "second",
            allPrinciples: this._allPrinciples.map(p => ({
                ...p,
                selected: p.uuid === retcon.newPrincipleUuid
            }))
        };
    }

    #healthContext() {
        const draft = this.wizardState;
        const traits = collectEffectiveTraits(draft, this._traitCategories);
        const options = healthTraitOptions(draft, traits);
        refreshHealthComputation(draft, this._traitCategories);
        const health = draft.health;
        const red = draft.personality?.statusDie?.red;
        const notes = draft.personality?.specialNotes || [];

        return {
            redStatusLabel: red || "—",
            redStatusFaces: dieFaces(red),
            bonusOptions: options.map(t => ({
                ...t,
                selected: t.uuid === health.bonusTraitUuid
            })),
            bonusTraitName: health.bonusTraitName,
            bonusDieLabel: health.bonusTraitUuid
                ? (options.find(t => t.uuid === health.bonusTraitUuid)?.die || "d4")
                : "d4",
            bonusDieFaces: health.bonusDieFaces || 4,
            healthAny: notes.includes("healthMayUseAnyPowerOrQuality"),
            varianceTake4: health.varianceMode === "take4",
            varianceRoll: health.varianceMode === "roll",
            varianceLabel: health.varianceMode === "roll"
                ? (health.varianceRoll != null ? `rolled ${health.varianceRoll}` : "roll pending")
                : (health.varianceMode === "take4" ? "take 4" : "—"),
            varianceFaces: health.varianceMode === "roll"
                ? (Number(health.varianceRoll) || 0)
                : (health.varianceMode === "take4" ? 4 : 0),
            varianceRollSummary: health.varianceMode === "roll" && health.varianceRoll != null
                ? { total: health.varianceRoll, detail: health.varianceRollDetail || "1d8" }
                : null,
            healthMax: health.max,
            ranges: health.ranges
        };
    }

    #finishingContext() {
        const identity = this.wizardState.identity || {};
        return {
            heroName: identity.name || "",
            heroAlias: identity.alias || "",
            costume: identity.costume || "",
            physicalFields: PHYSICAL_FIELDS.map(f => ({
                ...f,
                value: identity[f.key] || ""
            })),
            summary: {
                background: this.wizardState.background.selectedName || "—",
                powerSource: this.wizardState.powerSource.selectedName || "—",
                archetype: this.wizardState.archetype.selectedName || "—",
                personality: this.wizardState.personality.selectedName || "—",
                health: this.wizardState.health?.max || "—",
                redCount: (this.wizardState.red?.abilityUuids || []).length
                    + (this.wizardState.retcon?.option === "extraRed" ? 1 : 0)
            }
        };
    }

    /**
     * Persist form field changes into draft state.
     * @this {CharacterCreationWizard}
     */
    static async #onFormSubmit(_event, _form, formData) {
        if (this._stepTransitioning || this._creating) return;
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

        if (step.id === "archetype" && data.archetypeNumber != null) {
            changed = this.#applyArchetypeSelection(Number(data.archetypeNumber)) || changed;
        }

        if (step.id === "archetypeDetails") {
            changed = this.#applyArchetypeDetails(data) || changed;
        }

        if (step.id === "personality" && data.personalityNumber != null) {
            changed = this.#applyPersonalitySelection(Number(data.personalityNumber)) || changed;
        }

        if (step.id === "personalityDetails") {
            changed = this.#applyPersonalityDetails(data) || changed;
        }

        if (step.id === "redAbilities") {
            changed = this.#applyRedAbilities(data) || changed;
        }

        if (step.id === "retcon") {
            changed = this.#applyRetcon(data) || changed;
        }

        if (step.id === "health") {
            changed = this.#applyHealth(data) || changed;
        }

        if (step.id === "finishing") {
            changed = this.#applyFinishing(data) || changed;
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
        this.wizardState.powerSource.abilitySlotSelections = {};
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
        const selectedUuids = [];
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
            selectedUuids.push(...selected);
        }

        draft.abilitySlotSelections = draft.abilitySlotSelections || {};
        for (const uuid of Object.keys(draft.abilitySlotSelections)) {
            if (!selectedUuids.includes(uuid)) {
                delete draft.abilitySlotSelections[uuid];
                changed = true;
            }
        }

        const slotRoot = data.psAbilitySlot || {};
        for (const uuid of selectedUuids) {
            const meta = this._abilityMeta.get(uuid);
            if (!meta) continue;
            const abilityKey = abilityKeyFromUuid(uuid);
            const slotMap = slotRoot[abilityKey] || {};
            draft.abilitySlotSelections[uuid] = draft.abilitySlotSelections[uuid] || {};
            for (const slot of meta.slots || []) {
                const key = tokenKeyFromToken(slot.token);
                const next = slotMap[key] || null;
                if ((draft.abilitySlotSelections[uuid][slot.token] || null) !== next) {
                    draft.abilitySlotSelections[uuid][slot.token] = next;
                    changed = true;
                }
            }
        }

        if (changed) invalidateFrom(this.wizardState, "powerSourceDetails");
        return changed;
    }

    #applyArchetypeSelection(number) {
        const rows = this._chartCache.get("archetypes") || [];
        const row = rows.find(r => r.number === number);
        if (!row || isArchetypeBlocked(row)) return false;
        if (this.isGuided) {
            const legal = legalChartNumbers(this.wizardState.archetype.roll);
            if (!legal.includes(number)) return false;
        }
        if (this.wizardState.archetype.selectedUuid === row.uuid) return false;

        invalidateFrom(this.wizardState, "archetype");
        const wizard = row.wizard || {};
        this.wizardState.archetype.selectedNumber = row.number;
        this.wizardState.archetype.selectedUuid = row.uuid;
        this.wizardState.archetype.selectedName = row.name;
        this.wizardState.archetype.personalityDice = [
            ...(wizard.personalityDice || row.flags.personalityDice || [])
        ];
        this.wizardState.archetype.principleCategory = wizard.principleCategory || null;
        this.wizardState.archetype.traitAssignments = buildTraitSlots(
            this.wizardState.powerSource.archetypeDice,
            wizard
        ).map(s => ({ ...s }));
        this.wizardState.archetype.abilitySelections = defaultAbilitySelections(wizard);
        this.wizardState.archetype.abilitySlotSelections = {};
        this._selectedArchetypeRow = row;
        return true;
    }

    #applyArchetypeDetails(data) {
        const draft = this.wizardState.archetype;
        const wizard = this._selectedArchetypeRow?.wizard || {};
        const slots = draft.traitAssignments || [];
        let changed = false;

        const uuidMap = data.traitUuid || {};
        const dieMap = data.traitDie || {};
        for (const slot of slots) {
            const key = String(slot.slotIndex);
            const nextUuid = slot.lockedUuid || uuidMap[key] || null;
            const nextDie = dieMap[key] || null;
            const opt = this._traitOptions.find(o => o.uuid === nextUuid);
            const nextName = slot.lockedName || opt?.name || null;
            const nextType = slot.lockedUuid
                ? slot.itemType
                : (opt?.itemType || slot.itemType || null);
            if (slot.uuid !== nextUuid || slot.die !== nextDie || slot.itemType !== nextType) {
                slot.uuid = nextUuid;
                slot.name = nextName;
                slot.die = nextDie;
                slot.itemType = nextType;
                changed = true;
            }
        }

        const pickMap = data.abilityPick || {};
        const groups = wizard.abilityPicks || [];
        const selectedUuids = [];
        for (let i = 0; i < groups.length; i++) {
            const key = String(i);
            const group = groups[i];
            let selected;
            if (group.autoGranted) {
                selected = (group.abilities || []).map(a => a.uuid).filter(Boolean);
            } else {
                selected = pickMap[key];
                if (selected == null) selected = [];
                if (!Array.isArray(selected)) selected = [selected];
                selected = selected.filter(Boolean);
                const need = Number(group.count) || 0;
                if (selected.length > need) selected = selected.slice(0, need);
            }
            const prev = draft.abilitySelections[key] || [];
            if (prev.join("|") !== selected.join("|")) {
                draft.abilitySelections[key] = selected;
                changed = true;
            }
            selectedUuids.push(...selected);
        }

        draft.abilitySlotSelections = draft.abilitySlotSelections || {};
        for (const uuid of Object.keys(draft.abilitySlotSelections)) {
            if (!selectedUuids.includes(uuid)) {
                delete draft.abilitySlotSelections[uuid];
                changed = true;
            }
        }

        const slotRoot = data.archAbilitySlot || {};
        for (const uuid of selectedUuids) {
            const meta = this._abilityMeta.get(uuid);
            if (!meta) continue;
            const abilityKey = abilityKeyFromUuid(uuid);
            const slotMap = slotRoot[abilityKey] || {};
            draft.abilitySlotSelections[uuid] = draft.abilitySlotSelections[uuid] || {};
            for (const slot of meta.slots || []) {
                const key = tokenKeyFromToken(slot.token);
                const next = slotMap[key] || null;
                if ((draft.abilitySlotSelections[uuid][slot.token] || null) !== next) {
                    draft.abilitySlotSelections[uuid][slot.token] = next;
                    changed = true;
                }
            }
        }

        if (data.principleUuid && data.principleUuid !== draft.principleUuid) {
            const principle = this._principles.find(p => p.uuid === data.principleUuid);
            draft.principleUuid = data.principleUuid;
            draft.principleName = principle?.name || null;
            changed = true;
        }

        if (changed) invalidateFrom(this.wizardState, "archetypeDetails");
        return changed;
    }

    #applyPersonalitySelection(number) {
        const rows = this._chartCache.get("personalities") || [];
        const row = rows.find(r => r.number === number);
        if (!row) return false;
        if (this.isGuided) {
            const legal = legalChartNumbers(this.wizardState.personality.roll);
            if (!legal.includes(number)) return false;
        }
        if (this.wizardState.personality.selectedUuid === row.uuid) return false;

        invalidateFrom(this.wizardState, "personality");
        const wizard = row.wizard || {};
        const status = wizard.statusDie || row.flags.statusDie || row.doc?.system?.statusDie || {};
        this.wizardState.personality.selectedNumber = row.number;
        this.wizardState.personality.selectedUuid = row.uuid;
        this.wizardState.personality.selectedName = row.name;
        this.wizardState.personality.statusDie = {
            green: status.green || null,
            yellow: status.yellow || null,
            red: status.red || null
        };
        this.wizardState.personality.outAbilityUuid = wizard.outAbilityUuid
            || wizard.outAbility?.uuid
            || row.flags.outAbilityUuid
            || null;
        this.wizardState.personality.specialQualityDie = wizard.specialQuality?.dieType || "d8";
        this.wizardState.personality.specialNotes = [...(wizard.specialQuality?.notes || [])];
        this.wizardState.personality.outSlotSelections = {};
        this.wizardState.personality.upgradeTraitUuid = null;
        this._selectedPersonalityRow = row;
        return true;
    }

    #applyPersonalityDetails(data) {
        const draft = this.wizardState.personality;
        let changed = false;

        const nextName = data.specialQualityName != null
            ? String(data.specialQualityName)
            : draft.specialQualityName;
        if (nextName !== draft.specialQualityName) {
            draft.specialQualityName = nextName;
            changed = true;
        }

        if (data.upgradeTraitUuid !== undefined) {
            const next = data.upgradeTraitUuid || null;
            if (next !== draft.upgradeTraitUuid) {
                draft.upgradeTraitUuid = next;
                changed = true;
            }
        }

        const outMap = data.outSlot || {};
        for (const slot of this._outSlots) {
            const key = tokenKeyFromToken(slot.token);
            const next = outMap[key] || null;
            if ((draft.outSlotSelections[slot.token] || null) !== next) {
                draft.outSlotSelections[slot.token] = next;
                changed = true;
            }
        }

        if (changed) invalidateFrom(this.wizardState, "personalityDetails");
        return changed;
    }

    #applyRedAbilities(data) {
        const draft = this.wizardState.red;
        let changed = false;

        let selected = data.redAbility;
        if (selected == null) selected = [];
        if (!Array.isArray(selected)) selected = [selected];
        selected = selected.filter(Boolean).slice(0, RED_PICK_COUNT);
        const prev = draft.abilityUuids || [];
        if (prev.join("|") !== selected.join("|")) {
            draft.abilityUuids = selected;
            for (const uuid of Object.keys(draft.slotSelections || {})) {
                if (!selected.includes(uuid)) delete draft.slotSelections[uuid];
            }
            changed = true;
            invalidateFrom(this.wizardState, "redAbilities");
        }

        const slotRoot = data.redSlot || {};
        for (const uuid of draft.abilityUuids || []) {
            const ability = this._redAbilities.find(a => a.uuid === uuid);
            if (!ability) continue;
            const abilityKey = abilityKeyFromUuid(uuid);
            const slotMap = slotRoot[abilityKey] || {};
            draft.slotSelections[uuid] = draft.slotSelections[uuid] || {};
            for (const slot of ability.slots || []) {
                const key = tokenKeyFromToken(slot.token);
                const next = slotMap[key] || null;
                if ((draft.slotSelections[uuid][slot.token] || null) !== next) {
                    draft.slotSelections[uuid][slot.token] = next;
                    changed = true;
                }
            }
        }

        return changed;
    }

    #applyRetcon(data) {
        const draft = this.wizardState.retcon;
        let changed = false;

        if (data.retconOption && isValidRetconOption(data.retconOption)) {
            if (draft.option !== data.retconOption) {
                const empty = createEmptyDraft().retcon;
                Object.assign(draft, empty);
                draft.option = data.retconOption;
                changed = true;
                invalidateFrom(this.wizardState, "retcon");
            }
        }

        if (draft.option === "extraRed") {
            if (data.extraRedUuid !== undefined && data.extraRedUuid !== draft.extraRedUuid) {
                draft.extraRedUuid = data.extraRedUuid || null;
                draft.extraRedSlotSelections = {};
                changed = true;
            }
            const slotMap = data.extraRedSlot || {};
            const ability = this._redAbilities.find(a => a.uuid === draft.extraRedUuid);
            for (const slot of ability?.slots || []) {
                const key = tokenKeyFromToken(slot.token);
                const next = slotMap[key] || null;
                if ((draft.extraRedSlotSelections[slot.token] || null) !== next) {
                    draft.extraRedSlotSelections[slot.token] = next;
                    changed = true;
                }
            }
        }

        if (draft.option === "swapDice") {
            if (data.swapUuidA !== undefined && data.swapUuidA !== draft.swapUuidA) {
                draft.swapUuidA = data.swapUuidA || null;
                changed = true;
            }
            if (data.swapUuidB !== undefined && data.swapUuidB !== draft.swapUuidB) {
                draft.swapUuidB = data.swapUuidB || null;
                changed = true;
            }
        }

        if (draft.option === "rebindAbility") {
            if (data.rebindAbilityUuid !== undefined && data.rebindAbilityUuid !== draft.rebindAbilityUuid) {
                draft.rebindAbilityUuid = data.rebindAbilityUuid || null;
                draft.rebindToken = null;
                draft.rebindTraitUuid = null;
                changed = true;
            }
            if (data.rebindToken !== undefined && data.rebindToken !== draft.rebindToken) {
                draft.rebindToken = data.rebindToken || null;
                changed = true;
            }
            if (data.rebindTraitUuid !== undefined && data.rebindTraitUuid !== draft.rebindTraitUuid) {
                draft.rebindTraitUuid = data.rebindTraitUuid || null;
                changed = true;
            }
        }

        if (draft.option === "addD6" && data.addD6Uuid !== undefined) {
            const next = data.addD6Uuid || null;
            if (next !== draft.addD6Uuid) {
                const opt = this._allTraitsCatalog.find(t => t.uuid === next);
                draft.addD6Uuid = next;
                draft.addD6Name = opt?.name || null;
                draft.addD6ItemType = opt?.itemType || null;
                changed = true;
            }
        }

        if (draft.option === "swapPrinciple") {
            if (data.principleSlot !== undefined && data.principleSlot !== draft.principleSlot) {
                draft.principleSlot = data.principleSlot || null;
                changed = true;
            }
            if (data.newPrincipleUuid !== undefined && data.newPrincipleUuid !== draft.newPrincipleUuid) {
                const principle = this._allPrinciples.find(p => p.uuid === data.newPrincipleUuid);
                draft.newPrincipleUuid = data.newPrincipleUuid || null;
                draft.newPrincipleName = principle?.name || null;
                changed = true;
            }
        }

        return changed;
    }

    #applyHealth(data) {
        const health = this.wizardState.health;
        let changed = false;

        if (data.healthBonusTraitUuid !== undefined) {
            const next = data.healthBonusTraitUuid || null;
            if (next !== health.bonusTraitUuid) {
                health.bonusTraitUuid = next;
                changed = true;
            }
        }

        if (data.healthVarianceMode === "take4" || data.healthVarianceMode === "roll") {
            if (health.varianceMode !== data.healthVarianceMode) {
                health.varianceMode = data.healthVarianceMode;
                if (data.healthVarianceMode === "take4") {
                    health.varianceRoll = null;
                    health.varianceRollDetail = null;
                }
                changed = true;
            }
        }

        if (changed) refreshHealthComputation(this.wizardState, this._traitCategories);
        return changed;
    }

    #applyFinishing(data) {
        const identity = this.wizardState.identity;
        let changed = false;

        if (data.heroName !== undefined) {
            const next = String(data.heroName || "");
            if (next !== (identity.name || "")) {
                identity.name = next;
                changed = true;
            }
        }
        if (data.heroAlias !== undefined) {
            const next = String(data.heroAlias || "");
            if (next !== (identity.alias || "")) {
                identity.alias = next;
                changed = true;
            }
        }
        if (data.costume !== undefined) {
            const next = String(data.costume || "");
            if (next !== (identity.costume || "")) {
                identity.costume = next;
                changed = true;
            }
        }

        const physical = data.physical || {};
        for (const field of PHYSICAL_FIELDS) {
            if (physical[field.key] !== undefined) {
                const next = String(physical[field.key] || "");
                if (next !== (identity[field.key] || "")) {
                    identity[field.key] = next;
                    changed = true;
                }
            }
        }

        return changed;
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onNext(event, _target) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!this.canGoNext || this._stepTransitioning) return;
        const nextIndex = this.wizardState.stepIndex + 1;
        if (nextIndex >= STEPS.length) return;
        await this.#transitionToStep(nextIndex);
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onBack(event, _target) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!this.canGoBack || this._stepTransitioning) return;
        await this.#transitionToStep(Math.max(0, this.wizardState.stepIndex - 1));
    }

    /**
     * Advance/rewind steps with recovery so a render throw cannot leave the
     * fixed-id wizard stuck in AppV2 ERROR with a null element.
     * @param {number} nextIndex
     */
    async #transitionToStep(nextIndex) {
        const prevIndex = this.wizardState.stepIndex;
        if (nextIndex === prevIndex) return;
        this._stepTransitioning = true;
        this.wizardState.stepIndex = nextIndex;
        try {
            await this.render();
        } catch (err) {
            this.wizardState.stepIndex = prevIndex;
            console.error(`${MODULE_ID} | Wizard step transition failed`, err);
            ui.notifications?.error("Wizard step failed. Check the console for details.");
            await this.#recoverAfterRenderError();
        } finally {
            this._stepTransitioning = false;
        }
    }

    /**
     * Re-mount the wizard after AppV2 tears down the element on render failure.
     */
    async #recoverAfterRenderError() {
        const states = ApplicationV2.RENDER_STATES;
        if (this.element && this.state === states.RENDERED) return;
        try {
            await this.render({ force: true });
        } catch (err) {
            console.error(`${MODULE_ID} | Wizard recovery render failed`, err);
            foundry.applications.instances.delete(this.id);
            ui.notifications?.warn("The wizard closed after an error. Use Create SCRPG Hero… to open a new one.");
        }
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onCancel(event, _target) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        await this.close();
    }

    /**
     * Silent Health variance roll (1d8).
     * @this {CharacterCreationWizard}
     */
    static async #onHealthRoll(_event, _target) {
        if (this.currentStep.id !== "health") return;
        if (this.wizardState.health.varianceMode !== "roll") {
            this.wizardState.health.varianceMode = "roll";
        }
        const result = await rollHealthVariance();
        this.wizardState.health.varianceRoll = result.total;
        this.wizardState.health.varianceRollDetail = result.detail;
        refreshHealthComputation(this.wizardState, this._traitCategories);
        await this.render();
    }

    /**
     * @this {CharacterCreationWizard}
     */
    static async #onCreateHero(_event, _target) {
        if (!this.canGoNext || this._creating) return;
        if (this.currentStep.id !== "finishing") return;
        const name = String(this.wizardState.identity?.name || "").trim();
        if (!name) {
            ui.notifications?.warn("Enter a hero name before creating.");
            return;
        }

        this._creating = true;
        await this.render();
        try {
            const actor = await createHeroFromDraft(this.wizardState);
            ui.notifications?.info(`Created hero “${actor.name}”.`);
            await this.close();
            actor.sheet?.render(true);
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to create hero from wizard`, err);
            ui.notifications?.error("Failed to create hero. Check the console for details.");
            this._creating = false;
            await this.render();
        }
    }

    /**
     * Open a chart option's Item sheet from its content-tag name without selecting the row.
     * @this {CharacterCreationWizard}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onPreviewChartItem(event, target) {
        // Keep the surrounding radio/label from selecting this row, and stop
        // Foundry's global .content-link handler from double-opening the sheet.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const uuid = target.dataset.uuid;
        if (!uuid) return;
        const doc = await fromUuid(uuid);
        if (!doc) {
            ui.notifications?.warn("Could not open that compendium entry.");
            return;
        }
        doc.sheet?.render(true);
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
            this.#clearIllegalSelection("background");
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
            this.#clearIllegalSelection("powerSource");
            await this.render();
            return;
        }
        if (step.id === "archetype") {
            const formula = archetypeRollFormula(this.wizardState.powerSource.archetypeDice);
            if (!formula) {
                ui.notifications?.warn("Power Source has no archetype dice to roll.");
                return;
            }
            this.wizardState.archetype.roll = await rollChart(formula);
            this.#clearIllegalSelection("archetype");
            await this.render();
            return;
        }
        if (step.id === "personality") {
            const formula = personalityRollFormula(this.wizardState.archetype.personalityDice);
            if (!formula) {
                ui.notifications?.warn("Archetype has no personality dice to roll.");
                return;
            }
            this.wizardState.personality.roll = await rollChart(formula);
            this.#clearIllegalSelection("personality");
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
            this.#clearIllegalSelection("background");
            await this.render();
            return;
        }
        if (step.id === "powerSource") {
            const formula = powerSourceRollFormula(this.wizardState.background.powerSourceDice);
            const prior = this.wizardState.powerSource.roll;
            this.wizardState.powerSource.roll = prior?.formula
                ? await rerollChart(prior)
                : await rollChart(formula);
            this.#clearIllegalSelection("powerSource");
            await this.render();
            return;
        }
        if (step.id === "archetype") {
            const formula = archetypeRollFormula(this.wizardState.powerSource.archetypeDice);
            const prior = this.wizardState.archetype.roll;
            this.wizardState.archetype.roll = prior?.formula
                ? await rerollChart(prior)
                : await rollChart(formula);
            this.#clearIllegalSelection("archetype");
            await this.render();
            return;
        }
        if (step.id === "personality") {
            const formula = personalityRollFormula(this.wizardState.archetype.personalityDice);
            const prior = this.wizardState.personality.roll;
            this.wizardState.personality.roll = prior?.formula
                ? await rerollChart(prior)
                : await rollChart(formula);
            this.#clearIllegalSelection("personality");
            await this.render();
        }
    }

    /**
     * @param {"background"|"powerSource"|"archetype"|"personality"} key
     */
    #clearIllegalSelection(key) {
        const bucket = this.wizardState[key];
        if (bucket?.selectedNumber == null) return;
        const legal = legalChartNumbers(bucket.roll);
        if (legal.includes(bucket.selectedNumber)) {
            if (key === "archetype") {
                const row = (this._chartCache.get("archetypes") || [])
                    .find(r => r.number === bucket.selectedNumber);
                if (row && !isArchetypeBlocked(row)) return;
            } else {
                return;
            }
        }
        invalidateFrom(this.wizardState, key);
        bucket.selectedNumber = null;
        bucket.selectedUuid = null;
        bucket.selectedName = null;
        if (key === "background") this._selectedBackgroundRow = null;
        if (key === "powerSource") this._selectedPowerSourceRow = null;
        if (key === "archetype") this._selectedArchetypeRow = null;
        if (key === "personality") this._selectedPersonalityRow = null;
    }
}

function capitalize(value) {
    const s = String(value || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function constraintNote(constraint) {
    if (constraint === "differentPower") {
        return "Each chosen ability should use a different power (fill slots below each pick).";
    }
    if (constraint === "atLeastTwoDifferentPowers") {
        return "Use at least two different powers across the chosen abilities (fill slots below each pick).";
    }
    if (constraint === "includeFlightOrSignatureVehicle") {
        return "At least one chosen ability should use Flight or Signature Vehicle.";
    }
    return null;
}

function tokenKeyFromToken(token) {
    return String(token || "")
        .replace(/^\[/, "")
        .replace(/\]$/, "")
        .replace(/[^a-zA-Z0-9]+/g, "_");
}

function abilityKeyFromUuid(uuid) {
    return String(uuid || "").replace(/[^a-zA-Z0-9]+/g, "_");
}

function abilityUuidsFromPicks(abilityPicks = []) {
    const uuids = [];
    for (const group of abilityPicks || []) {
        for (const ab of group?.abilities || []) {
            if (ab?.uuid) uuids.push(ab.uuid);
        }
    }
    return uuids;
}

/**
 * Inline FILL dropdown rows for a selected ability.
 * @param {{uuid?:string,slots?:Array<object>}|null|undefined} ability
 * @param {Array<object>} traits
 * @param {Record<string, string>|null|undefined} slotSelections
 */
function buildInlineSlotRows(ability, traits, slotSelections) {
    if (!ability) return [];
    return slotOptionsForAbility(ability, traits).map(row => ({
        token: row.token,
        tokenKey: tokenKeyFromToken(row.token),
        abilityKey: abilityKeyFromUuid(ability.uuid),
        options: row.options.map(opt => ({
            ...opt,
            selected: slotSelections?.[row.token] === opt.uuid
        }))
    }));
}

function stripHtml(html) {
    return String(html || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
