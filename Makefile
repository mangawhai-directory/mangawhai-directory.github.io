# Mangawhai Directory
#
# New clone? One command:
#
#   make setup      checks Hugo, Node and Python, installs the Node packages,
#                   and tells you what is left
#
# Then day to day:
#
#   make serve      run the site at http://localhost:1313/ with live reload
#                   (make serve PORT=1314 if 1313 is taken)
#   make test       validate the listings, build, and check the built site
#   make build      build the site into public/, as the deploy does
#   make status     what is installed, running and checked out
#
# Everything runs on this machine: Hugo plus Node for Tailwind. No container,
# no database. A push to main DEPLOYS THE LIVE SITE — work on a branch and open
# a pull request.

SHELL := bash
.DEFAULT_GOAL := help
PORT ?= 1313
.PHONY: setup check build serve test status worker-reset help

# ── setup ───────────────────────────────────────────────────────────────────

setup: ## Set this clone up (idempotent — safe to re-run)
	@scripts/setup.sh

check: ## Check setup and versions without changing anything
	@scripts/setup.sh --check

# ── day to day ──────────────────────────────────────────────────────────────

serve: ## Run the site locally with live reload (PORT=1313; Ctrl-C stops it)
	@scripts/setup.sh --check >/dev/null || { echo "not set up — run: make check"; exit 1; }
	@! (exec 3<>/dev/tcp/127.0.0.1/$(PORT)) 2>/dev/null \
		|| { echo "port $(PORT) is already in use — try: make serve PORT=$$(( $(PORT) + 1 ))"; exit 1; }
	@npm run --silent dev -- --bind 127.0.0.1 --port $(PORT) $(ARGS)

build: ## Build the site into public/, as the deploy does
	@scripts/setup.sh --check >/dev/null || { echo "not set up — run: make check"; exit 1; }
	@npm run --silent build

test: ## Validate listings, build, check the output (BASE=origin/main: new findings only)
	@scripts/test.sh $(if $(BASE),--base $(BASE))

status: ## What is installed, running and checked out
	@printf '  setup      '; scripts/setup.sh --check >/dev/null 2>&1 \
		&& echo 'ok' || echo 'incomplete     → make check'
	@printf '  branch     %s' "$$(git branch --show-current)"; \
		git rev-parse -q --verify origin/main >/dev/null \
		&& printf ', %s behind / %s ahead of origin/main (as of the last fetch)\n' \
			"$$(git rev-list --count HEAD..origin/main)" "$$(git rev-list --count origin/main..HEAD)" \
		|| echo
	@printf '  changes    %s uncommitted\n' "$$(git status --porcelain | wc -l)"
	@printf '  port %-5s ' $(PORT); (exec 3<>/dev/tcp/127.0.0.1/$(PORT)) 2>/dev/null \
		&& echo 'in use (make serve, or something else)' || echo 'free           → make serve'
	@printf '  helper     '; scripts/worker.sh status 2>/dev/null | sed -n 2p | sed 's/^ *//' | grep . \
		|| echo 'none           → make worker-reset BRANCH=<name>'

# ── helper checkout (maintainers' helper agents) ────────────────────────────

worker-reset: ## Put the helper checkout on a fresh BRANCH from origin/main
	@test -n "$(BRANCH)" || { echo "usage: make worker-reset BRANCH=md-123-short-slug"; exit 1; }
	@scripts/worker.sh reset $(BRANCH)

# ── help ────────────────────────────────────────────────────────────────────

help: ## List these targets
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  make %-13s %s\n", $$1, $$2}'
