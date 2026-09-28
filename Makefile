# moul/gnosnake — run `make` for the list.
#
# Two things are needed on the machine: a `gno` toolchain, and GNOROOT pointing
# at a gnolang/gno checkout for the stdlibs. Everything else (every gno.land
# dependency) is committed under vendor/, so no target here needs the network.
#
# Every recipe is one line. When something takes more than a line it goes in
# scripts/, where it can be read, given a flag, and run on its own.

GNOROOT ?= $(HOME)/p/gh/gnolang/gno
export GNOROOT

REALM  := $(shell sed -n 's/^module = "\(.*\)"/\1/p' r/moul/gnosnake/gnomod.toml)
KEY    ?= moul
ADDR   ?= g1manfred47kzduec920z88wfr64ylksmdcedlf5
CHAIN  ?= gnoland-1
REMOTE ?= https://rpc.gno.land:443

.DEFAULT_GOAL := help
.PHONY: help deps guards lint test repin stage dev web publish-print republish-print clean ci

help: ## show this help
	@awk 'BEGIN{FS=":.*?## "} /^##@/{printf "\n%s\n",substr($$0,5)} /^[a-z][a-z-]*:.*?## /{printf "  %-18s %s\n",$$1,$$2}' $(MAKEFILE_LIST)

##@ The gate: green before every commit, and exactly what CI runs

ci: guards lint test ## everything CI runs, in CI's order

guards: ## the five checks gno lint cannot make; see scripts/guards.sh
	@./scripts/guards.sh

lint: ## gno lint every package this repository owns
	@gno lint ./p/... ./r/...

test: ## gno test every package this repository owns
	@gno test ./p/... ./r/...

##@ Writing code

deps: ## fill vendor/ from GNOROOT, so no build needs the chain
	@./scripts/vendor.sh

repin: ## regenerate the pinned Render output, then read the diff
	@python3 scripts/repin.py

dev: ## a local chain with these packages loaded, at http://127.0.0.1:8888
	@gnodev -no-watch=false p/moul/gnosnake r/moul/gnosnake

##@ Deploying

stage: ## build _stage/: what actually goes on chain, tests stripped, plus the /preview twin
	@./scripts/stage.sh

publish-print: stage ## print the publish report and the script, and run nothing
	@gnopm -C _stage publish -print -addr $(ADDR)

publish.sh: stage ## write just the runnable script, ready to read and then run
	@./scripts/publish-script.sh $(ADDR)

republish-print: stage ## print the transaction that redeploys the private /preview twin
	@gnopm -C _stage publish -print -republish $(REALM)/preview -addr $(ADDR)

##@ The web front-end

web: ## serve web/ at http://127.0.0.1:8080 (static: no build, no node_modules)
	@python3 -m http.server -d web 8080

clean: ## remove everything a target can rebuild
	@rm -rf _stage .gnopm
