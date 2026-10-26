#!/usr/bin/env node
// Check data/ads.yaml: the ad bookings and what they point at.
//
//   node scripts/validate-ads.mjs            from the repository root
//
// Prints one line per finding, "ERROR …" or "WARN …", and a summary. Exit 0
// when clean, 1 with errors, 2 when it could not run. scripts/test.sh runs it
// as the `ads` step; errors are findings, warnings never fail.
//
// Why it exists: the site check only sees the creatives in the build it ran
// on, so a booking for a later month pointing at a file nobody committed would
// be found on the 1st, by the deploy. This checks every booking now. It also
// catches the things a text editor will not: two bookings on one slot in the
// same month, a month that does not exist, a category slug with no category.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.join(root, 'data', 'ads.yaml');
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const REQUIRED = ['id', 'advertiser', 'image', 'alt', 'href'];
const OPTIONAL = ['from', 'to', 'imageMobile'];
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// The current month in New Zealand, whatever the machine's clock zone is.
const nowNZ = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' })
  .formatToParts(new Date()).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
const thisMonth = `${nowNZ.year}-${nowNZ.month}`;

let data;
try {
  data = yaml.load(fs.readFileSync(file, 'utf8')) ?? {};
} catch (e) {
  console.log(`ERROR data/ads.yaml: ${e.message.split('\n')[0]}`);
  process.exit(2);
}

function checkImage(slot, i, key, value) {
  if (typeof value !== 'string' || !value) { err(`${slot} booking ${i}: ${key} must be a non-empty string`); return; }
  if (/^https?:\/\//.test(value)) return;
  if (!value.startsWith('/')) { err(`${slot} booking ${i}: ${key} "${value}" must be site-rooted (/img/…) or an https URL`); return; }
  if (!fs.existsSync(path.join(root, 'static', value))) err(`${slot} booking ${i}: ${key} "${value}" is not in static/`);
}

function checkSlot(slot, cfg) {
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) { err(`${slot}: must be a map with a bookings list`); return; }
  const extra = Object.keys(cfg).filter((k) => k !== 'bookings');
  if (extra.length) err(`${slot}: unexpected key${extra.length > 1 ? 's' : ''} ${extra.join(', ')} — an ad goes under bookings now`);
  const bookings = cfg.bookings;
  if (bookings === undefined) { warn(`${slot}: no bookings (placeholder shows)`); return; }
  if (!Array.isArray(bookings)) { err(`${slot}: bookings must be a list`); return; }
  const spans = [];
  bookings.forEach((b, n) => {
    const i = n + 1;
    if (b === null || typeof b !== 'object' || Array.isArray(b)) { err(`${slot} booking ${i}: must be a map`); return; }
    for (const k of Object.keys(b)) if (!REQUIRED.includes(k) && !OPTIONAL.includes(k)) err(`${slot} booking ${i}: unknown key ${k}`);
    for (const k of REQUIRED) if (typeof b[k] !== 'string' || !b[k].trim()) err(`${slot} booking ${i}: ${k} is required`);
    if (typeof b.id === 'string' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.id)) err(`${slot} booking ${i}: id "${b.id}" must be lowercase letters, digits and hyphens`);
    if (typeof b.href === 'string' && !/^(https?:\/\/|tel:|mailto:)/.test(b.href)) err(`${slot} booking ${i}: href "${b.href}" must be http(s), tel: or mailto:`);
    if (typeof b.image === 'string') checkImage(slot, i, 'image', b.image);
    if (b.imageMobile !== undefined) checkImage(slot, i, 'imageMobile', b.imageMobile);
    const from = b.from, to = b.to;
    if (typeof from !== 'string' || !MONTH.test(from)) { err(`${slot} booking ${i}: from must be a quoted month like "2026-11"${from instanceof Date ? ' (unquoted, YAML read it as a date)' : ''}`); return; }
    if (to !== undefined && (typeof to !== 'string' || !MONTH.test(to))) { err(`${slot} booking ${i}: to must be a quoted month like "2027-01"`); return; }
    if (to !== undefined && to < from) { err(`${slot} booking ${i}: to ${to} is before from ${from}`); return; }
    if (to !== undefined && to < thisMonth) warn(`${slot} booking ${i} (${b.id}) ended ${to} and can be removed`);
    spans.push({ i, id: b.id, from, to: to ?? '9999-12' });
  });
  for (let a = 0; a < spans.length; a++) for (let c = a + 1; c < spans.length; c++) {
    const x = spans[a], y = spans[c];
    if (x.from <= y.to && y.from <= x.to) err(`${slot}: bookings ${x.i} (${x.id}) and ${y.i} (${y.id}) overlap between ${x.from > y.from ? x.from : y.from} and ${x.to < y.to ? x.to : y.to}`);
  }
}

if (typeof data !== 'object' || data === null || Array.isArray(data)) {
  err('data/ads.yaml: must be a map with home and category');
} else {
  for (const k of Object.keys(data)) if (k !== 'home' && k !== 'category') err(`unknown top-level key ${k}`);
  if (data.home !== undefined) checkSlot('home', data.home);
  if (data.category !== undefined) {
    if (typeof data.category !== 'object' || data.category === null || Array.isArray(data.category)) err('category: must be a map of slug → slot');
    else for (const [slug, cfg] of Object.entries(data.category)) {
      if (!fs.existsSync(path.join(root, 'content', 'categories', slug, '_index.md'))) err(`category.${slug}: no such category under content/categories/`);
      checkSlot(`category.${slug}`, cfg);
    }
  }
}

for (const m of errors) console.log(`ERROR ${m}`);
for (const m of warnings) console.log(`WARN ${m}`);
console.log(`(${errors.length} errors, ${warnings.length} warnings; month ${thisMonth})`);
process.exit(errors.length ? 1 : 0);
