/** Method step (wizard step 0): Guided vs Constructed. */

export const METHOD_STEP = {
    id: "method",
    label: "Method",
    index: 0
};

export const METHODS = [
    {
        id: "guided",
        label: "Guided",
        summary: "Roll dice for each chart, then choose among the legal rows. Best for discovering a hero as you go."
    },
    {
        id: "constructed",
        label: "Constructed",
        summary: "Pick any row on each chart. Die sizes still come from the prior step’s chart dice (rules as written)."
    }
];

export function isValidMethod(value) {
    return value === "guided" || value === "constructed";
}
