# `gno.land/r/moul/gnosnake`

**A leaderboard that does not have to believe you.**

A score sent by a front-end is a number somebody typed; there is no signature that makes it
true. So no score is submitted here. A run is: a seed this realm issued, and the moves played
with it. The realm replays them with
[`p/moul/gnosnake`](/p/moul/gnosnake/v0) and works the score out itself.

This is the **verification** corner of the [web2.5
checklist](https://github.com/moul/gnosnake/blob/main/CHECKLIST.md).

**What it buys.** Nobody can claim a score their moves did not produce. Every line of the
leaderboard carries its seed and its moves, so anybody can re-derive it without asking this
realm anything, including a future version of this realm checking itself. The realm page
draws each run, because it can: the picture is derived, not stored.

**What it does not buy.** Any evidence that a human played. A bot's moves replay exactly as
well as a person's, and a seed the realm issues does not stop somebody searching offline for
good moves once they know it. What issuing the seed does stop is one seed being reused for a
thousand submissions: `Submit` spends it.

**What it costs.** Replaying up to 1,200 ticks is real work the submitter pays gas for, which
is why the board is 16 by 16 and the limit exists at all. That is the trade this corner is
about: verification is not free, and the question is whether the thing you are verifying is
worth the ticks.

Pages: the board at the root, `:u/<address>` for a player and their best run replayed,
`:about` for what is and is not proven. `Leaderboard()`, `BestOf()` and `PendingOf()` are the
machine-readable views.

Source: [github.com/moul/gnosnake](https://github.com/moul/gnosnake).
