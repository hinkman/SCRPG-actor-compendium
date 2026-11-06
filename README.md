# Sentinel Comics RPG Actor Compendium

Unofficial compendium module for [Foundry VTT](https://foundryvtt.com/) using the [scrpg-foundry](https://github.com/hinkman/SCRPG-foundry) system. A copy of Sentinel Comics: The Roleplaying Game is required. This module does not replace the rules.

Version 0.1.0 contains the power list (rulebook pages 123–126) as Foundry items, grouped into compendium folders by category. Die size is left at `d4` because the die is chosen when the power is added to a hero.

## Install

Foundry 14 and `scrpg-foundry` 0.9.10 or newer. In Foundry Setup, install the module from:

`https://raw.githubusercontent.com/hinkman/SCRPG-actor-compendium/main/module.json`

Enable **Sentinel Comics RPG Actor Compendium** in a world that uses `scrpg-foundry`. The powers are in the **SCRPG Powers** compendium.

## Rebuild the pack

```bash
npm install
npm run pack
```

`src/data/powers.json` is the editable list. `npm run pack` writes `src/packs/powers` and compiles `packs/powers`.
