/** Step 8 — Finishing touches: identity + physical fields the sheet supports. */

export const FINISHING_STEP = {
    id: "finishing",
    label: "Finishing",
    index: 12
};

export const PHYSICAL_FIELDS = [
    { key: "gender", label: "Gender" },
    { key: "age", label: "Age" },
    { key: "height", label: "Height" },
    { key: "eyes", label: "Eyes" },
    { key: "hair", label: "Hair" },
    { key: "skin", label: "Skin" },
    { key: "build", label: "Build" }
];

/**
 * Only hero name is required to create; other fields are optional sheet fill-ins.
 * @param {object} draft
 */
export function isFinishingComplete(draft) {
    return Boolean(String(draft?.identity?.name || "").trim());
}

export function emptyIdentity() {
    return {
        name: null,
        alias: null,
        gender: null,
        age: null,
        height: null,
        eyes: null,
        hair: null,
        skin: null,
        build: null,
        costume: null
    };
}
