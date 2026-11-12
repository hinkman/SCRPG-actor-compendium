/**
 * Guided chart helpers: turn silent-roll results into legal row numbers (1–20).
 * Rules: a single die face, or the sum of any two dice, may pick the chart row.
 */

import { silentRoll, rerollSilent } from "./silentRoll.js";

/**
 * Normalize chart die sizes like "d10" / "1d8" into a Foundry formula.
 * @param {string[]} dice
 * @returns {string}
 */
export function diceSizesToFormula(dice = []) {
    return dice
        .map(d => {
            const s = String(d).trim().toLowerCase();
            if (/^\d*d\d+$/.test(s)) return s.startsWith("d") ? `1${s}` : s;
            return s;
        })
        .filter(Boolean)
        .join("+");
}

/**
 * Flatten face results from a silentRoll payload.
 * @param {{dice?: Array<{results?: number[]}>}|null|undefined} rollResult
 * @returns {number[]}
 */
export function flattenDieResults(rollResult) {
    const out = [];
    for (const die of rollResult?.dice ?? []) {
        for (const r of die.results ?? []) out.push(Number(r));
    }
    return out.filter(n => Number.isFinite(n));
}

/**
 * Legal chart row numbers from a silent roll (single faces + pairwise sums, clamped 1–20).
 * @param {{dice?: Array<{results?: number[]}>}|null|undefined} rollResult
 * @param {{min?: number, max?: number}} [opts]
 * @returns {number[]}
 */
export function legalChartNumbers(rollResult, opts = {}) {
    const min = opts.min ?? 1;
    const max = opts.max ?? 20;
    const values = flattenDieResults(rollResult);
    const legal = new Set();

    for (const v of values) {
        if (v >= min && v <= max) legal.add(v);
    }
    for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
            const sum = values[i] + values[j];
            if (sum >= min && sum <= max) legal.add(sum);
        }
    }
    return [...legal].sort((a, b) => a - b);
}

/**
 * @param {string} formula
 */
export async function rollChart(formula) {
    return silentRoll(formula);
}

/**
 * @param {{formula?: string}|string} prior
 */
export async function rerollChart(prior) {
    return rerollSilent(prior);
}
