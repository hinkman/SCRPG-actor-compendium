# Sentinel Comics RPG Actor Compendium

Unofficial compendium module for [Foundry VTT](https://foundryvtt.com/) using the [scrpg-foundry](https://github.com/hinkman/SCRPG-foundry) system. A copy of Sentinel Comics: The Roleplaying Game is required. This module does not replace the rules.

Current contents:

- Backgrounds, powers, qualities, principles, personalities, archetypes, power sources
- Abilities (Green/Yellow/Red/Out) and **SCRPG Rollable Tables** (minor/major twists)
- **Archive actors** (rulebook Chapter 7):
  - **SCRPG Heroes** — team folders (Sentinels of Freedom, Daybreak)
  - **SCRPG Villains** — Independent, Helfyre, Perestroika, Slaughterhouse Six
  - **SCRPG Minions** — Aliens, Blade Battalion, Blade Drones, Devices, Magmarian Foes, Thematic Enemies, Typical Combatants
  - **SCRPG Environments** — Megalopolis, Freedom Plaza, Wagner II Mars Base, Magmaria, Mordengrad, Ruins of Atlantis

Wizard/item packs are unchanged. Archive actors use the existing `scrpg-foundry` hero/villain/minion/environment schemas.

## Install

Foundry 14 and `scrpg-foundry` 0.9.15 or newer. Install from:

`https://raw.githubusercontent.com/hinkman/SCRPG-actor-compendium/main/module.json`

## Rebuild the packs

```bash
npm install
npm run pack          # item + roll table packs
npm run pack:archive  # Archive actor packs (from src/data/archive)
# or: npm run pack:all
```

To refresh Archive JSON from the SCRPG PDF (requires PyMuPDF):

```bash
npm run extract:archive
npm run pack:archive
```

Edit files under `src/data/` (and `src/data/archive/` for actors), then rebuild.
