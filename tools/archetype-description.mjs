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
        escaped = escaped.replace(re, `@UUID[${uuid}]{${name}}`);
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

/**
 * Build description HTML with ability UUID links placed directly under
 * the grant instructions that introduce them (PDF-like layout).
 */
export function buildArchetypeDescriptionHtml(archetype) {
    const paragraphs = archetype.description
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean);

    const remaining = {
        green: archetype.abilities.filter(a => a.color === "green").map(a => ({ ...a })),
        yellow: archetype.abilities.filter(a => a.color === "yellow").map(a => ({ ...a })),
        red: archetype.abilities.filter(a => a.color === "red").map(a => ({ ...a }))
    };
    const used = new Set();
    const parts = [];

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

    for (const paragraph of paragraphs) {
        parts.push(`<p>${linkPowersQualities(paragraph)}</p>`);
        if (!isGrantParagraph(paragraph)) continue;

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

    for (const color of ["green", "yellow", "red"]) {
        const left = remaining[color].filter(a => !used.has(a.uuid));
        if (!left.length) continue;
        const label = color.charAt(0).toUpperCase() + color.slice(1);
        parts.push(`<p>${label} abilities:</p>`);
        parts.push(abilityLinkList(left));
    }

    return parts.join("");
}

export function rebuildAllArchetypeDescriptions(archetypesPath = path.join(ROOT, "src/data/archetypes.json")) {
    const archetypes = JSON.parse(fs.readFileSync(archetypesPath, "utf8"));
    for (const archetype of archetypes) {
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
