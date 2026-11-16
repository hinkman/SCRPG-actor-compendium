#!/usr/bin/env python3
"""Extract Archive chapter actors (book pp. 291–431) into src/data/archive/*.json."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
PDF = Path.home() / "Desktop" / "Sentinel_Comics_RPG.pdf"
OUT = ROOT / "src" / "data" / "archive"
BOOK_TO_PDF = 8  # book page N → PDF page N+8 (1-based)

CHROME = {
    "Playing", "the Game", "the", "Bullpen", "Adventure", "Issues", "Creating",
    "Heroes", "Intro", "Moderating", "Archives", "Appendices", "rchives", "A",
    "Villains", "Environments", "Minions & Lieutenants", "Description", "Ability",
    "Tactics", "ICON", "NAME", "TYPE", "GAME TEXT", "DIE", "TYPE", "Alias",
    "Powers", "Qualities", "OUT", "Health Range", "Status Dice", "GREEN",
    "YELLOW", "RED", "CURRENT", "Abilities", "Player", "Hero Name",
}


def book_page(doc: pymupdf.Document, book: int) -> pymupdf.Page:
    return doc[book + BOOK_TO_PDF - 1]


def page_spans(page: pymupdf.Page) -> list[dict]:
    spans = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span["text"].strip()
                if not text:
                    continue
                spans.append(
                    {
                        "t": text,
                        "x": span["bbox"][0],
                        "y": span["bbox"][1],
                        "size": span["size"],
                        "font": span["font"],
                    }
                )
    return spans


def page_text(page: pymupdf.Page) -> str:
    return page.get_text("text")


def html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def paragraphs(text: str) -> str:
    cleaned = re.sub(r"[ \t]+", " ", text).strip()
    cleaned = re.sub(r"\n{2,}", "\n\n", cleaned)
    parts = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    if not parts:
        parts = [cleaned] if cleaned else []
    return "".join(f"<p>{html_escape(p)}</p>" for p in parts)


def infer_icons(game_text: str) -> dict:
    lower = game_text.lower()
    return {
        "attack": "attack" in lower,
        "defend": "defend" in lower,
        "overcome": "overcome" in lower,
        "hinder": "hinder" in lower,
        "boost": "boost" in lower,
        "recover": "recover" in lower,
    }


def parse_health_ranges(spans: list[dict]) -> dict | None:
    ranges = {}
    for span in spans:
        m = re.fullmatch(r"(\d+)\s*[–-]\s*(\d+)", span["t"])
        if not m:
            continue
        high, low = int(m.group(1)), int(m.group(2))
        if high < low:
            high, low = low, high
        # nearest color label above/left
        label = None
        for other in spans:
            if other["t"] in {"GREEN", "YELLOW", "RED"} and abs(other["y"] - span["y"]) < 40:
                label = other["t"].lower()
                break
        if label:
            ranges[label] = {"high": high, "low": low}
    if not ranges:
        return None
    green_high = ranges.get("green", {}).get("high", 0)
    return {
        "greenLow": ranges.get("green", {}).get("low", 0),
        "yellowHigh": ranges.get("yellow", {}).get("high", 0),
        "yellowLow": ranges.get("yellow", {}).get("low", 0),
        "redHigh": ranges.get("red", {}).get("high", 0),
        "redLow": ranges.get("red", {}).get("low", 1),
        "max": green_high,
    }


def parse_power_quality_names(spans: list[dict]) -> tuple[list[str], list[str]]:
    powers, qualities = [], []
    for span in spans:
        if span["y"] < 95 or span["y"] > 235:
            continue
        if "GillSans" not in span["font"] or "Light" not in span["font"]:
            continue
        if span["size"] < 10:
            continue
        if span["t"] in CHROME:
            continue
        if span["x"] < 180:
            powers.append(span["t"])
        elif span["x"] < 350:
            qualities.append(span["t"])
    return powers, qualities


def parse_abilities(spans: list[dict]) -> list[dict]:
    yellow_y = next((s["y"] for s in spans if s["t"] == "YELLOW ZONE"), 10_000)
    red_y = next((s["y"] for s in spans if s["t"] == "RED ZONE"), 10_000)
    out_y = next((s["y"] for s in spans if s["t"] == "OUT"), 10_000)

    names = [
        s
        for s in spans
        if s["y"] > 250
        and "GillSans" in s["font"]
        and "Light" not in s["font"]
        and s["size"] >= 9
        and s["t"] not in CHROME
        and not re.fullmatch(r"[AIR]", s["t"])
    ]
    types = [
        s
        for s in spans
        if s["y"] > 250 and s["t"] in {"A", "I", "R"} and s["size"] < 12
    ]
    text_spans = [
        s
        for s in spans
        if s["y"] > 250
        and "Light" in s["font"]
        and s["x"] > 225
        and s["t"] not in {"A", "I", "R"}
        and not re.fullmatch(r"\d+", s["t"])
    ]

    abilities = []
    for name in sorted(names, key=lambda s: (round(s["y"], 1), s["x"])):
        typ = next(
            (t["t"] for t in types if abs(t["y"] - name["y"]) < 8 and t["x"] > name["x"]),
            "A",
        )
        nearby = [
            t["t"]
            for t in text_spans
            if name["y"] - 4 <= t["y"] <= name["y"] + 40
        ]
        # keep contiguous lines for this ability until next name
        next_name_y = min(
            (n["y"] for n in names if n["y"] > name["y"] + 2),
            default=name["y"] + 55,
        )
        lines = [
            t["t"]
            for t in text_spans
            if name["y"] - 2 <= t["y"] < next_name_y - 2
        ]
        game_text = " ".join(lines).strip()
        game_text = re.sub(r"\s+", " ", game_text)
        if name["y"] < yellow_y:
            aux = "green"
        elif name["y"] < red_y:
            aux = "yellow"
        elif name["y"] < out_y:
            aux = "red"
        else:
            aux = "out"
        abilities.append(
            {
                "name": name["t"],
                "type": typ,
                "aux": aux,
                "gameText": game_text,
                "icon": infer_icons(game_text),
            }
        )
    # Out ability often has no bold name — capture orphan text below OUT
    out_lines = [
        t["t"]
        for t in text_spans
        if t["y"] >= out_y - 2
    ]
    if out_lines and not any(a["aux"] == "out" and a["gameText"] for a in abilities):
        game_text = re.sub(r"\s+", " ", " ".join(out_lines)).strip()
        if game_text:
            abilities.append(
                {
                    "name": "Out Ability",
                    "type": "A",
                    "aux": "out",
                    "gameText": game_text,
                    "icon": infer_icons(game_text),
                }
            )
    return abilities


def parse_principles_from_attr(spans: list[dict]) -> list[str]:
    return [s["t"] for s in spans if s["t"].startswith("Principle of")]


def parse_hero_attr_page(spans: list[dict]) -> dict:
    principles = parse_principles_from_attr(spans)
    # After principles: name, alias, gender, age, height, eyes, hair, skin, build, costume..., then bg/ps/arch/pers
    try:
        idx = next(i for i, s in enumerate(spans) if s["t"].startswith("Principle of"))
    except StopIteration:
        return {}
    # second principle then hero name
    after = [s["t"] for s in spans[idx:] if s["t"] not in CHROME]
    # Find first Principle block end
    prin = []
    rest = []
    for text in after:
        if text.startswith("Principle of") and len(prin) < 2:
            prin.append(text)
            continue
        if len(prin) < 2:
            continue
        rest.append(text)
    if len(rest) < 10:
        return {"principles": prin}
    name = rest[0]
    alias = rest[1]
    gender, age, height = rest[2], rest[3], rest[4]
    eyes, hair, skin = rest[5], rest[6], rest[7]
    build = rest[8]
    # costume until a known background/power source word or short trait list near end
    known_bg = {
        "Dynasty", "Academic", "Tragic", "Military", "Upper Class", "Blank Slate",
        "Struggling", "Adventurer", "Unremarkable", "Law Enforcement", "Performer",
        "Retired", "Criminal", "Medical", "Anachronistic", "Exile", "Former Villain",
        "Interstellar", "Otherworldly", "Created",
    }
    costume_parts = []
    i = 9
    while i < len(rest) and rest[i] not in known_bg:
        costume_parts.append(rest[i])
        i += 1
    background = rest[i] if i < len(rest) else ""
    power_source = rest[i + 1] if i + 1 < len(rest) else ""
    archetype = rest[i + 2] if i + 2 < len(rest) else ""
    personality = rest[i + 3] if i + 3 < len(rest) else ""
    return {
        "name": name,
        "alias": alias,
        "gender": gender,
        "age": age,
        "height": height,
        "eyes": eyes,
        "hair": hair,
        "skin": skin,
        "build": build,
        "costume": " ".join(costume_parts).strip(),
        "background": background,
        "powerSource": power_source,
        "archetype": archetype,
        "personality": personality,
        "principles": prin or principles,
    }


HERO_DICE = {
    # book ability page → curated dice from sheet art
    295: {
        "powers": [
            ("Awareness", "d8"), ("Flight", "d8"), ("Speed", "d6"),
            ("Strength", "d10"), ("Vitality", "d8"),
        ],
        "qualities": [
            ("America’s Finest", "d8"), ("Close Combat", "d8"),
            ("History", "d10"), ("Leadership", "d10"),
        ],
        "statusDie": {"green": "d6", "yellow": "d8", "red": "d10"},
    },
    301: {
        "powers": [
            ("Atomic Glare", "d8"), ("Flight", "d10"),
            ("Strength", "d8"), ("Vitality", "d8"),
        ],
        "qualities": [
            ("America’s Favorite", "d8"), ("Close Combat", "d10"),
            ("History", "d10"), ("Insight", "d10"), ("Ranged Combat", "d8"),
        ],
        "statusDie": {"green": "d10", "yellow": "d8", "red": "d8"},
    },
    305: {
        "powers": [
            ("Agility", "d8"), ("Deduction", "d10"),
            ("Gadgets", "d8"), ("Throwing Knives", "d8"),
        ],
        "qualities": [
            ("Close Combat", "d8"), ("Investigation", "d10"), ("Fitness", "d8"),
            ("Ranged Combat", "d8"), ("Stealth", "d10"), ("Wealthy CEO", "d8"),
        ],
        "statusDie": {"green": "d10", "yellow": "d8", "red": "d6"},
    },
    309: {
        "powers": [
            ("Power Suit", "d10"), ("RIOT Cannon", "d8"),
            ("Lightning Calculator", "d8"), ("Strength", "d10"),
        ],
        "qualities": [
            ("Fitness", "d6"), ("Insight", "d6"), ("Ranged Combat", "d10"),
            ("Self-Discipline", "d8"), ("Veteran", "d8"),
        ],
        "statusDie": {"green": "d8", "yellow": "d8", "red": "d10"},
    },
    313: {
        "powers": [
            ("Inventions", "d8"), ("Lightning Calculator", "d10"),
            ("Speed", "d10"), ("Vitality", "d6"),
        ],
        "qualities": [
            ("Finesse", "d8"), ("Mind Over Matter", "d8"),
            ("Science", "d12"), ("Self-Discipline", "d8"),
        ],
        "statusDie": {"green": "d6", "yellow": "d8", "red": "d12"},
    },
    317: {
        "powers": [
            ("Absorption", "d6"), ("Cold", "d12"),
            ("Intuition", "d10"), ("Vitality", "d6"),
        ],
        "qualities": [
            ("Banter", "d10"), ("Cool Under Pressure", "d8"),
            ("Creativity", "d8"), ("Ranged Combat", "d10"),
        ],
        "statusDie": {"green": "d8", "yellow": "d8", "red": "d8"},
    },
    321: {
        "powers": [
            ("Awareness", "d8"), ("Postcognition", "d8"), ("Power Arm", "d10"),
            ("Robot Horse", "d6"), ("Time Revolver", "d8"),
        ],
        "qualities": [
            ("History", "d10"), ("Ranged Combat", "d8"),
            ("Self-Discipline", "d10"), ("Time-Lost Sheriff", "d8"),
        ],
        "statusDie": {"green": "d8", "yellow": "d8", "red": "d8"},
    },
    327: {
        "powers": [
            ("Agility", "d8"), ("Awareness", "d6"), ("Intuition", "d8"),
            ("Momentum", "d10"), ("Speed", "d6"),
        ],
        "qualities": [
            ("Acrobatics", "d8"), ("Banter", "d6"),
            ("Criminal Underworld Info", "d6"), ("Hustlin’", "d8"),
            ("Persuasion", "d10"),
        ],
        "statusDie": {"green": "d6", "yellow": "d8", "red": "d10"},
    },
    331: {
        "powers": [
            ("Stone", "d12"), ("Strength", "d8"),
            ("Transmutation", "d6"), ("Vitality", "d8"),
        ],
        "qualities": [
            ("Close Combat", "d8"), ("Creativity", "d10"),
            ("Hard Rock Lifestyle", "d8"), ("Leadership", "d6"),
        ],
        "statusDie": {"green": "d10", "yellow": "d8", "red": "d6"},
    },
    335: {
        "powers": [
            ("Illusions", "d8"), ("Intuition", "d8"), ("Invisibility", "d6"),
            ("Suggestion", "d10"), ("Telekinesis", "d8"), ("Telepathy", "d10"),
        ],
        "qualities": [
            ("Awakened Mind", "d8"), ("Conviction", "d8"),
            ("Creativity", "d8"), ("Insight", "d10"),
        ],
        "statusDie": {"green": "d6", "yellow": "d6", "red": "d12"},
    },
    339: {
        "powers": [
            ("Absorption", "d8"), ("Cosmic", "d10"), ("Density Control", "d8"),
            ("Flight", "d10"), ("Infernal", "d8"), ("Teleportation", "d8"),
        ],
        "qualities": [
            ("Alertness", "d10"), ("Cosmic Progeny", "d8"), ("Ranged Combat", "d8"),
        ],
        "statusDie": {"green": "d6", "yellow": "d6", "red": "d12"},
    },
    343: {
        "powers": [
            ("Awareness", "d10"), ("Electricity (Ghost)", "d8"),
            ("Intangibility", "d10"), ("Part Detachment (Electronic)", "d6"),
            ("Power Suit (Electronic)", "d8"), ("Remote Viewing (Ghost)", "d8"),
        ],
        "qualities": [
            ("Anima", "d8"), ("Finesse (Electronic)", "d8"),
            ("Stealth (Ghost)", "d10"), ("Technology", "d10"),
        ],
        "statusDie": {"green": "d10", "yellow": "d8", "red": "d6"},
    },
}

HERO_TEAMS = [
    {
        "key": "sentinels-of-freedom",
        "label": "Sentinels of Freedom",
        "heroes": [
            {"attr": 294, "ability": 295, "bio": 296},
            {"attr": 300, "ability": 301, "bio": 302},
            {"attr": 304, "ability": 305, "bio": 306},
            {"attr": 308, "ability": 309, "bio": 310},
            {"attr": 312, "ability": 313, "bio": 314},
            {"attr": 316, "ability": 317, "bio": 318},
            {"attr": 320, "ability": 321, "bio": 322},
        ],
    },
    {
        "key": "daybreak",
        "label": "Daybreak",
        "heroes": [
            {"attr": 326, "ability": 327, "bio": 328},
            {"attr": 330, "ability": 331, "bio": 332},
            {"attr": 334, "ability": 335, "bio": 336},
            {"attr": 338, "ability": 339, "bio": 340},
            {"attr": 342, "ability": 343, "bio": 344},
        ],
    },
]

VILLAIN_ENTRIES = [
    # Independent
    {"team": "independent", "teamLabel": "Independent", "sheet": 348, "bio": 349, "name": "Baron Blade"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 350, "bio": 351, "name": "Miss Information"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 352, "bio": 353, "name": "Fright Train"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 354, "bio": 355, "name": "Ermine"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 356, "bio": 357, "name": "Biomancer"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 358, "bio": 359, "name": "Myriad"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 360, "bio": 361, "name": "Dragonclaw"},
    {"team": "independent", "teamLabel": "Independent", "sheet": 362, "bio": 363, "name": "xxtz’Hulissh"},
    # Helfyre
    {"team": "helfyre", "teamLabel": "Helfyre", "sheet": 366, "bio": 367, "name": "Screech"},
    {"team": "helfyre", "teamLabel": "Helfyre", "sheet": 368, "bio": 369, "name": "Blister"},
    {"team": "helfyre", "teamLabel": "Helfyre", "sheet": 370, "bio": 371, "name": "Deeproot"},
    {"team": "helfyre", "teamLabel": "Helfyre", "sheet": 372, "bio": 373, "name": "Snare"},
    {"team": "helfyre", "teamLabel": "Helfyre", "sheet": 374, "bio": 375, "name": "Drudge"},
    # Perestroika
    {"team": "perestroika", "teamLabel": "Perestroika", "sheet": 378, "bio": 379, "name": "Mecha-Stalin 1"},
    {"team": "perestroika", "teamLabel": "Perestroika", "sheet": 380, "bio": 381, "name": "Mecha-Stalin 2"},
    {"team": "perestroika", "teamLabel": "Perestroika", "sheet": 382, "bio": 383, "name": "Proletariat"},
    {"team": "perestroika", "teamLabel": "Perestroika", "sheet": 384, "bio": 385, "name": "Iron Curtain"},
    {"team": "perestroika", "teamLabel": "Perestroika", "sheet": 386, "bio": 387, "name": "Marsman"},
    # Slaughterhouse Six
    {"team": "slaughterhouse-six", "teamLabel": "Slaughterhouse Six", "sheet": 390, "bio": 391, "name": "Glamour"},
    {"team": "slaughterhouse-six", "teamLabel": "Slaughterhouse Six", "sheet": 392, "bio": 393, "name": "Desert Eagle"},
    {"team": "slaughterhouse-six", "teamLabel": "Slaughterhouse Six", "sheet": 394, "bio": 395, "name": "Re-Volt"},
    {"team": "slaughterhouse-six", "teamLabel": "Slaughterhouse Six", "sheet": 396, "bio": 397, "name": "Hippo"},
    {"team": "slaughterhouse-six", "teamLabel": "Slaughterhouse Six", "sheet": 398, "bio": 399, "name": "Kismet"},
    {"team": "slaughterhouse-six", "teamLabel": "Slaughterhouse Six", "sheet": 400, "bio": 401, "name": "Ray Manta"},
]


def extract_villain_sheet(doc: pymupdf.Document, book: int, name: str) -> dict:
    page = book_page(doc, book)
    text = page_text(page)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    alias = approach = archetype = ""
    health = 0
    # Prefer lines after Abilities header when present
    try:
        i = lines.index("Abilities")
        chunk = lines[i + 1 :]
    except ValueError:
        chunk = lines
    # alias / approach / archetype are early non-chrome tokens after Abilities
    # Prefer structured Alias/Approach/Archetype from spans when present
    approaches = {
        "Mastermind", "Overpowered", "Disruptive", "Skilled", "Creator", "Ninja",
        "Ancient", "Focused", "Generalist", "Dampening", "Leech", "Adaptive",
        "Tactician", "Prideful", "Specialized", "Relentless", "Bully", "Underpowered",
    }
    archetypes = {
        "Inventor", "Inhibitor", "Bruiser", "Formidable", "Legion", "Overlord",
        "Guerrilla", "Guerilla", "Titan", "Fragile", "Indomitable", "Loner",
        "Squad", "Predator",
    }
    identity = []
    for ln in chunk:
        if ln in CHROME or ln in {"U", "M", "Health", "Current Health", "Status:", "Powers", "Qualities"}:
            continue
        if re.fullmatch(r"\d+", ln):
            if not health and int(ln) >= 20:
                health = int(ln)
            continue
        if re.match(r"^\d", ln):
            continue
        if ln.endswith(".") or len(ln) >= 60:
            break
        if len(identity) < 3:
            identity.append(ln)
            continue
        break
    if len(identity) >= 3 and identity[1] in approaches:
        alias, approach, archetype = identity[0], identity[1], identity[2]
    elif len(identity) >= 3 and identity[2] in archetypes:
        alias, approach, archetype = identity[0], identity[1], identity[2]
    else:
        # Mecha-Stalin 1 and similar sheets put an ability title before identity
        alias = next((x for x in identity if x not in approaches and x not in archetypes), "")
        approach = next((x for x in identity if x in approaches), "")
        archetype = next((x for x in identity if x in archetypes), "")
        if book == 378:
            alias = "Joseph Stalin?"
            approach = "Adaptive"
            archetype = "Squad"

    # powers / qualities: collect short name-like lines before long ability texts
    powers, qualities, abilities = [], [], []
    # Fall back: use ability name lines from bold-ish short titles in text after health block
    # Extract ability blocks: Title lines followed by game text
    # Heuristic from sheet text: ability titles are Title Case short lines before long sentences
    body = "\n".join(chunk)
    # Pull power/quality candidate names from known lists via spans
    spans = page_spans(page)
    pq_names = []
    for span in spans:
        if 90 < span["y"] < 260 and "GillSans" in span["font"] and span["size"] >= 9:
            if span["t"] not in CHROME and not re.search(r"[:]", span["t"]):
                pq_names.append((span["x"], span["y"], span["t"]))
    pq_names.sort(key=lambda x: (round(x[1], 1), x[0]))
    for x, _y, t in pq_names:
        if x < 220:
            powers.append({"name": t, "dieType": "d8", "dieTypeKnown": False})
        else:
            qualities.append({"name": t, "dieType": "d8", "dieTypeKnown": False})

    # Abilities: use spans similar to heroes but villains often lack zone headers
    name_spans = [
        s
        for s in spans
        if s["y"] > 250
        and "GillSans" in s["font"]
        and "Light" not in s["font"]
        and s["size"] >= 9
        and s["t"] not in CHROME
        and not re.fullmatch(r"[AIRUM]", s["t"])
    ]
    type_spans = [s for s in spans if s["y"] > 250 and s["t"] in {"A", "I", "R"}]
    text_spans = [
        s
        for s in spans
        if s["y"] > 250 and "Light" in s["font"] and s["x"] > 200 and s["t"] not in {"A", "I", "R"}
    ]
    for ns in sorted(name_spans, key=lambda s: (round(s["y"], 1), s["x"])):
        typ = next((t["t"] for t in type_spans if abs(t["y"] - ns["y"]) < 10), "A")
        next_y = min((n["y"] for n in name_spans if n["y"] > ns["y"] + 2), default=ns["y"] + 60)
        lines_txt = [t["t"] for t in text_spans if ns["y"] - 2 <= t["y"] < next_y - 2]
        game_text = re.sub(r"\s+", " ", " ".join(lines_txt)).strip()
        abilities.append(
            {
                "name": ns["t"],
                "type": typ,
                "aux": "main",
                "gameText": game_text,
                "icon": infer_icons(game_text),
            }
        )

    # Health fallback from text
    if not health:
        m = re.search(r"\b([3-9]\d)\b", text)
        if m:
            health = int(m.group(1))

    return {
        "name": name,
        "alias": alias,
        "approach": approach,
        "archetype": archetype,
        "health": health,
        "powers": powers,
        "qualities": qualities,
        "abilities": abilities,
        "sourcePage": book,
        "gaps": [
            "Villain power/quality die sizes are image glyphs; defaulted to d8 until visually verified.",
            "Villain status dice (conditional) are not fully modeled beyond health max.",
        ],
    }


def extract_heroes(doc: pymupdf.Document) -> dict:
    teams = []
    gaps = []
    for team in HERO_TEAMS:
        members = []
        for pages in team["heroes"]:
            attr_spans = page_spans(book_page(doc, pages["attr"]))
            ability_spans = page_spans(book_page(doc, pages["ability"]))
            bio_text = page_text(book_page(doc, pages["bio"]))
            attr = parse_hero_attr_page(attr_spans)
            abilities = parse_abilities(ability_spans)
            health = parse_health_ranges(ability_spans)
            dice = HERO_DICE.get(pages["ability"], {})
            powers = [
                {"name": n, "dieType": d, "dieTypeKnown": True}
                for n, d in dice.get("powers", [])
            ]
            qualities = [
                {"name": n, "dieType": d, "dieTypeKnown": True}
                for n, d in dice.get("qualities", [])
            ]
            if not powers:
                pnames, qnames = parse_power_quality_names(ability_spans)
                powers = [{"name": n, "dieType": "d8", "dieTypeKnown": False} for n in pnames]
                qualities = [{"name": n, "dieType": "d8", "dieTypeKnown": False} for n in qnames]
                gaps.append(f"{attr.get('name', pages['ability'])}: power/quality dice unverified")
            # principle text lives on attr page after principle names; keep names on actor
            principles = []
            for pname in attr.get("principles", []):
                principles.append(
                    {
                        "name": pname,
                        "roleplaying": "",
                        "minorTwist": "",
                        "majorTwist": "",
                    }
                )
            # out ability text
            out = next((a["gameText"] for a in abilities if a["aux"] == "out"), "")
            members.append(
                {
                    "name": attr.get("name", f"Hero {pages['attr']}"),
                    "alias": attr.get("alias", ""),
                    "gender": attr.get("gender", ""),
                    "age": attr.get("age", ""),
                    "height": attr.get("height", ""),
                    "eyes": attr.get("eyes", ""),
                    "hair": attr.get("hair", ""),
                    "skin": attr.get("skin", ""),
                    "build": attr.get("build", ""),
                    "costume": attr.get("costume", ""),
                    "background": attr.get("background", ""),
                    "powerSource": attr.get("powerSource", ""),
                    "archetype": attr.get("archetype", ""),
                    "personality": attr.get("personality", ""),
                    "principles": principles,
                    "powers": powers,
                    "qualities": qualities,
                    "abilities": [a for a in abilities if a["aux"] != "out"],
                    "out": out,
                    "statusDie": dice.get(
                        "statusDie",
                        {"green": "d8", "yellow": "d8", "red": "d8"},
                    ),
                    "health": health
                    or {
                        "greenLow": 0,
                        "yellowHigh": 0,
                        "yellowLow": 0,
                        "redHigh": 0,
                        "redLow": 1,
                        "max": 0,
                    },
                    "biographyHtml": paragraphs(bio_text),
                    "sourcePages": pages,
                }
            )
        teams.append({"key": team["key"], "label": team["label"], "members": members})
    return {"teams": teams, "gaps": gaps}


def extract_villains(doc: pymupdf.Document) -> dict:
    teams: dict[str, dict] = {}
    for entry in VILLAIN_ENTRIES:
        team = teams.setdefault(
            entry["team"],
            {"key": entry["team"], "label": entry["teamLabel"], "members": []},
        )
        sheet = extract_villain_sheet(doc, entry["sheet"], entry["name"])
        bio = paragraphs(page_text(book_page(doc, entry["bio"])))
        sheet["biographyHtml"] = bio
        team["members"].append(sheet)
    return {"teams": list(teams.values())}


def extract_minions(doc: pymupdf.Document) -> dict:
    """Parse minion/lieutenant entries from book pages 404–417 into team folders."""
    teams: dict[str, dict] = {}
    current_team = {"key": "general", "label": "General", "members": []}
    teams["general"] = current_team

    # Known team header pages / names from chapter layout (size-30 titles)
    team_headers = {
        404: ("aliens", "Aliens"),
        406: ("blade-battalion", "Blade Battalion"),
        408: ("blade-drones", "Blade Drones"),
        409: ("devices", "Devices"),
        411: ("magmarian-foes", "Magmarian Foes"),
        413: ("thematic-enemies", "Thematic Enemies"),
        414: ("typical-combatants", "Typical Combatants"),
    }

    # Collect entries by scanning for duplicated Name lines + Minion/Lieutenant tags
    for book in range(404, 418):
        if book in team_headers:
            key, label = team_headers[book]
            current_team = teams.setdefault(key, {"key": key, "label": label, "members": []})
        text = page_text(book_page(doc, book))
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        # Find patterns: Name repeated twice, then Minion or Lieutenant nearby
        i = 0
        while i < len(lines) - 1:
            a, b = lines[i], lines[i + 1]
            if (
                a == b
                and a not in CHROME
                and len(a) < 60
                and not a.endswith(":")
                and not a.startswith("Whenever")
                and a not in {"Minion", "Lieutenant"}
            ):
                # look ahead for type
                kind = None
                for j in range(i, min(i + 8, len(lines))):
                    if lines[j] in {"Minion", "Lieutenant"}:
                        kind = lines[j].lower()
                        break
                # also check previous lines
                if not kind:
                    for j in range(max(0, i - 4), i):
                        if lines[j] in {"Minion", "Lieutenant"}:
                            kind = lines[j].lower()
                            break
                if kind and not re.fullmatch(r"\d{3}", a):
                    # description: following prose until Ability
                    desc_parts = []
                    abilities = []
                    k = i + 2
                    while k < len(lines) and lines[k] not in {"Ability", "Ability OPTIONS", "Tactics"}:
                        if lines[k] in {"Minion", "Lieutenant", a}:
                            k += 1
                            continue
                        if lines[k] in CHROME or re.fullmatch(r"\d{3}", lines[k]):
                            k += 1
                            continue
                        desc_parts.append(lines[k])
                        k += 1
                    # abilities: lines like "Name: text"
                    while k < len(lines):
                        if lines[k] in {"Tactics", "Description"}:
                            break
                        if lines[k] == "Ability":
                            k += 1
                            continue
                        if ":" in lines[k]:
                            title, _, body = lines[k].partition(":")
                            if len(title) > 60:
                                k += 1
                                continue
                            body_parts = [body.strip()]
                            k += 1
                            while k < len(lines) and ":" not in lines[k] and lines[k] not in {
                                "Tactics",
                                "Description",
                                "Ability",
                                "Minion",
                                "Lieutenant",
                            }:
                                if lines[k] not in CHROME and not re.fullmatch(r"\d{3}", lines[k]):
                                    body_parts.append(lines[k])
                                k += 1
                            abilities.append(
                                {
                                    "name": title.strip(),
                                    "description": re.sub(r"\s+", " ", " ".join(body_parts)).strip(),
                                }
                            )
                            continue
                        k += 1
                    member = {
                        "name": a,
                        "kind": kind,
                        "team": current_team["key"],
                        "description": re.sub(r"\s+", " ", " ".join(desc_parts)).strip(),
                        "abilities": abilities,
                        "typicalDie": "d8",
                        "dieTypeKnown": False,
                        "sourcePage": book,
                    }
                    # dedupe by name within team
                    if not any(m["name"] == a for m in current_team["members"]):
                        current_team["members"].append(member)
                    i += 2
                    continue
            i += 1

    # Drop empty general if unused
    teams_list = [t for t in teams.values() if t["members"]]
    return {
        "teams": teams_list,
        "gaps": [
            "Minion/lieutenant die sizes are often icon-only in the PDF; defaulted to d8.",
            "Some multi-entry pages may miss alternate names if text extraction collapsed labels.",
        ],
    }


def extract_environments(doc: pymupdf.Document) -> dict:
    envs = [
        {"name": "Megalopolis", "intro": 420, "twists": 421},
        {"name": "Freedom Plaza", "intro": 422, "twists": 423},
        {"name": "Wagner II Mars Base", "intro": 424, "twists": 425},
        {"name": "Magmaria", "intro": 426, "twists": 427},
        {"name": "Mordengrad", "intro": 428, "twists": 429},
        {"name": "Ruins of Atlantis", "intro": 430, "twists": 431},
    ]
    out = []
    for env in envs:
        intro = page_text(book_page(doc, env["intro"]))
        twists_text = page_text(book_page(doc, env["twists"]))
        twists = []
        # Parse twist titles as "Name: text"
        current_zone = "green"
        current_major = False
        for raw in twists_text.splitlines():
            line = raw.strip()
            if not line or line in CHROME or re.fullmatch(r"\d{3}", line):
                continue
            if line in {"Green", "Yellow", "Red"}:
                current_zone = line.lower()
                continue
            if line == "Minor Twists":
                current_major = False
                continue
            if line == "Major Twist":
                current_major = True
                continue
            if ":" in line and not line.startswith("http"):
                title, _, body = line.partition(":")
                if len(title) < 60:
                    twists.append(
                        {
                            "name": title.strip(),
                            "type": f"{current_zone}{'major' if current_major else 'minor'}",
                            "description": body.strip(),
                        }
                    )
        out.append(
            {
                "name": env["name"],
                "descriptionHtml": paragraphs(intro),
                "twists": twists,
                "dice": {"firstDie": "d10", "secondDie": "d8", "thirdDie": "d6"},
                "sourcePages": {"intro": env["intro"], "twists": env["twists"]},
                "gaps": [
                    "Environment dice pool defaults to d10/d8/d6 when not printed as text.",
                ],
            }
        )
    return {"environments": out}


def main() -> int:
    if not PDF.exists():
        print(f"PDF not found: {PDF}", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(PDF)
    heroes = extract_heroes(doc)
    villains = extract_villains(doc)
    minions = extract_minions(doc)
    environments = extract_environments(doc)

    (OUT / "heroes.json").write_text(json.dumps(heroes, indent=2, ensure_ascii=False) + "\n")
    (OUT / "villains.json").write_text(json.dumps(villains, indent=2, ensure_ascii=False) + "\n")
    (OUT / "minions.json").write_text(json.dumps(minions, indent=2, ensure_ascii=False) + "\n")
    (OUT / "environments.json").write_text(
        json.dumps(environments, indent=2, ensure_ascii=False) + "\n"
    )

    hero_count = sum(len(t["members"]) for t in heroes["teams"])
    villain_count = sum(len(t["members"]) for t in villains["teams"])
    minion_count = sum(len(t["members"]) for t in minions["teams"])
    env_count = len(environments["environments"])
    print(
        f"Extracted heroes={hero_count} teams={len(heroes['teams'])}; "
        f"villains={villain_count} teams={len(villains['teams'])}; "
        f"minions={minion_count} teams={len(minions['teams'])}; "
        f"environments={env_count}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
