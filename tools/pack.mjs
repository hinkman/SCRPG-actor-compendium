import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const STATS = {
    coreVersion: "14.000",
    systemId: "scrpg-foundry",
    systemVersion: "0.9.10",
    createdTime: 1762387200000,
    modifiedTime: 1762387200000,
    lastModifiedBy: null
};

const PACKS = [
    {
        key: "powers",
        dataFile: "src/data/powers.json",
        entriesKey: "powers",
        itemType: "power",
        img: "icons/svg/aura.svg",
        expectedCount: 54,
        validateEntry(entry, categoryKey) {
            if (!entry.name || !entry.description) {
                throw new Error(`power in ${categoryKey} is missing name or description`);
            }
        },
        buildItem(entry, categoryKey, folderId, itemId) {
            const description = `<p>${htmlEscape(entry.description)}</p>`;
            return {
                name: entry.name,
                type: "power",
                img: "icons/svg/aura.svg",
                system: {
                    dieType: "d4",
                    aux: "main",
                    selected: null,
                    description
                },
                effects: [],
                folder: folderId,
                sort: 0,
                ownership: { default: 0 },
                flags: {
                    "scrpg-actor-compendium": { category: categoryKey }
                },
                _stats: STATS,
                _id: itemId,
                _key: `!items!${itemId}`
            };
        }
    },
    {
        key: "qualities",
        dataFile: "src/data/qualities.json",
        entriesKey: "qualities",
        itemType: "quality",
        img: "icons/svg/book.svg",
        expectedCount: 24,
        validateEntry(entry, categoryKey) {
            if (!entry.name || !entry.description) {
                throw new Error(`quality in ${categoryKey} is missing name or description`);
            }
        },
        buildItem(entry, categoryKey, folderId, itemId) {
            const description = `<p>${htmlEscape(entry.description)}</p>`;
            return {
                name: entry.name,
                type: "quality",
                img: "icons/svg/book.svg",
                system: {
                    dieType: "d4",
                    selected: null,
                    description
                },
                effects: [],
                folder: folderId,
                sort: 0,
                ownership: { default: 0 },
                flags: {
                    "scrpg-actor-compendium": { category: categoryKey }
                },
                _stats: STATS,
                _id: itemId,
                _key: `!items!${itemId}`
            };
        }
    },
    {
        key: "principles",
        dataFile: "src/data/principles.json",
        entriesKey: "principles",
        itemType: "principles",
        img: "icons/svg/upgrade.svg",
        expectedCount: 64,
        validateEntry(entry, categoryKey) {
            if (!entry.name || !entry.roleplaying || !entry.minorTwist || !entry.majorTwist) {
                throw new Error(`principle in ${categoryKey} is missing required text fields`);
            }
            const ability = entry.greenAbility;
            if (!ability?.name || !ability?.type || !ability?.gameText || !ability?.icon) {
                throw new Error(`principle ${entry.name} is missing greenAbility data`);
            }
        },
        buildItem(entry, categoryKey, folderId, itemId) {
            return {
                name: entry.name,
                type: "principles",
                img: "icons/svg/upgrade.svg",
                system: {
                    roleplaying: `<p>${htmlEscape(entry.roleplaying)}</p>`,
                    minorTwist: `<p>${htmlEscape(entry.minorTwist)}</p>`,
                    majorTwist: `<p>${htmlEscape(entry.majorTwist)}</p>`
                },
                effects: [],
                folder: folderId,
                sort: 0,
                ownership: { default: 0 },
                flags: {
                    "scrpg-actor-compendium": {
                        category: categoryKey,
                        greenAbility: {
                            name: entry.greenAbility.name,
                            type: entry.greenAbility.type,
                            icon: entry.greenAbility.icon,
                            gameText: `<p>${htmlEscape(entry.greenAbility.gameText)}</p>`
                        }
                    }
                },
                _stats: STATS,
                _id: itemId,
                _key: `!items!${itemId}`
            };
        }
    },
    {
        key: "abilities",
        dataFile: "src/data/abilities.json",
        nested: true,
        itemType: "ability",
        img: "icons/svg/combat.svg",
        expectedCount: 67,
        validateEntry(entry, categoryKey) {
            if (!entry.name || !entry.type || !entry.gameText || !entry.icon) {
                throw new Error(`ability in ${categoryKey} is missing required fields`);
            }
            if (!["A", "I", "R"].includes(entry.type)) {
                throw new Error(`ability ${entry.name} has invalid type ${entry.type}`);
            }
            if (!Array.isArray(entry.slots)) {
                throw new Error(`ability ${entry.name} is missing slots array`);
            }
        },
        buildItem(entry, categoryKey, folderId, itemId, context) {
            const icon = {
                attack: !!entry.icon.attack,
                defend: !!entry.icon.defend,
                overcome: !!entry.icon.overcome,
                hinder: !!entry.icon.hinder,
                boost: !!entry.icon.boost,
                recover: !!entry.icon.recover
            };
            return {
                name: entry.name,
                type: "ability",
                img: "icons/svg/combat.svg",
                system: {
                    aux: context.aux || "red",
                    icon,
                    type: entry.type,
                    gameText: `<p>${htmlEscape(entry.gameText)}</p>`
                },
                effects: [],
                folder: folderId,
                sort: 0,
                ownership: { default: 0 },
                flags: {
                    "scrpg-actor-compendium": {
                        color: context.colorKey,
                        category: categoryKey,
                        source: context.source || null,
                        gameTextTemplate: entry.gameText,
                        slots: entry.slots,
                        selections: {}
                    }
                },
                _stats: STATS,
                _id: itemId,
                _key: `!items!${itemId}`
            };
        }
    }
];

function foundryId(seed) {
    const hash = createHash("sha256").update(seed).digest();
    let id = "";
    for (let i = 0; i < 16; i++) id += ALPHABET[hash[i] % ALPHABET.length];
    return id;
}

function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function htmlEscape(text) {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function clearPack(packDest) {
    fs.mkdirSync(packDest, { recursive: true });
    for (const name of fs.readdirSync(packDest)) {
        if (name === "_source") continue;
        fs.rmSync(path.join(packDest, name), { recursive: true, force: true });
    }
}

function makeFolder({ name, parentId = null, color = null, idSeed }) {
    const folderId = foundryId(idSeed);
    return {
        folder: {
            name,
            description: "",
            folder: parentId,
            type: "Item",
            sorting: "a",
            sort: 0,
            color,
            flags: {},
            _stats: STATS,
            _id: folderId,
            _key: `!folders!${folderId}`
        },
        folderId
    };
}

function buildFlatSources(pack, categories, sourceRoot, ids, documents) {
    for (const category of categories) {
        const entries = category[pack.entriesKey];
        if (!category.key || !category.label || !Array.isArray(entries)) {
            throw new Error(`Category is missing key, label, or ${pack.entriesKey}: ${JSON.stringify(category)}`);
        }

        const { folder, folderId } = makeFolder({
            name: category.label,
            idSeed: `folder:${pack.key}:${category.key}`
        });
        if (ids.has(folderId)) throw new Error(`Duplicate id ${folderId}`);
        ids.add(folderId);
        documents.push(folder);
        writeJson(path.join(sourceRoot, category.key, "_Folder.json"), folder);

        for (const entry of entries) {
            pack.validateEntry(entry, category.key);
            const itemId = foundryId(`${pack.itemType}:${category.key}:${slug(entry.name)}`);
            if (ids.has(itemId)) throw new Error(`Duplicate id ${itemId} for ${entry.name}`);
            ids.add(itemId);
            if (!/^[A-Za-z0-9]{16}$/.test(itemId)) throw new Error(`Bad id ${itemId}`);

            const item = pack.buildItem(entry, category.key, folderId, itemId);
            documents.push(item);
            writeJson(path.join(sourceRoot, category.key, `${slug(entry.name)}.json`), item);
        }
    }
}

function buildNestedAbilitySources(pack, colors, sourceRoot, ids, documents) {
    for (const color of colors) {
        if (!color.key || !color.label || !Array.isArray(color.categories)) {
            throw new Error(`Ability color folder is missing key, label, or categories: ${JSON.stringify(color)}`);
        }

        const { folder: colorFolder, folderId: colorFolderId } = makeFolder({
            name: color.label,
            color: color.color || null,
            idSeed: `folder:${pack.key}:${color.key}`
        });
        if (ids.has(colorFolderId)) throw new Error(`Duplicate id ${colorFolderId}`);
        ids.add(colorFolderId);
        documents.push(colorFolder);
        writeJson(path.join(sourceRoot, color.key, "_Folder.json"), colorFolder);

        for (const category of color.categories) {
            const entries = category.abilities;
            if (!category.key || !category.label || !Array.isArray(entries)) {
                throw new Error(`Ability category is missing key, label, or abilities: ${JSON.stringify(category)}`);
            }

            const { folder, folderId } = makeFolder({
                name: category.label,
                parentId: colorFolderId,
                idSeed: `folder:${pack.key}:${color.key}:${category.key}`
            });
            if (ids.has(folderId)) throw new Error(`Duplicate id ${folderId}`);
            ids.add(folderId);
            documents.push(folder);
            writeJson(path.join(sourceRoot, color.key, category.key, "_Folder.json"), folder);

            for (const entry of entries) {
                pack.validateEntry(entry, category.key);
                const itemId = foundryId(`${pack.itemType}:${color.key}:${category.key}:${slug(entry.name)}`);
                if (ids.has(itemId)) throw new Error(`Duplicate id ${itemId} for ${entry.name}`);
                ids.add(itemId);
                if (!/^[A-Za-z0-9]{16}$/.test(itemId)) throw new Error(`Bad id ${itemId}`);

                const item = pack.buildItem(entry, category.key, folderId, itemId, {
                    aux: color.aux || color.key,
                    colorKey: color.key,
                    source: category.source || null
                });
                documents.push(item);
                writeJson(
                    path.join(sourceRoot, color.key, category.key, `${slug(entry.name)}.json`),
                    item
                );
            }
        }
    }
}

function buildSources(pack) {
    const dataPath = path.join(root, pack.dataFile);
    const sourceRoot = path.join(root, "src/packs", pack.key);
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    fs.rmSync(sourceRoot, { recursive: true, force: true });

    const ids = new Set();
    const documents = [];

    if (pack.nested) {
        buildNestedAbilitySources(pack, data, sourceRoot, ids, documents);
    } else {
        buildFlatSources(pack, data, sourceRoot, ids, documents);
    }

    const itemCount = documents.filter(doc => doc.type === pack.itemType).length;
    const folderCount = documents.filter(doc => doc._key.startsWith("!folders!")).length;
    const label = pack.nested ? "abilities" : pack.entriesKey;
    console.log(`Wrote ${itemCount} ${label} in ${folderCount} folders`);
    return { itemCount, folderCount, sourceRoot };
}

for (const pack of PACKS) {
    const { itemCount, sourceRoot } = buildSources(pack);
    const packDest = path.join(root, "packs", pack.key);
    clearPack(packDest);
    await compilePack(sourceRoot, packDest, { log: true, recursive: true });
    if (itemCount !== pack.expectedCount) {
        const label = pack.nested ? "abilities" : pack.entriesKey;
        throw new Error(`Expected ${pack.expectedCount} ${label}, wrote ${itemCount}`);
    }
}
