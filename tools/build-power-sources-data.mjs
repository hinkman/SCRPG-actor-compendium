/**
 * Curated Power Sources + abilities from SCRPG PDF (book pp. 56–70).
 * Writes src/data/powerSources.json and merges Power Sources groups into abilities.json.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function slotsFromText(gameText) {
    const slots = [];
    const seen = new Set();
    for (const m of gameText.matchAll(/\[([^\]]+)\]/g)) {
        const token = `[${m[1]}]`;
        if (seen.has(token)) continue;
        seen.add(token);
        const inner = m[1].toLowerCase();
        if (inner === "power/quality" || inner.includes("power/quality")) {
            slots.push({ token, itemTypes: ["power", "quality"] });
        } else if (inner.startsWith("power") || inner.includes("element") || inner.includes("energy") || inner.includes("physical")) {
            slots.push({ token, itemType: "power" });
        } else if (inner.startsWith("quality") || inner.includes("choose two basic")) {
            slots.push({ token, itemType: "quality" });
        } else {
            slots.push({ token, itemType: "power" });
        }
    }
    return slots;
}

function iconsFromText(gameText, type) {
    const t = gameText.toLowerCase();
    return {
        attack: /\battack\b/.test(t),
        defend: /\bdefend\b/.test(t),
        overcome: /\bovercome\b/.test(t),
        hinder: /\bhinder\b/.test(t),
        boost: /\bboost\b/.test(t),
        recover: /\brecover\b/.test(t)
    };
}

function ability(name, type, gameText) {
    return {
        name,
        type,
        icon: iconsFromText(gameText, type),
        gameText,
        slots: slotsFromText(gameText)
    };
}

/** @type {Array<object>} */
const SOURCES = [
    {
        number: 1,
        name: "Accident",
        flavor: "An external source caused you to manifest powers or perhaps the cure for an accident caused it.",
        powers: [
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Intellectual powers category",
            "Select from Materials powers category",
            "Select from Psychic powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Area Alteration", "A", "Boost or Hinder any number of nearby targets using [power]. Use your Max die."),
            ability("Inflict", "A", "Attack using [power]. Hinder that same target using your Min die."),
            ability("Reflexive Burst", "R", "When your personal zone changes, Attack all close enemy targets by rolling your single [power] die.")
        ],
        green: [
            ability("Ambush Awareness", "R", "If you haven't yet acted in an action scene, you may Defend against an Attack by rolling your single [power] die."),
            ability("Change in Circumstance", "R", "When you change personal zones, you may Boost by rolling your single [power] die."),
            ability("Immunity", "I", "You do not take damage from [energy/element].")
        ],
        additionalInfo: [],
        archetypeDice: ["d12", "d6"]
    },
    {
        number: 2,
        name: "Training",
        flavor: "The source of your powers is the result of your hard work, dedication, and long hours.",
        powers: [
            "Gadgets",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Intellectual powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Always Be Prepared", "A", "Boost yourself using [power]. That bonus is persistent and exclusive. Then, Attack using your Min die. You may use the bonus you just created on that Attack."),
            ability("Reactive Field", "R", "When you are attacked by a nearby enemy, the attacker also takes an equal amount of damage."),
            ability("Flowing Fight", "A", "Attack using [power]. Use your Mid die to Attack one extra target for each bonus you have. Apply a different bonus to each Attack.")
        ],
        green: [],
        additionalInfo: [
            "When you move to the next step, select an extra quality from that archetype's list at d8."
        ],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 3,
        name: "Genetic",
        flavor: "Mutations in your DNA have caused you to develop unusual abilities.",
        powers: [
            "Agility",
            "Flight",
            "Signature Weaponry",
            "Strength",
            "Vitality",
            "Select from Intellectual powers category",
            "Select from Psychic powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Danger Sense", "R", "When damaged by an environment target or a surprise Attack, Defend by rolling your single [power] die."),
            ability("Adaptive", "A", "Boost yourself using [power], then either remove a penalty on yourself or Recover using your Min die."),
            ability("Area Assault", "A", "Attack multiple targets using [power], using your Min die against each.")
        ],
        green: [
            ability("Growth", "A", "Boost yourself using [quality]. That bonus is persistent and exclusive."),
            ability("Rally", "A", "Attack using [quality]. Other nearby heroes in the Yellow or Red zone Recover equal to your Min die.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 4,
        name: "Experimentation",
        flavor: "Your powers were created in a lab and had some unexpected side effects.",
        powers: [
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Intellectual powers category",
            "Select from Mobility powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Personal Upgrade", "A", "Boost yourself using [power]. Use your Max die. That bonus is persistent and exclusive."),
            ability("Misdirection", "R", "When a nearby hero in the Yellow or Red zone would take damage, Defend against that damage by rolling your single [power] die, then redirect any remaining damage to a nearby minion of your choice."),
            ability("Throw Minion", "A", "Attack a minion using [power]. The result of the minion's save Attacks another target of your choice.")
        ],
        green: [
            ability("Overpower", "I", "Whenever you are Boosted, increase that bonus by +1. Then, if that bonus is +5 or higher, take damage equal to that bonus and remove it."),
            ability("Unflagging", "I", "At the start of your turn, remove a penalty on yourself.")
        ],
        additionalInfo: [],
        archetypeDice: ["d8", "d8", "d8"]
    },
    {
        number: 5,
        name: "Mystical",
        flavor: "Your magical training or alteration by magic gives you your powers.",
        powers: [
            "Awareness",
            "Flight",
            "Presence",
            "Signature Weaponry",
            "Teleportation",
            "Select from Elemental/Energy powers category",
            "Select from Materials powers category",
            "Select from Psychic powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Modification Wave", "A", "Boost or Hinder using [power], and apply that mod to multiple nearby targets."),
            ability("Mystic Redirection", "R", "When another hero in the Yellow or Red zone would take damage, you may redirect it to yourself and Defend against it by rolling your single [power] die."),
            ability("Sever Link", "A", "Overcome an environmental challenge using [power]. Use your Max die. Either remove any penalty in the scene or Boost equal to your Mid die.")
        ],
        green: [],
        additionalInfo: ["Gain an Information quality and assign a d10 to it."],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 6,
        name: "Nature",
        flavor: "The power of nature flows through you.",
        powers: [
            "Animal Control",
            "Cold",
            "Electricity",
            "Fire",
            "Flight",
            "Leaping",
            "Shapeshifting",
            "Swimming",
            "Swinging",
            "Wall-Crawling",
            "Weather",
            "Select from Athletic powers category",
            "Select from Materials powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Call to the Wild", "A", "Gain a d8 minion. It takes its turn before yours, but goes away at the end of the scene. You may only have one such minion at a time."),
            ability("Predator's Eye", "A", "Attack using [power]. Use your Max+Min dice. Then gain a Boost using your Mid die. The target of the Attack gains a bonus of the same size."),
            ability("Wild Strength", "R", "When you defeat a minion, roll that minion's die and Boost yourself using that roll to create a bonus for your next action.")
        ],
        green: [
            ability("Grasping Vines", "A", "Hinder using [power]. Use your Max die. You may split that penalty across multiple nearby targets."),
            ability("Natural Weapon", "A", "Attack using [power]. Use your Max die.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 7,
        name: "Relic",
        flavor: "An object (or collection of objects) of mystical significance either grants you powers or altered you to give you powers.",
        powers: [
            "Awareness",
            "Intuition",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Elemental/Energy powers category",
            "Select from Materials powers category",
            "Select from Mobility powers category",
            "Select from Psychic powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Harvest Life Force", "A", "Attack using [power]. Use your Min die. Take damage equal to your Mid die, and one nearby ally Recovers Health equal to your Max die."),
            ability("Magical Shield", "R", "When another hero in the Yellow or Red zone would take damage, you may Defend them by rolling your single [power] die."),
            ability("Momentary Power", "A", "Boost yourself using [power]. Use your Max die. Hinder a nearby opponent with your Min die."),
            ability("Relic Drain", "A", "Hinder using [power]. Also Recover Health equal to your Min die.")
        ],
        green: [
            ability("Draw Power", "A", "Boost yourself using [power]. That bonus is persistent and exclusive."),
            ability("Punishment", "I", "Whenever you Attack an enemy that has inflicted a penalty on you, treat that penalty as if it were a bonus for the purpose of that Attack.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d10", "d6"]
    },
    {
        number: 8,
        name: "Powered Suit",
        flavor: "An engineered suit provides you with your powers, and may even be important to keeping you alive.",
        powers: [
            "Awareness",
            "Cold",
            "Elasticity",
            "Electricity",
            "Fire",
            "Lightning Calculator",
            "Nuclear",
            "Part Detachment",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Mobility powers category"
        ],
        powersIntro: "Assign one die to the power Power Suit.\nAssign the rest of the dice you rolled at the end of the background step to the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Energy Converter", "R", "When you take damage from [element/energy], treat the amount of damage you take as a Boost action for yourself."),
            ability("Explosive Attack", "A", "Attack up to three different targets using [power]. Apply your Max die to one, your Mid die to another, and your Min die to the third. If you roll doubles, take a minor twist or take irreducible damage equal to that die."),
            ability("Onboard Upgrade", "A", "Boost yourself using Power Suit. Use your Min+Mid dice. That bonus is persistent and exclusive.")
        ],
        green: [
            ability("Damage Reduction", "I", "Reduce physical or energy damage you take by 1 while you are in the Green zone, 2 while in the Yellow zone, and 3 while in the Red zone."),
            ability("Diagnostic Subroutine", "I", "Whenever your status changes due to a change in your current Health, you may remove a penalty on yourself.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d6", "d6"]
    },
    {
        number: 9,
        name: "Radiation",
        flavor: "Exposure to radiation has charged your system and given you new abilities.",
        powers: [
            "Nuclear",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Self Control powers category",
            "Select from Technological powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Radioactive Recharge", "A", "Boost yourself using [power]. Then, either remove a penalty on yourself or Recover using your Min die."),
            ability("Unstable Reaction", "R", "After rolling during your turn, you may take 1 irreducible damage to reroll your entire dice pool."),
            ability("Wither", "A", "Attack using [power]. Hinder that target using your Max die.")
        ],
        green: [
            ability("Charged Up", "I", "Whenever you roll a 1 on one or more dice, you may reroll those dice. You must accept the result of the reroll."),
            ability("Dangerous Lash", "A", "Attack multiple targets using [power], applying your Min die to each. If you roll doubles, also Attack an ally using your Mid die."),
            ability("Radioactive Aura", "R", "When a new target enters the scene close to you, you may Attack it by rolling your single [power] die.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d8", "d6"]
    },
    {
        number: 10,
        name: "Tech Upgrades",
        flavor: "You have technological upgrades and implants that give you your powers.",
        powers: [
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Intellectual powers category",
            "Select from Mobility powers category",
            "Select from Technological powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Energy Burst", "A", "Attack multiple targets using [power], using your Min die against each."),
            ability("Recharge", "A", "Boost yourself using [power]. Then, either remove a penalty on yourself or Recover using your Min die."),
            ability("Techno-Absorb", "I", "When you would take damage from [element/energy], you may Recover that amount of Health instead."),
            ability("Tactical Analysis", "R", "When Attacked, treat the amount of damage you take as a Boost action for yourself.")
        ],
        green: [
            ability("Indiscriminate Fabrication", "A", "Boost using [power], assigning your Min, Mid, and Max dice to 3 different bonuses, one of which must be given to an enemy."),
            ability("Organi-Hack", "A", "Attack a target using [power]. Hinder that target with your Min die.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 11,
        name: "Supernatural",
        flavor: "In some way, you have pierced the veil of life and reality and brought back power.",
        powers: [
            "Awareness",
            "Cold",
            "Electricity",
            "Fire",
            "Infernal",
            "Plants",
            "Presence",
            "Radiant",
            "Strength",
            "Transmutation",
            "Vitality",
            "Weather",
            "Select from Mobility powers category",
            "Select from Psychic powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Area Healing", "A", "Boost an ally using [power]. You and nearby heroes in the Yellow and Red zones Recover Health equal to your Min die."),
            ability("Mass Modification", "A", "Boost or Hinder using [power], and apply that mod to multiple close targets."),
            ability("Personal Upgrade", "A", "Boost yourself using [power]. Use your Max die. That bonus is persistent and exclusive."),
            ability("Reach through Veil", "R", "When a nearby ally would take damage, Defend that ally by rolling your single status die, and move them elsewhere in the same scene.")
        ],
        green: [],
        additionalInfo: ["Gain one power not on the above list. Assign it a d10."],
        archetypeDice: ["d10", "d10", "d6"]
    },
    {
        number: 12,
        name: "Artificial Being",
        flavor: "You were created, not born, and your abilities simply stem from your makeup.",
        powers: [
            "Inventions",
            "Robotics",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Intellectual powers category",
            "Select from Mobility powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Created Immunity", "I", "When you would take damage from [element/energy], you may Recover that amount of Health instead."),
            ability("Multiple Assault", "A", "Attack using [power] against multiple targets, using your Min die against each."),
            ability("Recalculating...", "R", "After rolling during your turn, you may take 1 irreducible damage to reroll your entire dice pool.")
        ],
        green: [
            ability("Created Form", "I", "Reduce physical damage to yourself by 1 while you are in the Green zone, 2 while in the Yellow zone, and 3 while in the Red zone."),
            ability("Intentionality", "I", "Whenever you roll a 1 on one or more dice, you may reroll those dice. You must accept the result of the reroll.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 13,
        name: "Cursed",
        flavor: "A supernatural curse has been inflicted upon you or your family line, granting both boons and banes.",
        powers: [
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Materials powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Attunement", "I", "When you would take damage from [element/energy], you may Recover that amount of Health instead."),
            ability("Costly Strength", "A", "Boost all nearby allies using [power]. Use your Max+Mid dice. Hinder yourself with your Min die."),
            ability("Cursed Resolve", "A", "Boost yourself using [power]. Then, either remove a penalty on yourself or Recover using your Min die.")
        ],
        green: [
            ability("Double Edged Luck", "I", "Whenever you roll a 1 on one or more dice, you may reroll those dice. You must accept the result of the reroll."),
            ability("Extremes", "I", "Whenever you roll a die's max value, treat that value as 1 higher. When you roll a 1 on a die, treat that die as if it had rolled a 0.")
        ],
        additionalInfo: [],
        archetypeDice: ["d12", "d6"]
    },
    {
        number: 14,
        name: "Alien",
        flavor: "You are not from Earth, though your powers might not be all that unusual where you come from. Or you've been granted abilities by an extraterrestrial source.",
        powers: [
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Intellectual powers category",
            "Select from Mobility powers category",
            "Select from Psychic powers category",
            "Select from Technological powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Alien Boost", "A", "Boost all nearby allies using [power]. Use your Max+Mid dice. Hinder yourself with your Min die."),
            ability("Empower and Repair", "A", "Boost, Hinder, Defend, or Attack using [power]. You and all nearby heroes in the Yellow or Red zone Recover Health equal to your Min die."),
            ability("Halt", "R", "When you are Attacked at close range, Defend yourself by rolling your single [power] die.")
        ],
        green: [],
        additionalInfo: [
            "Then, upgrade one d8 power or quality to d10. If you have no d8 powers, instead add a new power from the above list at d8."
        ],
        archetypeDice: ["d8", "d8", "d8"]
    },
    {
        number: 15,
        name: "Genius",
        flavor: "The source of your powers is your brilliant mind. You have put your staggering intellect to the task of fighting crime.",
        powers: [
            "Inventions",
            "Robotics",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Intellectual powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("A Plan For Everything", "R", "When you are attacked, first roll your single [power] die. Defend yourself with that roll. Then, Boost yourself using that roll."),
            ability("Expanded Mind", "A", "Boost yourself using [power]. Use your Max die. That bonus is persistent and exclusive. Then Attack using your Min die."),
            ability("Overwhelming Vision", "A", "Attack using [power]. Then, if the target of the Attack survived, also Attack that target with your Max die. Otherwise, Recover an amount of Health equal to your Min die.")
        ],
        green: [],
        additionalInfo: ["Select an extra quality from the Information or Mental quality categories at d10."],
        archetypeDice: ["d10", "d6", "d6"]
    },
    {
        number: 16,
        name: "Cosmos",
        flavor: "Exposure to forces from beyond the stars have changed you.",
        powers: [
            "Cosmic",
            "Intuition",
            "Signature Vehicle",
            "Signature Weaponry",
            "Select from Mobility powers category",
            "Select from Psychic powers category",
            "Select from Self Control powers category",
            "Select from Technological powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Cosmic Ray Absorption", "I", "If you would take damage from [element/energy you have a related power for], instead reduce that damage to 0 and Recover that amount of Health."),
            ability("Encourage", "A", "Attack using [power]. Boost all nearby heroes taking Attack or Overcome actions using your Min die until your next turn."),
            ability("Mass Effect", "A", "Boost or Hinder using [power] and apply that mod to multiple close targets.")
        ],
        green: [],
        additionalInfo: ["Downgrade one d10 or d12 power one die size and upgrade one d6 or d8 power one die size."],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 17,
        name: "Extradimensional",
        flavor: "Exposure to side dimensions like the Realm of Discord has left its mark on you.",
        powers: [
            "Cosmic",
            "Duplication",
            "Infernal",
            "Intangibility",
            "Invisibility",
            "Radiant",
            "Signature Vehicle",
            "Signature Weaponry",
            "Transmutation",
            "Teleportation",
            "Select from Intellectual powers category",
            "Select from Psychic powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Absorb Essence", "R", "When you defeat a minion, roll that minion's die and Boost yourself using that roll."),
            ability("Aura of Pain", "A", "Attack multiple targets using [power]. Then, take irreducible damage equal to the number of targets hit."),
            ability("Bizarre Strike", "A", "Attack using [power]. Use your Max die. Hinder that target with your Mid die. Hinder yourself with your Min die.")
        ],
        green: [
            ability("Attune", "A", "Boost yourself using [power]. That bonus is persistent and exclusive. Damage dealt using that bonus is all [energy/element]."),
            ability("Extrasensory Awareness", "R", "When you would take damage that would change your zone, Defend against that damage by rolling your single [quality] die.")
        ],
        additionalInfo: [],
        archetypeDice: ["d12", "d6"]
    },
    {
        number: 18,
        name: "Unknown",
        flavor: "You don't know the source of your powers: they either just manifested one day, or hint at a bigger mystery.",
        powers: [
            "Select from Elemental/Energy powers category",
            "Select from Intellectual powers category",
            "Select from Materials powers category",
            "Select from Self Control powers category",
            "Select from Technological powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Brainstorm", "A", "Attack using [power]. Hit one target using your Min die, another target with your Mid die, and Boost using your Max die."),
            ability("Strange Enhancement", "A", "Boost all nearby allies using [power] using your Max+Mid dice. Hinder yourself with your Min die."),
            ability("Volatile Creations", "R", "When one of your bonuses, penalties, or other creation of your powers is destroyed, deal a target damage equal to the roll of your [power] die.")
        ],
        green: [],
        additionalInfo: ["Gain a Social quality at d10."],
        archetypeDice: ["d10", "d8", "d6"]
    },
    {
        number: 19,
        name: "Higher Power",
        flavor: "You have been chosen by a higher force or are a being from another realm. Your powers are a reflection of your calling or true form.",
        powers: [
            "Select from Athletic powers category",
            "Select from Elemental/Energy powers category",
            "Select from Materials powers category",
            "Select from Psychic powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: "Gain one of these Green abilities:",
        yellow: [
            ability("Command Power", "R", "When you take damage from [elemental/energy], you may deal that much damage to another target."),
            ability("Dangerous Explosion", "A", "Attack multiple targets using [power]. Use your Mid die. Hinder all targets damaged by this ability with your Min die. Hinder yourself with your Max die."),
            ability("Embolden", "A", "Attack using [power], and Boost all nearby heroes taking [choose two basic actions] using your Min die until your next turn."),
            ability("Resolve", "A", "Boost yourself using [power], then remove a penalty on yourself or Recover using your Min die.")
        ],
        green: [
            ability("Resilience", "I", "At the start of your turn, remove any -1 penalties on you."),
            ability("Twist Reality", "R", "After rolling during your turn, you may take 1 irreducible damage to reroll your entire dice pool.")
        ],
        additionalInfo: [],
        archetypeDice: ["d10", "d8", "d8"]
    },
    {
        number: 20,
        name: "The Multiverse",
        flavor: "You have traveled or been flung through the realms of time and space. Without The Multiverse itself, you would not be who you are now.",
        powers: [
            "Awareness",
            "Cosmic",
            "Intuition",
            "Speed",
            "Teleportation",
            "Select from Psychic powers category",
            "Select from Self Control powers category"
        ],
        powersIntro: "Assign all the dice you rolled at the end of the background step to any of the following powers:",
        yellowGrant: "Gain two of these Yellow abilities, each using a different power:",
        greenGrant: null,
        yellow: [
            ability("Power From Beyond", "A", "Boost yourself using [power]. Use your Max die. That bonus is persistent and exclusive. Then, Attack using your Min die."),
            ability("Respond In Kind", "R", "When you are hit with an Attack at close range, the attacker also takes damage equal to their effect die."),
            ability("Dread Pallor", "A", "Hinder multiple targets using [power]. Use your Mid die for one and your Min die for the rest."),
            ability("Reality Scorned", "A", "Attack using [power]. If your target survived, Hinder them using your Max die.")
        ],
        green: [],
        additionalInfo: ["Gain one extra power from any category at d6."],
        archetypeDice: ["d10", "d8", "d6"]
    }
];

function buildDescription(source) {
    const lines = [source.flavor, "", source.powersIntro, ...source.powers.map(p => `• ${p}`), ""];
    if (source.yellowGrant) {
        lines.push(source.yellowGrant, "");
    }
    if (source.greenGrant) {
        lines.push(source.greenGrant, "");
    }
    for (const info of source.additionalInfo) {
        lines.push(info, "");
    }
    lines.push(`Roll ${source.archetypeDice.join(", ")} for archetype selection.`);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function abilityUuid(color, sourceName, abilityName) {
    const id = foundryId(`ability:${color}:${slug(sourceName)}:${slug(abilityName)}`);
    return `Compendium.scrpg-actor-compendium.abilities.Item.${id}`;
}

function toPowerSourceEntry(source) {
    const abilities = [
        ...source.yellow.map(a => ({
            color: "yellow",
            name: a.name,
            uuid: abilityUuid("yellow", source.name, a.name)
        })),
        ...source.green.map(a => ({
            color: "green",
            name: a.name,
            uuid: abilityUuid("green", source.name, a.name)
        }))
    ];
    return {
        number: source.number,
        name: source.name,
        flavor: source.flavor,
        powersIntro: source.powersIntro,
        powers: source.powers,
        yellowGrant: source.yellowGrant,
        greenGrant: source.greenGrant,
        additionalInfo: source.additionalInfo,
        archetypeDice: source.archetypeDice,
        description: buildDescription(source),
        descriptionHtml: "",
        abilities
    };
}

function categoryFor(source, colorAbilities) {
    return {
        key: slug(source.name),
        label: source.name,
        source: { itemType: "powerSources", number: source.number },
        abilities: colorAbilities
    };
}

// --- write powerSources.json ---
const powerSources = SOURCES.map(toPowerSourceEntry);
fs.writeFileSync(path.join(ROOT, "src/data/powerSources.json"), `${JSON.stringify(powerSources, null, 2)}\n`);

// --- merge into abilities.json ---
const abilitiesPath = path.join(ROOT, "src/data/abilities.json");
const abilitiesRoot = JSON.parse(fs.readFileSync(abilitiesPath, "utf8"));

function ensurePowerSourcesGroup(colorKey, categories) {
    const color = abilitiesRoot.find(c => c.key === colorKey);
    if (!color) throw new Error(`Missing color ${colorKey}`);
    if (!Array.isArray(color.groups)) color.groups = [];
    color.groups = color.groups.filter(g => g.key !== "power-sources");
    if (categories.length) {
        // Insert Power Sources before Archetypes when present, else append.
        const archetypesIdx = color.groups.findIndex(g => g.key === "archetypes");
        const group = { key: "power-sources", label: "Power Sources", categories };
        if (archetypesIdx >= 0) color.groups.splice(archetypesIdx, 0, group);
        else color.groups.push(group);
    }
}

const yellowCats = SOURCES.filter(s => s.yellow.length).map(s => categoryFor(s, s.yellow));
const greenCats = SOURCES.filter(s => s.green.length).map(s => categoryFor(s, s.green));
ensurePowerSourcesGroup("yellow", yellowCats);
ensurePowerSourcesGroup("green", greenCats);

fs.writeFileSync(abilitiesPath, `${JSON.stringify(abilitiesRoot, null, 2)}\n`);

const yellowCount = yellowCats.reduce((n, c) => n + c.abilities.length, 0);
const greenCount = greenCats.reduce((n, c) => n + c.abilities.length, 0);
console.log(`Wrote ${powerSources.length} power sources; yellow abilities ${yellowCount}; green abilities ${greenCount}`);
