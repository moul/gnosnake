package gnosnake

import (
	"chain/runtime"
	"chain/runtime/unsafe"
	"strings"

	"gno.land/p/moul/gnosnake/v0"
	"gno.land/p/moul/md/v0"
	"gno.land/p/moul/txlink/v0"
)

// self is this realm's gnoweb prefix, read from the package path it is running
// under, because the same source is deployed here and at /preview and a
// hardcoded link would point the preview back at production.
func self() string {
	return strings.TrimPrefix(unsafe.CurrentRealm().PkgPath(), runtime.ChainDomain())
}

// Render is the product, and here it does something no leaderboard usually
// can: it draws the run. Every entry is stored as its seed and its moves, so
// the page replays them and shows the board the score came from.
//
// Deterministic: no current height, no clock. Every height on the page was
// recorded by the write that produced it.
func Render(path string) string {
	switch {
	case path == "":
		return renderBoard()
	case path == "about":
		return renderAbout()
	case strings.HasPrefix(path, "u/"):
		return renderPlayer(strings.TrimPrefix(path, "u/"))
	}
	return "# Not found\n\nNo page at `" + md.EscapeText(path) + "`. [Back to the board](" + self() + ").\n"
}

func renderBoard() string {
	verified, players := Stats()
	var b strings.Builder
	b.WriteString("# Snake, verified\n\n")
	b.WriteString("**No score is submitted here.** A run is: the seed this realm issued and the " +
		"moves that were played with it. The realm replays them and works the score out itself, " +
		"so nobody can claim a score their moves did not produce and anybody can re-derive every " +
		"line below.\n\n")
	b.WriteString(itoa(verified) + " runs verified, by " + itoa(players) + " players.\n\n")

	if len(board) > 0 {
		top := board[0]
		res, err := gnosnake.Run(top.Seed, top.Moves)
		if err == nil {
			b.WriteString(md.H2("The run in front"))
			b.WriteString(res.Image("the leading run") + "\n\n")
			b.WriteString(md.Bold(itoa(top.Score)) + " eaten in " + itoa(top.Ticks) +
				" ticks, by " + player(top.By) + ".\n\n")
		}
	}

	b.WriteString(md.H2("Leaderboard"))
	if len(board) == 0 {
		b.WriteString("Nothing yet. " + md.Link("Take a seed", txlink.Call("Start")) + " and play.\n\n")
	} else {
		b.WriteString("| | player | score | ticks | seed |\n|---|---|---|---|---|\n")
		for i, r := range board {
			b.WriteString("| " + itoa(i+1) + " | " + player(r.By) + " | " + md.Bold(itoa(r.Score)) +
				" | " + itoa(r.Ticks) + " | `" + utoa(r.Seed) + "` |\n")
		}
		b.WriteString("\nThe top " + itoa(Board) + ", one entry per player. Every one of them " +
			"carries the moves that produced it: " + md.Link("check them yourself", self()+":about") + ".\n\n")
	}

	b.WriteString(md.HorizontalRule())
	b.WriteString(md.CollapsibleSection("Playing from a terminal", howTo()))
	b.WriteString("\n" + md.Link("What is actually verified, and what is not", self()+":about") + "\n")
	return b.String()
}

func renderPlayer(raw string) string {
	addr := address(raw)
	if !addr.IsValid() {
		return "# Not a player\n\n`" + md.EscapeText(raw) + "` is not an address. [Back to the board](" + self() + ").\n"
	}
	seed, moves, score, ticks := BestOf(addr)

	var b strings.Builder
	b.WriteString("# " + short(addr) + "\n\n")
	b.WriteString(md.Link(addr.String(), "/u/"+addr.String()) + "\n\n")
	if score == 0 {
		b.WriteString("No verified run yet.\n\n")
	} else {
		res, err := gnosnake.Run(seed, moves)
		if err == nil {
			b.WriteString(res.Image("best run") + "\n\n")
		}
		b.WriteString("Best: " + md.Bold(itoa(score)) + " eaten in " + itoa(ticks) + " ticks.\n\n")
		b.WriteString(md.H2("The run, in full"))
		b.WriteString("Seed `" + utoa(seed) + "`, " + itoa(len(moves)) + " moves. Replay it and you " +
			"get the same board and the same score, on any machine.\n\n")
		b.WriteString(md.CodeBlock(moves))
	}
	b.WriteString("\n" + md.Link("Back to the board", self()) + "\n")
	return b.String()
}

func renderAbout() string {
	return `# What is actually verified, and what is not

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

There are two deployments of this same source: this one, and a ` + "`/preview`" + `
twin flagged ` + "`private = true`" + ` so it stays redeployable while the design
is still moving. A public path can never be redeployed.

The repository, the checklist and the other three:
[github.com/moul/gnosnake](https://github.com/moul/gnosnake).

` + md.Link("Back to the board", self()) + "\n"
}

func player(addr address) string {
	if addr == "" {
		return "_nobody_"
	}
	return md.Link(short(addr), self()+":u/"+addr.String())
}

func short(addr address) string {
	s := addr.String()
	if len(s) <= 12 {
		return s
	}
	return s[:8] + "…" + s[len(s)-4:]
}

func howTo() string {
	pkg := runtime.ChainDomain() + strings.TrimPrefix(self(), "/")
	return "```sh\n" +
		"# take a seed; the output is the number to play with\n" +
		"gnokey maketx call -pkgpath " + pkg + " -func Start \\\n" +
		"  -gas-fee 1000000ugnot -gas-wanted 3000000 -broadcast \\\n" +
		"  -chainid " + runtime.ChainID() + " -remote https://rpc.gno.land:443 YOURKEY\n" +
		"\n" +
		"# submit the moves; u d l r and . for keep going, one per tick\n" +
		"gnokey maketx call -pkgpath " + pkg + " -func Submit -args rrrddd... \\\n" +
		"  -gas-fee 1000000ugnot -gas-wanted 20000000 -broadcast \\\n" +
		"  -chainid " + runtime.ChainID() + " -remote https://rpc.gno.land:443 YOURKEY\n" +
		"```\n" +
		"\nSubmit replays every tick, so it costs far more gas than a normal call and the " +
		"number above is a guess. Drop `-broadcast` and the node answers with what your run " +
		"actually costs.\n"
}
