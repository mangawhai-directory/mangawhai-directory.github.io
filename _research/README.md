# Mangawhai businesses — research master list

This directory holds the working research file used to populate
`content/businesses/*.md` (MD-12). It is **input data only** — the published
directory site does not read from this folder.

## Files

- `businesses-master.csv` — the master list. One row per business.

## Schema (CSV columns)

`name, trading_name, nzbn, street, suburb, postcode, phone, email, website, facebook, instagram, x, linkedin, sources, last_seen_date, notes`

Empty cells mean unknown — never fabricated. The `sources` column lists the
discovery source(s); `last_seen_date` is when the row was last touched.

## Coverage

- **Total rows:** 152
- **Categories represented:** all 26 from MD-E-1's taxonomy
- **Suburbs:** Mangawhai, Mangawhai Heads, Te Arai, Kaiwaka, Wellsford
  (cross-references), Mangawhai Valley
- **Acceptance:** 100% of rows have `name` + `suburb` + at least one of
  `phone`/`email`/`website`. For 16 rows where the only known web presence is
  a Facebook page, the Facebook URL is also placed in `website` and the
  `notes` column flags this — those rows need a phone or proper website
  before publication.

## Sources used (authority-ranked, MD-3 source list)

| # | Source | Used? | Notes |
|---|---|---|---|
| 1 | NZBN register / Companies Office | ❌ | Not exhausted in this pass — no NZBN values populated. Recommend a follow-up batch run against `nzbn.govt.nz` to add legal entity authority before publication. |
| 2 | Kaipara District Council registers (food premises, alcohol) | ❌ | Not used — KDC does not publish a public food premises register that's easily scraped. Recommend a council request for the alcohol licensee list. |
| 3 | Mangawhai Business Association (mangawhai.co.nz) | ⚠️ Partial | The association's home page lists membership info but not a public member directory. The `/business-services` URL 404'd. Member list is members-only or behind login. Direct contact: `hello@mangawhai.co.nz`. |
| 4 | Google Maps | ❌ | Not exhausted. Web search queries surfaced map-listed businesses indirectly. A future pass should sweep Google Maps by category for completeness, particularly for trades that don't show up in tourist-facing aggregators. |
| 5 | mangawhai.co.nz, Mangawhai Focus | ⚠️ Partial | mangawhai.co.nz used for Business Association data only. Mangawhai Focus advertiser pages not crawled. |
| 6 | Facebook Pages | ✅ | Many small businesses (especially food trucks, beauticians, single-operator services) appear here as their primary web presence. 16 rows use a Facebook URL as their `website`. |
| 7 | Yellow / Finda / Localist | ❌ | Yellow returned 403 (bot detection). Finda hit indirectly (one row, My Two Cents). |
| 8 | mangawhaiinfo.co.nz Community Organisations | ✅ | Source of all 36 community/club/church entries — captures non-commercial entities the directory needs to feel locally legitimate. |
| 9 | Tripadvisor | ✅ | Restaurants list, fishing charters, accommodation. Limited contact info available; cross-checked against other sources where possible. |
| 10 | wanderlog.com (`where to eat-best-restaurants-in-mangawhai`) | ✅ | Highest-yield source for restaurant addresses + phones in this pass. |
| 11 | mangawhaiheadsholidaypark.co.nz/best-places-to-eat-in-mangawhai | ✅ | Cross-referenced restaurant addresses + websites. |
| 12 | Direct vendor websites (DEC, Pierce, Oakland, Bayleys, Bennetts, etc.) | ✅ | Where a known vendor name surfaced via search, the website was confirmed. |

## Known coverage gaps

1. **NZBN identifiers missing** — none populated. MD-9 schema accepts NZBN as
   optional; for trust signal, a follow-up batch query against
   `nzbn.govt.nz` should backfill at least the larger commercial entities
   (real estate offices, builders, motels).
2. **Direct phone numbers missing for many trades** — Many trade businesses
   (plumbers, electricians, painters, gardeners) have only websites; the
   phone was not always extractable from search snippets. Phone capture
   needs a per-website fetch pass before publication so a user clicking
   "phone" actually rings the right number.
3. **Email addresses missing for almost all rows** — most NZ small businesses
   route inquiries through web forms or Facebook Messenger rather than
   public email. Schema makes email optional; this is acceptable.
4. **Trading status not verified** — none of the rows have been confirmed
   as "actively trading right now". MD-3 spec's heuristic (Google reviews
   silent >12mo + no FB activity + no website → flag `possibly_closed`)
   was not applied per-row. Recommend a Google Reviews + Facebook recency
   sweep before publication, especially for hospitality (high churn).
5. **Hours not captured** — none of the rows have opening hours. Per the
   business schema, `hours` is optional; it's a per-website fetch task
   for whichever rows are promoted to published `.md` files.
6. **Possible duplicates flagged in `notes`:**
   - "Frog & Kiwi Restaurant" + "The Corner Bistro" share a phone
     (+6494314439) and address (6 Molesworth Drive). One is likely the
     current trading name; verify before MD-12.
   - "The Dune" + "No8 Mangawhai" share an address (40 Moir Street).
   - "Super Shoppe Mangawhai" + "Jackson Brown Automotive and Marine"
     are predecessor/successor brands of the same operation; "Mangawhai
     Marine" is the marine-side spin-off. Decide whether to publish one
     entry or three.
7. **Geographic boundary** — most rows are clearly Mangawhai or Mangawhai
   Heads. A few border-case suburbs (Te Arai, Kaiwaka, Pakiri, Wellsford,
   Warkworth) appear where the operator services Mangawhai but is based
   adjacent. The `notes` column flags those that need editorial decision
   on whether to include in v1.

## What MD-12 should do with this list

1. Cross-check each row against Google / Facebook for trading status and
   contact freshness.
2. Resolve the duplicates (Frog & Kiwi vs Corner Bistro; Dune vs No8;
   Jackson Brown trio).
3. For each surviving row, run `hugo new content businesses/<slug>.md` and
   merge in the data from this CSV plus any new info gathered.
4. Set `last_verified` to the date of the per-row verification, not
   `2026-05-03` (which is when the row first entered this CSV).
5. Run `node scripts/validate-businesses.mjs` after each batch — the
   validator will fail rows with a Facebook URL in `website` if the URL
   doesn't end in `/` or contains `search/top` (the The Cove row will
   fail until verified).

## Re-running this research

The web-fetch + web-search activity used to compile this list is captured
in the conversation log. To re-run for a coverage update, the most
productive sources to hit first are: wanderlog.com restaurants page,
mangawhaiheadsholidaypark.co.nz/best-places-to-eat, mangawhaiinfo.co.nz
community-organisations, plus category-targeted Google searches for
each of the 26 categories. Allow ~4 hours of human time; this pass took
roughly 90 minutes of agent time.
