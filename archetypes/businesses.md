---
title: "{{ replace .File.ContentBaseName `-` ` ` | title }}"
slug: "{{ .File.ContentBaseName }}"
blurb: ""
address:
  street: ""
  suburb: ""
  postcode: ""
  country: "NZ"
geo:
  lat: 0.0
  lng: 0.0
phone: ""
email: ""
website: ""
socials:
  facebook: ""
  instagram: ""
  x: ""
  linkedin: ""
  tiktok: ""
  youtube: ""
categories: []
tags: []
hours: []
nzbn: ""
logo: ""
featured: false
tier: "free"
last_verified: "{{ now.Format `2006-01-02` }}"
status: "active"
---

<!--
Optional 1–2 sentence description in the body. The `blurb` above is what
renders on the category page; this body is currently unused (no per-business
page in v1) but kept for future use without re-importing.
-->
