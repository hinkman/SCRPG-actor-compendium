/**
 * Silent in-wizard dice helpers for SCRPG character creation.
 * Rolls evaluate locally and never post to chat.
 */

/**
 * Evaluate a Foundry Roll without creating a chat message.
 * @param {string} formula  Dice formula, e.g. "2d10" or "1d8+1d10"
 * @param {object} [options]
 * @param {boolean} [options.allowInteractive=false]
 * @returns {Promise<{
 *   formula: string,
 *   total: number,
 *   dice: Array<{faces: number, results: number[]}>,
 *   roll: Roll
 * }>}
 */
export async function silentRoll(formula, options = {}) {
    const allowInteractive = options.allowInteractive ?? false;
    const roll = new Roll(String(formula));
    await roll.evaluate({ allowInteractive });

    return {
        formula: roll.formula,
        total: roll.total,
        dice: roll.dice.map(die => ({
            faces: die.faces,
            results: die.results.map(r => r.result)
        })),
        roll
    };
}

/**
 * Re-evaluate using the same formula as a prior silent roll result.
 * @param {{formula?: string}|string} prior
 * @param {object} [options]
 */
export async function rerollSilent(prior, options = {}) {
    const formula = typeof prior === "string" ? prior : prior?.formula;
    if (!formula) {
        throw new Error("silentRoll.rerollSilent requires a prior formula");
    }
    return silentRoll(formula, options);
}
