import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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

function loadQualityNameToUuid() {
    const qualities = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/qualities.json"), "utf8"));
    const nameToUuid = new Map();
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
function qualityNames() {
    if (!cachedNames) {
        const map = loadQualityNameToUuid();
        cachedNames = {
            map,
            names: [...map.keys()].sort((a, b) => b.length - a.length)
        };
    }
    return cachedNames;
}

function linkQualities(text) {
    const { map, names } = qualityNames();
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
    return `<p>${linkQualities(text)}</p>`;
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
 * Build background description HTML with Qualities / Principle / Power Source sections.
 */
export function buildBackgroundDescriptionHtml(entry) {
    const intro = [p(entry.flavor || entry.name)];

    const qualitiesParts = [];
    const qualitiesIntroLines = (entry.qualitiesIntro || "").split("\n").map(s => s.trim()).filter(Boolean);
    for (const line of qualitiesIntroLines) qualitiesParts.push(p(line));
    for (const quality of entry.qualities || []) {
        qualitiesParts.push(p(`• ${quality}`));
    }

    const principleParts = entry.principle ? [p(entry.principle)] : [];
    const additionalParts = (entry.additionalInfo || []).map(line => p(line));

    const dice = (entry.powerSourceDice?.length ? entry.powerSourceDice : ["d10", "d10"]).join(", ");
    const powerSourceParts = [p(`Roll ${dice} for power source selection.`)];

    return [
        untitledBlock(intro, "scrpg-archetype-block-intro"),
        sectionHtml("Qualities", qualitiesParts),
        sectionHtml("Principle", principleParts),
        sectionHtml("Additional Info", additionalParts),
        sectionHtml("Power Source", powerSourceParts)
    ].join("");
}

export function buildBackgroundPlainDescription(entry) {
    const lines = [
        entry.flavor || entry.name,
        "",
        entry.qualitiesIntro || "",
        ...(entry.qualities || []).map(q => `• ${q}`),
        "",
        entry.principle || "",
        "",
        ...(entry.additionalInfo || []),
        "",
        `Roll ${(entry.powerSourceDice || []).join(", ")} for power source selection.`
    ];
    return lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim() + "\n";
}

export function rebuildAllBackgroundDescriptions(
    backgroundsPath = path.join(ROOT, "src/data/backgrounds.json")
) {
    const entries = JSON.parse(fs.readFileSync(backgroundsPath, "utf8"));
    for (const entry of entries) {
        entry.description = buildBackgroundPlainDescription(entry);
        entry.descriptionHtml = buildBackgroundDescriptionHtml(entry);
    }
    fs.writeFileSync(backgroundsPath, `${JSON.stringify(entries, null, 2)}\n`);
    return entries;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
    const entries = rebuildAllBackgroundDescriptions();
    console.log(`Rebuilt descriptionHtml for ${entries.length} backgrounds`);
}
