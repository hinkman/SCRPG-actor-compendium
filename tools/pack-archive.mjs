#!/usr/bin/env node
/**
 * Build Archive Actor packs (heroes, villains, minions, environments)
 * from src/data/archive/*.json into packs/* LevelDB via foundryvtt-cli.
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const STATS = {
    coreVersion: "14.000",
    systemId: "scrpg-foundry",
    systemVersion: "0.9.23",
    createdTime: 1763270000000,
    modifiedTime: 1763270000000,
    lastModifiedBy: null
};

function foundryId(seed) {
    const hash = createHash("sha256").update(seed).digest();
    let id = "";
    for (let i = 0; i < 16; i++) id += ALPHABET[hash[i] % ALPHABET.length];
    return id;
}

function slug(name) {
    return String(name)
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
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

function makeFolder({ name, parentId = null, color = null, idSeed, docType }) {
    const folderId = foundryId(idSeed);
    return {
        folder: {
            name,
            description: "",
            folder: parentId,
            type: docType,
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

function itemId(seed) {
    return foundryId(seed);
}

function attachItemKey(actorId, item) {
    item._key = `!actors.items!${actorId}.${item._id}`;
    return item;
}

function powerItem(actorId, actorSeed, power, index, aux = "main") {
    const mode = power.aux || aux;
    // Keep legacy main-power seeds stable; namespace form/mode powers by aux.
    const idSeed =
        mode === "main"
            ? `${actorSeed}:power:${index}:${slug(power.name)}`
            : `${actorSeed}:power:${mode}:${index}:${slug(power.name)}`;
    const id = itemId(idSeed);
    return attachItemKey(actorId, {
        _id: id,
        name: power.name,
        type: "power",
        img: "icons/svg/aura.svg",
        system: {
            dieType: power.dieType || "d8",
            aux: mode,
            selected: "",
            description: ""
        },
        effects: [],
        folder: null,
        sort: index * 100_000,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                dieTypeKnown: power.dieTypeKnown !== false
            }
        },
        _stats: STATS
    });
}

function qualityItem(actorId, actorSeed, quality, index) {
    const id = itemId(`${actorSeed}:quality:${index}:${slug(quality.name)}`);
    return attachItemKey(actorId, {
        _id: id,
        name: quality.name,
        type: "quality",
        img: "icons/svg/book.svg",
        system: {
            dieType: quality.dieType || "d8",
            selected: "",
            description: ""
        },
        effects: [],
        folder: null,
        sort: index * 100_000,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                dieTypeKnown: quality.dieTypeKnown !== false
            }
        },
        _stats: STATS
    });
}

function abilityZoneColor(aux) {
    const value = String(aux || "main");
    // Form/mode slots like green1/yellow1 map to sheet zone colors; leave green/yellow/red/main alone.
    if (value === "green1" || value === "green2") return "green";
    if (value === "yellow1" || value === "yellow2") return "yellow";
    if (value === "red1") return "red";
    return value;
}

function villainStatusItem(actorId, actorSeed, status, index) {
    const id = itemId(`${actorSeed}:villainStatus:${index}:${slug(status.name)}`);
    const category = status.category || status.description || "";
    const description = category
        ? `<p>${String(category)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</p>`
        : "";
    return attachItemKey(actorId, {
        _id: id,
        name: status.name,
        type: "villainStatus",
        img: "icons/svg/d20-grey.svg",
        system: {
            dieType: status.dieType || "d8",
            selected: false,
            description
        },
        effects: [],
        folder: null,
        sort: index * 100_000,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                dieTypeKnown: status.dieTypeKnown !== false,
                category: category || null
            }
        },
        _stats: STATS
    });
}

function abilityItem(actorId, actorSeed, ability, index) {
    const aux = ability.aux || "main";
    const id = itemId(`${actorSeed}:ability:${aux}:${index}:${slug(ability.name)}`);
    const icon = ability.icon || {
        attack: false,
        defend: false,
        overcome: false,
        hinder: false,
        boost: false,
        recover: false
    };
    return attachItemKey(actorId, {
        _id: id,
        name: ability.name,
        type: "ability",
        img: "icons/svg/combat.svg",
        system: {
            aux,
            icon,
            type: ability.type || "A",
            gameText: ability.gameText ? `<p>${ability.gameText
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")}</p>` : ""
        },
        effects: [],
        folder: null,
        sort: index * 100_000,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                color: ability.color || abilityZoneColor(aux)
            }
        },
        _stats: STATS
    });
}

/** Optional Archive form-changer / modular mode blocks → Auxiliary tab fields + items. */
function applyFormChanger(actor, hero, actorSeed) {
    const formChanger = hero.formChanger;
    if (!formChanger || formChanger.enabled === false) return actor;

    actor.system.formchanger = true;
    // Form-changer UI reuses the modular green2 slot, which is gated on powerless.
    actor.system.powerless = true;

    const forms = formChanger.forms || {};
    const modeKeys = ["main", "green1", "green2", "yellow1", "yellow2", "red1"];
    let powerIndex = (hero.powers || []).length;
    let abilityIndex = (hero.abilities || []).length;

    for (const mode of modeKeys) {
        const form = forms[mode];
        if (!form) continue;

        if (form.name) actor.system.modeName[mode] = form.name;
        if (form.description) {
            actor.system.modeDescription[mode] = `<p>${String(form.description)
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll("\n", "</p><p>")}</p>`;
        }
        actor.system.modeDisplayed[mode] = form.displayed !== false;

        for (const power of form.powers || []) {
            actor.items.push(powerItem(actor._id, actorSeed, power, powerIndex, mode));
            powerIndex += 1;
        }
        for (const ability of form.abilities || []) {
            actor.items.push(
                abilityItem(actor._id, actorSeed, { ...ability, aux: ability.aux || mode }, abilityIndex)
            );
            abilityIndex += 1;
        }
    }

    return actor;
}

function environmentTwistItem(actorId, actorSeed, twist, index) {
    const id = itemId(`${actorSeed}:twist:${index}:${slug(twist.name)}`);
    return attachItemKey(actorId, {
        _id: id,
        name: twist.name,
        type: "environmentTwist",
        img: "icons/svg/explosion.svg",
        system: {
            type: twist.type || "greenminor",
            description: twist.description
                ? `<p>${twist.description
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")}</p>`
                : ""
        },
        effects: [],
        folder: null,
        sort: index * 100_000,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": { archive: true }
        },
        _stats: STATS
    });
}

function buildHeroActor(hero, folderId, teamKey) {
    const seed = `actor:hero:${teamKey}:${slug(hero.name)}`;
    const id = foundryId(seed);
    const items = [
        ...hero.powers.map((p, i) => powerItem(id, seed, p, i)),
        ...hero.qualities.map((q, i) => qualityItem(id, seed, q, i)),
        ...hero.abilities.map((a, i) => abilityItem(id, seed, a, i))
    ];
    const health = hero.health || {};
    const first = hero.principles?.[0] || {};
    const second = hero.principles?.[1] || {};
    const collectionSlots = ["one", "two", "three", "four", "five", "six"];
    const collections = Object.fromEntries(collectionSlots.map((key) => [key, ""]));
    for (const [index, title] of (hero.collections || []).slice(0, 6).entries()) {
        collections[collectionSlots[index]] = title;
    }
    const actor = {
        name: hero.name,
        type: "hero",
        img: "icons/svg/mystery-man.svg",
        system: {
            alias: hero.alias || "",
            archetype: hero.archetype || "",
            wounds: { value: 0, max: health.max || 0 },
            mode: "main",
            modName: "",
            modValue: "+1",
            firstDie: "d4",
            secondDie: "d4",
            thirdDie: "d4",
            firstDieName: "N/A",
            secondDieName: "N/A",
            thirdDieName: "N/A",
            firstPrinciple: {
                name: first.name || "",
                roleplaying: first.roleplaying || "",
                minorTwist: first.minorTwist || "",
                majorTwist: first.majorTwist || ""
            },
            secondPrinciple: {
                name: second.name || "",
                roleplaying: second.roleplaying || "",
                minorTwist: second.minorTwist || "",
                majorTwist: second.majorTwist || ""
            },
            backIssue: { one: "", two: "", three: "", four: "", five: "", six: "" },
            collections,
            collectionsUsed: { one: false, two: false, three: false, four: false, five: false, six: false },
            heroPoints: {
                game: { one: false, two: false, three: false, four: false, five: false },
                one: { one: false, two: false, three: false, four: false },
                two: { one: false, two: false, three: false, four: false },
                three: { one: false, two: false, three: false, four: false },
                four: { one: false, two: false, three: false, four: false }
            },
            gender: hero.gender || "",
            age: hero.age || "",
            height: hero.height || "",
            eyes: hero.eyes || "",
            hair: hero.hair || "",
            skin: hero.skin || "",
            build: hero.build || "",
            costume: hero.costume ? `<p>${hero.costume}</p>` : "",
            background: hero.background || "",
            powerSource: hero.powerSource || "",
            personality: hero.personality || "",
            health: {
                greenLow: health.greenLow || 0,
                yellowHigh: health.yellowHigh || 0,
                yellowLow: health.yellowLow || 0,
                redHigh: health.redHigh || 0,
                redLow: health.redLow || 1
            },
            statusDie: {
                green: hero.statusDie?.green || "d8",
                yellow: hero.statusDie?.yellow || "d8",
                red: hero.statusDie?.red || "d8",
                civilianGreen: "d8",
                civilianYellow: "d8",
                civilianRed: "d8"
            },
            scene: "green",
            out: hero.out ? `<p>${hero.out}</p>` : "",
            modeName: { main: "", green1: "", green2: "", yellow1: "", yellow2: "", red1: "" },
            modeDescription: { main: "", green1: "", green2: "", yellow1: "", yellow2: "", red1: "" },
            modeDisplayed: { main: false, green1: false, green2: false, yellow1: false, yellow2: false, red1: false },
            modular: false,
            powerless: false,
            formchanger: false,
            divided: false,
            dividedPsyche: false,
            dividedStatus: false,
            civilianMode: false,
            poweredMode: false,
            persistent: false,
            exclusive: false
        },
        items,
        effects: [],
        folder: folderId,
        sort: 0,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                team: teamKey,
                sourcePages: hero.sourcePages || null,
                biographyHtml: hero.biographyHtml || ""
            }
        },
        _stats: STATS,
        _id: id,
        _key: `!actors!${id}`
    };
    return applyFormChanger(actor, hero, seed);
}

function buildVillainActor(villain, folderId, teamKey) {
    const seed = `actor:villain:${teamKey}:${slug(villain.name)}`;
    const id = foundryId(seed);
    // Villain sheet abilitiestable filters on system.aux === "villain".
    const abilities = (villain.abilities || []).map((ability) => ({
        ...ability,
        aux: ability.aux && ability.aux !== "main" ? ability.aux : "villain"
    }));
    const items = [
        ...(villain.powers || []).map((p, i) => powerItem(id, seed, p, i)),
        ...(villain.qualities || []).map((q, i) => qualityItem(id, seed, q, i)),
        ...(villain.statuses || []).map((s, i) => villainStatusItem(id, seed, s, i)),
        ...abilities.map((a, i) => abilityItem(id, seed, a, i))
    ];
    return {
        name: villain.name,
        type: "villain",
        img: "icons/svg/skull.svg",
        system: {
            alias: villain.alias || "",
            archetype: villain.archetype || "",
            approach: villain.approach || "",
            wounds: { value: 0, max: villain.health || 0 },
            mode: "main",
            modName: "",
            modValue: "+1",
            firstDie: "d4",
            secondDie: "d4",
            thirdDie: "d4",
            firstDieName: "N/A",
            secondDieName: "N/A",
            thirdDieName: "N/A"
        },
        items,
        effects: [],
        folder: folderId,
        sort: 0,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                team: teamKey,
                sourcePage: villain.sourcePage || null,
                biographyHtml: villain.biographyHtml || "",
                statusTheme: villain.statusTheme || null,
                gaps: villain.gaps || []
            }
        },
        _stats: STATS,
        _id: id,
        _key: `!actors!${id}`
    };
}

function buildMinionActor(minion, folderId, teamKey) {
    const seed = `actor:minion:${teamKey}:${slug(minion.name)}`;
    const id = foundryId(seed);
    const die = minion.typicalDie || "d8";
    const items = (minion.abilities || []).map((ability, index) => attachItemKey(id, {
        _id: itemId(`${seed}:minion-ability:${index}:${slug(ability.name)}`),
        name: ability.name,
        type: "minionForm",
        img: "icons/svg/combat.svg",
        system: {
            description: ability.description ? `<p>${ability.description
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")}</p>` : "",
            bonus: "one",
            group: 1
        },
        effects: [],
        folder: null,
        sort: index * 100_000,
        ownership: { default: 0 },
        flags: { "scrpg-actor-compendium": { archive: true } },
        _stats: STATS
    }));
    return {
        name: minion.name,
        type: "minion",
        img: "icons/svg/cowled.svg",
        system: {
            groups: "1",
            groupName: {
                one: minion.name,
                two: "Group 2",
                three: "Group 3",
                four: "Group 4",
                five: "Group 5",
                six: "Group 6",
                seven: "Group 7",
                eight: "Group 8",
                nine: "Group 9",
                ten: "Group 10"
            },
            typicalDie: {
                one: die,
                two: "d4",
                three: "d4",
                four: "d4",
                five: "d4",
                six: "d4",
                seven: "d4",
                eight: "d4",
                nine: "d4",
                ten: "d4"
            }
        },
        items,
        effects: [],
        folder: folderId,
        sort: 0,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                team: teamKey,
                kind: minion.kind || "minion",
                description: minion.description || "",
                sourcePage: minion.sourcePage || null,
                dieTypeKnown: minion.dieTypeKnown === true
            }
        },
        _stats: STATS,
        _id: id,
        _key: `!actors!${id}`
    };
}

function buildEnvironmentActor(env, folderId) {
    const seed = `actor:environment:${slug(env.name)}`;
    const id = foundryId(seed);
    const items = (env.twists || []).map((t, i) => environmentTwistItem(id, seed, t, i));
    const dice = env.dice || {};
    return {
        name: env.name,
        type: "environment",
        img: "icons/svg/city.svg",
        system: {
            firstDie: dice.firstDie || "d10",
            secondDie: dice.secondDie || "d8",
            thirdDie: dice.thirdDie || "d6",
            firstDieName: "Environment",
            secondDieName: "Environment",
            thirdDieName: "Environment",
            description: env.descriptionHtml || ""
        },
        items,
        effects: [],
        folder: folderId,
        sort: 0,
        ownership: { default: 0 },
        flags: {
            "scrpg-actor-compendium": {
                archive: true,
                sourcePages: env.sourcePages || null,
                gaps: env.gaps || []
            }
        },
        _stats: STATS,
        _id: id,
        _key: `!actors!${id}`
    };
}

function buildTeamPack({ packKey, dataFile, actorType, buildActor, expectedMin = 1 }) {
    const dataPath = path.join(root, dataFile);
    const sourceRoot = path.join(root, "src/packs", packKey);
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    fs.rmSync(sourceRoot, { recursive: true, force: true });

    const ids = new Set();
    const documents = [];
    let actorCount = 0;
    const teams = data.teams || [{ key: "all", label: "All", members: data.environments || [] }];

    for (const team of teams) {
        const members = team.members || team.environments || [];
        if (!team.key || !team.label) {
            throw new Error(`Team missing key/label in ${packKey}`);
        }
        const { folder, folderId } = makeFolder({
            name: team.label,
            idSeed: `folder:actor:${packKey}:${team.key}`,
            docType: "Actor"
        });
        if (ids.has(folderId)) throw new Error(`Duplicate folder id ${folderId}`);
        ids.add(folderId);
        documents.push(folder);
        writeJson(path.join(sourceRoot, team.key, "_Folder.json"), folder);

        for (const member of members) {
            const actor = buildActor(member, folderId, team.key);
            if (ids.has(actor._id)) throw new Error(`Duplicate actor id ${actor._id} for ${actor.name}`);
            ids.add(actor._id);
            // nested item ids
            for (const item of actor.items || []) {
                if (ids.has(item._id)) throw new Error(`Duplicate item id ${item._id}`);
                ids.add(item._id);
            }
            documents.push(actor);
            writeJson(path.join(sourceRoot, team.key, `${slug(actor.name)}.json`), actor);
            actorCount += 1;
        }
    }

    if (actorCount < expectedMin) {
        throw new Error(`Expected at least ${expectedMin} ${actorType} actors in ${packKey}, got ${actorCount}`);
    }

    const packDest = path.join(root, "packs", packKey);
    clearPack(packDest);
    return { actorCount, sourceRoot, packDest, folderCount: documents.filter(d => d._key?.startsWith("!folders!")).length };
}

async function compile(sourceRoot, packDest) {
    await compilePack(sourceRoot, packDest, { log: true, recursive: true });
}

async function main() {
    const heroesData = JSON.parse(fs.readFileSync(path.join(root, "src/data/archive/heroes.json"), "utf8"));
    const villainsData = JSON.parse(fs.readFileSync(path.join(root, "src/data/archive/villains.json"), "utf8"));
    const minionsData = JSON.parse(fs.readFileSync(path.join(root, "src/data/archive/minions.json"), "utf8"));
    const environmentsData = JSON.parse(fs.readFileSync(path.join(root, "src/data/archive/environments.json"), "utf8"));

    // Normalize environments into a single folder team for pack builder
    const envWrapped = {
        teams: [
            {
                key: "archive",
                label: "Archive Environments",
                members: environmentsData.environments
            }
        ]
    };
    writeJson(path.join(root, "src/data/archive/environments.pack.json"), envWrapped);

    const heroes = buildTeamPack({
        packKey: "heroes",
        dataFile: "src/data/archive/heroes.json",
        actorType: "hero",
        buildActor: buildHeroActor,
        expectedMin: 12
    });
    await compile(heroes.sourceRoot, heroes.packDest);
    console.log(`heroes: ${heroes.actorCount} actors in ${heroes.folderCount} folders`);

    const villains = buildTeamPack({
        packKey: "villains",
        dataFile: "src/data/archive/villains.json",
        actorType: "villain",
        buildActor: buildVillainActor,
        expectedMin: 24
    });
    await compile(villains.sourceRoot, villains.packDest);
    console.log(`villains: ${villains.actorCount} actors in ${villains.folderCount} folders`);

    const minions = buildTeamPack({
        packKey: "minions",
        dataFile: "src/data/archive/minions.json",
        actorType: "minion",
        buildActor: buildMinionActor,
        expectedMin: 10
    });
    await compile(minions.sourceRoot, minions.packDest);
    console.log(`minions: ${minions.actorCount} actors in ${minions.folderCount} folders`);

    // environments pack uses wrapped file
    fs.writeFileSync(
        path.join(root, "src/data/archive/environments.json.bak"),
        JSON.stringify(environmentsData, null, 2)
    );
    // build from wrapped structure without mutating primary environments.json shape permanently:
    const envBuild = (() => {
        const packKey = "environments";
        const sourceRoot = path.join(root, "src/packs", packKey);
        fs.rmSync(sourceRoot, { recursive: true, force: true });
        const ids = new Set();
        const documents = [];
        let actorCount = 0;
        const { folder, folderId } = makeFolder({
            name: "Archive Environments",
            idSeed: "folder:actor:environments:archive",
            docType: "Actor"
        });
        ids.add(folderId);
        documents.push(folder);
        writeJson(path.join(sourceRoot, "archive", "_Folder.json"), folder);
        for (const env of environmentsData.environments) {
            const actor = buildEnvironmentActor(env, folderId);
            if (ids.has(actor._id)) throw new Error(`Duplicate env id ${actor._id}`);
            ids.add(actor._id);
            for (const item of actor.items || []) {
                if (ids.has(item._id)) throw new Error(`Duplicate item id ${item._id}`);
                ids.add(item._id);
            }
            documents.push(actor);
            writeJson(path.join(sourceRoot, "archive", `${slug(actor.name)}.json`), actor);
            actorCount += 1;
        }
        if (actorCount !== 6) throw new Error(`Expected 6 environments, got ${actorCount}`);
        const packDest = path.join(root, "packs", packKey);
        clearPack(packDest);
        return { actorCount, sourceRoot, packDest };
    })();
    await compile(envBuild.sourceRoot, envBuild.packDest);
    console.log(`environments: ${envBuild.actorCount} actors`);

    // cleanup temp
    fs.rmSync(path.join(root, "src/data/archive/environments.pack.json"), { force: true });
    fs.rmSync(path.join(root, "src/data/archive/environments.json.bak"), { force: true });

    console.log(
        JSON.stringify(
            {
                heroes: heroes.actorCount,
                heroTeams: heroesData.teams.length,
                villains: villains.actorCount,
                villainTeams: villainsData.teams.length,
                minions: minions.actorCount,
                minionTeams: minionsData.teams.length,
                environments: envBuild.actorCount
            },
            null,
            2
        )
    );
}

await main();
