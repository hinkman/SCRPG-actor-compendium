/**
 * Enrich src/data chart entries with structured wizard metadata so packed
 * Item flags no longer require free-text parsing at runtime for Steps 1–4.
 *
 * Usage: node ./tools/enrich-wizard-metadata.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
    COMPLEX_ARCHETYPES,
    ROOT,
    abilityConstraint,
    loadCatalogs,
    parseAbilityPickCount,
    parseChoiceLine,
    parsePersonalityDiceFromText,
    parsePrincipleCategory,
    parseQualityDiceIntro,
    parseDiceFromText
} from "./wizard-choice-schema.mjs";
import { classifyArchetypeParagraphs, normalizePersonalityParagraph } from "./archetype-description.mjs";

function writeJson(file, data) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function buildAbilityPick(color, grantText, abilities, { countOverride = undefined } = {}) {
    const list = abilities.filter(a => a.color === color).map(a => ({
        color: a.color,
        name: a.name,
        uuid: a.uuid
    }));
    let count = countOverride;
    if (count === undefined) {
        const parsed = parseAbilityPickCount(grantText);
        count = parsed === null ? list.length : parsed;
    }
    return {
        color,
        count,
        grantText: grantText || null,
        constraint: abilityConstraint(grantText),
        abilities: list
    };
}

function enrichBackgrounds(catalog) {
    const file = path.join(ROOT, "src/data/backgrounds.json");
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const entry of entries) {
        const diceInfo = parseQualityDiceIntro(entry.qualitiesIntro);
        const principle = parsePrincipleCategory(entry.principle);
        if (!principle) throw new Error(`Background ${entry.name}: missing principle category`);

        const qualityChoices = entry.qualities.map(line => parseChoiceLine(line, catalog, "qualities"));
        let requiredQualities = [];
        if (diceInfo.requiredQualityName) {
            const required = catalog.qualityByName.get(diceInfo.requiredQualityName);
            if (!required) throw new Error(`Background ${entry.name}: missing required quality ${diceInfo.requiredQualityName}`);
            requiredQualities = [{ ...required, required: true }];
        }

        entry.wizard = {
            qualityDice: diceInfo.qualityDice,
            qualityPickCount: diceInfo.qualityPickCount,
            qualityAssignmentMode: diceInfo.mode,
            qualitiesIntro: diceInfo.qualitiesIntro,
            qualityChoices,
            requiredQualities,
            principleCategory: principle.key,
            principleCategoryLabel: principle.label,
            powerSourceDice: entry.powerSourceDice
        };
    }
    writeJson(file, entries);
    return entries;
}

function enrichPowerSources(catalog) {
    const file = path.join(ROOT, "src/data/powerSources.json");
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const entry of entries) {
        const powerChoices = entry.powers.map(line => parseChoiceLine(line, catalog, "powers"));
        const requiredPowers = [];
        // Powered Suit: intro requires Power Suit before the remaining list.
        if (/Assign one die to the power Power Suit/i.test(entry.powersIntro || "")) {
            const powerSuit = catalog.powerByName.get("Power Suit");
            if (!powerSuit) throw new Error("Power Suit power missing from catalog");
            requiredPowers.push({ ...powerSuit, required: true });
        }

        const yellowGrant = entry.yellowGrant || null;
        const greenGrant = entry.greenGrant || null;
        const abilityPicks = [];
        if (yellowGrant || entry.abilities.some(a => a.color === "yellow")) {
            abilityPicks.push(buildAbilityPick("yellow", yellowGrant, entry.abilities));
        }
        if (greenGrant || entry.abilities.some(a => a.color === "green")) {
            abilityPicks.push(buildAbilityPick("green", greenGrant, entry.abilities));
        }

        entry.wizard = {
            powersIntro: entry.powersIntro || null,
            powerChoices,
            requiredPowers,
            assignAllBackgroundDice: !/Assign one die to the power Power Suit/i.test(entry.powersIntro || ""),
            abilityPicks,
            archetypeDice: entry.archetypeDice,
            additionalInfo: entry.additionalInfo || [],
            // Additional grants remain free-text for Slice A (extra quality/power upgrades).
            remainingFreeText: (entry.additionalInfo || []).length
                ? ["additionalInfo: structured bonus grants deferred; keep prose for display"]
                : []
        };
    }
    writeJson(file, entries);
    return entries;
}

function extractArchetypeChoiceBlocks(description) {
    const paragraphs = description.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const buckets = classifyArchetypeParagraphs(paragraphs);
    const pq = buckets.powersQualities;

    const blocks = [];
    let current = null;
    for (const para of pq) {
        if (/^Assign\b/i.test(para)) {
            if (current) blocks.push(current);
            current = { instruction: para, lines: [] };
            continue;
        }
        if (para.startsWith("• ") && current) {
            current.lines.push(para.slice(2).trim());
            continue;
        }
        if (current) {
            // Continuation sentences (e.g. "If you already have…") stay on the instruction.
            current.instruction = `${current.instruction} ${para}`.trim();
        }
    }
    if (current) blocks.push(current);
    return { buckets, blocks };
}

function detectGrantColor(para) {
    if (/\bat Yellow\b|\bas a Yellow\b|\bYellow (?:form )?abilit/i.test(para)) return "yellow";
    if (/\bat Red\b|\bas a Red\b|\bRed (?:form )?abilit/i.test(para)) return "red";
    if (/\bGreen (?:form )?abilit|\bGreen forms?\b|\bGreen abilit/i.test(para)) return "green";
    if (/\bYellow\b/i.test(para)) return "yellow";
    if (/\bRed\b/i.test(para)) return "red";
    if (/\bGreen\b/i.test(para)) return "green";
    return null;
}

function namedAbilitiesInText(para, abilities) {
    const found = [];
    const sorted = [...abilities].sort((a, b) => b.name.length - a.name.length);
    for (const ability of sorted) {
        const re = new RegExp(`\\b${ability.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (re.test(para)) found.push(ability);
    }
    return found;
}

function isSingularAbilityGrant(para) {
    if (/\b(?:one|two|three|four|\d+)\s+of\b/i.test(para)) return false;
    if (/\babilities\b/i.test(para) && !/\bability\b/i.test(para)) return false;
    return /\bability\b/i.test(para) || /Gain the following Green ability/i.test(para);
}

function enrichArchetypeAbilityPicks(entry, buckets) {
    const picks = [];
    const remainingByColor = {
        green: entry.abilities.filter(a => a.color === "green").map(a => ({ ...a })),
        yellow: entry.abilities.filter(a => a.color === "yellow").map(a => ({ ...a })),
        red: entry.abilities.filter(a => a.color === "red").map(a => ({ ...a }))
    };
    const abilityParas = buckets.abilities.filter(p =>
        /\babilit(?:y|ies)\b/i.test(p) &&
        !/cannot use any abilities/i.test(p) &&
        !/abilities from your principles/i.test(p) &&
        !/^These abilities are available to you in any form/i.test(p)
    );

    for (const para of abilityParas) {
        const color = detectGrantColor(para);
        if (!color) continue;
        if (picks.some(p => p.grantText === para)) continue;

        const pool = remainingByColor[color] || [];
        let count = parseAbilityPickCount(para);
        const named = namedAbilitiesInText(para, entry.abilities.filter(a => a.color === color));
        const singular = isSingularAbilityGrant(para);
        const fromAbove = /above abilities/i.test(para);

        let listed;
        if (singular) {
            listed = named.length ? named.slice(0, 1) : pool.slice(0, 1);
            count = 1;
            const taken = new Set(listed.map(a => a.uuid));
            remainingByColor[color] = pool.filter(a => !taken.has(a.uuid));
        } else if (fromAbove) {
            listed = [...pool];
            if (count === null) count = 1;
        } else if (named.length) {
            listed = named;
            if (count === null) count = named.length;
        } else {
            // "Gain three of these" after a singular auto-grant → leftover pool.
            listed = [...pool];
            if (count === null) count = listed.length;
        }

        picks.push({
            color,
            count,
            grantText: para,
            constraint: abilityConstraint(para),
            abilities: listed.map(a => ({ color: a.color, name: a.name, uuid: a.uuid })),
            fromAboveList: fromAbove,
            autoGranted: singular
        });
    }

    return picks;
}

function enrichArchetypes(catalog) {
    const file = path.join(ROOT, "src/data/archetypes.json");
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));

    for (const entry of entries) {
        const complexInfo = COMPLEX_ARCHETYPES[entry.name] || null;
        const { buckets, blocks } = extractArchetypeChoiceBlocks(entry.description);

        const principlePara = buckets.principle[0] || null;
        const principle = parsePrincipleCategory(principlePara || "");
        const personalityPara = buckets.personality[0] ||
            entry.description.split(/\n+/).map(s => s.trim()).find(l => /personality/i.test(l)) ||
            "Roll d10, d10 for personality selection.";
        const personalityDice = entry.personalityDice?.length
            ? entry.personalityDice.map(d => d.toLowerCase())
            : parsePersonalityDiceFromText(normalizePersonalityParagraph(personalityPara));

        // Persist personalityDice on the entry for description rebuilds.
        entry.personalityDice = personalityDice;

        const powerChoices = [];
        const qualityChoices = [];
        const requiredTraits = [];
        const assignmentSteps = [];

        for (const block of blocks) {
            const isQualityBlock = /qualities\b/i.test(block.instruction) && !/powers?\b.*qualities\b/i.test(block.instruction)
                ? /any of these qualities|to any of these qualities|remaining dice to any of these qualities/i.test(block.instruction)
                : /qualities\b/i.test(block.instruction) && !/powers\b/i.test(block.instruction);
            const prefersQualities = /to any of these qualities|remaining dice to any of these qualities|Assign any remaining dice to any of these qualities/i.test(block.instruction);
            const prefersPowers = /to any of (?:the following|these) powers|remaining dice to any of (?:the following|these) powers/i.test(block.instruction);

            let pack = null;
            if (prefersQualities) pack = "qualities";
            else if (prefersPowers) pack = "powers";
            else if (isQualityBlock) pack = "qualities";
            else pack = "powers";

            const choices = [];
            for (const line of block.lines) {
                // Skip minion-form chart bullets that aren't trait choices.
                if (/\(\+?\d/.test(line)) continue;
                try {
                    choices.push(parseChoiceLine(line, catalog, pack));
                } catch (err) {
                    // Some archetype bullets mix packs; try the other pack once.
                    const other = pack === "powers" ? "qualities" : "powers";
                    try {
                        choices.push(parseChoiceLine(line, catalog, other));
                    } catch {
                        throw err;
                    }
                }
            }

            // Required trait sentences: "Assign one ... to the Speed power"
            const requiredMatch = block.instruction.match(
                /Assign one of the dice you rolled at the end of the power source step to (?:the |a )?(?:power from the )?(.+?)(?: power| quality)?\./i
            );
            if (requiredMatch && !block.lines.length) {
                const raw = requiredMatch[1].replace(/^the\s+/i, "").trim();
                if (/Self Control category/i.test(block.instruction)) {
                    requiredTraits.push({
                        kind: "category",
                        pack: "powers",
                        categoryKey: "self-control",
                        categoryLabel: "Self Control",
                        required: true,
                        instruction: block.instruction
                    });
                } else {
                    const named = catalog.powerByName.get(raw) || catalog.qualityByName.get(raw);
                    if (named) {
                        requiredTraits.push({ ...named, required: true, instruction: block.instruction });
                    }
                }
            } else if (/Assign one of the dice.*to the (.+?) (?:power|quality)/i.test(block.instruction)) {
                const m = block.instruction.match(/Assign one of the dice.*?to the (.+?) (power|quality)/i);
                if (m) {
                    const named = m[2].toLowerCase() === "power"
                        ? catalog.powerByName.get(m[1])
                        : catalog.qualityByName.get(m[1]);
                    if (named) requiredTraits.push({ ...named, required: true, instruction: block.instruction });
                }
            }

            if (choices.length) {
                const step = {
                    instruction: block.instruction,
                    pack,
                    choices
                };
                assignmentSteps.push(step);
                if (pack === "powers") powerChoices.push(...choices);
                else qualityChoices.push(...choices);
            } else if (!requiredTraits.length) {
                assignmentSteps.push({
                    instruction: block.instruction,
                    pack: null,
                    choices: [],
                    unstructured: true
                });
            }
        }

        // Close Quarters Combatant requires Close Combat quality — often in prose without a lone Assign block.
        if (/Close Combat quality/i.test(entry.description) && entry.name === "Close Quarters Combatant") {
            const cc = catalog.qualityByName.get("Close Combat");
            if (cc && !requiredTraits.some(t => t.name === "Close Combat")) {
                requiredTraits.push({ ...cc, required: true });
            }
        }

        const abilityPicks = enrichArchetypeAbilityPicks(entry, buckets);

        entry.wizard = {
            complex: Boolean(complexInfo),
            complexKey: complexInfo?.key || null,
            wizardBlocked: Boolean(complexInfo),
            actorFlags: complexInfo?.actorFlags || null,
            personalityDice,
            principleCategory: principle?.key || null,
            principleCategoryLabel: principle?.label || null,
            principleText: principlePara,
            requiredTraits,
            assignmentSteps,
            powerChoices,
            qualityChoices,
            abilityPicks,
            remainingFreeText: complexInfo
                ? [`Complex archetype (${complexInfo.key}): nested UX deferred; wizardBlocked=true`]
                : assignmentSteps.some(s => s.unstructured)
                    ? ["Some assignmentSteps.instruction lines still need human reading for die counts (one vs remaining)"]
                    : []
        };
    }

    writeJson(file, entries);
    return entries;
}

function enrichPersonalities() {
    const file = path.join(ROOT, "src/data/personalities.json");
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const entry of entries) {
        const notes = [];
        if (/Upgrade one of your power or quality dice/i.test(entry.description)) {
            notes.push("upgradeOnePowerOrQualityDie");
        }
        if (/When determining your health during Step 7.*any power or quality/i.test(entry.description)) {
            notes.push("healthMayUseAnyPowerOrQuality");
        }
        entry.wizard = {
            statusDie: { ...entry.statusDie },
            outAbilityUuid: entry.outAbility.uuid,
            outAbility: { ...entry.outAbility },
            specialQuality: {
                kind: "custom",
                dieType: "d8",
                namePrompt: "Make up a quality based on your hero's backstory.",
                notes
            }
        };
    }
    writeJson(file, entries);
    return entries;
}

export function enrichAll() {
    const catalog = loadCatalogs();
    const backgrounds = enrichBackgrounds(catalog);
    const powerSources = enrichPowerSources(catalog);
    const archetypes = enrichArchetypes(catalog);
    const personalities = enrichPersonalities();

    // Validation summary
    const blocked = archetypes.filter(a => a.wizard.wizardBlocked).map(a => a.name);
    console.log(`Enriched ${backgrounds.length} backgrounds, ${powerSources.length} power sources, ${archetypes.length} archetypes, ${personalities.length} personalities`);
    console.log(`Wizard-blocked complex archetypes: ${blocked.join(", ")}`);

    for (const bg of backgrounds) {
        if (!bg.wizard.qualityDice.length) throw new Error(`${bg.name}: empty qualityDice`);
        if (!bg.wizard.principleCategory) throw new Error(`${bg.name}: missing principleCategory`);
    }
    for (const ps of powerSources) {
        if (!ps.wizard.powerChoices.length && !ps.wizard.requiredPowers.length) {
            throw new Error(`${ps.name}: no power choices`);
        }
        if (!ps.wizard.abilityPicks.length && ps.abilities.length) {
            throw new Error(`${ps.name}: abilities present but no abilityPicks`);
        }
    }
    for (const ar of archetypes) {
        if (!ar.wizard.personalityDice?.length) throw new Error(`${ar.name}: missing personalityDice`);
        if (!ar.wizard.wizardBlocked && !ar.wizard.principleCategory) {
            throw new Error(`${ar.name}: missing principleCategory`);
        }
        if (!ar.wizard.wizardBlocked && !ar.wizard.abilityPicks.length) {
            throw new Error(`${ar.name}: missing abilityPicks`);
        }
    }
    return { backgrounds, powerSources, archetypes, personalities };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    enrichAll();
}
