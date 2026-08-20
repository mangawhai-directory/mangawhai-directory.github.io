#!/usr/bin/env node
// Validate every content/businesses/*.md against schemas/business.schema.json
// plus a set of structural checks that don't fit cleanly in JSON Schema.
//
// Usage:
//   node scripts/validate-businesses.mjs        # human-readable
//   node scripts/validate-businesses.mjs --json # JSON output for CI
//
// Exit code: 0 = clean, 1 = any error (warnings alone do not fail).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const BUSINESSES_DIR = path.join(REPO_ROOT, "content", "businesses");
const CATEGORIES_DIR = path.join(REPO_ROOT, "content", "categories");
const SCHEMA_PATH = path.join(REPO_ROOT, "schemas", "business.schema.json");

const args = new Set(process.argv.slice(2));
const JSON_OUTPUT = args.has("--json");

const PHONE_RE = /^\+64\d{8,11}$/;
const POSTCODE_RE = /^\d{4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_RE = /^https:\/\//;
const HTTP_RE = /^http:\/\//;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_MONTHS_MS = 2 * TWELVE_MONTHS_MS;

// js-yaml resolves an unquoted YAML timestamp (2026-05-10) to a JS Date, which
// then fails the schema's `type: string`. The CMS datetime widget writes dates
// unquoted, so normalise Date back to a YYYY-MM-DD string before validating.
function normaliseDates(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normaliseDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDates(v)]));
  }
  return value;
}

function readFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return null;
  return normaliseDates(yaml.load(match[1]));
}

function loadSchema() {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
}

function listBusinessFiles() {
  if (!fs.existsSync(BUSINESSES_DIR)) return [];
  return fs.readdirSync(BUSINESSES_DIR)
    .filter((f) => f.endsWith(".md") && f !== "_index.md")
    .map((f) => path.join(BUSINESSES_DIR, f));
}

function knownCategorySlugs() {
  if (!fs.existsSync(CATEGORIES_DIR)) return new Set();
  return new Set(
    fs.readdirSync(CATEGORIES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  );
}

function structuralChecks(file, fm, knownCats, slugMap) {
  const errors = [];
  const warnings = [];
  const stem = path.basename(file, ".md");

  // Slug must equal filename stem
  if (fm.slug && fm.slug !== stem) {
    errors.push(`slug "${fm.slug}" does not match filename stem "${stem}"`);
  }
  // Slug uniqueness
  if (fm.slug) {
    const prev = slugMap.get(fm.slug);
    if (prev && prev !== file) {
      errors.push(`duplicate slug "${fm.slug}" (also in ${path.relative(REPO_ROOT, prev)})`);
    } else {
      slugMap.set(fm.slug, file);
    }
  }
  // Category existence
  if (Array.isArray(fm.categories)) {
    for (const cat of fm.categories) {
      if (!knownCats.has(cat)) {
        errors.push(`unknown category slug "${cat}" (no content/categories/${cat}/ directory)`);
      }
      if (typeof cat === "string" && !SLUG_RE.test(cat)) {
        errors.push(`category slug "${cat}" not in lowercase-hyphen form`);
      }
    }
  }
  // Phone format
  if (fm.phone && !PHONE_RE.test(fm.phone)) {
    errors.push(`phone "${fm.phone}" must match ^\\+64\\d{8,11}$`);
  }
  // Postcode format
  if (fm.address?.postcode && !POSTCODE_RE.test(fm.address.postcode)) {
    errors.push(`address.postcode "${fm.address.postcode}" must be 4 digits`);
  }
  // Email
  if (fm.email && !EMAIL_RE.test(fm.email)) {
    errors.push(`email "${fm.email}" failed regex check`);
  }
  // URL scheme
  const urlFields = [
    ["website", fm.website],
    ...Object.entries(fm.socials || {}).map(([k, v]) => [`socials.${k}`, v]),
  ];
  for (const [name, val] of urlFields) {
    if (!val) continue;
    if (HTTP_RE.test(val) && !HTTPS_RE.test(val)) {
      warnings.push(`${name} uses http:// — prefer https://`);
    } else if (!/^https?:\/\//.test(val)) {
      errors.push(`${name} "${val}" must start with http:// or https://`);
    }
    if (!val.includes("/")) {
      errors.push(`${name} "${val}" looks like a bare handle, not a full URL`);
    }
  }
  // last_verified age
  if (fm.last_verified) {
    const verified = new Date(fm.last_verified);
    if (Number.isNaN(verified.getTime())) {
      errors.push(`last_verified "${fm.last_verified}" not parseable as date`);
    } else {
      const age = Date.now() - verified.getTime();
      if (age > TWENTY_FOUR_MONTHS_MS) {
        errors.push(`last_verified ${fm.last_verified} is older than 24 months`);
      } else if (age > TWELVE_MONTHS_MS) {
        warnings.push(`last_verified ${fm.last_verified} is older than 12 months`);
      }
    }
  }
  return { errors, warnings };
}

function main() {
  const schema = loadSchema();
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const files = listBusinessFiles();
  const knownCats = knownCategorySlugs();
  const slugMap = new Map();

  const results = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file);
    const fm = readFrontmatter(file);
    if (!fm) {
      totalErrors += 1;
      results.push({ file: rel, errors: ["could not parse front matter"], warnings: [] });
      continue;
    }
    const errs = [];
    const warns = [];
    if (!validate(fm)) {
      for (const e of validate.errors || []) {
        errs.push(`schema: ${e.instancePath || "/"} ${e.message}`);
      }
    }
    const struct = structuralChecks(file, fm, knownCats, slugMap);
    errs.push(...struct.errors);
    warns.push(...struct.warnings);
    if (errs.length || warns.length) {
      totalErrors += errs.length;
      totalWarnings += warns.length;
      results.push({ file: rel, errors: errs, warnings: warns });
    } else {
      results.push({ file: rel, errors: [], warnings: [] });
    }
  }

  const summary = {
    files: files.length,
    errors: totalErrors,
    warnings: totalWarnings,
  };

  if (JSON_OUTPUT) {
    process.stdout.write(JSON.stringify({ summary, results }, null, 2) + "\n");
  } else {
    for (const r of results) {
      if (r.errors.length === 0 && r.warnings.length === 0) continue;
      process.stdout.write(`\n${r.file}\n`);
      for (const e of r.errors) process.stdout.write(`  ERROR  ${e}\n`);
      for (const w of r.warnings) process.stdout.write(`  WARN   ${w}\n`);
    }
    process.stdout.write(
      `\n(${summary.files} file${summary.files === 1 ? "" : "s"} validated, ` +
      `${summary.errors} error${summary.errors === 1 ? "" : "s"}, ` +
      `${summary.warnings} warning${summary.warnings === 1 ? "" : "s"})\n`
    );
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
