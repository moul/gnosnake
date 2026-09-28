// Package gnosnake keeps a leaderboard it does not have to believe.
//
// This is the verification corner of the exploration. A score submitted by a
// front-end is a number somebody typed; there is no signature that makes it
// true. So no score is submitted here. What is submitted is the run: a seed the
// realm issued and the moves that were played with it. The realm replays them
// and works the score out itself.
//
// What that buys, precisely: nobody can claim a score their moves did not
// produce, and anybody can re-derive every entry on the board from what is
// stored. What it does NOT buy: any evidence that a human played. A bot's moves
// replay exactly as well as a person's, and saying so is more useful than
// implying otherwise.
//
// The simulator is [p/moul/gnosnake](/p/moul/gnosnake/v0), which knows nothing
// about a chain.
package gnosnake

import (
	"chain/runtime"
	"errors"

	"gno.land/p/moul/gnosnake/v0"
	"gno.land/p/nt/avl/v0"
)

// Board is how many runs the leaderboard keeps. Bounded: an unbounded board is
// a page that renders slower every day and storage nobody ever reclaims.
const Board = 20

// Run is a verified run. The seed and the moves are kept, not just the score,
// so every entry can be re-derived by anybody, including by a future version of
// this realm that wants to check itself.
type Run struct {
	By     address
	Seed   uint32
	Moves  string
	Score  int
	Ticks  int
	Height int64
}

var (
	pending avl.Tree // address -> uint32, the seed issued and not yet spent
	best    avl.Tree // address -> *Run
	board   []Run    // the leaderboard, highest first
	runs    int      // every run ever verified
	nonce   uint32 = 0x9e3779b9
)

var (
	ErrNoSeed   = errors.New("gnosnake: call Start first, and use the seed it gives you")
	ErrNotBest  = errors.New("gnosnake: that run does not beat your own best")
	ErrNoScore  = errors.New("gnosnake: a run that ate nothing is not a submission")
)

// Start issues a seed. It is bound to the caller and to the height, and it can
// be spent once.
//
// A seed the player picks would let them search offline for a board they like;
// a seed the realm issues does not stop that (they can still search their moves
// once they know it), and pretending it does would be the wrong lesson. What it
// does do is stop one seed being reused for a thousand submissions.
func Start(cur realm) uint32 {
	caller := cur.Previous().Address()
	nonce = mix(nonce ^ uint32(runtime.ChainHeight()) ^ hash(caller.String()))
	if nonce == 0 {
		nonce = 1 // a zero seed is not a game
	}
	pending.Set(caller.String(), nonce)
	return nonce
}

// Submit replays a run and records what it was actually worth.
//
// The score is not an argument. There is nowhere to put one.
func Submit(cur realm, moves string) int {
	caller := cur.Previous().Address()
	v := pending.Get(caller.String())
	if v == nil {
		panic(ErrNoSeed)
	}
	seed := v.(uint32)

	res, err := gnosnake.Run(seed, moves)
	if err != nil {
		panic(err)
	}
	if res.Score == 0 {
		panic(ErrNoScore)
	}
	// The seed is spent whether or not the run makes the board, so one Start is
	// one submission and a good seed cannot be farmed.
	pending.Remove(caller.String())
	runs++

	run := Run{By: caller, Seed: seed, Moves: moves, Score: res.Score, Ticks: res.Ticks, Height: runtime.ChainHeight()}
	if prev := bestOf(caller); prev != nil && prev.Score >= res.Score {
		panic(ErrNotBest)
	}
	best.Set(caller.String(), &run)
	insert(run)
	return res.Score
}

// insert keeps the board sorted, highest first, one entry per address.
func insert(run Run) {
	out := make([]Run, 0, len(board)+1)
	placed := false
	for _, r := range board {
		if r.By == run.By {
			continue // an address holds one entry: its best
		}
		if !placed && run.Score > r.Score {
			out = append(out, run)
			placed = true
		}
		out = append(out, r)
	}
	if !placed {
		out = append(out, run)
	}
	if len(out) > Board {
		out = out[:Board]
	}
	board = out
}

// Leaderboard returns the board, highest first, one line each:
//
//	<address>\t<score>\t<ticks>\t<seed>\t<moves>\t<height>
//
// The seed and the moves are there so a reader can verify any line without
// asking this realm anything: replay them and compare.
func Leaderboard() string {
	out := ""
	for _, r := range board {
		out += r.By.String() + "\t" + itoa(r.Score) + "\t" + itoa(r.Ticks) + "\t" +
			utoa(r.Seed) + "\t" + r.Moves + "\t" + itoa64(r.Height) + "\n"
	}
	return out
}

// PendingOf returns the unspent seed issued to an address, or 0. A front-end
// that lost its tab asks for this rather than burning another Start.
func PendingOf(addr address) uint32 {
	v := pending.Get(addr.String())
	if v == nil {
		return 0
	}
	return v.(uint32)
}

// BestOf returns an address's best run. Values, not the *Run: this realm is
// private = true, and handing out a pointer into its own storage is the one
// mistake that cannot be undone afterwards.
func BestOf(addr address) (seed uint32, moves string, score, ticks int) {
	r := bestOf(addr)
	if r == nil {
		return 0, "", 0, 0
	}
	return r.Seed, r.Moves, r.Score, r.Ticks
}

// Stats returns runs verified and players seen.
func Stats() (verified, players int) { return runs, best.Size() }

func bestOf(addr address) *Run {
	v := best.Get(addr.String())
	if v == nil {
		return nil
	}
	return v.(*Run)
}

// mix is xorshift32, the same one the simulator uses, so there is one source of
// randomness in the repository and not two that can disagree.
func mix(x uint32) uint32 {
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	return x
}

func hash(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

func utoa(n uint32) string { return itoa(int(n)) }

func itoa64(n int64) string { return itoa(int(n)) }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	out := ""
	for n > 0 {
		out = string(rune('0'+n%10)) + out
		n /= 10
	}
	if neg {
		out = "-" + out
	}
	return out
}
