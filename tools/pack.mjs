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
        systemFields: ["dieType", "aux", "selected", "description"],
        buildSystem(description) {
            return {
                dieType: "d4",
                aux: "main",
                selected: null,
                description
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
        systemFields: ["dieType", "selected", "description"],
        buildSystem(description) {
            return {
                dieType: "d4",
                selected: null,
                description
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

function buildSources(pack) {
    const dataPath = path.join(root, pack.dataFile);
    const sourceRoot = path.join(root, "src/packs", pack.key);
    const categories = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    fs.rmSync(sourceRoot, { recursive: true, force: true });

    const ids = new Set();
    const documents = [];

    for (const category of categories) {
        const entries = category[pack.entriesKey];
        if (!category.key || !category.label || !Array.isArray(entries)) {
            throw new Error(`Category is missing key, label, or ${pack.entriesKey}: ${JSON.stringify(category)}`);
        }

        const folderId = foundryId(`folder:${pack.key}:${category.key}`);
        if (ids.has(folderId)) throw new Error(`Duplicate id ${folderId}`);
        ids.add(folderId);

        const folder = {
            name: category.label,
            description: "",
            folder: null,
            type: "Item",
            sorting: "a",
            sort: 0,
            color: null,
            flags: {},
            _stats: STATS,
            _id: folderId,
            _key: `!folders!${folderId}`
        };
        documents.push(folder);
        writeJson(path.join(sourceRoot, category.key, "_Folder.json"), folder);

        for (const entry of entries) {
            if (!entry.name || !entry.description) {
                throw new Error(`${pack.itemType} in ${category.key} is missing name or description`);
            }

            const itemId = foundryId(`${pack.itemType}:${category.key}:${slug(entry.name)}`);
            if (ids.has(itemId)) throw new Error(`Duplicate id ${itemId} for ${entry.name}`);
            ids.add(itemId);
            if (!/^[A-Za-z0-9]{16}$/.test(itemId)) throw new Error(`Bad id ${itemId}`);

            const description = `<p>${htmlEscape(entry.description)}</p>`;
            const system = pack.buildSystem(description);
            for (const key of Object.keys(system)) {
                if (!pack.systemFields.includes(key)) throw new Error(`Unexpected system field ${key}`);
            }

            const item = {
                name: entry.name,
                type: pack.itemType,
                img: pack.img,
                system,
                effects: [],
                folder: folderId,
                sort: 0,
                ownership: { default: 0 },
                flags: {
                    "scrpg-actor-compendium": { category: category.key }
                },
                _stats: STATS,
                _id: itemId,
                _key: `!items!${itemId}`
            };
            documents.push(item);
            writeJson(path.join(sourceRoot, category.key, `${slug(entry.name)}.json`), item);
        }
    }

    const itemCount = documents.filter(doc => doc.type === pack.itemType).length;
    const folderCount = documents.filter(doc => doc._key.startsWith("!folders!")).length;
    console.log(`Wrote ${itemCount} ${pack.entriesKey} in ${folderCount} folders`);
    return { itemCount, folderCount, sourceRoot };
}

for (const pack of PACKS) {
    const { itemCount, sourceRoot } = buildSources(pack);
    const packDest = path.join(root, "packs", pack.key);
    clearPack(packDest);
    await compilePack(sourceRoot, packDest, { log: true, recursive: true });
    if (itemCount !== pack.expectedCount) {
        throw new Error(`Expected ${pack.expectedCount} ${pack.entriesKey}, wrote ${itemCount}`);
    }
}
