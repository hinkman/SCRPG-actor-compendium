import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function foundryId(seed) {
    const hash = createHash("sha256").update(seed).digest();
    let id = "";
    for (let i = 0; i < 16; i++) id += ALPHABET[hash[i] % ALPHABET.length];
    return id;
}

function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadNameToUuid() {
    const powers = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/powers.json"), "utf8"));
    const qualities = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/qualities.json"), "utf8"));
    const nameToUuid = new Map();
    for (const cat of powers) {
        for (const p of cat.powers) {
            nameToUuid.set(
                p.name,
                `Compendium.scrpg-actor-compendium.powers.Item.${foundryId(`power:${cat.key}:${slug(p.name)}`)}`
            );
        }
    }
    for (const cat of qualities) {
        for (const q of cat.qualities) {
            nameToUuid.set(
                q.name,
                `Compendium.scrpg-actor-compendium.qualities.Item.${foundryId(`quality:${cat.key}:${slug(q.name)}`)}`
            );
        }
    }
    return nameToUuid;
}

let cachedNames = null;
function powerQualityNames() {
    if (!cachedNames) {
        const map = loadNameToUuid();
        cachedNames = {
            map,
            names: [...map.keys()].sort((a, b) => b.length - a.length)
        };
    }
    return cachedNames;
}

function linkPowersQualities(text) {
    const { map, names } = powerQualityNames();
    let escaped = text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    for (const name of names) {
        const uuid = map.get(name);
        const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
        escaped = escaped.replace(re, (match, offset, full) => {
            // Skip minion-form labels like "• Stealth (+3 or higher)".
            const before = full.slice(Math.max(0, offset - 4), offset);
            const after = full.slice(offset + match.length, offset + match.length + 4);
            if (/•\s*$/.test(before) && /^\s*\(/.test(after)) return match;
            return `@UUID[${uuid}]{${name}}`;
        });
    }
    return escaped;
}

function isGrantParagraph(paragraph) {
    if (!/\babilit(?:y|ies)\b/i.test(paragraph)) return false;
    if (/cannot use any abilities/i.test(paragraph)) return false;
    if (/abilities from your principles/i.test(paragraph)) return false;
    if (/^These abilities are available to you in any form\.$/i.test(paragraph.trim())) return false;
    return /\b(?:gain|gains|following|have the)\b/i.test(paragraph);
}

function detectColor(paragraph) {
    if (/\bat Yellow\b|\bas a Yellow\b|\bYellow (?:form )?abilit/i.test(paragraph)) return "yellow";
    if (/\bat Red\b|\bas a Red\b|\bRed (?:form )?abilit/i.test(paragraph)) return "red";
    if (/\bGreen (?:form )?abilit|\bGreen forms?\b/i.test(paragraph)) return "green";
    if (/\bYellow\b/i.test(paragraph)) return "yellow";
    if (/\bRed\b/i.test(paragraph)) return "red";
    if (/\bGreen\b/i.test(paragraph)) return "green";
    return null;
}

function namedAbilitiesInGrant(paragraph, abilities) {
    const found = [];
    const sorted = [...abilities].sort((a, b) => b.name.length - a.name.length);
    for (const ability of sorted) {
        const re = new RegExp(`\\b${escapeRegex(ability.name)}\\b`, "i");
        if (re.test(paragraph)) found.push(ability);
    }
    return found;
}

function isSingularGrant(paragraph) {
    if (/\bone of\b/i.test(paragraph)) return false;
    if (/\btwo of\b|\bthree of\b|\bthese abilities\b|\bfollowing abilities\b/i.test(paragraph)) {
        return false;
    }
    if (/\babilities\b/i.test(paragraph) && !/\bability\b/i.test(paragraph)) return false;
    if (/\bability\b/i.test(paragraph)) return true;
    return false;
}

function abilityLinkList(abilities) {
    const items = abilities.map(a => `<li>@UUID[${a.uuid}]{${a.name}}</li>`).join("");
    return `<ul class="scrpg-archetype-ability-links">${items}</ul>`;
}

function isPrincipleParagraph(paragraph) {
    if (/^Choose (an?|a)\s+.+\sprinciple/i.test(paragraph)) return true;
    if (/\btake a\s+\w+\s+principle\b/i.test(paragraph)) return true;
    if (/\bchoose a principle from your other archetype\b/i.test(paragraph)) return true;
    return false;
}

function isPersonalityParagraph(paragraph) {
    return /\bpersonality selection\b|\bfor your personality\b|\bfor personality\b/i.test(paragraph);
}

function isHealthParagraph(paragraph) {
    return /\bWhen determining Health\b/i.test(paragraph);
}

function isAdditionalInfoStart(paragraph) {
    if (isHealthParagraph(paragraph)) return true;
    if (/^(?:Your Minions|Minion Forms|Minion chart:)/i.test(paragraph)) return true;
    if (/^The minions you summon/i.test(paragraph)) return true;
    if (/^Additionally, during hero creation/i.test(paragraph)) return true;
    if (/^When you create a minion during a scene/i.test(paragraph)) return true;
    if (/^Whenever you create a minion/i.test(paragraph)) return true;
    return false;
}

/**
 * Ensure personality lines include explicit die sizes (PDF die icons).
 * Default is d10, d10; keep any dice already present in the prose unless
 * personalityDice is provided as an override.
 */
export function normalizePersonalityParagraph(paragraph, personalityDice = null) {
    const diceFromText = [...paragraph.matchAll(/\bd\d+\b/gi)].map(m => m[0].toLowerCase());
    const dice = (personalityDice?.length ? personalityDice : diceFromText.length ? diceFromText : ["d10", "d10"])
        .map(d => d.toLowerCase());
    const diceText = dice.join(", ");
    const useYour = /\byour personality\b/i.test(paragraph);
    const optional = paragraph.match(/personality selection\.(.*)$/is)?.[1]?.trim() || "";
    let line = useYour
        ? `Roll ${diceText} for your personality selection.`
        : `Roll ${diceText} for personality selection.`;
    if (optional) line += ` ${optional}`;
    return line;
}

function isPowersQualitiesStart(paragraph) {
    if (/^Assign\b/i.test(paragraph)) return true;
    if (/^•\s/.test(paragraph) && /powers? category|qualities? category/i.test(paragraph)) return true;
    return false;
}

function isAbilitiesStart(paragraph) {
    if (isGrantParagraph(paragraph)) return true;
    if (/^First, choose one of these four methods of transformation/i.test(paragraph)) return true;
    if (/^After choosing your method of transformation/i.test(paragraph)) return true;
    if (/^You gain the following Green ability/i.test(paragraph)) return true;
    if (/^And the following (?:Yellow|Red) ability/i.test(paragraph)) return true;
    if (/^You have two Green modes/i.test(paragraph)) return true;
    if (/^(?:Default|Powerless) Mode:/i.test(paragraph)) return true;
    if (/^Choose (?:one more Green|two Yellow|a Red) mode/i.test(paragraph)) return true;
    if (/ Mode:/i.test(paragraph) && /\b(?:gain|have) the\b/i.test(paragraph)) return true;
    if (/^These abilities are available to you in any form/i.test(paragraph)) return true;
    if (/^Then make a Yellow form/i.test(paragraph)) return true;
    if (/following Red abilities are available/i.test(paragraph)) return true;
    return false;
}

function splitPrincipleAndPersonality(paragraph) {
    const match = paragraph.match(
        /^(.*?\b(?:choose a principle from your other archetype|take a\s+\w+\s+principle)\.?)\s+(.*)$/i
    );
    if (match && isPersonalityParagraph(match[2])) {
        return { principle: match[1].trim(), personality: match[2].trim() };
    }
    return null;
}

/**
 * Split archetype prose into intro / powersQualities / abilities / principle /
 * additionalInfo / personality.
 */
export function classifyArchetypeParagraphs(paragraphs) {
    const buckets = {
        intro: [],
        powersQualities: [],
        abilities: [],
        principle: [],
        additionalInfo: [],
        personality: []
    };
    let section = "intro";

    for (const paragraph of paragraphs) {
        if (isPrincipleParagraph(paragraph)) {
            const split = splitPrincipleAndPersonality(paragraph);
            if (split) {
                buckets.principle.push(split.principle);
                buckets.personality.push(split.personality);
                section = "personality";
                continue;
            }
            buckets.principle.push(paragraph);
            section = "principle";
            continue;
        }

        if (isPersonalityParagraph(paragraph)) {
            buckets.personality.push(paragraph);
            section = "personality";
            continue;
        }

        if (isAdditionalInfoStart(paragraph)) {
            buckets.additionalInfo.push(paragraph);
            section = "additionalInfo";
            continue;
        }

        if (isAbilitiesStart(paragraph)) {
            buckets.abilities.push(paragraph);
            section = "abilities";
            continue;
        }

        if (isPowersQualitiesStart(paragraph) && section !== "abilities") {
            buckets.powersQualities.push(paragraph);
            section = "powersQualities";
            continue;
        }

        // Bullet / continuation lines stay in the current content section.
        if (section === "intro" && /^•\s/.test(paragraph)) {
            buckets.powersQualities.push(paragraph);
            section = "powersQualities";
            continue;
        }

        if (section === "additionalInfo" && /^•\s/.test(paragraph)) {
            buckets.additionalInfo.push(paragraph);
            continue;
        }

        buckets[section].push(paragraph);
    }

    return buckets;
}

function renderParagraphBlock(paragraphs, abilitiesState) {
    const parts = [];
    for (const paragraph of paragraphs) {
        parts.push(`<p>${linkPowersQualities(paragraph)}</p>`);
        if (!isGrantParagraph(paragraph)) continue;

        const { remaining, used, take } = abilitiesState;
        const allRemaining = [...remaining.green, ...remaining.yellow, ...remaining.red];
        let color = detectColor(paragraph);
        let picks = [];

        if (color) {
            picks = namedAbilitiesInGrant(paragraph, remaining[color]);
            if (!picks.length) {
                picks = isSingularGrant(paragraph)
                    ? remaining[color].slice(0, 1)
                    : [...remaining[color]];
            }
        } else {
            picks = namedAbilitiesInGrant(paragraph, allRemaining);
            if (!picks.length && isSingularGrant(paragraph) && allRemaining.length === 1) {
                picks = allRemaining.slice(0, 1);
            }
        }

        const selected = take(picks);
        if (selected.length) parts.push(abilityLinkList(selected));
    }
    return parts;
}

function sectionHtml(title, bodyParts) {
    if (!bodyParts.length) return "";
    // Use a div, not h4 — Foundry dark-theme heading colors are unreadable on the white sheet.
    return `<section class="scrpg-archetype-block"><div class="scrpg-archetype-section">${title}</div>${bodyParts.join("")}</section>`;
}

function untitledBlock(bodyParts, extraClass = "") {
    if (!bodyParts.length) return "";
    const cls = extraClass ? `scrpg-archetype-block ${extraClass}` : "scrpg-archetype-block";
    return `<section class="${cls}">${bodyParts.join("")}</section>`;
}

/**
 * Build description HTML with Powers/Qualities, Abilities, Principle,
 * Additional Info, and Personality sections.
 * Ability UUID links sit under the grant lines that introduce them.
 */
export function buildArchetypeDescriptionHtml(archetype) {
    const paragraphs = archetype.description
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean);

    const buckets = classifyArchetypeParagraphs(paragraphs);
    const remaining = {
        green: archetype.abilities.filter(a => a.color === "green").map(a => ({ ...a })),
        yellow: archetype.abilities.filter(a => a.color === "yellow").map(a => ({ ...a })),
        red: archetype.abilities.filter(a => a.color === "red").map(a => ({ ...a }))
    };
    const used = new Set();
    const take = picks => {
        const unique = [];
        for (const ability of picks) {
            if (used.has(ability.uuid)) continue;
            used.add(ability.uuid);
            unique.push(ability);
            if (remaining[ability.color]) {
                remaining[ability.color] = remaining[ability.color].filter(a => a.uuid !== ability.uuid);
            }
        }
        return unique;
    };
    const abilitiesState = { remaining, used, take };

    const intro = renderParagraphBlock(buckets.intro, abilitiesState);
    const powersQualities = renderParagraphBlock(buckets.powersQualities, abilitiesState);
    const abilities = renderParagraphBlock(buckets.abilities, abilitiesState);

    // Safety: any ability never attached to a grant lands under Abilities.
    for (const color of ["green", "yellow", "red"]) {
        const left = remaining[color].filter(a => !used.has(a.uuid));
        if (!left.length) continue;
        const label = color.charAt(0).toUpperCase() + color.slice(1);
        abilities.push(`<p>${label} abilities:</p>`);
        abilities.push(abilityLinkList(take(left)));
    }

    const principle = renderParagraphBlock(buckets.principle, abilitiesState);
    const additionalInfo = renderParagraphBlock(buckets.additionalInfo, abilitiesState);

    let personalityParas = buckets.personality.map(p =>
        normalizePersonalityParagraph(p, archetype.personalityDice)
    );
    if (!personalityParas.length) {
        personalityParas = [
            normalizePersonalityParagraph("Roll for personality selection.", archetype.personalityDice)
        ];
    }
    const personality = renderParagraphBlock(personalityParas, abilitiesState);

    return [
        untitledBlock(intro, "scrpg-archetype-block-intro"),
        sectionHtml("Powers/Qualities", powersQualities),
        sectionHtml("Abilities", abilities),
        sectionHtml("Principle", principle),
        sectionHtml("Additional Info", additionalInfo),
        sectionHtml("Personality", personality)
    ].join("");
}

export function rebuildAllArchetypeDescriptions(archetypesPath = path.join(ROOT, "src/data/archetypes.json")) {
    const archetypes = JSON.parse(fs.readFileSync(archetypesPath, "utf8"));
    for (const archetype of archetypes) {
        // Keep source prose in sync: inject explicit personality dice where missing.
        const lines = archetype.description.split(/\n/);
        archetype.description = lines
            .map(line => {
                const trimmed = line.trim();
                if (!trimmed || !isPersonalityParagraph(trimmed)) return line;
                // Preserve indent/blank structure by only replacing the trimmed content.
                return line.replace(trimmed, normalizePersonalityParagraph(trimmed, archetype.personalityDice));
            })
            .join("\n");
        archetype.descriptionHtml = buildArchetypeDescriptionHtml(archetype);
    }
    fs.writeFileSync(archetypesPath, `${JSON.stringify(archetypes, null, 2)}\n`);
    return archetypes;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    const archetypes = rebuildAllArchetypeDescriptions();
    console.log(`Rebuilt descriptionHtml for ${archetypes.length} archetypes`);
}
