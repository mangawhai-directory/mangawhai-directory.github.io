# Scripts

Validation and tooling scripts for the Mangawhai Directory.

## validate-businesses.mjs

Validates every `content/businesses/*.md` against `schemas/business.schema.json`
and runs structural checks not expressible in JSON Schema (slug uniqueness,
filename match, category existence, phone/postcode/email/URL format,
`last_verified` age).

### Run

```sh
cd scripts && npm install     # first time only
node scripts/validate-businesses.mjs           # human-readable
node scripts/validate-businesses.mjs --json    # JSON output for CI
```

Exit code: `0` clean, `1` if any **error** (warnings alone do not fail).

### What it checks

| Rule | Severity |
|---|---|
| JSON Schema (required fields, formats, enums) | error |
| `slug` matches filename stem | error |
| `slug` unique across all business files | error |
| Each `categories[]` entry has a directory under `content/categories/` | error |
| `phone` matches `^\+64\d{8,10}$` | error |
| `address.postcode` is 4 digits | error |
| `email` matches a basic RFC regex | error |
| `website` and `socials.*` start with `http://` or `https://` | error |
| `website` and `socials.*` are full URLs (contain `/`) | error |
| `socials.*` uses `http://` instead of `https://` | warning |
| `last_verified` older than 12 months | warning |
| `last_verified` older than 24 months | error |

### Performance

Validates 300 business files in ~0.4s.
