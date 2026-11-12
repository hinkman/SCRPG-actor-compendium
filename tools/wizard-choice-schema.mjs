import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function foundryId(seed) {
    const hash = createHash("sha256").update(seed).digest();
    let id = "";
    for (let i = 0; i < 16; i++) id += ALPHABET[hash[i] % ALPHABET.length];
    return id;
}

export function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const POWER_CATEGORY_LABEL_TO_KEY = {
    Athletic: "athletic",
    "Elemental/Energy": "elemental-energy",
    Hallmark: "hallmark",
    Intellectual: "intellectual",
    Materials: "materials",
    Mobility: "mobility",
    Psychic: "psychic",
    "Self Control": "self-control",
    Technological: "technological"
};

const QUALITY_CATEGORY_LABEL_TO_KEY = {
    Information: "information",
    Mental: "mental",
    Physical: "physical",
    Social: "social"
};

const PRINCIPLE_CATEGORY_LABEL_TO_KEY = {
    Esoteric: "esoteric",
    Expertise: "expertise",
    Ideals: "ideals",
    Identity: "identity",
    Responsibility: "responsibility"
};

export function loadCatalogs() {
    const powers = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/powers.json"), "utf8"));
    const qualities = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/qualities.json"), "utf8"));

    const powerByName = new Map();
    const powerCategories = new Map();
    for (const cat of powers) {
        powerCategories.set(cat.key, { key: cat.key, label: cat.label, pack: "powers" });
        for (const entry of cat.powers) {
            powerByName.set(entry.name, {
                kind: "item",
                pack: "powers",
                categoryKey: cat.key,
                name: entry.name,
                uuid: `Compendium.scrpg-actor-compendium.powers.Item.${foundryId(`power:${cat.key}:${slug(entry.name)}`)}`
            });
        }
    }

    const qualityByName = new Map();
    const qualityCategories = new Map();
    for (const cat of qualities) {
        qualityCategories.set(cat.key, { key: cat.key, label: cat.label, pack: "qualities" });
        for (const entry of cat.qualities) {
            qualityByName.set(entry.name, {
                kind: "item",
                pack: "qualities",
                categoryKey: cat.key,
                name: entry.name,
                uuid: `Compendium.scrpg-actor-compendium.qualities.Item.${foundryId(`quality:${cat.key}:${slug(entry.name)}`)}`
            });
        }
    }

    return {
        powerByName,
        qualityByName,
        powerCategories,
        qualityCategories
    };
}

export function parseCategoryChoice(line, expectedPack = null) {
    const match = line.match(/^Select from (.+?) (qualities|powers) category$/i);
    if (!match) return null;
    const label = match[1].trim();
    const pack = match[2].toLowerCase() === "powers" ? "powers" : "qualities";
    if (expectedPack && pack !== expectedPack) {
        throw new Error(`Expected ${expectedPack} category line, got: ${line}`);
    }
    const map = pack === "powers" ? POWER_CATEGORY_LABEL_TO_KEY : QUALITY_CATEGORY_LABEL_TO_KEY;
    const categoryKey = map[label];
    if (!categoryKey) throw new Error(`Unknown ${pack} category label: ${label}`);
    return {
        kind: "category",
        pack,
        categoryKey,
        categoryLabel: label
    };
}

export function parseNamedChoice(line, catalog, pack) {
    const byName = pack === "powers" ? catalog.powerByName : catalog.qualityByName;
    const item = byName.get(line);
    if (!item) return null;
    return { ...item };
}

export function parseChoiceLine(line, catalog, pack) {
    const category = parseCategoryChoice(line, pack);
    if (category) return category;
    const named = parseNamedChoice(line, catalog, pack);
    if (named) return named;
    throw new Error(`Unparseable ${pack} choice line: ${line}`);
}

export function parsePrincipleCategory(text) {
    if (!text) return null;
    const match = text.match(/Choose an?\s+([A-Za-z]+)\s+principle/i);
    if (!match) return null;
    const label = match[1];
    const key = PRINCIPLE_CATEGORY_LABEL_TO_KEY[label];
    if (!key) throw new Error(`Unknown principle category: ${label} in "${text}"`);
    return { key, label };
}

export function parseDiceFromText(text) {
    return [...text.matchAll(/\bd(?:4|6|8|10|12)\b/gi)].map(m => m[0].toLowerCase());
}

export function parseQualityDiceIntro(intro) {
    if (/Assign one of d10, d8, or d6 to Medicine/i.test(intro)) {
        return {
            mode: "medical",
            qualityDice: ["d10", "d8", "d6"],
            qualityPickCount: 2,
            requiredQualityName: "Medicine",
            qualitiesIntro: intro
        };
    }
    const dice = parseDiceFromText(intro);
    const pickMatch = intro.match(/to (\w+) of these qualities/i);
    const wordToCount = { one: 1, two: 2, three: 3, four: 4 };
    let qualityPickCount = dice.length;
    if (pickMatch) {
        const word = pickMatch[1].toLowerCase();
        qualityPickCount = wordToCount[word] || Number(word) || dice.length;
    }
    return {
        mode: "standard",
        qualityDice: dice,
        qualityPickCount,
        requiredQualityName: null,
        qualitiesIntro: intro
    };
}

export function parseAbilityPickCount(grantText) {
    if (!grantText) return 0;
    if (/Gain these\b|Gain the following\b|Gain all\b/i.test(grantText) && !/\b(?:one|two|three|four) of\b/i.test(grantText)) {
        return null; // all listed
    }
    const ofMatch = grantText.match(/\b(one|two|three|four|\d+)\s+of\b/i);
    if (ofMatch) {
        const word = ofMatch[1].toLowerCase();
        const map = { one: 1, two: 2, three: 3, four: 4 };
        return map[word] ?? Number(word);
    }
    if (/\bGain the following\b/i.test(grantText)) return 1;
    return null;
}

export function abilityConstraint(grantText) {
    if (!grantText) return null;
    if (/each using a different power or quality/i.test(grantText)) return "differentPowerOrQuality";
    if (/using a different power or quality from any of your [Gg]reen/i.test(grantText)) {
        return "differentFromGreenAbilities";
    }
    if (/using a different power or quality than your [Gg]reen/i.test(grantText)) {
        return "differentFromGreenAbilities";
    }
    if (/each using a different power/i.test(grantText)) return "differentPower";
    if (/using two different powers/i.test(grantText)) return "differentPower";
    if (/using two different qualities/i.test(grantText)) return "differentQuality";
    if (/one using Signature Weaponry and the other using one of your qualities/i.test(grantText)) {
        return "signatureWeaponryAndQuality";
    }
    if (/at least one using your Close Combat/i.test(grantText)) return "includeCloseCombatAndPower";
    if (/at least one using your Flight or Signature Vehicle/i.test(grantText)) {
        return "includeFlightOrSignatureVehicle";
    }
    if (/both of which must use your Elemental\/Energy/i.test(grantText)) return "elementalEnergyPowers";
    if (/using at least two different powers/i.test(grantText)) return "atLeastTwoDifferentPowers";
    if (/using one of your Elemental\/Energy/i.test(grantText)) return "elementalEnergyPowers";
    if (/that you have the associated power or quality for/i.test(grantText)) return "requiresAssociatedTrait";
    return null;
}

export function parsePersonalityDiceFromText(text) {
    const dice = parseDiceFromText(text);
    return dice.length ? dice : ["d10", "d10"];
}

export const COMPLEX_ARCHETYPES = {
    "Minion-Maker": { key: "minion-maker", actorFlags: { minionMaker: true } },
    "Form-Changer": { key: "form-changer", actorFlags: { formchanger: true } },
    Divided: { key: "divided", actorFlags: { divided: true } },
    Modular: { key: "modular", actorFlags: { modular: true } }
};

export { POWER_CATEGORY_LABEL_TO_KEY, QUALITY_CATEGORY_LABEL_TO_KEY, PRINCIPLE_CATEGORY_LABEL_TO_KEY, ROOT };
