# Mangawhai Directory

The source of https://mangawhaidirectory.co.nz/, a free local business directory for Mangawhai,
Mangawhai Heads, Te Arai and Kaiwaka. A [Hugo](https://gohugo.io/) site with Tailwind CSS v4,
deployed to GitHub Pages.

## Set up

You need **Hugo 0.165.0 extended**, **Node 24** with npm, **git** and **Python 3**. The versions are
the ones the deploy uses; `make check` tells you if yours differ.

```bash
make setup     # installs the Node packages; safe to re-run
```

That is all. There is no database and nothing else to start.

## Run it

```bash
make serve     # http://localhost:1313/ with live reload; make serve PORT=1314 if 1313 is taken
```

`npm run dev` does the same. Listings have no page of their own: each appears on its category pages,
at `/categories/<category>/#<listing-file-name>`.

## Test it

```bash
make test                    # every check; any finding fails
make test BASE=origin/main   # fails only on findings that main does not already have
```

`make test` validates every listing's front matter against `schemas/business.schema.json`, builds
the site for production (failing on any Hugo warning), and then checks the built site: page titles
and descriptions, internal links and anchors, images, `sitemap.xml`, `robots.txt`, `llms.txt`, the
search index and that no draft or future-dated page was published. It takes a few seconds.

Some listings on `main` fail the validator today, so plain `make test` does not pass there yet;
`make test BASE=origin/main` is the check to run on your own change, and the one pull requests get.

`make build` builds into `public/` exactly as the deploy does (`npm run build`).

## Change it

- **Listings, categories and pages** are usually edited in the CMS at `/admin/`, which commits
  straight to `main`. To change them by hand, edit `content/businesses/*.md` or
  `content/categories/<slug>/_index.md`; `archetypes/businesses.md` shows every field.
- **Templates** are in `layouts/`, styles in `assets/css/main.css`, ads and rates in `data/`.
- Work on a branch and open a pull request. The **Site checks** workflow runs `make test` against
  the pull request's base.

## Release

**Every push to `main` is a release.** `.github/workflows/hugo.yaml` builds and deploys the site to
GitHub Pages on each one, including every save in the CMS. Merging a pull request publishes it
in about a minute (recent deploys took 33–72 seconds). There is no staging site; `make serve` and `make build` are the preview.

## More

- [`CLAUDE.md`](CLAUDE.md) — how the site works in detail: the content model, the CMS, the build,
  and the traps.
- [`scripts/README.md`](scripts/README.md) — the listing validator.
- `make help` — every command.
