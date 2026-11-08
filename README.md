# Sentinel Comics RPG Actor Compendium

Unofficial compendium module for [Foundry VTT](https://foundryvtt.com/) using the [scrpg-foundry](https://github.com/hinkman/SCRPG-foundry) system. A copy of Sentinel Comics: The Roleplaying Game is required. This module does not replace the rules.

Version 0.7.0 contains:

- Powers (rulebook pages 123–126)
- Qualities (rulebook pages 127–128)
- Principles (rulebook pages 132–149)
- Personalities (rulebook pages 109–112)
- Archetypes (rulebook pages 81–106), with table numbers and UUID-linked powers/qualities in descriptions
- Abilities in the shared **SCRPG Abilities** pack:
  - **Green → Principles** — principle Green abilities
  - **Green / Yellow / Red → Archetypes** — archetype abilities by color
  - **Red** — Red abilities from pp. 114–119 (power/quality category folders)
  - **Out → Personalities** — grey Out abilities

Entries stay in their Foundry compendia. Drag items onto a hero when needed. Die size for powers and qualities starts at `d4`.

Principle and personality sheets show linked abilities. Archetype descriptions are split into **Powers/Qualities**, **Abilities**, and **Principle** sections, with ability UUID links inline under each grant instruction. Drops create those linked abilities on the hero. Bracket tokens such as `[power]`, `[quality]`, and `[power/quality]` show trait dropdowns once an ability is owned.

## Install

Foundry 14 and `scrpg-foundry` 0.9.10 or newer. Install from:

`https://raw.githubusercontent.com/hinkman/SCRPG-actor-compendium/main/module.json`

## Rebuild the packs

```bash
npm install
npm run pack
```

Edit files under `src/data/`, then run `npm run pack`.
