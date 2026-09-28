package gnosnake

import (
	"strings"
	"testing"

	"gno.land/p/moul/gnosnake/v0"
	"gno.land/p/nt/avl/v0"
	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

var (
	alice = testutils.TestAddress("alice")
	bob   = testutils.TestAddress("bob")
)

// Every caller switch below is a literal testing.SetRealm, never a helper.
// SetRealm applies to the CURRENT FRAME: wrapped in a func it sets the helper's
// frame, the helper returns, and the caller the realm sees is unchanged. The
// call still succeeds, so the test would pass for the wrong reason.
func reset() {
	pending = avl.Tree{}
	best = avl.Tree{}
	board = nil
	runs = 0
	nonce = 0x9e3779b9
}

// eat plays greedily toward the food, one tick at a time, and returns the
// moves once n pieces have been eaten.
//
// It picks the move by simulating it rather than by reasoning about it: at each
// tick it tries the candidates in order and keeps the first that leaves the
// snake alive. Hand-written move strings would only ever score by accident, and
// a fixture that scores by accident is a test that stops testing the moment the
// seed changes.
func eat(seed uint32, n int) string {
	moves := ""
	for tick := 0; tick < gnosnake.MaxTicks; tick++ {
		res, err := gnosnake.Run(seed, moves)
		if err != nil || !res.Alive || res.Food < 0 {
			return moves
		}
		if res.Score >= n {
			return moves
		}
		step := ""
		for _, c := range candidates(res.Body[0], res.Food) {
			trial, err := gnosnake.Run(seed, moves+c)
			if err == nil && trial.Alive {
				step = c
				break
			}
		}
		if step == "" {
			return moves // boxed in; the caller asserts on what was eaten
		}
		moves += step
	}
	return moves
}

// candidates orders the four moves: toward the food first, then the rest, so a
// blocked direction still has somewhere to go.
func candidates(head, food int) []string {
	hx, hy := head%gnosnake.Width, head/gnosnake.Width
	fx, fy := food%gnosnake.Width, food/gnosnake.Width
	out := []string{}
	switch {
	case fx > hx:
		out = append(out, "r")
	case fx < hx:
		out = append(out, "l")
	}
	switch {
	case fy > hy:
		out = append(out, "d")
	case fy < hy:
		out = append(out, "u")
	}
	for _, c := range []string{"r", "d", "l", "u"} {
		seen := false
		for _, o := range out {
			if o == c {
				seen = true
			}
		}
		if !seen {
			out = append(out, c)
		}
	}
	return out
}

func TestStartIssuesASeed(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seed := Start(cross(cur))
	uassert.True(t, seed != 0, "a zero seed is not a game")
	uassert.Equal(t, seed, PendingOf(alice))
	uassert.Equal(t, uint32(0), PendingOf(bob), "one seed belongs to one address")
}

// The whole design: no score is submitted, the realm works it out.
func TestSubmitComputesTheScore(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seed := Start(cross(cur))
	moves := eat(seed, 3)
	urequire.True(t, moves != "", "the fixture must actually eat something")

	testing.SetRealm(testing.NewUserRealm(alice))
	score := Submit(cross(cur), moves)
	uassert.Equal(t, 3, score)

	gotSeed, gotMoves, gotScore, _ := BestOf(alice)
	uassert.Equal(t, seed, gotSeed)
	uassert.Equal(t, moves, gotMoves)
	uassert.Equal(t, 3, gotScore)

	// And the stored run reproduces the score with no help from this realm.
	res, err := gnosnake.Run(gotSeed, gotMoves)
	urequire.NoError(t, err)
	uassert.Equal(t, gotScore, res.Score, "anybody can re-derive the leaderboard")
}

// A seed is spent by the submission that uses it, so one Start is one
// submission and a good seed cannot be farmed.
func TestASeedIsSpentOnce(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seed := Start(cross(cur))
	moves := eat(seed, 2)

	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), moves)
	uassert.Equal(t, uint32(0), PendingOf(alice))

	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, ErrNoSeed.Error(), func() {
		Submit(cross(cur), moves)
	})
}

func TestSubmitWithoutAStartIsRefused(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, ErrNoSeed.Error(), func() {
		Submit(cross(cur), "rrr")
	})
}

// The engine's refusals reach the caller unchanged: the realm does not
// re-implement the rules, it forwards the error.
func TestEngineRefusalsReachTheCaller(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, gnosnake.ErrBadMove.Error(), func() {
		Submit(cross(cur), "rrxrr")
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, gnosnake.ErrTooLong.Error(), func() {
		Submit(cross(cur), strings.Repeat(".", gnosnake.MaxTicks+1))
	})
	// A refused submission does not spend the seed.
	uassert.True(t, PendingOf(alice) != 0)
}

func TestAScorelessRunIsNotASubmission(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, ErrNoScore.Error(), func() {
		Submit(cross(cur), "r")
	})
}

// One address holds one entry: its best. A player improving must replace their
// own line rather than adding a second one.
func TestTheBoardKeepsOneEntryPerPlayer(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seed := Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), eat(seed, 1))
	uassert.Equal(t, 1, len(board))

	testing.SetRealm(testing.NewUserRealm(alice))
	seed = Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), eat(seed, 3))
	urequire.Equal(t, 1, len(board), "still one line for alice")
	uassert.Equal(t, 3, board[0].Score)

	// And a worse run is refused rather than silently dropped, so the player
	// learns their seed was spent for nothing.
	testing.SetRealm(testing.NewUserRealm(alice))
	seed = Start(cross(cur))
	worse := eat(seed, 1)
	testing.SetRealm(testing.NewUserRealm(alice))
	urequire.AbortsContains(t, cur, ErrNotBest.Error(), func() {
		Submit(cross(cur), worse)
	})
}

func TestTheBoardIsSortedAndBounded(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seedA := Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), eat(seedA, 1))

	testing.SetRealm(testing.NewUserRealm(bob))
	seedB := Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(bob))
	Submit(cross(cur), eat(seedB, 4))

	urequire.Equal(t, 2, len(board))
	uassert.Equal(t, bob, board[0].By, "highest first")
	uassert.True(t, board[0].Score > board[1].Score)

	verified, players := Stats()
	uassert.Equal(t, 2, verified)
	uassert.Equal(t, 2, players)
}

// Leaderboard is a contract with a program: every line carries the seed and the
// moves, which is what lets a reader verify it without asking this realm.
func TestLeaderboardShape(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seed := Start(cross(cur))
	moves := eat(seed, 2)
	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), moves)

	row := strings.TrimSuffix(Leaderboard(), "\n")
	cols := strings.Split(row, "\t")
	urequire.Equal(t, 6, len(cols))
	uassert.Equal(t, alice.String(), cols[0])
	uassert.Equal(t, "2", cols[1])
	uassert.Equal(t, moves, cols[4])

	res, err := gnosnake.Run(seed, cols[4])
	urequire.NoError(t, err)
	uassert.Equal(t, "2", itoa(res.Score), "the row verifies from its own contents")
}

func TestRenderNeverPanics(cur realm, t *testing.T) {
	reset()
	testing.SetRealm(testing.NewUserRealm(alice))
	seed := Start(cross(cur))
	testing.SetRealm(testing.NewUserRealm(alice))
	Submit(cross(cur), eat(seed, 2))
	for _, p := range []string{
		"", "about", "u/" + alice.String(), "u/" + bob.String(), "u/", "u/nonsense",
		"nope", "../../etc/passwd", "<script>alert(1)</script>",
	} {
		uassert.True(t, len(Render(p)) > 0, "empty render for "+p)
	}
}

func TestRenderEscapesThePathItEchoes(cur realm, t *testing.T) {
	reset()
	uassert.False(t, strings.Contains(Render("u/<script>"), "<script>"))
}
