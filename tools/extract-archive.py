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
VILLAIN_DICE_PATH = OUT / "villain-dice.json"
MINION_DICE_PATH = OUT / "minion-dice.json"
ENVIRONMENT_DICE_PATH = OUT / "environment-dice.json"
CHECKBOX_CHAR = "\uf06f"


def load_villain_dice() -> dict:
    """Curated die sizes read from Archive sheet die glyphs (by book page)."""
    if not VILLAIN_DICE_PATH.exists():
        return {}
    try:
        return json.loads(VILLAIN_DICE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def apply_villain_dice(
    entries: list[dict], curated: dict[str, str] | None
) -> tuple[list[dict], list[str]]:
    """Apply curated dieType map; return updated entries and unmatched names."""
    if not curated:
        return entries, [e["name"] for e in entries]
    unmatched: list[str] = []
    updated: list[dict] = []
    for entry in entries:
        name = entry["name"]
        die = curated.get(name)
        if not die:
            unmatched.append(name)
            updated.append({**entry, "dieType": entry.get("dieType", "d8"), "dieTypeKnown": False})
            continue
        updated.append({**entry, "dieType": die, "dieTypeKnown": True})
    return updated, unmatched


def load_minion_dice() -> dict:
    """Curated typicalDie sizes from Archive minion/lieutenant die glyphs."""
    if not MINION_DICE_PATH.exists():
        return {}
    try:
        return json.loads(MINION_DICE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def apply_minion_die(member: dict, curated_by_page: dict) -> dict:
    """Set typicalDie from curated page map; leave gap if missing."""
    page_map = curated_by_page.get(str(member.get("sourcePage")), {}) or {}
    die = page_map.get(member["name"])
    gaps = list(member.get("gaps") or [])
    if not die:
        gaps.append(f"Die glyph missing from minion-dice.json for {member['name']}.")
        return {
            **member,
            "typicalDie": member.get("typicalDie", "d8"),
            "dieTypeKnown": False,
            "gaps": gaps,
        }
    return {**member, "typicalDie": die, "dieTypeKnown": True, "gaps": gaps}


def load_environment_dice() -> dict:
    """Curated environment trait names + die glyphs (by environment name)."""
    if not ENVIRONMENT_DICE_PATH.exists():
        return {}
    try:
        return json.loads(ENVIRONMENT_DICE_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def environment_dice_fields(env_name: str, curated: dict) -> tuple[dict, list[str], list[str]]:
    """Return dice dict, die name list, and gaps for one environment."""
    traits = curated.get(env_name) or []
    gaps: list[str] = []
    if len(traits) != 3:
        gaps.append(
            f"Environment dice missing/incomplete in environment-dice.json for {env_name}."
        )
        return (
            {"firstDie": "d10", "secondDie": "d8", "thirdDie": "d6"},
            ["Environment", "Environment", "Environment"],
            gaps,
        )
    keys = ("firstDie", "secondDie", "thirdDie")
    dice = {keys[i]: traits[i]["die"] for i in range(3)}
    names = [traits[i]["name"] for i in range(3)]
    return dice, names, gaps


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


def ability_zone_bands(page: pymupdf.Page) -> dict[str, tuple[float, float]]:
    """Detect Green/Yellow/Red/Out ability bands from colored sheet rectangles.

    Zone sidebar labels are vertically centered in each band, so label Y alone
    mis-assigns the first ability of Yellow/Red. Prefer filled band geometry.
    """
    best: dict[str, tuple[float, float, float]] = {}
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        rect = drawing.get("rect")
        if not fill or not rect:
            continue
        if rect.width < 400 or rect.height < 12:
            continue
        r, g, b = fill[0], fill[1], fill[2]
        if g > 0.7 and r < 0.85 and b < 0.8 and g > r and g > b:
            color = "green"
        elif r > 0.9 and g > 0.85 and b < 0.85:
            color = "yellow"
        elif r > 0.85 and g < 0.85 and b < 0.8:
            color = "red"
        elif abs(r - g) < 0.05 and abs(g - b) < 0.05 and 0.7 < r < 0.95:
            color = "out"
        else:
            continue
        height = rect.y1 - rect.y0
        if color not in best or height > best[color][2]:
            best[color] = (rect.y0, rect.y1, height)
    return {color: (y0, y1) for color, (y0, y1, _h) in best.items()}


def classify_ability_zone(y: float, bands: dict[str, tuple[float, float]]) -> str:
    for color in ("green", "yellow", "red", "out"):
        if color not in bands:
            continue
        y0, y1 = bands[color]
        if y0 - 2 <= y <= y1 + 2:
            return color
    if not bands:
        return "green"
    return min(bands, key=lambda c: abs(((bands[c][0] + bands[c][1]) / 2) - y))


def cluster_ability_names(name_spans: list[dict], max_gap: float = 18.0) -> list[dict]:
    """Merge multi-line ability titles and expose a Y anchor for game-text matching.

    Sheet titles are often vertically centered in their game-text cell; long names
    may also wrap onto a second bold line. Clustering nearby name fragments keeps
    both the full title and a stable midpoint for nearest-Y text assignment.
    """
    ordered = sorted(name_spans, key=lambda s: (round(s["y"], 1), s["x"]))
    clusters: list[list[dict]] = []
    for span in ordered:
        if clusters and span["y"] - clusters[-1][-1]["y"] < max_gap:
            clusters[-1].append(span)
        else:
            clusters.append([span])
    anchors: list[dict] = []
    for parts in clusters:
        anchors.append(
            {
                "name": " ".join(part["t"] for part in parts),
                "y": sum(part["y"] for part in parts) / len(parts),
                "x": min(part["x"] for part in parts),
                "parts": parts,
            }
        )
    return anchors


def assign_game_text_by_nearest_name(
    text_spans: list[dict], anchors: list[dict]
) -> dict[int, list[dict]]:
    """Assign each GAME TEXT span to the nearest ability-name anchor by Y."""
    buckets: dict[int, list[dict]] = {i: [] for i in range(len(anchors))}
    if not anchors:
        return buckets
    for span in text_spans:
        index = min(range(len(anchors)), key=lambda i: abs(anchors[i]["y"] - span["y"]))
        buckets[index].append(span)
    return buckets


def parse_abilities(spans: list[dict], page: pymupdf.Page | None = None) -> list[dict]:
    bands = ability_zone_bands(page) if page is not None else {}
    # Label fallback only when band fills are unavailable; labels sit mid-band,
    # so use midpoints between consecutive zone markers.
    label_y = {
        "yellow": next((s["y"] for s in spans if s["t"] == "YELLOW ZONE"), None),
        "red": next((s["y"] for s in spans if s["t"] == "RED ZONE"), None),
        "out": next((s["y"] for s in spans if s["t"] == "OUT"), None),
        "green": next((s["y"] for s in spans if s["t"] == "GREEN ZONE"), None),
    }
    if not bands and label_y["yellow"] is not None and label_y["red"] is not None:
        green_mid = label_y["green"] if label_y["green"] is not None else 300
        yellow_start = (green_mid + label_y["yellow"]) / 2
        red_start = (label_y["yellow"] + label_y["red"]) / 2
        out_start = (
            (label_y["red"] + label_y["out"]) / 2
            if label_y["out"] is not None
            else label_y["red"] + 40
        )
        bands = {
            "green": (0, yellow_start),
            "yellow": (yellow_start, red_start),
            "red": (red_start, out_start),
            "out": (out_start, 10_000),
        }

    out_y = bands.get("out", (10_000, 10_000))[0]
    if label_y["out"] is not None:
        out_y = min(out_y, label_y["out"])

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
    # Ability titles are vertically centered in multi-line game-text cells, so
    # the first line often sits above the name Y. Assign each GAME TEXT span to
    # the nearest ability-name anchor by Y instead of clipping at name.y.
    text_spans = [
        s
        for s in spans
        if s["y"] > 250
        and "Light" in s["font"]
        and s["x"] > 225
        and s["t"] not in {"A", "I", "R"}
        and not re.fullmatch(r"\d+", s["t"])
        and s["y"] < out_y - 2
    ]

    anchors = cluster_ability_names(names)
    buckets = assign_game_text_by_nearest_name(text_spans, anchors)

    abilities = []
    for index, anchor in enumerate(anchors):
        typ = next(
            (
                t["t"]
                for t in types
                if abs(t["y"] - anchor["y"]) < 12 and t["x"] > anchor["x"]
            ),
            "A",
        )
        lines = sorted(buckets[index], key=lambda s: (s["y"], s["x"]))
        game_text = re.sub(r"\s+", " ", " ".join(t["t"] for t in lines)).strip()
        aux = classify_ability_zone(anchor["y"], bands) if bands else "green"
        abilities.append(
            {
                "name": anchor["name"],
                "type": typ,
                "aux": aux,
                "gameText": game_text,
                "icon": infer_icons(game_text),
            }
        )
    # Out ability often has no bold name — capture orphan text below OUT.
    # OUT game text is left-aligned (~x=45), unlike the main GAME TEXT column.
    out_lines = [
        t["t"]
        for t in sorted(spans, key=lambda s: (s["y"], s["x"]))
        if t["y"] >= out_y - 2
        and "Light" in t["font"]
        and "GillSans" in t["font"]
        and t["t"] not in CHROME
        and t["t"] not in {"A", "I", "R"}
        and not re.fullmatch(r"\d+", t["t"])
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


def parse_principle_details(spans: list[dict]) -> list[dict]:
    """Import During Roleplaying / Minor Twist / Major Twist for each principle column."""
    titles = sorted(
        [s for s in spans if s["t"].startswith("Principle of")],
        key=lambda s: (s["x"], s["y"]),
    )
    # Prefer the large italic title spans when duplicates exist
    deduped: list[dict] = []
    for title in titles:
        if any(abs(title["x"] - t["x"]) < 40 and abs(title["y"] - t["y"]) < 20 for t in deduped):
            continue
        deduped.append(title)
    titles = deduped[:2]
    if not titles:
        return []

    mid_x = (titles[0]["x"] + titles[1]["x"]) / 2 if len(titles) == 2 else titles[0]["x"] + 200
    section_labels = {
        "DURING ROLEPLAYING": "roleplaying",
        "MINOR TWIST": "minorTwist",
        "MAJOR TWIST": "majorTwist",
    }
    footer_y = next(
        (
            s["y"]
            for s in spans
            if s["t"] in {"Back Issues", "Collections", "Hero Points", "This Issue:"}
        ),
        580,
    )

    principles: list[dict] = []
    for index, title in enumerate(titles):
        col_min = -1 if index == 0 else mid_x
        col_max = mid_x if index == 0 else 10_000
        headers: dict[str, float] = {}
        for span in spans:
            field = section_labels.get(span["t"])
            if not field:
                continue
            if not (col_min <= span["x"] < col_max):
                continue
            headers[field] = span["y"]

        def body_for(field: str) -> str:
            start = headers.get(field)
            if start is None:
                return ""
            ends = [y for key, y in headers.items() if y > start]
            ends.append(footer_y)
            end = min(ends)
            lines = [
                s["t"]
                for s in sorted(spans, key=lambda s: (s["y"], s["x"]))
                if "Light" in s["font"]
                and col_min <= s["x"] < col_max
                and start + 2 < s["y"] < end - 2
                and s["t"] not in section_labels
            ]
            return re.sub(r"\s+", " ", " ".join(lines)).strip()

        principles.append(
            {
                "name": title["t"],
                "roleplaying": body_for("roleplaying"),
                "minorTwist": body_for("minorTwist"),
                "majorTwist": body_for("majorTwist"),
            }
        )
    return principles


def parse_collections(spans: list[dict]) -> list[str]:
    """Collections checklist titles from the page-1 Collections box."""
    header = next((s for s in spans if s["t"] == "Collections"), None)
    if not header:
        return []
    items: list[str] = []
    for span in sorted(spans, key=lambda s: (s["y"], s["x"])):
        if span["y"] <= header["y"] + 2:
            continue
        if span["y"] > header["y"] + 130:
            break
        if span["x"] < header["x"] - 20:
            continue
        if "Light" not in span["font"]:
            continue
        if span["t"] in CHROME or re.fullmatch(r"\d+", span["t"]):
            continue
        if span["size"] < 8:
            continue
        items.append(span["t"])
    # Preserve order, drop duplicates
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        out.append(item)
    return out[:6]


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
        "key": "independent",
        "label": "Independent",
        "heroes": [
            # Heritage and Time-Slinger are Archive independents (not SoF).
            {"attr": 294, "ability": 295, "bio": 296},
            {"attr": 320, "ability": 321, "bio": 322},
        ],
    },
    {
        "key": "sentinels-of-freedom",
        "label": "Sentinels of Freedom",
        "heroes": [
            {"attr": 300, "ability": 301, "bio": 302},
            {"attr": 304, "ability": 305, "bio": 306},
            {"attr": 308, "ability": 309, "bio": 310},
            {"attr": 312, "ability": 313, "bio": 314},
            {"attr": 316, "ability": 317, "bio": 318},
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


def parse_villain_powers_qualities_status(
    spans: list[dict], abilities_y: float
) -> tuple[list[dict], list[dict], list[dict], str]:
    """Split villain sheet columns by X: Powers | Qualities | Status.

    Archive villain sheets place:
      Powers   ~x 47–60
      Qualities ~x 199–210
      Status   ~x 350+
    A previous split at x<220 folded Qualities into Powers and Status into Qualities.
    """
    powers: list[dict] = []
    qualities: list[dict] = []
    statuses: list[dict] = []
    status_theme = ""

    header_y = next(
        (s["y"] for s in spans if s["t"] in {"Powers", "Qualities", "Status:"}),
        205.0,
    )
    # Status category labels sit on the same row as Powers/Qualities/Status headers.
    # Light name rows begin a little below that header band.
    y_min = header_y + 8
    y_max = abilities_y - 8
    theme_y_min = header_y - 4
    theme_y_max = header_y + 14

    for span in sorted(spans, key=lambda s: (s["y"], s["x"])):
        if "GillSans" not in span["font"] or span["size"] < 10:
            continue
        text = span["t"]
        if text in CHROME or text in {"Status:", "Powers", "Qualities"}:
            continue
        if re.fullmatch(r"\d+", text):
            continue

        # Non-Light GillSans in the Status column is the status category label
        # (e.g. "Heroes with Penalties", "Inventions (Mods)", "Health").
        if (
            "Light" not in span["font"]
            and span["x"] >= 320
            and theme_y_min <= span["y"] <= theme_y_max
            and not status_theme
        ):
            status_theme = text
            continue

        if span["y"] < y_min or span["y"] > y_max:
            continue
        if "Light" not in span["font"]:
            continue
        # Power/quality names never contain ":", but status tracks often do
        # ("Green Zone: 65-45"). Only reject colon labels outside Status.
        if ":" in text and span["x"] < 320:
            continue

        entry = {"name": text, "dieType": "d8", "dieTypeKnown": False}
        if span["x"] < 150:
            powers.append(entry)
        elif span["x"] < 320:
            qualities.append(entry)
        else:
            if status_theme:
                entry = {**entry, "category": status_theme}
            statuses.append(entry)

    return powers, qualities, statuses, status_theme


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

    spans = page_spans(page)
    # Abilities start below the Abilities header; power/quality Light labels sit
    # lower on villain sheets than on heroes, so y>250 alone is too loose.
    abilities_y = next((s["y"] for s in spans if s["t"] == "Abilities"), 370.0)
    powers, qualities, statuses, status_theme = parse_villain_powers_qualities_status(
        spans, abilities_y
    )

    abilities: list[dict] = []
    name_spans = [
        s
        for s in spans
        if s["y"] > abilities_y
        and "GillSans" in s["font"]
        and "Light" not in s["font"]
        and s["size"] >= 9
        and s["t"] not in CHROME
        and not re.fullmatch(r"[AIRUM]", s["t"])
    ]
    type_spans = [
        s for s in spans if s["y"] > abilities_y and s["t"] in {"A", "I", "R"}
    ]
    text_spans = [
        s
        for s in spans
        if s["y"] > abilities_y
        and "Light" in s["font"]
        and s["x"] > 200
        and s["t"] not in {"A", "I", "R"}
    ]
    anchors = cluster_ability_names(name_spans)
    buckets = assign_game_text_by_nearest_name(text_spans, anchors)
    for index, anchor in enumerate(anchors):
        typ = next(
            (t["t"] for t in type_spans if abs(t["y"] - anchor["y"]) < 14),
            "A",
        )
        lines_txt = [
            t["t"] for t in sorted(buckets[index], key=lambda s: (s["y"], s["x"]))
        ]
        game_text = re.sub(r"\s+", " ", " ".join(lines_txt)).strip()
        # Villain sheet abilitiestable filters on system.aux === "villain".
        abilities.append(
            {
                "name": anchor["name"],
                "type": typ,
                "aux": "villain",
                "gameText": game_text,
                "icon": infer_icons(game_text),
            }
        )

    # Health fallback from text
    if not health:
        m = re.search(r"\b([3-9]\d)\b", text)
        if m:
            health = int(m.group(1))

    # Die glyphs are image art; apply curated sizes from villain-dice.json.
    dice = load_villain_dice().get(str(book), {})
    powers, miss_p = apply_villain_dice(powers, dice.get("powers"))
    qualities, miss_q = apply_villain_dice(qualities, dice.get("qualities"))
    statuses, miss_s = apply_villain_dice(statuses, dice.get("statuses"))

    gaps: list[str] = []
    if not dice:
        gaps.append(
            "Villain power/quality/status die sizes missing from villain-dice.json; defaulted to d8."
        )
    for label, missing in (
        ("power", miss_p),
        ("quality", miss_q),
        ("status", miss_s),
    ):
        for item_name in missing:
            gaps.append(f"Unverified {label} die for {item_name}; defaulted to d8.")
    if not statuses:
        gaps.append("No villain status tracks parsed from sheet Status column.")
    if not abilities:
        gaps.append("No villain abilities parsed below Abilities header.")

    result = {
        "name": name,
        "alias": alias,
        "approach": approach,
        "archetype": archetype,
        "health": health,
        "powers": powers,
        "qualities": qualities,
        "statuses": statuses,
        "abilities": abilities,
        "sourcePage": book,
        "gaps": gaps,
    }
    if status_theme:
        result["statusTheme"] = status_theme
    return result


def extract_heroes(doc: pymupdf.Document) -> dict:
    teams = []
    gaps = []
    for team in HERO_TEAMS:
        members = []
        for pages in team["heroes"]:
            attr_page = book_page(doc, pages["attr"])
            ability_page = book_page(doc, pages["ability"])
            attr_spans = page_spans(attr_page)
            ability_spans = page_spans(ability_page)
            bio_text = page_text(book_page(doc, pages["bio"]))
            attr = parse_hero_attr_page(attr_spans)
            abilities = parse_abilities(ability_spans, ability_page)
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
            principles = parse_principle_details(attr_spans)
            if not principles:
                for pname in attr.get("principles", []):
                    principles.append(
                        {
                            "name": pname,
                            "roleplaying": "",
                            "minorTwist": "",
                            "majorTwist": "",
                        }
                    )
                    gaps.append(
                        f"{attr.get('name', pages['attr'])}: principle prose missing for {pname}"
                    )
            collections = parse_collections(attr_spans)
            if not collections:
                gaps.append(f"{attr.get('name', pages['attr'])}: no collections parsed")
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
                    "collections": collections,
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


MINION_TEAM_HEADERS = {
    404: ("aliens", "Aliens"),
    406: ("blade-battalion", "Blade Battalion"),
    408: ("blade-drones", "Blade Drones"),
    409: ("devices", "Devices"),
    411: ("magmarian-foes", "Magmarian Foes"),
    413: ("thematic-enemies", "Thematic Enemies"),
    414: ("typical-combatants", "Typical Combatants"),
}

MINION_COL_SPLIT = 300.0
MINION_NAME_CHROME = CHROME | {
    "Aliens",
    "Blade",
    "Battalion",
    "Devices",
    "Blade Drones",
    "Magmarian Foes",
    "Thematic Enemies",
    "Typical Combatants",
}


def _join_span_text(parts: list[str]) -> str:
    return re.sub(r"\s+", " ", " ".join(p for p in parts if p)).strip()


def _minion_name_column(name_x: float) -> str:
    return "left" if name_x < 320 else "right"


def _minion_section_column(sec_x: float) -> str:
    return "left" if sec_x < 200 else "right"


def _minion_column_x_range(col: str) -> tuple[float, float]:
    if col == "left":
        return (40.0, MINION_COL_SPLIT)
    return (MINION_COL_SPLIT - 5.0, 560.0)


def parse_minion_page(spans: list[dict], book: int) -> list[dict]:
    """Parse Archive minion/lieutenant entries on one page via span geometry.

    PDF text order mixes entries; Description/Ability/Tactics belong to the
    name whose Y-band and column (left/right) own that section header.
    """
    name_cands = [
        s
        for s in spans
        if 19.5 <= s["size"] <= 22.5
        and s["y"] <= 700
        and s["t"] not in MINION_NAME_CHROME
        and not re.fullmatch(r"\d{3}", s["t"])
        and "Minions" not in s["t"]
    ]
    names: list[dict] = []
    for span in sorted(name_cands, key=lambda z: (z["y"], z["x"])):
        if any(abs(span["y"] - n["y"]) < 8 and span["t"] == n["name"] for n in names):
            continue
        roles = [
            r
            for r in spans
            if r["t"] in {"Minion", "Lieutenant"} and span["y"] < r["y"] < span["y"] + 40
        ]
        if not roles:
            continue
        role = min(roles, key=lambda r: (abs(r["x"] - (span["x"] + 40)), r["y"]))
        if abs(role["x"] - span["x"]) > 220 and abs(role["y"] - span["y"]) > 35:
            continue
        names.append(
            {
                "name": span["t"],
                "x": span["x"],
                "y": span["y"],
                "role": role["t"].lower(),
                "col": _minion_name_column(span["x"]),
            }
        )

    sections = [
        s for s in spans if s["t"] in {"Description", "Ability", "Tactics"} and 11 <= s["size"] <= 13
    ]
    desc_headers = [s for s in sections if s["t"] == "Description"]
    ownership: dict[int, dict] = {}
    for desc in desc_headers:
        dcol = _minion_section_column(desc["x"])
        cands = [n for n in names if n["col"] == dcol and n["y"] < desc["y"] - 5]
        if not cands:
            cands = [n for n in names if n["y"] < desc["y"] - 5]
        if not cands:
            continue
        ownership[id(desc)] = min(
            cands, key=lambda n: (desc["y"] - n["y"]) + abs(n["x"] - desc["x"]) * 0.3
        )

    members: list[dict] = []
    for entry in names:
        my_descs = [d for d in desc_headers if ownership.get(id(d)) is entry]
        if not my_descs:
            members.append(
                {
                    "name": entry["name"],
                    "role": entry["role"],
                    "kind": entry["role"],
                    "description": "",
                    "tactics": "",
                    "abilities": [],
                    "typicalDie": "d8",
                    "dieTypeKnown": False,
                    "sourcePage": book,
                    "gaps": ["Missing Description block for this entry."],
                }
            )
            continue

        desc = my_descs[0]
        dcol = _minion_section_column(desc["x"])
        x_min, x_max = _minion_column_x_range(dcol)
        later = [
            d
            for d in desc_headers
            if _minion_section_column(d["x"]) == dcol and d["y"] > desc["y"] + 10
        ]
        y_max = later[0]["y"] - 2 if later else 730.0
        later_names = [n for n in names if n["col"] == entry["col"] and n["y"] > entry["y"] + 10]
        if later_names:
            y_max = min(y_max, later_names[0]["y"] - 2)

        my_secs = sorted(
            [
                s
                for s in sections
                if _minion_section_column(s["x"]) == dcol and entry["y"] + 5 < s["y"] < y_max
            ],
            key=lambda s: s["y"],
        )

        def body_between(y0: float, y1: float) -> str:
            parts = [
                s
                for s in spans
                if s["size"] <= 13
                and s["t"] not in {"Description", "Ability", "Tactics"}
                and y0 < s["y"] < y1
                and x_min <= s["x"] <= x_max
                and s["y"] <= 720
            ]
            parts.sort(key=lambda z: (round(z["y"], 1), z["x"]))
            return _join_span_text([p["t"] for p in parts])

        description = ""
        tactics = ""
        abilities: list[dict] = []
        for j, sec in enumerate(my_secs):
            y0 = sec["y"] + 1
            y1 = my_secs[j + 1]["y"] - 1 if j + 1 < len(my_secs) else y_max
            if sec["t"] == "Description":
                description = body_between(y0, y1)
            elif sec["t"] == "Tactics":
                tactics = body_between(y0, y1)
            elif sec["t"] == "Ability":
                ab_spans = [
                    s
                    for s in spans
                    if y0 < s["y"] < y1
                    and x_min <= s["x"] <= x_max
                    and s["size"] <= 13
                    and s["t"] not in {"Description", "Ability", "Tactics"}
                ]
                ab_spans.sort(key=lambda z: (round(z["y"], 1), z["x"]))
                current: dict | None = None
                for span in ab_spans:
                    title = None
                    rest = None
                    if span["t"].endswith(":") and len(span["t"]) < 45:
                        title = span["t"][:-1].strip()
                    elif ":" in span["t"] and len(span["t"].split(":", 1)[0]) < 40:
                        title, rest = span["t"].split(":", 1)
                        title = title.strip()
                        rest = rest.strip()
                    if title:
                        if current:
                            abilities.append(current)
                        current = {"name": title, "description": rest or ""}
                    elif current is not None:
                        current["description"] = _join_span_text(
                            [current["description"], span["t"]]
                        )
                if current:
                    abilities.append(current)
                for ability in abilities:
                    ability["description"] = re.sub(r"\s+", " ", ability["description"]).strip()

        gaps: list[str] = []
        if not description:
            gaps.append("Empty description.")
        if not tactics:
            gaps.append("Empty tactics.")
        if not abilities:
            gaps.append("No abilities parsed.")

        members.append(
            {
                "name": entry["name"],
                "role": entry["role"],
                "kind": entry["role"],
                "description": description,
                "tactics": tactics,
                "abilities": abilities,
                "typicalDie": "d8",
                "dieTypeKnown": False,
                "sourcePage": book,
                "gaps": gaps,
            }
        )
    return members


def extract_minions(doc: pymupdf.Document) -> dict:
    """Parse minion/lieutenant entries from book pages 404–417 into team folders."""
    teams: dict[str, dict] = {}
    current_team = {"key": "general", "label": "General", "members": []}
    teams["general"] = current_team
    curated_dice = load_minion_dice()
    unknown_dice: list[str] = []

    for book in range(404, 418):
        if book in MINION_TEAM_HEADERS:
            key, label = MINION_TEAM_HEADERS[book]
            current_team = teams.setdefault(key, {"key": key, "label": label, "members": []})
        members = parse_minion_page(page_spans(book_page(doc, book)), book)
        for member in members:
            member["team"] = current_team["key"]
            member = apply_minion_die(member, curated_dice)
            if not member.get("dieTypeKnown"):
                unknown_dice.append(member["name"])
            if any(m["name"] == member["name"] for m in current_team["members"]):
                continue
            current_team["members"].append(member)

    teams_list = [t for t in teams.values() if t["members"]]
    gaps = []
    if unknown_dice:
        gaps.append(
            "Unverified minion/lieutenant die glyphs (missing from minion-dice.json): "
            + ", ".join(unknown_dice)
        )
    return {"teams": teams_list, "gaps": gaps}


ENV_ZONE_HEADERS = {"Green", "Yellow", "Red", "Green ", "Yellow ", "Red "}
ENV_MINOR_HEADERS = {"Minor Twists", "Minor Twist"}
ENV_MAJOR_HEADERS = {"Major Twist", "Major Twists"}
ENV_STOP_HEADERS = {"Environments", "ROLL", "MID DIE RESULT", "MAX DIE RESULT", "MIN DIE RESULT"}


def _env_clean_line(raw: str) -> str:
    """Strip PDF control chars / soft hyphens while preserving checkbox markers."""
    text = raw.replace("\x07", "").replace("\u00ad", "")
    return text.strip()


def _env_is_chrome(line: str, env_name: str) -> bool:
    if not line:
        return True
    if line in CHROME or re.fullmatch(r"\d{3}", line):
        return True
    if line == env_name:
        return True
    if line in ENV_STOP_HEADERS:
        return True
    return False


def _env_is_twist_title(line: str) -> bool:
    """True when a line starts a new Named Twist: body… entry."""
    if CHECKBOX_CHAR in line:
        return False
    if ":" not in line or line.startswith("http"):
        return False
    title, _, _ = line.partition(":")
    title = title.strip()
    if not title or len(title) >= 60:
        return False
    if title in ENV_ZONE_HEADERS | ENV_MINOR_HEADERS | ENV_MAJOR_HEADERS | ENV_STOP_HEADERS:
        return False
    # Reject lines that are clearly mid-sentence (lowercase start after join artifacts).
    if title[0].islower():
        return False
    return True


def _env_parse_checkbox_line(line: str) -> dict | None:
    """Parse '☐☐ Name' into {name, boxes} or None."""
    if CHECKBOX_CHAR not in line:
        return None
    # Count leading checkbox glyphs (allow spaces between).
    boxes = 0
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == CHECKBOX_CHAR:
            boxes += 1
            i += 1
            continue
        if ch in " \t":
            i += 1
            continue
        break
    if boxes < 1:
        return None
    name = line[i:].strip(" \t\u200b")
    name = re.sub(r"\s+", " ", name).strip()
    if not name:
        return None
    return {"name": name, "boxes": [False] * boxes, "description": ""}


def _env_split_twist_body(body_lines: list[str]) -> tuple[str, list[dict]]:
    """Split twist body into description prose + challenges[] from checkbox lines."""
    pre: list[str] = []
    challenges: list[dict] = []
    post: list[str] = []
    seen_challenge = False
    awaiting_name_wrap = False
    for raw in body_lines:
        line = _env_clean_line(raw)
        if not line:
            continue
        challenge = _env_parse_checkbox_line(line)
        if challenge:
            seen_challenge = True
            awaiting_name_wrap = True
            challenges.append(challenge)
            continue
        # Wrapped challenge titles continue on the next line in lowercase
        # (e.g. "Prevent the monorail car from crashing to" / "the ground").
        if (
            awaiting_name_wrap
            and challenges
            and line[:1].islower()
            and CHECKBOX_CHAR not in line
        ):
            challenges[-1]["name"] = re.sub(
                r"\s+", " ", f"{challenges[-1]['name']} {line}"
            ).strip()
            awaiting_name_wrap = False
            continue
        awaiting_name_wrap = False
        if seen_challenge:
            post.append(line)
        else:
            pre.append(line)
    description = re.sub(r"\s+", " ", " ".join(pre)).strip()
    post_text = re.sub(r"\s+", " ", " ".join(post)).strip()
    if challenges and post_text:
        # Shared mechanical text after checkbox titles belongs on the first challenge.
        challenges[0]["description"] = post_text
    return description, challenges


def parse_environment_twists(twists_text: str, env_name: str) -> list[dict]:
    """Parse full multi-line environment twists + embedded challenges."""
    current_zone = "green"
    current_major = False
    twists: list[dict] = []
    current: dict | None = None
    body_lines: list[str] = []

    def flush() -> None:
        nonlocal current, body_lines
        if not current:
            body_lines = []
            return
        description, challenges = _env_split_twist_body(body_lines)
        current["description"] = description
        current["challenges"] = challenges
        twists.append(current)
        current = None
        body_lines = []

    for raw in twists_text.splitlines():
        line = _env_clean_line(raw)
        if _env_is_chrome(line, env_name):
            # Stop once the roll-result chart / footer begins after twists.
            if line in ENV_STOP_HEADERS and twists:
                flush()
                break
            continue

        zone_key = line.rstrip()
        if zone_key in {"Green", "Yellow", "Red"}:
            flush()
            current_zone = zone_key.lower()
            continue
        if line in ENV_MINOR_HEADERS:
            flush()
            current_major = False
            continue
        if line in ENV_MAJOR_HEADERS:
            flush()
            current_major = True
            continue

        if _env_is_twist_title(line):
            flush()
            title, _, body = line.partition(":")
            current = {
                "name": title.strip(),
                "type": f"{current_zone}{'major' if current_major else 'minor'}",
            }
            remainder = body.strip()
            body_lines = [remainder] if remainder else []
            continue

        if current is not None:
            body_lines.append(line)

    flush()
    return twists


def extract_environments(doc: pymupdf.Document) -> dict:
    envs = [
        {"name": "Megalopolis", "intro": 420, "twists": 421},
        {"name": "Freedom Plaza", "intro": 422, "twists": 423},
        {"name": "Wagner II Mars Base", "intro": 424, "twists": 425},
        {"name": "Magmaria", "intro": 426, "twists": 427},
        {"name": "Mordengrad", "intro": 428, "twists": 429},
        {"name": "Ruins of Atlantis", "intro": 430, "twists": 431},
    ]
    curated = load_environment_dice()
    out = []
    for env in envs:
        intro = page_text(book_page(doc, env["intro"]))
        twists_text = page_text(book_page(doc, env["twists"]))
        twists = parse_environment_twists(twists_text, env["name"])
        dice, die_names, gaps = environment_dice_fields(env["name"], curated)
        out.append(
            {
                "name": env["name"],
                "descriptionHtml": paragraphs(intro),
                "twists": twists,
                "dice": dice,
                "dieNames": {
                    "firstDieName": die_names[0],
                    "secondDieName": die_names[1],
                    "thirdDieName": die_names[2],
                },
                "sourcePages": {"intro": env["intro"], "twists": env["twists"]},
                "gaps": gaps,
            }
        )
    return {"environments": out}


# Hand-curated hero fields that OCR extract does not regenerate.
PRESERVE_HERO_FIELDS = ("formChanger",)


def merge_preserved_hero_fields(heroes: dict, previous_path: Path) -> list[str]:
    """Copy curated fields (e.g. Muerto formChanger) from prior heroes.json."""
    if not previous_path.exists():
        return []
    try:
        previous = json.loads(previous_path.read_text())
    except (OSError, json.JSONDecodeError):
        return []
    prior_by_name = {
        member["name"]: member
        for team in previous.get("teams", [])
        for member in team.get("members", [])
    }
    restored: list[str] = []
    for team in heroes.get("teams", []):
        for member in team.get("members", []):
            prior = prior_by_name.get(member.get("name", ""))
            if not prior:
                continue
            for field in PRESERVE_HERO_FIELDS:
                if field in prior and field not in member:
                    member[field] = prior[field]
                    restored.append(f"{member['name']}.{field}")
    return restored


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

    heroes_path = OUT / "heroes.json"
    restored = merge_preserved_hero_fields(heroes, heroes_path)
    heroes_path.write_text(json.dumps(heroes, indent=2, ensure_ascii=False) + "\n")
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
    if restored:
        print(f"Preserved curated fields: {', '.join(restored)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
