#!/usr/bin/env bash
# Headless Chrome, used to render the media kit and advertiser reports to PDF
# (.dontcheckin/media-kit/build.sh and reporting/report.py --pdf).
#
# Ubuntu's `chromium` package is a snap wrapper and does not work in a
# container, so this installs Google's own .deb — the same binary those scripts
# were written against, and the one the layout was designed in.
set -euo pipefail

if command -v google-chrome >/dev/null 2>&1; then
  echo "google-chrome already present: $(google-chrome --version)"
  exit 0
fi

DEB="$(mktemp -d)/chrome.deb"
curl -fsSL -o "$DEB" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt-get update -qq
# Installing the .deb by path lets apt resolve its dependencies.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$DEB" poppler-utils
rm -rf "$(dirname "$DEB")"
echo "installed: $(google-chrome --version)"
