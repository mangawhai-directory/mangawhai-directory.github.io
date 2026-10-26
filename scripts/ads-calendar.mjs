#!/usr/bin/env node
// Print the next twelve months of ad bookings per slot, from data/ads.yaml.
//
//   make ads                     or: node scripts/ads-calendar.mjs [YYYY-MM]
//
// Rows are the homepage tile and every category slot that has a booking;
// cells are the advertiser or a dash for free. Categories with no bookings
// at all are counted at the bottom, since every one of them is free.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data = yaml.load(fs.readFileSync(path.join(root, 'data', 'ads.yaml'), 'utf8')) ?? {};

const nowNZ = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' })
  .formatToParts(new Date()).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
let [y, m] = (process.argv[2] ?? `${nowNZ.year}-${nowNZ.month}`).split('-').map(Number);
const months = [];
for (let i = 0; i < 12; i++) { months.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } }

const slots = [];
if (data.home) slots.push(['home', data.home]);
for (const [slug, cfg] of Object.entries(data.category ?? {})) slots.push([slug, cfg]);
const booked = slots.filter(([, c]) => Array.isArray(c?.bookings) && c.bookings.length);

const name = (b) => (b.advertiser ?? b.id ?? '?').slice(0, 7).padEnd(7);
const head = 'slot'.padEnd(26) + months.map((mo) => mo.slice(2)).join('   ');
console.log(head);
for (const [slot, cfg] of booked) {
  const cells = months.map((mo) => {
    const b = cfg.bookings.find((x) => String(x.from) <= mo && (x.to === undefined || String(x.to) >= mo));
    return b ? name(b) : '—'.padEnd(7);
  });
  console.log(slot.padEnd(26) + cells.join(' '));
}
const categories = fs.readdirSync(path.join(root, 'content', 'categories'), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
const free = categories - booked.filter(([s]) => s !== 'home').length;
console.log(`\n${free} of ${categories} category slots have no bookings at all. Months are New Zealand time; a name is cut to seven letters.`);
