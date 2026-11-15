#!/usr/bin/env node
/**
 * Keep module.json "version" and the "download" URL tag in lockstep.
 *
 *   node tools/bump-module-version.mjs --check          # exit 1 on drift
 *   node tools/bump-module-version.mjs 0.9.18           # set version + download
 *   node tools/bump-module-version.mjs --patch          # bump patch (x.y.Z+1)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(root, "module.json");
const DOWNLOAD_TEMPLATE =
    "https://github.com/hinkman/SCRPG-actor-compendium/releases/download/v{version}/scrpg-actor-compendium.zip";

function downloadFor(version) {
    return DOWNLOAD_TEMPLATE.replace("{version}", version);
}

function versionFromDownload(url) {
    const match = String(url ?? "").match(/\/download\/v([^/]+)\/scrpg-actor-compendium\.zip$/);
    return match?.[1] ?? null;
}

function readModule() {
    return JSON.parse(fs.readFileSync(modulePath, "utf8"));
}

function writeModule(data) {
    fs.writeFileSync(modulePath, `${JSON.stringify(data, null, 4)}\n`);
}

function bumpPatch(version) {
    const parts = String(version).split(".").map(Number);
    if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) {
        throw new Error(`Cannot auto-bump non-semver version: ${version}`);
    }
    parts[2] += 1;
    return parts.join(".");
}

function check(data) {
    const expected = downloadFor(data.version);
    const fromUrl = versionFromDownload(data.download);
    if (data.download !== expected || fromUrl !== data.version) {
        console.error(
            `module.json version/download mismatch:\n` +
            `  version:  ${data.version}\n` +
            `  download: ${data.download}\n` +
            `  expected: ${expected}`
        );
        process.exit(1);
    }
    console.log(`OK: version ${data.version} matches download URL.`);
}

function setVersion(next) {
    const data = readModule();
    data.version = next;
    data.download = downloadFor(next);
    writeModule(data);
    console.log(`Updated module.json to version ${next}`);
    console.log(`download → ${data.download}`);
}

const arg = process.argv[2];
if (!arg || arg === "--check") {
    check(readModule());
} else if (arg === "--patch") {
    const data = readModule();
    setVersion(bumpPatch(data.version));
} else if (arg.startsWith("-")) {
    console.error(`Unknown flag: ${arg}`);
    console.error("Usage: bump-module-version.mjs [--check|--patch|<version>]");
    process.exit(1);
} else {
    setVersion(arg);
}
