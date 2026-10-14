# CLAUDE.md

Guidance for Claude Code working in this repository. Everything here was checked against the
repository or by running it. If something you find contradicts it, say so rather than guessing which
is right.

## What this is

Mangawhai Directory, https://mangawhaidirectory.co.nz/: a free local business directory for
Mangawhai, Mangawhai Heads, Te Arai and Kaiwaka. It is a Hugo site with no theme (the layouts are
in this repository) and Tailwind CSS v4. Content is in Markdown with YAML front matter: about 490
listings in `content/businesses/` and about 48 categories in `content/categories/`. Most of it is
edited by people who are not developers, through a CMS that commits to this repository.

**This repository is public.** Everything committed is published. Never commit a credential, and
do not put private notes, plans or anything about the people behind the site into it.

## A push to main deploys the live site

`.github/workflows/hugo.yaml` builds with Hugo 0.165.0 extended and Node 24 and deploys to GitHub
Pages on **every push to `main`**. A merge is a release, and so is every CMS save (see below).
Work on a branch and open a pull request. Never push to `main`, never trigger that workflow by
hand, and never merge without being told to.

## Where it runs, and the commands

On the host. No container, no database, no server process of its own. You need Hugo (the version
and edition the deploy uses), Node 24 (for Tailwind), npm, git and Python 3 (for the site checks).

| Command | Does |
|---|---|
| `make setup` | installs the Node packages for the build (`node_modules/`) and the validator (`scripts/node_modules/`); idempotent; stops at the first thing only a person can do |
| `make check` | the same checks, changes nothing; fails loudly if Hugo or Node here, or in any workflow, differs from the deploy |
| `make serve` | `hugo server` on http://localhost:1313/ with live reload (`make serve PORT=1314` if 1313 is taken) |
| `make build` | `npm run build` (`hugo --gc --minify`) into `public/`, as the deploy does |
| `make test` | validate every listing, production build, check the built site — strict: any finding fails |
| `make test BASE=origin/main` | the same, but fails only on findings `origin/main` does not already have. **Use this one to judge your own change.** CI runs it |
| `make status` | setup, branch against `origin/main`, uncommitted changes, the port, the helper checkout |

`npm run build` and `npm run dev` still work and are what `make build` and `make serve` call.

### What `make test` checks

1. **validate** — `scripts/validate-businesses.mjs`: every listing against
   `schemas/business.schema.json`, plus slug matches filename, slugs unique, categories exist,
   phone (`+64…`), postcode, email, URL scheme, and `last_verified` age (warning at 12 months,
   error at 24). Warnings never fail.
2. **build** — `hugo --gc --minify` into `.cache/test/` with path and i18n warnings on; any `WARN`
   or `ERROR` line fails, because Hugo itself exits 0 on a warning.
3. **site** — `scripts/check-site.py` over that build: every page has `lang`, a title and a meta
   description; every internal link, image, stylesheet, font, `srcset` and `og:image` resolves, and
   every `#anchor` exists on its target page; `sitemap.xml` parses and lists only built pages;
   `robots.txt` names the sitemap; `llms.txt` has its H1 and summary and its links resolve;
   `index.json` (the search index) is well formed and every entry's URL and anchor resolves; and
   nothing `hugo list drafts|future|expired` reports was published. External links are not fetched.

It takes about 3 seconds strict and 5–11 seconds with `BASE` (the base is built too). **On
`origin/main` today strict mode fails**: some listings fail the validator (mismatched slugs, a
duplicate slug, an unknown category). Those are content defects to fix through the CMS or a
content change, not something to work around in the checks.

`BASE` exists because the CMS changes `main` all day and some listings there already fail. A change
to one listing or one template should be told what *it* broke. The base is exported with
`git archive` into `.cache/test/base-src` and judged by **this** checkout's checkers and schema, so
the two sides differ only in the site.

## The content model

**Listings** are `content/businesses/<file>.md`. The section's `_index.md` cascades
`build: {render: never, list: always}`, so **a listing has no page of its own**. It appears as a
card on each of its category pages, at `/categories/<category>/#<file>` — the anchor is the
*filename* (`.File.BaseFileName`), used by `layouts/partials/business-entry.html`,
`layouts/categories/term.html` (JSON-LD `@id`) and `layouts/index.json` (search). Renaming a file
breaks deep links and search results.

The `slug` front-matter field does **not** set a URL here. It is only sent to analytics as
`data-listing-slug` (falling back to the filename when empty). The validator requires it to equal
the filename, and some listings on `main` fail that today.

The fields are defined by `schemas/business.schema.json`; `archetypes/businesses.md` scaffolds a
new one. `status: closed` keeps a listing in the repository but out of category pages, counts, the
search index and `llms.txt`. `tier: paid` with an `image` shows the image. `categories` needs at
least one entry, each the name of a directory under `content/categories/`; the CMS allows at most
three, the schema sets no maximum.

**Categories** are `content/categories/<slug>/_index.md` and are also Hugo's `categories`
taxonomy, so the directory name is the term. `layouts/categories/term.html` renders the page from
every listing whose `categories` contains that term. `hidden: true` keeps a category's page but
removes it from the home page, `llms.txt`, related-category links and the category list. `aliases`
redirect old URLs (about 19 today) — removing one breaks old links. `related` drives the
"related categories" chips, one direction only. The meta description of a category page is
generated from the name and the listing count (`layouts/partials/seo-description.html`) unless
`description` is set.

**Pages**: `content/_index.md` (home heading and tagline), `advertise.md`, `contact.md`,
`privacy.md`, `terms.md`, `thanks.md`. **Data**: `data/ads.yaml` (ad slots: the home tile and
per-category banners) and `data/rates.yaml` (read by the `pricing-cards` and `rate-steps`
shortcodes on the advertise page), both read with `hugo.Data`.

## The CMS, and what it commits

Sveltia CMS, served from `static/admin/` at `/admin/`. `index.html` loads it from unpkg **without
a pinned version**, so a new release can change behaviour with no commit here (it has broken the
config once before). `config.yml`:

- `backend: github`, `branch: main`, and no `publish_mode`, which is Sveltia's simple mode: **every
  save is a commit straight to `main`, and so a deploy.** There is no review step for CMS edits.
- Commits read `Create Business “<file>”`, `Update Business “<file>”`, `Delete Business “<file>”`,
  `Update Category “<slug>”`, `Update Pages “home”`, and are authored by a dedicated GitHub account
  rather than a person.
- Uploads go to `static/uploads/` and are referenced as `/uploads/<name>`.
- New listing filenames come from the **title**, slugified (`Andra's Flowers` →
  `andra-s-flowers.md`), not from the `slug` field — despite the field's hint. Editing a slug in the
  CMS does not rename the file, which is how the slug/filename mismatches arose.
- There are a few open pull requests from `cms/*` branches, left from an earlier editorial-workflow
  setup. Leave them alone.

Because CMS commits do not go through pull requests, the pull-request check below never sees them.
The `Site checks` workflow (`.github/workflows/site-checks.yml`) also runs on every push to `main`,
with the previous commit as the base, so a CMS
save that breaks something shows a red check on that commit — after it has deployed.

## Layouts and the Tailwind pipeline

`layouts/_default/baseof.html` holds the `<head>`: title, the meta description from
`partials/seo-description.html`, canonical, `hreflang`, Open Graph, and — only when
`hugo.IsProduction` — Google Analytics plus the ad and listing click tracking partials. `make serve`
runs in the development environment, so local browsing sends nothing to analytics; a production
build includes the tag.

CSS is `assets/css/main.css`, a Tailwind v4 entry (`@import "tailwindcss"`, `@source` over
`layouts/` and `content/`). `baseof.html` pipes it through Hugo's `css.TailwindCSS`, which runs the
Tailwind CLI from `node_modules/.bin` — hence `npm ci` before any build. Tailwind emits only classes
it finds written out in those files: a class assembled at render time is never generated (the
listing image uses an inline style for this reason). Production builds fingerprint the CSS.

## Traps that do not announce themselves

- **`[security.exec]` in `hugo.toml` replaces Hugo's whole allow-list.** It repeats the defaults and
  adds `tailwindcss`, which Hugo 0.165 dropped from its defaults. Remove `tailwindcss` and the CSS
  build fails; add a tool without repeating the defaults and something else does.
- **`markup.goldmark.renderer.unsafe = true`**: raw HTML in Markdown is rendered as-is. That
  includes Markdown edited in the CMS (page bodies, category intros), so anyone with CMS access can
  put arbitrary HTML, scripts included, on the live site.
- **Custom output formats on the home page**: `[outputs] home = ["html", "rss", "llms", "json"]`.
  `llms` is a plain-text format with `baseName = "llms"`, rendered by `layouts/index.llms.txt` to
  `/llms.txt`; `json` is rendered by `layouts/index.json` to `/index.json`, the search index the
  home page downloads (its keys are one letter to keep it small). Taxonomy and term pages are HTML
  only. A new home-page template must not collide with either name.
- **`locale = "en-nz"` and `defaultContentLanguage = "en"`** — the language code stays `en` while
  the locale is New Zealand. `<html lang="en-NZ">`, `hreflang` and `og:locale` are written by hand in
  `baseof.html`, not derived from config, so changing one does not change the others.
- **`scripts/generate-businesses.mjs` is a one-time seeding script.** It reads
  `_research/businesses-master.csv`, which is not in the repository, and **overwrites**
  `content/businesses/<slug>.md` unconditionally. Do not run it: it would wipe every CMS edit to
  the listings it writes. It also guessed missing data (street set to the suburb, postcode inferred
  from it), so seeded listings may carry those placeholders.
- **`hugo` installed as a snap cannot see `/tmp`.** A snap gets a private `/tmp`, so a build with
  `--destination /tmp/…` "succeeds" into a directory nothing else can read. That is why the test
  build goes into `.cache/`.
- **`.devcontainer/` is not held to the deploy's versions.** It installs Hugo `latest` and Node
  `lts`; `make check` warns about it.

## Conventions

- Commit messages are one plain imperative sentence, capitalised, no prefix and no full stop:
  `Keep deep-linked anchors clear of the sticky header`, `Use hugo.Data instead of the deprecated
  site.Data`. A body says why when it is not obvious.
- No AI attribution in commits or pull requests.
- Template comments explain *why*, at length, at the top of the file or block. Keep that up.
- Do not change listing content to make a check pass unless the task is the content fix itself.

## How maintainers plan and dispatch work

The maintainers track work in **Houston**, a task tracker, under project code **MD** (tasks
`MD-123`, epics `MD-E-12`). Work falls in one of two lanes:

- **Content — the `susan` lane:** listings, categories, page copy, the advertise page's wording.
- **Engineering — the `dave` lane:** templates, the build, the Tailwind pipeline, validation, the
  CMS configuration, CI and tooling.

A helper agent works in a separate clone, never in the maintainer's working tree:

```bash
make worker-reset BRANCH=md-123-short-slug     # create or reset ../.worker/mangawhai-directory
scripts/worker.sh run make test BASE=origin/main   # run anything there
scripts/worker.sh status
```

`worker-reset` clones the first time, then discards the last task's changes, untracked files and
branches, puts the clone on a fresh branch from `origin/main` (not tracking it), reinstalls Node
packages only if a lockfile changed, and installs a pre-push hook that refuses any push to `main`.
Run `scripts/worker.sh` from the owning checkout; from inside the helper it refuses and names the
right one.

`scripts/houston.sh task MD-123` prints a task's brief, and `comment`, `checkpoint`, `decision` and
`status` record against it. It needs a lane token in `.houston.local.json` (gitignored) or
`CT_AUTH_TOKEN`; without one it stops and says so, and it never borrows another credential.
