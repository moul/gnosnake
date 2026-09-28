package gnosnake

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// fixture verifies two runs, deterministically.
//
// Deterministic is the operative word: Render reads no current height and no
// clock, only what a write recorded, so the same fixture always produces the
// same bytes and the pins can be exact.
func fixture(cur realm, t *testing.T) {
	t.Helper()
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seedA := Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), eat(seedA, 2))

	testing.SetRealm(testing.NewUserRealm(bob))
	seedB := Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(bob))
	Submit(cross(cur), eat(seedB, 5))
}

func pinnedPaths() []string {
	return []string{"", "u/" + alice.String(), "about", "nope"}
}

// renderForPin strips the inline board, which is base64 and would make the pin
// unreadable. The SVG is asserted by shape in the engine's own tests.
func renderForPin(path string) string {
	out := Render(path)
	for {
		start := strings.Index(out, "![")
		if start < 0 {
			return out
		}
		end := strings.Index(out[start:], ")")
		if end < 0 {
			return out
		}
		out = out[:start] + "<board>" + out[start+end+1:]
	}
}

type pinnedPage struct{ path, want string }

// pinnedPages is generated: `make repin` rewrites it from what Render actually
// produces, and the diff is the review. A gno raw string literal cannot contain
// a backtick and these pages contain fenced code, so {BT} stands in for one.
var pinnedPages = []pinnedPage{
	{"", `# Snake, verified

**No score is submitted here.** A run is: the seed this realm issued and the moves that were played with it. The realm replays them and works the score out itself, so nobody can claim a score their moves did not produce and anybody can re-derive every line below.

2 runs verified, by 2 players.

## The run in front
<board>

**5** eaten in 65 ticks, by [g1vfhkyh…vdhu](/r/moul/gnosnake:u/g1vfhkyh6lta047h6lta047h6lta047h6l03vdhu).

## Leaderboard
| | player | score | ticks | seed |
|---|---|---|---|---|
| 1 | [g1vfhkyh…vdhu](/r/moul/gnosnake:u/g1vfhkyh6lta047h6lta047h6lta047h6l03vdhu) | **5** | 65 | {BT}2590672027{BT} |
| 2 | [g1v9kxjc…40gh](/r/moul/gnosnake:u/g1v9kxjcm9ta047h6lta047h6lta047h6lzd40gh) | **2** | 28 | {BT}4157746799{BT} |

The top 20, one entry per player. Every one of them carries the moves that produced it: [check them yourself](/r/moul/gnosnake:about).

---
<details><summary>Playing from a terminal</summary>

{BT}{BT}{BT}sh
# take a seed; the output is the number to play with
gnokey maketx call -pkgpath gno.landr/moul/gnosnake -func Start \
  -gas-fee 1000000ugnot -gas-wanted 3000000 -broadcast \
  -chainid dev -remote https://rpc.gno.land:443 YOURKEY

# submit the moves; u d l r and . for keep going, one per tick
gnokey maketx call -pkgpath gno.landr/moul/gnosnake -func Submit -args rrrddd... \
  -gas-fee 1000000ugnot -gas-wanted 20000000 -broadcast \
  -chainid dev -remote https://rpc.gno.land:443 YOURKEY
{BT}{BT}{BT}

Submit replays every tick, so it costs far more gas than a normal call and the number above is a guess. Drop {BT}-broadcast{BT} and the node answers with what your run actually costs.

</details>

[What is actually verified, and what is not](/r/moul/gnosnake:about)
`},
	{"u/g1v9kxjcm9ta047h6lta047h6lta047h6lzd40gh", `# g1v9kxjc…40gh

[g1v9kxjcm9ta047h6lta047h6lta047h6lzd40gh](/u/g1v9kxjcm9ta047h6lta047h6lta047h6lzd40gh)

<board>

Best: **2** eaten in 28 ticks.

## The run, in full
Seed {BT}4157746799{BT}, 28 moves. Replay it and you get the same board and the same score, on any machine.

{BT}{BT}{BT}
lllllllullllllllllllllluuuuu
{BT}{BT}{BT}

[Back to the board](/r/moul/gnosnake)
`},
	{"about", `# What is actually verified, and what is not

One of four small applications written to answer a single question: **what does a
web2.5 application on gno.land actually have to get right?** This one took
verification.

A score sent by a front-end is a number somebody typed. There is no signature
that makes it true, and a leaderboard built on one is a leaderboard of whoever
read the network tab first. So no score is sent here. A run is: a seed this realm
issued, and the moves played with it. The realm replays them.

**What that buys.** Nobody can claim a score their moves did not produce. Every
line of the leaderboard carries its seed and its moves, so anybody can re-derive
it without asking this realm anything, including a future version of this realm
checking itself.

**What it does not buy.** Any evidence that a human played. A bot's moves replay
exactly as well as a person's, and a seed the realm issues does not prevent
somebody searching offline for good moves once they know it. What issuing the
seed does prevent is one seed being reused for a thousand submissions.

**What it costs.** Replaying up to 1,200 ticks is real work the submitter pays
gas for, which is why the board is 16 by 16 and the limit exists at all. That is
the trade this whole corner is about: verification is not free, and the question
is whether the thing you are verifying is worth the ticks.

There are two deployments of this same source: this one, and a {BT}r/moul/preview/gnosnake{BT}
flagged {BT}private = true{BT} so it stays redeployable while the design
is still moving. A public path can never be redeployed.

The repository, the checklist and the other three:
[github.com/moul/gnosnake](https://github.com/moul/gnosnake).

[Back to the board](/r/moul/gnosnake)
`},
	{"nope", `# Not found

No page at {BT}nope{BT}. [Back to the board](/r/moul/gnosnake).
`},
}

func TestRenderIsPinned(cur realm, t *testing.T) {
	fixture(cur, t)
	if len(pinnedPages) != len(pinnedPaths()) {
		t.Fatalf("pins are stale: %d pinned, %d paths. Run `make repin`.",
			len(pinnedPages), len(pinnedPaths()))
	}
	for _, p := range pinnedPages {
		uassert.Equal(t, strings.ReplaceAll(p.want, "{BT}", "\x60"), renderForPin(p.path),
			"page "+p.path+" changed. If you meant it, run `make repin` and read the diff.")
	}
}

func TestRenderAboutMentionsThePrivateFlag(cur realm, t *testing.T) {
	out := Render("about")
	uassert.True(t, strings.Contains(out, "private = true"))
	uassert.True(t, strings.Contains(out, "github.com/moul/gnosnake"))
}
