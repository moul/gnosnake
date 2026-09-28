<h1 align="center">gnosnake</h1>

<p align="center">
  <b>A leaderboard that does not have to believe you.</b><br>
  You do not submit a score. You submit the moves, and the chain works the score out.
</p>

<p align="center">
  <a href="https://github.com/moul/gnosnake/actions/workflows/ci.yml"><img src="https://github.com/moul/gnosnake/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./CHECKLIST.md"><img src="https://img.shields.io/badge/web2.5-checklist-22c55e" alt="checklist"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-97ca00.svg" alt="License"></a>
</p>

> **This is an exploration, not a product.** One of four small applications written to answer
> a single question: *what does a web2.5 application on gno.land actually have to get right?*
> This one stresses **verification**. The decisions are written down in
> **[CHECKLIST.md](./CHECKLIST.md)**.

### ▶ [Play it](https://moul.github.io/gnosnake/) &nbsp;·&nbsp; [The realm in gnoweb](https://gno.land/r/moul/gnosnake) &nbsp;·&nbsp; [The checklist](./CHECKLIST.md)

---

## The idea

A score sent by a front-end is a number somebody typed. There is no signature that makes it
true, and a leaderboard built on one is a leaderboard of whoever read the network tab first.

So nothing sends a score. You take a seed from the realm, play, and send the **moves**. The
realm replays them and computes the score itself. `Submit` has nowhere to put a score, which
is the point: the interface makes the lie impossible rather than detecting it.

**What that buys.** Nobody can claim a score their moves did not produce, and every line of
the leaderboard carries its seed and its moves, so anybody can re-derive the whole board
without trusting this realm.

**What it does not buy.** Any evidence a human played. A bot's moves replay exactly as well.
The realm says so on its own page, because a verification claim that is quietly broader than
what it verifies is worse than none.

**What it costs.** Replaying up to 1,200 ticks is real gas. The board is 16×16 and the limit
exists because of it. That trade is the whole corner.

## The shape

```
p/moul/gnosnake/v0      the simulator. deterministic, no chain import.
r/moul/gnosnake         seeds, replay, the leaderboard, the pages.
r/moul/gnosnake/preview the same source at a second path, private = true. generated.
web/                    a static page. no build step, no node_modules.
```

**Two implementations, cross-checked.** The browser plays the same simulator so the score on
screen is the score the chain will recompute. Twelve runs dumped straight out of the gno
package are fixtures in the JavaScript test, food positions included, because the PRNG is
where two ports drift: one missing `>>> 0` in JavaScript diverges hundreds of ticks in and
looks like a rules bug.

## Running it

```sh
make         # the list
make ci      # guards, lint, test: exactly what CI runs
make dev     # a local chain with these packages, at http://127.0.0.1:8888
make web     # the front-end at http://127.0.0.1:8080
make repin   # regenerate the pinned Render output, then read the diff
```

## What it does not do

**No anti-bot anything.** See above. It is a stated limit, not an oversight.

**No replay of somebody else's seed.** A seed belongs to the address it was issued to and is
spent by the submission that uses it.

## The other three

Same checklist, different pressure: [gno4](https://github.com/moul/gno4) (the chain as
referee), [gnoplace](https://github.com/moul/gnoplace) (write volume and cost),
[gnordle](https://github.com/moul/gnordle) (hidden state on a transparent chain).
