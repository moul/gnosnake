# `gno.land/p/moul/gnosnake/v0`

**A deterministic snake, replayable from a seed and a string of moves**: `Run`, `Result`, `SVG`, `Text`.

```go
import "gno.land/p/moul/gnosnake/v0"

res, err := gnosnake.Run(12345, "rrrdddlllu")
res.Score      // food eaten
res.Alive      // running out of moves is not death
res.Image("run") // ![run](data:image/svg+xml;base64,...)
```

The game runs in a browser at whatever speed the player can manage. What reaches a chain is
not a score, it is the moves. Re-running them gives the same answer on any machine, which is
what lets a realm recompute a score instead of believing one.

**Everything that could vary comes from the seed.** The food, the spawn walk, the tick order.
Nothing comes from the environment, because a simulator that reads a clock or a global cannot
be replayed and a leaderboard built on it is a leaderboard of nothing.

Four behaviours worth knowing before you use it:

- **The tail cell is legal to enter**, unless the snake just ate and did not shorten. Getting
  this wrong makes a perfectly normal turn fatal, and only on the tick after eating, which is
  the kind of bug that survives an afternoon of playtesting.
- **Reversing into your own neck is ignored, not fatal and not an error.** A player mashing
  keys is not cheating.
- **Running out of moves is not death.** A player who stops is alive with the score they had.
- **Food is placed by walking forward from a random cell**, not by rejecting and retrying. A
  retry loop on a nearly full board is unbounded work, and unbounded work is the one thing a
  replay running on chain cannot have.

`MaxTicks` is 1,200 and the board is 16 by 16 for one reason: a replay is real work somebody
pays gas for, and both numbers are the budget.

The PRNG is xorshift32, small enough to be written identically in gno and in JavaScript,
which is what lets the browser and the chain agree about where the food went. The
repository's JS port is cross-checked against this package's own fixtures.

Live demo: [r/moul/gnosnake](/r/moul/gnosnake).
