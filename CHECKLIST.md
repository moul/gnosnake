# The web2.5 checklist

**What a small application on gno.land has to get right, and where each one is done here.**

"web2.5" is the shape almost every real gno app ends up in: state and rules on chain,
a face on the web, and a chain-native page that has to be good on its own because it is
the only view that cannot go offline. This file is the list of decisions that shape turns
out to force. It is written as a checklist because most of them are invisible until they
are wrong, and four of them are permanent once a transaction lands.

It is shared by four repositories exploring the same ground from different angles:

| | the question it stresses |
|---|---|
| [gno4](https://github.com/moul/gno4) | the chain as **referee**: authority, turn order, a game that is fully public |
| [gnoplace](https://github.com/moul/gnoplace) | **write volume and cost**: thousands of tiny writes to one shared object |
| [gnordle](https://github.com/moul/gnordle) | **hidden state** on a transparent chain, and what obscurity is and is not worth |
| **[gnosnake](https://github.com/moul/gnosnake)** ← you are here | **verification**: a score the chain recomputes instead of believing |

Tracking issue: [moul/gno-contracts#249](https://github.com/moul/gno-contracts/issues/249), where the list is up for discussion.

---

## 1. Shape

- [x] **The rules are a pure `p/` package with no chain import.** No address, no height,
  no `chain/*`. That is what makes them testable with no node, reusable by another realm,
  and what keeps the realm thin enough to read in one sitting.
- [x] **The realm owns only what the package cannot decide**: who may act, when, and what
  the world sees. In `gno4` that is about 200 lines against 400 of engine.
- [x] **Store the minimal canonical input, derive everything else.** A whole game is its
  move list, at most 42 bytes; the board, the winner and the winning line are replayed on
  read. One representation cannot disagree with itself, and an engine change then needs no
  state migration because what is stored is the input, not a derived structure.
- [x] **No exported function hands out a pointer into realm storage.** A `private = true`
  realm that does this fails at runtime, not at lint, and the path is already spent.

## 2. Render is the product

- [x] **The whole application is usable from gnoweb with no wallet and no JavaScript.**
  Every page, every board, every move link. The front-end is a nicer way to do the same
  thing, never the only way.
- [x] **The realm draws itself.** An SVG built at render time and inlined as
  `data:image/svg+xml;base64`, which is the one data URI gnoweb allows. It costs no
  storage and there is no asset that can go missing later.
- [x] **Deterministic.** No current height, no clock, no randomness in `Render`. Anything
  that moves on its own cannot be pinned by a test, and then a rendering regression is
  found by a human or not at all.
- [x] **Every page is pinned by a test, and the pins are generated.** `make repin` rewrites
  them from what `Render` actually produces and CI fails if they are stale. A pin nobody
  can regenerate is a pin somebody deletes.
- [x] **Everything a caller typed is escaped before it renders.** A live realm can never be
  fixed in place, so this is checked before the deploy, not after.
- [x] **A machine-readable view exists beside the human one.** `Feed()` and `Line(id)`
  return tab-separated state. Without it the front-end scrapes its own markdown, and then
  a wording change is an outage.

## 3. Paths, versions, and the things that are permanent

- [x] **`private = true` while the design is still moving.** It is the most consequential
  line in the repository: a public path can never be redeployed, on any chain, ever.
  Going public is a one-way door and gets taken deliberately, once.
- [x] **The version lives in `gnomod.toml`, not in a directory name.** `gnopm` exists for
  this: a bump is a one-line diff instead of a copied directory git cannot pair.
- [x] **No realm hardcodes its own package path.** The same source is deployed twice, and a
  hardcoded link sends every click on the preview back to production while looking like it
  works. Read the path from the running frame. Guarded by `make guards`.
- [x] **A guard per permanent mistake.** `scripts/guards.sh`: the private flag, the
  hardcoded self path, a `Render` no test calls, a package with no README, an import that
  is not vendored.

## 4. Environments, when there is no testnet

- [x] **A `/preview` twin: the same source at a second path, `private = true`, redeployed
  freely.** Until a suitable testnet exists this *is* the staging environment. Only
  `gnomod.toml` differs; if anything else ever has to, the design is wrong, because a realm
  that behaves differently in staging is not the thing you tested.
- [x] **`make dev` runs the whole thing against a local `gnodev`** with no accounts to
  create and nothing to configure.
- [ ] **A testnet target.** Tracked as an issue in each repository. Not done: the current
  testnets are replaced every few weeks, so pointing a deploy at one is a commitment to
  redoing it.

## 5. Build and CI

- [x] **Every dependency is committed under `vendor/`.** A build needs no chain, no cache
  and no network. The public RPC answers 403 under load, and a build that fails for that
  reason is a build nobody trusts.
- [x] **`make ci` is exactly what CI runs**, so a check that is green locally is green
  there.
- [x] **The pull request shows what the realm renders**, not just what the source diff says.
  One sticky comment, every page, produced by a fresh run.
- [x] **The front-end has no build step.** Static files, no `node_modules`, no bundler.
  What is debugged locally is what is deployed, byte for byte.
- [x] **Deploy waits for CI**, and deploys the exact commit CI passed, not the branch head.

## 6. The write path

- [x] **Reading needs nothing from the visitor.** No wallet, no account, no signature. A
  first visit and a shared link both work.
- [x] **Signing is one function with a pasteable fallback.** Where there is no wallet, the
  page prints the `gnokey` command that does the same thing.
- [x] **A run is a string.** A seed and its moves reproduce the whole game on any machine,
  which is what makes the leaderboard verifiable, the replay drawable, and a bug report
  something you can paste.
- [ ] **Gas is measured, not guessed.** A browser cannot simulate, so the front-end
  over-provides and says so. It matters most here: `Submit` replays every tick, so it costs
  far more than a normal call and the ceiling has to be generous.

## 7. Documentation

- [x] **Every package has a hand-written README** saying what it is, the design decision
  that shaped it, and what it will not do.
- [x] **The repository says what it is exploring and what it is not**, on chain as well as
  on GitHub: `:about` is a page of the realm itself.
- [ ] **Listed in [awesome-gno](https://github.com/gnoverse/awesome-gno).** Once the realms
  are live.
