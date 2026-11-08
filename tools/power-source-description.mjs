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

function p(text) {
    return `<p>${linkPowersQualities(text)}</p>`;
}

function abilityList(abilities) {
    if (!abilities?.length) return "";
    return `<ul class="scrpg-archetype-ability-links">${abilities
        .map(a => `<li>@UUID[${a.uuid}]{${a.name}}</li>`)
        .join("")}</ul>`;
}

function sectionHtml(title, bodyParts) {
    if (!bodyParts.length) return "";
    return `<section class="scrpg-archetype-block"><div class="scrpg-archetype-section">${title}</div>${bodyParts.join("")}</section>`;
}

function untitledBlock(bodyParts, extraClass = "") {
    if (!bodyParts.length) return "";
    const cls = extraClass ? `scrpg-archetype-block ${extraClass}` : "scrpg-archetype-block";
    return `<section class="${cls}">${bodyParts.join("")}</section>`;
}

/**
 * Build power-source description HTML with Powers / Abilities / Additional Info / Archetype sections.
 */
export function buildPowerSourceDescriptionHtml(entry) {
    const yellow = (entry.abilities || []).filter(a => a.color === "yellow");
    const green = (entry.abilities || []).filter(a => a.color === "green");

    const intro = [p(entry.flavor || entry.description?.split("\n")[0] || entry.name)];

    const powersParts = [];
    const powersIntroLines = (entry.powersIntro || "").split("\n").map(s => s.trim()).filter(Boolean);
    for (const line of powersIntroLines) powersParts.push(p(line));
    for (const power of entry.powers || []) {
        powersParts.push(p(`• ${power}`));
    }

    const abilitiesParts = [];
    if (entry.yellowGrant) {
        abilitiesParts.push(p(entry.yellowGrant));
        abilitiesParts.push(abilityList(yellow));
    }
    if (entry.greenGrant) {
        abilitiesParts.push(p(entry.greenGrant));
        abilitiesParts.push(abilityList(green));
    }
    // Safety: leftover ability links if grants missing
    if (!entry.yellowGrant && yellow.length) {
        abilitiesParts.push(p("Yellow abilities:"));
        abilitiesParts.push(abilityList(yellow));
    }
    if (!entry.greenGrant && green.length) {
        abilitiesParts.push(p("Green abilities:"));
        abilitiesParts.push(abilityList(green));
    }

    const additionalParts = (entry.additionalInfo || []).map(line => p(line));

    const dice = (entry.archetypeDice?.length ? entry.archetypeDice : ["d10", "d10"]).join(", ");
    const archetypeParts = [p(`Roll ${dice} for archetype selection.`)];

    return [
        untitledBlock(intro, "scrpg-archetype-block-intro"),
        sectionHtml("Powers", powersParts),
        sectionHtml("Abilities", abilitiesParts),
        sectionHtml("Additional Info", additionalParts),
        sectionHtml("Archetype", archetypeParts)
    ].join("");
}

export function rebuildAllPowerSourceDescriptions(
    powerSourcesPath = path.join(ROOT, "src/data/powerSources.json")
) {
    const entries = JSON.parse(fs.readFileSync(powerSourcesPath, "utf8"));
    for (const entry of entries) {
        entry.descriptionHtml = buildPowerSourceDescriptionHtml(entry);
    }
    fs.writeFileSync(powerSourcesPath, `${JSON.stringify(entries, null, 2)}\n`);
    return entries;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    const entries = rebuildAllPowerSourceDescriptions();
    console.log(`Rebuilt descriptionHtml for ${entries.length} power sources`);
}
