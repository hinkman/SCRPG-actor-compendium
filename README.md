# Sentinel Comics RPG Actor Compendium

Unofficial compendium module for [Foundry VTT](https://foundryvtt.com/) using the [scrpg-foundry](https://github.com/hinkman/SCRPG-foundry) system. A copy of Sentinel Comics: The Roleplaying Game is required. This module does not replace the rules.

Version 0.2.1 contains:

- Powers (rulebook pages 123–126)
- Qualities (rulebook pages 127–128)

Entries stay in their Foundry compendia and are not imported into the world Items directory automatically. Drag a power or quality onto a hero when you need it. Die size starts at `d4` and is set on the character.

## Install

Foundry 14 and `scrpg-foundry` 0.9.10 or newer. In Foundry Setup, install or update the module from:

`https://raw.githubusercontent.com/hinkman/SCRPG-actor-compendium/main/module.json`

Enable **Sentinel Comics RPG Actor Compendium** in a world that uses `scrpg-foundry`. Use the **SCRPG Powers** and **SCRPG Qualities** packs.

## Rebuild the packs

```bash
npm install
npm run pack
```

Edit `src/data/powers.json` or `src/data/qualities.json`, then run `npm run pack` to regenerate `src/packs/*` and compile `packs/*`.
