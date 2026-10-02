#!/usr/bin/env python3
"""Check a built copy of the site (the output of `hugo`). Standard library only.

    scripts/check-site.py <public-dir> --base-url URL [--build-log FILE] [--held-back CSV ...]

Prints one line per finding, as `<check>: <where>: <what>`, and exits 1 if
there are any. The lines are stable from one run to the next, so
scripts/test.sh can compare two builds and tell new findings from old ones.

What it checks, and why each one is here:

  build    every WARN or ERROR line in hugo's output. Hugo exits 0 on a
           warning, so without this a deprecation or a missing template is
           invisible until the release that turns it into an error.
  pages    every HTML page has a <html lang>, a non-empty <title> and a
           non-empty <meta name="description">. Search results and link
           previews are built from them.
  links    every internal href, src, srcset and og:image (relative,
           root-relative, or absolute on the site's own host) resolves to a
           built file, and every #fragment to an id on the target page. That
           covers missing images, stylesheets and fonts as well as links, and
           the /<category>/#<business> deep links the listings depend on.
  sitemap  sitemap.xml parses, and every <loc> is on the site's host and built.
  robots   robots.txt exists and its Sitemap: line points at the sitemap.
  llms     llms.txt has the llmstxt.org shape (H1, then a > summary) and every
           link in it resolves.
  search   index.json (the homepage search index) is a JSON array of entries
           with a name, a kind and a URL, and every URL resolves, anchor too.
  drafts   nothing `hugo list drafts|future|expired` reports was published.

External links are not fetched: the answer must be the same offline and in CI,
and another site being down is not a defect in this one.
"""

import argparse
import csv
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlparse

SKIP_SCHEMES = {"mailto", "tel", "sms", "javascript", "data", "blob"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lang = None
        self.title = None
        self._in_title = False
        self._title_buf = []
        self.description = None
        self.redirect = False
        self.ids = set()
        self.refs = []  # (tag, attr, value)

    def handle_starttag(self, tag, attrs):
        a = {k: (v if v is not None else "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title" and self.title is None:
            self._in_title = True
        elif tag == "meta":
            name = a.get("name", "").lower()
            prop = a.get("property", "").lower()
            if name == "description":
                self.description = a.get("content", "")
            elif a.get("http-equiv", "").lower() == "refresh":
                self.redirect = True
            elif prop == "og:image" or name == "twitter:image":
                self.refs.append((tag, prop or name, a.get("content", "")))
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        for attr in ("href", "src"):
            if attr in a:
                # preconnect / dns-prefetch name a host, not a file
                if tag == "link" and a.get("rel", "") in ("preconnect", "dns-prefetch"):
                    continue
                self.refs.append((tag, attr, a[attr]))
        if "srcset" in a:
            for candidate in a["srcset"].split(","):
                url = candidate.strip().split(" ")[0]
                if url:
                    self.refs.append((tag, "srcset", url))

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self._in_title = False
            self.title = "".join(self._title_buf).strip()

    def handle_data(self, data):
        if self._in_title:
            self._title_buf.append(data)


def url_path_for(root, file_path):
    """The URL path a built file is served at."""
    rel = os.path.relpath(file_path, root).replace(os.sep, "/")
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[: -len("index.html")]
    return "/" + rel


def resolve(root, url_path):
    """The built file a URL path is served from (GitHub Pages rules), or None."""
    path = unquote(url_path)
    candidate = os.path.normpath(os.path.join(root, path.lstrip("/")))
    if candidate != root and not candidate.startswith(root + os.sep):
        return None
    for option in (candidate, os.path.join(candidate, "index.html"), candidate + ".html"):
        if os.path.isfile(option):
            return option
    return None


class Site:
    def __init__(self, root, base_url):
        self.root = root
        b = urlparse(base_url)
        self.scheme, self.host = b.scheme, b.hostname
        self.base_path = b.path or "/"
        self.pages = {}
        for dirpath, _, files in os.walk(root):
            for name in files:
                if name.endswith(".html"):
                    full = os.path.join(dirpath, name)
                    parser = Page()
                    with open(full, encoding="utf-8", errors="replace") as fh:
                        parser.feed(fh.read())
                    self.pages[full] = parser

    def check_url(self, from_path, value):
        """None if `value`, linked from `from_path`, is fine or not ours to
        check; otherwise what is wrong with it."""
        value = value.strip()
        if not value or value.startswith("#") and len(value) == 1:
            return None
        if value.startswith("//"):
            value = self.scheme + ":" + value
        u = urlparse(urljoin(f"{self.scheme}://{self.host}{from_path}", value))
        if u.scheme in SKIP_SCHEMES or u.scheme not in ("http", "https") or u.hostname != self.host:
            return None
        target = resolve(self.root, u.path or "/")
        if target is None:
            return "not built"
        if u.fragment and target in self.pages and unquote(u.fragment) not in self.pages[target].ids:
            return f"no id {unquote(u.fragment)!r} on {url_path_for(self.root, target)}"
        return None


def main(argv):
    ap = argparse.ArgumentParser(description="Check a built copy of the site.")
    ap.add_argument("public", help="the directory hugo built into")
    ap.add_argument("--base-url", required=True, help="the site's baseURL, e.g. https://example.org/")
    ap.add_argument("--build-log", help="hugo's output; every WARN/ERROR line is a finding")
    ap.add_argument("--held-back", nargs="*", default=[], metavar="CSV",
                    help="output of `hugo list drafts|future|expired`")
    args = ap.parse_args(argv[1:])

    root = os.path.realpath(args.public)
    if not os.path.isfile(os.path.join(root, "index.html")):
        print(f"check-site: {root} has no index.html; build the site first", file=sys.stderr)
        return 2

    site = Site(root, args.base_url)
    findings = []
    add = lambda check, where, what: findings.append(f"{check}: {where}: {what}")

    # build ------------------------------------------------------------------
    if args.build_log:
        with open(args.build_log, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if re.match(r"^(WARN|ERROR)\b", line):
                    # Drop hugo's timestamps and durations so the line is stable.
                    add("build", "hugo", re.sub(r"\s+", " ", line.strip()))

    # pages ------------------------------------------------------------------
    real_pages = 0
    for full, p in sorted(site.pages.items()):
        where = url_path_for(root, full)
        if p.redirect:  # an alias stub: Hugo writes one per old URL
            continue
        if where.startswith("/admin/"):  # the CMS app shell, not a site page
            continue
        real_pages += 1
        if not p.lang:
            add("pages", where, "no <html lang>")
        if not p.title:
            add("pages", where, "no <title>")
        if not (p.description or "").strip():
            add("pages", where, "no meta description")

    # links ------------------------------------------------------------------
    refs = 0
    for full, p in sorted(site.pages.items()):
        where = url_path_for(root, full)
        for tag, attr, value in p.refs:
            refs += 1
            problem = site.check_url(where, value)
            if problem:
                add("links", where, f"<{tag} {attr}={value!r}> {problem}")

    # sitemap ----------------------------------------------------------------
    sitemap = os.path.join(root, "sitemap.xml")
    locs = 0
    if not os.path.isfile(sitemap):
        add("sitemap", "/sitemap.xml", "not built")
    else:
        try:
            for loc in ET.parse(sitemap).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc"):
                locs += 1
                text = (loc.text or "").strip()
                u = urlparse(text)
                if u.hostname != site.host or u.scheme != site.scheme:
                    add("sitemap", "/sitemap.xml", f"{text} is not on {site.scheme}://{site.host}")
                elif resolve(root, u.path) is None:
                    add("sitemap", "/sitemap.xml", f"{text} is listed but not built")
            if locs == 0:
                add("sitemap", "/sitemap.xml", "lists no URLs")
        except ET.ParseError as exc:
            add("sitemap", "/sitemap.xml", f"does not parse: {exc}")

    # robots -----------------------------------------------------------------
    robots = os.path.join(root, "robots.txt")
    want = f"{site.scheme}://{site.host}{site.base_path.rstrip('/')}/sitemap.xml"
    if not os.path.isfile(robots):
        add("robots", "/robots.txt", "not built")
    else:
        with open(robots, encoding="utf-8") as fh:
            lines = [l.strip() for l in fh]
        maps = [l.split(":", 1)[1].strip() for l in lines if l.lower().startswith("sitemap:")]
        if want not in maps:
            add("robots", "/robots.txt", f"no 'Sitemap: {want}' line (has {maps or 'none'})")
        if not any(l.lower().startswith("user-agent:") for l in lines):
            add("robots", "/robots.txt", "no User-agent line")

    # llms -------------------------------------------------------------------
    llms = os.path.join(root, "llms.txt")
    llms_links = 0
    if not os.path.isfile(llms):
        add("llms", "/llms.txt", "not built")
    else:
        with open(llms, encoding="utf-8") as fh:
            text = fh.read()
        body = [l for l in text.splitlines() if l.strip()]
        if not body or not body[0].startswith("# "):
            add("llms", "/llms.txt", "does not start with an H1 ('# Title')")
        if len(body) < 2 or not body[1].startswith("> "):
            add("llms", "/llms.txt", "second block is not a '> summary' line")
        for url in re.findall(r"\]\(([^)\s]+)\)", text):
            llms_links += 1
            problem = site.check_url("/llms.txt", url)
            if problem:
                add("llms", "/llms.txt", f"{url} {problem}")

    # search -----------------------------------------------------------------
    index = os.path.join(root, "index.json")
    entries = 0
    if not os.path.isfile(index):
        add("search", "/index.json", "not built")
    else:
        try:
            with open(index, encoding="utf-8") as fh:
                data = json.load(fh)
            if not isinstance(data, list) or not data:
                add("search", "/index.json", "is not a non-empty JSON array")
                data = []
            for i, e in enumerate(data):
                entries += 1
                label = e.get("n") if isinstance(e, dict) else None
                if not isinstance(e, dict) or not e.get("n") or e.get("k") not in ("b", "c") or not e.get("u"):
                    add("search", "/index.json", f"entry {i} lacks a name, a kind (b/c) or a URL: {e!r}")
                    continue
                problem = site.check_url("/", e["u"])
                if problem:
                    add("search", "/index.json", f"{label!r} -> {e['u']} {problem}")
        except (ValueError, OSError) as exc:
            add("search", "/index.json", f"does not parse: {exc}")

    # drafts -----------------------------------------------------------------
    held = 0
    for path in args.held_back:
        with open(path, encoding="utf-8", newline="") as fh:
            for row in csv.DictReader(fh):
                held += 1
                u = urlparse(row.get("permalink") or "")
                if u.path and resolve(root, u.path):
                    add("drafts", row.get("path", "?"), f"is draft, future or expired but {u.path} was built")

    for line in findings:
        print(line)
    print(f"check-site: {real_pages} pages, {refs} internal and external references, "
          f"{locs} sitemap URLs, {llms_links} llms.txt links, {entries} search entries, "
          f"{held} held-back pages; {len(findings)} finding(s)", file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
