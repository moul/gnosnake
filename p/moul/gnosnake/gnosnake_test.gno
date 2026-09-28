package gnosnake

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

const seed = uint32(12345)

func TestRunIsDeterministic(t *testing.T) {
	// The property the whole design rests on: the chain never has to believe a
	// score, because replaying the moves gives the same answer every time and
	// on every machine.
	moves := "rrrdddlllu"
	a, err := Run(seed, moves)
	urequire.NoError(t, err)
	b, err := Run(seed, moves)
	urequire.NoError(t, err)
	uassert.Equal(t, a.Score, b.Score)
	uassert.Equal(t, a.Ticks, b.Ticks)
	uassert.Equal(t, a.Food, b.Food)
	uassert.Equal(t, a.Text(), b.Text())
}

func TestADifferentSeedIsADifferentGame(t *testing.T) {
	a, err := Run(seed, "....")
	urequire.NoError(t, err)
	b, err := Run(seed+1, "....")
	urequire.NoError(t, err)
	uassert.False(t, a.Food == b.Food, "the food is placed from the seed")
}

func TestStartingPosition(t *testing.T) {
	r, err := Run(seed, "")
	urequire.NoError(t, err)
	uassert.Equal(t, 0, r.Ticks)
	uassert.Equal(t, 0, r.Score)
	uassert.True(t, r.Alive)
	uassert.Equal(t, startLen, r.Length)
	uassert.Equal(t, (Height/2)*Width+Width/2, r.Body[0], "the head starts at the centre")
	uassert.True(t, r.Food >= 0 && r.Food < Width*Height)
}

func TestWalls(t *testing.T) {
	cases := []struct {
		name  string
		moves string
	}{
		// The snake starts at the centre facing right: eight cells to the right
		// wall, and eight to each of the others after turning.
		{"the right wall", strings.Repeat("r", Width)},
		{"the left wall", "u" + strings.Repeat("l", Width)},
		{"the top wall", strings.Repeat("u", Height)},
		{"the bottom wall", strings.Repeat("d", Height)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r, err := Run(seed, tc.moves)
			urequire.NoError(t, err)
			uassert.False(t, r.Alive, r.Text())
			uassert.True(t, r.Ticks < len(tc.moves), "it stopped before the moves ran out")
		})
	}
}

// Reversing into your own neck is ignored, not fatal and not an error: a player
// mashing keys is not cheating, and every version of this game does the same.
func TestReversalIsIgnored(t *testing.T) {
	r, err := Run(seed, "l")
	urequire.NoError(t, err)
	uassert.True(t, r.Alive, r.Text())
	uassert.Equal(t, 1, r.Ticks)
	uassert.Equal(t, (Height/2)*Width+Width/2+1, r.Body[0], "it kept going right")
}

// A tight loop that returns to where the tail is about to vacate. The cell is
// free by the time the head arrives, so this must NOT be a collision. Getting
// it wrong makes a legal turn fatal, and only sometimes.
func TestFollowingYourOwnTailIsLegal(t *testing.T) {
	r, err := Run(seed, "drdlulur")
	urequire.NoError(t, err)
	uassert.True(t, r.Alive, r.Text())
}

func TestBadInput(t *testing.T) {
	cases := []struct {
		name  string
		seed  uint32
		moves string
		want  error
	}{
		{"a zero seed is not a game", 0, "rr", ErrBadSeed},
		{"an unknown move", seed, "rrxrr", ErrBadMove},
		{"an uppercase move is not a move", seed, "R", ErrBadMove},
		{"a run past the tick limit", seed, strings.Repeat(".", MaxTicks+1), ErrTooLong},
		{"exactly the tick limit is fine", seed, strings.Repeat("r", MaxTicks), nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Run(tc.seed, tc.moves)
			if tc.want == nil {
				uassert.NoError(t, err)
				return
			}
			uassert.ErrorIs(t, err, tc.want)
		})
	}
}

// Eating is what a score is, so the path to the first food is computed rather
// than guessed: whatever the seed put down, walk to it.
func TestEatingGrowsAndScores(t *testing.T) {
	start, err := Run(seed, "")
	urequire.NoError(t, err)
	moves := pathTo(start.Body[0], start.Food)
	urequire.True(t, moves != "", "the first food is reachable in a straight L")

	r, err := Run(seed, moves)
	urequire.NoError(t, err)
	uassert.Equal(t, 1, r.Score, r.Text())
	uassert.Equal(t, startLen+1, r.Length, "eating grows the snake by one")
	uassert.True(t, r.Food >= 0 && r.Food != start.Food, "new food was placed")
	uassert.True(t, r.Alive)
}

// pathTo walks horizontally then vertically. It is only used where that path is
// legal, which the test above asserts rather than assumes.
func pathTo(head, food int) string {
	hx, hy := head%Width, head/Width
	fx, fy := food%Width, food/Width
	out := ""
	for hx < fx {
		out += "r"
		hx++
	}
	for hx > fx {
		out += "l"
		hx--
	}
	for hy < fy {
		out += "d"
		hy++
	}
	for hy > fy {
		out += "u"
		hy--
	}
	// The snake starts facing right; a first move of "l" would be ignored and
	// the path would be wrong, so refuse it rather than return something close.
	if strings.HasPrefix(out, "l") {
		return ""
	}
	return out
}

func TestTextAndSVG(t *testing.T) {
	r, err := Run(seed, "rr")
	urequire.NoError(t, err)

	txt := r.Text()
	uassert.Equal(t, Height, len(strings.Split(strings.TrimSuffix(txt, "\n"), "\n")))
	uassert.Equal(t, 1, strings.Count(txt, "@"), "exactly one head")
	uassert.Equal(t, 1, strings.Count(txt, "*"), "exactly one food")
	uassert.Equal(t, startLen-1, strings.Count(txt, "o"))

	s := r.SVG()
	uassert.True(t, strings.HasPrefix(s, "<svg "), s[:40])
	uassert.True(t, strings.HasSuffix(s, "</svg>"))
	uassert.Equal(t, 1, strings.Count(s, "<circle"), "the food")

	img := r.Image("run")
	uassert.True(t, strings.HasPrefix(img, "![run](data:image/svg+xml;base64,"), img[:50])
}
