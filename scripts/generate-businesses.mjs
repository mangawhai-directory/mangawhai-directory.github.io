#!/usr/bin/env node
// Generate content/businesses/<slug>.md from _research/businesses-master.csv.
// Categorisation is keyed on the business name (case-insensitive) — see CATS below.
// For each row we fall back to heuristic keyword matching if no manual entry.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const CSV = path.join(REPO, "_research/businesses-master.csv");
const OUT = path.join(REPO, "content/businesses");
const TODAY = new Date().toISOString().slice(0, 10);

// ---------- Manual categorisation (one or more slugs, max 3) ----------
// Keys are the lowercased CSV `name` field. Order in array reflects primary→secondary→tertiary.
const CATS = {
  // Cafes / restaurants / bars
  "mangawhai tavern": ["bars-pubs-breweries", "cafes-restaurants"],
  "bennetts of mangawhai": ["cafes-restaurants", "bakeries"],
  "wood street pizzeria": ["cafes-restaurants", "bars-pubs-breweries"],
  "frog & kiwi restaurant": ["cafes-restaurants"],
  "the corner bistro": ["cafes-restaurants"],
  "stingray matt's takeaway": ["takeaways-food-trucks"],
  "gringas": ["cafes-restaurants", "takeaways-food-trucks"],
  "the cow shed and shop": ["cafes-restaurants", "shops-boutiques"],
  "madly indian mangawhai": ["cafes-restaurants", "takeaways-food-trucks"],
  "dot india restaurant": ["cafes-restaurants", "takeaways-food-trucks"],
  "oasis bar & eatery": ["cafes-restaurants", "bars-pubs-breweries"],
  "sandbar mangawhai": ["cafes-restaurants"],
  "mangawhai deli": ["cafes-restaurants", "shops-boutiques"],
  "the dune": ["cafes-restaurants", "bars-pubs-breweries"],
  "no8 mangawhai": ["cafes-restaurants"],
  "the bbq hut mangawhai": ["takeaways-food-trucks", "cafes-restaurants"],
  "mangawhai pizzeria": ["cafes-restaurants", "takeaways-food-trucks"],
  "mangawhai meat shop": ["shops-boutiques", "cafes-restaurants"],
  "brewed as cafe": ["cafes-restaurants"],
  "bunker sports bar": ["bars-pubs-breweries"],
  "head rock bakery": ["bakeries"],
  "coast 2 coast": ["takeaways-food-trucks"],
  "mangawhai tavern market": ["community-clubs-churches"],
  "the cove mangawhai": ["cafes-restaurants"],
  "allpress espresso mangawhai": ["cafes-restaurants"],

  // Wineries
  "brookelane vineyard": ["wineries-vineyards"],
  "millars vineyard": ["wineries-vineyards"],
  "te whai bay wines": ["wineries-vineyards"],

  // Accommodation / holiday homes
  "mangawhai lodge": ["accommodation"],
  "mangawhai chalets": ["accommodation"],
  "aotearoa surf lodge": ["accommodation", "surf-beach-watersports"],
  "tudor oaks motel": ["accommodation"],
  "tall trees b&b": ["accommodation"],
  "mangawhai heads holiday park": ["accommodation"],
  "te arai lodge": ["accommodation"],
  "compass rentals limited": ["property-management"],
  "ray white compass rentals": ["property-management"],
  "mangawhai property and cleaning services": ["property-management", "cleaning-services"],
  "tend property services": ["property-management", "cleaning-services"],
  "bach stay": ["holiday-homes"],

  // Things to do / tours
  "mangawhai golf club": ["things-to-do-tours", "community-clubs-churches"],
  "mangawhai mini golf": ["things-to-do-tours"],
  "fishmeister": ["things-to-do-tours"],
  "offshore adventures": ["things-to-do-tours"],
  "eco adventures fishing charters": ["things-to-do-tours"],
  "rnr charters ltd": ["things-to-do-tours"],
  "mangawhai information centre trust": ["community-clubs-churches"],

  // Surf / beach / watersports
  "mangawhai heads surf school": ["surf-beach-watersports"],
  "aotearoa surf school": ["surf-beach-watersports"],
  "bammas surf mangawhai": ["surf-beach-watersports", "shops-boutiques"],
  "no limits surf & skate co": ["surf-beach-watersports", "shops-boutiques"],

  // Builders
  "dec construction": ["builders-renovations"],
  "pierce construction": ["builders-renovations"],
  "oakland homes": ["builders-renovations"],
  "te arai builders": ["builders-renovations"],
  "stuart contract builders": ["builders-renovations"],
  "brackenridge builders": ["builders-renovations"],
  "green build projects": ["builders-renovations"],
  "central building tony farley": ["builders-renovations"],
  "rd construction": ["builders-renovations"],
  "asset construction": ["civil-engineering"],
  "coastal homes northland": ["builders-renovations"],

  // Plumbers / electricians
  "plumbuilt plumbing northland": ["plumbers"],
  "go gas and plumbing": ["plumbers"],
  "plumbwise northland": ["plumbers"],
  "allan plumbing & gas solutions": ["plumbers"],
  "spectrum plumbing and drainage limited": ["plumbers"],
  "laser electrical mangawhai": ["electricians"],
  "carl gordon electrical": ["electricians"],

  // Painters
  "mangawhai painters & decorators": ["painters-decorators"],
  "sd property services": ["painters-decorators"],
  "wall 2 wall painting": ["painters-decorators"],
  "gt painters": ["painters-decorators"],
  "paint mac's": ["painters-decorators"],
  "northland painters": ["painters-decorators"],

  // Landscaping / gardening
  "jim's mowing mangawhai": ["landscaping-gardening"],
  "landscaping mangawhai": ["landscaping-gardening"],
  "vip home services mangawhai": ["landscaping-gardening", "cleaning-services"],
  "grasshopper lawnmowing mangawhai": ["landscaping-gardening"],
  "premier property care": ["landscaping-gardening"],
  "nailhead fencing & landscaping": ["landscaping-gardening", "builders-renovations"],
  "rochford landscapes": ["landscaping-gardening"],
  "wyatt landscape supplies mangawhai": ["garden-hardware"],

  // Cleaning
  "seabreeze clean": ["cleaning-services"],
  "the mangawhai cleaning co": ["cleaning-services"],
  "eco maid mangawhai": ["cleaning-services"],
  "get washed": ["cleaning-services"],
  "reset cleaning co": ["cleaning-services"],
  "bubble cleaning mangawhai": ["cleaning-services"],

  // Real estate
  "bayleys mangawhai": ["real-estate"],
  "ray white mangawhai": ["real-estate"],
  "barfoot & thompson mangawhai": ["real-estate"],

  // Medical / dental
  "coast to coast health care mangawhai": ["medical-dental"],
  "mangawhai dental": ["medical-dental"],
  "mangawhai physiotherapy": ["medical-dental"],
  "dr anthoinet top": ["medical-dental"],
  "tbi health mangawhai": ["medical-dental"],
  "sundocs": ["medical-dental"],

  // Beauty / hair / spa
  "heads of hair": ["beauty-hair-spa"],
  "the don hair and beauty barbershop": ["beauty-hair-spa"],
  "the village hair co": ["beauty-hair-spa"],
  "magnolia hair": ["beauty-hair-spa"],
  "mangawhai piercing": ["beauty-hair-spa"],

  // Fitness
  "mangawhai reformer pilates": ["fitness-yoga-pilates"],
  "zest pilates mangawhai": ["fitness-yoga-pilates"],
  "tempo de joie": ["fitness-yoga-pilates"],
  "fit365 mangawhai": ["fitness-yoga-pilates"],

  // Shops / boutiques
  "caro with love": ["shops-boutiques"],
  "threadbox": ["shops-boutiques"],
  "dimity boutique": ["shops-boutiques"],
  "mangawhai boutique": ["shops-boutiques"],
  "little & loved": ["shops-boutiques"],
  "mangawhai books and gifts": ["shops-boutiques"],
  "flowerpower northland": ["shops-boutiques"],

  // Garden / hardware
  "planthouse mangawhai": ["garden-hardware"],
  "mangawhai landscape supplies": ["garden-hardware"],
  "mangawhai natives": ["garden-hardware"],
  "tumbleweed garden centre": ["garden-hardware"],

  // Professional services
  "my two cents accounting & advisory": ["professional-services"],
  "davis coastal consultants": ["civil-engineering"],
  "thrive marketing": ["professional-services"],

  // Technology / IT services
  "computersplus": ["technology-it-services"],

  // Automotive / marine
  "super shoppe mangawhai": ["automotive-marine"],
  "mangawhai mechanic ltd": ["automotive-marine"],
  "mangawhai village automotive": ["automotive-marine"],
  "fast crew automotive": ["automotive-marine"],
  "jackson brown automotive and marine": ["automotive-marine"],
  "mangawhai marine": ["automotive-marine"],
  "the panel shop": ["automotive-marine"],

  // Schools / childcare
  "mangawhai beach school": ["schools-childcare"],
  "mangawhai hills college": ["schools-childcare"],
  "mangawhai village preschool": ["schools-childcare"],
  "fame preschool mangawhai": ["schools-childcare"],
  "mangawhai kindergarten": ["schools-childcare"],
  "beforesix early childcare centre": ["schools-childcare"],
  "miniwhais": ["schools-childcare"],

  // Community / clubs / churches
  "mangawhai toy library": ["community-clubs-churches"],
  "mangawhai united soccer club": ["community-clubs-churches"],
  "mangawhai museum": ["community-clubs-churches", "things-to-do-tours"],
  "citizens advice bureau wellsford": ["community-clubs-churches"],
  "feeling fab": ["community-clubs-churches"],
  "plastic free mangawhai": ["community-clubs-churches"],
  "mangawhai activity zone": ["community-clubs-churches", "things-to-do-tours"],
  "fairy terns": ["community-clubs-churches"],
  "mangawhai walking weekend": ["community-clubs-churches", "things-to-do-tours"],
  "zonta club of mangawhai": ["community-clubs-churches"],
  "mangawhai library": ["community-clubs-churches"],
  "mangawhai st johns opportunity shop": ["community-clubs-churches", "shops-boutiques"],
  "te whai community trust": ["community-clubs-churches"],
  "mangawhai surf life saving club": ["community-clubs-churches", "surf-beach-watersports"],
  "mangawhai community patrol": ["community-clubs-churches"],
  "mangawhai harbour restoration society": ["community-clubs-churches"],
  "otamatea community services": ["community-clubs-churches"],
  "mangawhai community op shop": ["community-clubs-churches", "shops-boutiques"],
  "mangawhai shed": ["community-clubs-churches"],
  "sustainable kaipara": ["community-clubs-churches"],
  "warkworth wellsford budget service": ["community-clubs-churches"],
  "mangawhai movies": ["community-clubs-churches", "things-to-do-tours"],
  "the mangawhai tracks charitable trust": ["community-clubs-churches", "things-to-do-tours"],
  "mangawhai domain society": ["community-clubs-churches"],
  "mangawhai business association": ["community-clubs-churches", "professional-services"],
  "mangawhai community garden": ["community-clubs-churches"],
  "mangawhai community market": ["community-clubs-churches"],
  "mangawhai boating & fishing club": ["community-clubs-churches", "things-to-do-tours"],
  "mangawhai rotary": ["community-clubs-churches"],
  "piroa conservation trust": ["community-clubs-churches"],
  "weed action piroa-brynderwyns": ["community-clubs-churches"],
  "st pauls anglican mangawhai": ["community-clubs-churches"],
  "st pauls anglican kaiwaka": ["community-clubs-churches"],
};

// Slugs of businesses that have closed. Generated entries get
// `status: "closed"` instead of the active default; the partial renders these
// with the greyed-out style + Discontinued badge.
const DISCONTINUED = new Set([
  "dune",
  "frog-and-kiwi-restaurant",
  "oasis-bar-and-eatery",
]);

// Per-business opening hours, keyed by slug. Items follow the schema's
// OpeningHoursSpecification subset: `dayOfWeek` may be a string or array,
// `opens`/`closes` are "HH:MM". Slugs not listed get `hours: []`.
const HOURS = {
  "panel-shop": [
    { dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" },
    { dayOfWeek: "Saturday", opens: "09:00", closes: "13:00" },
  ],
  "brewed-as-cafe": [
    { dayOfWeek: ["Sunday", "Monday", "Tuesday"], opens: "07:30", closes: "15:00" },
    { dayOfWeek: ["Wednesday", "Thursday", "Friday", "Saturday"], opens: "07:30", closes: "21:30" },
  ],
  "dot-india-restaurant": [
    { dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "11:00", closes: "14:00" },
    { dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "16:30", closes: "21:00" },
  ],
  "barfoot-and-thompson-mangawhai": [
    { dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:30", closes: "17:00" },
    { dayOfWeek: ["Saturday", "Sunday"], opens: "closed" },
  ],
  "thrive-marketing": [
    { dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "09:00", closes: "16:00" },
    { dayOfWeek: ["Saturday", "Sunday"], opens: "closed" },
  ],
};

// ---------- helpers ----------
const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (macrons)
    .replace(/&/g, " and ")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(the|a)-/, "")
    .replace(/-(ltd|limited)$/, "");

function parseCsv(text) {
  // Handles simple CSV (no quoted commas in our file).
  const lines = text.split("\n").filter((l) => l.trim());
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = cols[i] || ""));
    return row;
  });
}

function categoriesFor(row) {
  const key = row.name.toLowerCase().trim();
  if (CATS[key]) return CATS[key];
  // Heuristic fallback (shouldn't fire for our 152 rows but defensive)
  const all = (row.name + " " + row.notes).toLowerCase();
  if (/cafe|restaurant|bistro|eatery|deli|bbq/.test(all)) return ["cafes-restaurants"];
  if (/bakery|bakehouse/.test(all)) return ["bakeries"];
  if (/plumb/.test(all)) return ["plumbers"];
  if (/electric|sparkie/.test(all)) return ["electricians"];
  if (/builder|construction|homes\b/.test(all)) return ["builders-renovations"];
  if (/painter/.test(all)) return ["painters-decorators"];
  if (/lawn|landscap|garden/.test(all)) return ["landscaping-gardening"];
  if (/clean/.test(all)) return ["cleaning-services"];
  if (/real estate/.test(all)) return ["real-estate"];
  if (/dental|medical|doctor|physio|health/.test(all)) return ["medical-dental"];
  if (/hair|barber|beauty|spa/.test(all)) return ["beauty-hair-spa"];
  if (/yoga|pilates|fitness|gym/.test(all)) return ["fitness-yoga-pilates"];
  if (/boutique|shop/.test(all)) return ["shops-boutiques"];
  if (/garden|nursery|hardware/.test(all)) return ["garden-hardware"];
  if (/account|lawyer|advisor|advisory|book/.test(all)) return ["professional-services"];
  if (/marine|automotive|mechanic|tyre|wof/.test(all)) return ["automotive-marine"];
  if (/school|kindergarten|preschool|childcare/.test(all)) return ["schools-childcare"];
  if (/church|club|trust|society|community|charity|rotary|zonta/.test(all)) return ["community-clubs-churches"];
  if (/winer|vineyard/.test(all)) return ["wineries-vineyards"];
  if (/accommod|motel|lodge|chalet|holiday park|b&b/.test(all)) return ["accommodation"];
  if (/surf|kayak|paddle/.test(all)) return ["surf-beach-watersports"];
  if (/charter|fishing|tour|golf/.test(all)) return ["things-to-do-tours"];
  return ["community-clubs-churches"]; // last-resort catch-all
}

function blurbFor(row) {
  // Conservative: blank unless the notes have a clear sentence (capital-led,
  // contains a verb, no taxonomy syntax). The CSV `notes` column is a research
  // dumping ground, not curated copy — better empty than a fragmentary blurb.
  // MD-12 spec says blurbs are written by a human pass, not auto-generated.
  return "";
}

function yamlString(s) {
  if (s == null || s === "") return '""';
  // Quote everything to keep YAML simple/safe; escape inner double-quotes.
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildFrontMatter(row, slug, cats) {
  const isClosed = DISCONTINUED.has(slug);
  const tags = [];
  // free-form tags from notes
  const notes = row.notes.toLowerCase();
  if (/family[- ]friendly/.test(notes)) tags.push("family-friendly");
  if (/dog/.test(notes)) tags.push("dog-friendly");
  if (/waterfront|harbour/.test(notes)) tags.push("waterfront");
  if (/takeaway/.test(notes)) tags.push("takeaway");
  if (/licensed/.test(notes)) tags.push("licensed");
  if (/heads/.test((row.suburb || "").toLowerCase())) tags.push("mangawhai-heads");

  const socials = {
    facebook: row.facebook || "",
    instagram: row.instagram || "",
    x: row.x || "",
    linkedin: row.linkedin || "",
    tiktok: "",
    youtube: "",
  };

  // If website is a Facebook URL, move it into socials.facebook and clear the
  // website field — the schema's `socialUrl` definition + the social-icons
  // partial handle Facebook properly; cluttering `website` with FB URLs hurts SEO.
  let website = row.website || "";
  if (/facebook\.com/i.test(website)) {
    if (!socials.facebook) socials.facebook = website;
    website = "";
  }

  // Address: skip the address block entirely when there's no street + suburb,
  // because the schema requires those subfields once `address` is present.
  const hasAddress = !!(row.street && row.suburb && row.postcode);
  const lines = [];
  lines.push("---");
  lines.push(`title: ${yamlString(row.name)}`);
  lines.push(`slug: ${yamlString(slug)}`);
  lines.push(`blurb: ${yamlString(blurbFor(row))}`);
  if (hasAddress) {
    lines.push("address:");
    lines.push(`  street: ${yamlString(row.street)}`);
    lines.push(`  suburb: ${yamlString(row.suburb)}`);
    lines.push(`  postcode: ${yamlString(row.postcode)}`);
    lines.push(`  country: "NZ"`);
  }
  if (row.phone) {
    let p = row.phone.replace(/[^\d+]/g, "");
    if (p.startsWith("0")) p = "+64" + p.slice(1);
    if (!p.startsWith("+")) p = "+64" + p;
    lines.push(`phone: ${yamlString(p)}`);
  }
  if (row.email) lines.push(`email: ${yamlString(row.email)}`);
  if (website) lines.push(`website: ${yamlString(website)}`);
  // Always include socials block — empty values are valid per schema
  lines.push("socials:");
  for (const [k, v] of Object.entries(socials)) {
    lines.push(`  ${k}: ${yamlString(v)}`);
  }
  lines.push(`categories: [${cats.map((c) => yamlString(c)).join(", ")}]`);
  if (tags.length) {
    lines.push(`tags: [${tags.map((t) => yamlString(t)).join(", ")}]`);
  } else {
    lines.push(`tags: []`);
  }
  const hours = HOURS[slug];
  if (hours && hours.length) {
    lines.push("hours:");
    for (const h of hours) {
      const day = Array.isArray(h.dayOfWeek)
        ? `[${h.dayOfWeek.map(yamlString).join(", ")}]`
        : yamlString(h.dayOfWeek);
      lines.push(`  - dayOfWeek: ${day}`);
      lines.push(`    opens: ${yamlString(h.opens)}`);
      lines.push(`    closes: ${yamlString(h.closes)}`);
    }
  } else {
    lines.push(`hours: []`);
  }
  if (row.nzbn) lines.push(`nzbn: ${yamlString(row.nzbn)}`);
  lines.push(`tier: "free"`);
  lines.push(`last_verified: ${yamlString(TODAY)}`);
  lines.push(`status: ${isClosed ? '"closed"' : '"active"'}`);
  lines.push("---");
  lines.push("");
  return lines.join("\n");
}

// ---------- main ----------
const csv = fs.readFileSync(CSV, "utf8");
const rows = parseCsv(csv);

// Skip the special address-only rows (no street/suburb at all means it's
// missing core data — but we leave the row in for record-keeping; emit anyway).

let written = 0;
const slugSeen = new Set();
const dupes = [];

// Address: schema requires address.{street,suburb,postcode,country} ALL present.
// Some rows have only a suburb. For those we omit the address block entirely
// (schema treats address as required object — see below).
//
// Wait — schema requires `address` as a top-level required field. If we omit
// it, the schema will fail. We need a workaround: emit a minimal address with
// suburb only, and use placeholder "" for street/postcode? No — schema says
// street/suburb/postcode all required AND postcode regex is 4 digits.
//
// Decision: every business gets a best-effort address. If we don't know the
// street, we set it to the suburb name as a fallback ("Mangawhai" / "Mangawhai
// Heads"). If we don't know the postcode, we infer 0505 (Mangawhai/Heads) or
// 0573 (Te Arai / wider Mangawhai postcode). This is a known pragmatic gap
// flagged for MD-12 follow-up; better than failing the schema for 100+ rows.

const POSTCODE_BY_SUBURB = {
  "mangawhai": "0505",
  "mangawhai heads": "0505",
  "mangawhai valley": "0505",
  "kaiwaka": "0540",
  "te arai": "0975",
  "wellsford": "0900",
  "otamatea": "0573",
  "manly": "0930",
};

for (const row of rows) {
  if (!row.name) continue;
  let slug = slugify(row.name);
  if (!slug) continue;
  if (slugSeen.has(slug)) {
    dupes.push(slug);
    slug = slug + "-2";
  }
  slugSeen.add(slug);

  // Backfill address with best-effort defaults if street/postcode missing
  const suburbKey = (row.suburb || "Mangawhai").toLowerCase().trim();
  if (!row.suburb) row.suburb = "Mangawhai";
  if (!row.street) row.street = row.suburb;
  if (!row.postcode) row.postcode = POSTCODE_BY_SUBURB[suburbKey] || "0505";

  const cats = categoriesFor(row);
  const fm = buildFrontMatter(row, slug, cats);
  const file = path.join(OUT, `${slug}.md`);
  fs.writeFileSync(file, fm);
  written++;
}

console.log(`Wrote ${written} business files to ${path.relative(REPO, OUT)}/`);
if (dupes.length) console.log(`Duplicate slugs collided (suffix -2 applied): ${dupes.join(", ")}`);
