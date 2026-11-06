import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataPath = path.join(root, "src/data/powers.json");
const sourceRoot = path.join(root, "src/packs/powers");
const packDest = path.join(root, "packs/powers");

const SYSTEM_FIELDS = ["dieType", "aux", "selected", "description"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const STATS = {
    coreVersion: "14.000",
    systemId: "scrpg-foundry",
    systemVersion: "0.9.10",
    createdTime: 1762387200000,
    modifiedTime: 1762387200000,
    lastModifiedBy: null
};

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

function buildSources() {
    const categories = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    fs.rmSync(sourceRoot, { recursive: true, force: true });

    const ids = new Set();
    const documents = [];

    for (const category of categories) {
        if (!category.key || !category.label || !Array.isArray(category.powers)) {
            throw new Error(`Category is missing key, label, or powers: ${JSON.stringify(category)}`);
        }
        const folderId = foundryId(`folder:powers:${category.key}`);
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

        for (const power of category.powers) {
            if (!power.name || !power.description) {
                throw new Error(`Power in ${category.key} is missing name or description`);
            }
            const itemId = foundryId(`power:${category.key}:${slug(power.name)}`);
            if (ids.has(itemId)) throw new Error(`Duplicate id ${itemId} for ${power.name}`);
            ids.add(itemId);
            if (!/^[A-Za-z0-9]{16}$/.test(itemId)) throw new Error(`Bad id ${itemId}`);

            const description = `<p>${htmlEscape(power.description)}</p>`;
            const system = {
                dieType: "d4",
                aux: "main",
                selected: null,
                description
            };
            for (const key of Object.keys(system)) {
                if (!SYSTEM_FIELDS.includes(key)) throw new Error(`Unexpected system field ${key}`);
            }

            const item = {
                name: power.name,
                type: "power",
                img: "icons/svg/aura.svg",
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
            writeJson(path.join(sourceRoot, category.key, `${slug(power.name)}.json`), item);
        }
    }

    const powerCount = documents.filter(doc => doc.type === "power").length;
    const folderCount = documents.filter(doc => doc._key.startsWith("!folders!")).length;
    console.log(`Wrote ${powerCount} powers in ${folderCount} folders`);
    return { powerCount, folderCount };
}

function clearPack() {
    fs.mkdirSync(packDest, { recursive: true });
    for (const name of fs.readdirSync(packDest)) {
        if (name === "_source") continue;
        fs.rmSync(path.join(packDest, name), { recursive: true, force: true });
    }
}

const { powerCount } = buildSources();
clearPack();
await compilePack(sourceRoot, packDest, { log: true, recursive: true });
if (powerCount !== 54) throw new Error(`Expected 54 powers, wrote ${powerCount}`);
