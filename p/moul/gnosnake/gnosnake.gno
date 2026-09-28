// Package gnosnake is a deterministic snake, replayable from a seed and a
// string of moves.
//
// That is the whole design. The game runs in a browser, at whatever speed the
// player can play it, and what reaches the chain is not a score but the moves
// that produced one. Re-running them gives the same answer on any machine, so a
// realm never has to believe a number: it recomputes it.
//
// It imports no chain package. Determinism is the property that matters, so
// everything that could vary (the food, the starting position, the tick order)
// comes from the seed and nothing comes from the environment.
//
// Live demo: [r/moul/gnosnake](/r/moul/gnosnake).
package gnosnake

import "errors"

// The board. Small, because the cost that matters is replay: a run is bounded
// by MaxTicks and every tick is work the chain pays for.
const (
	Width    = 16
	Height   = 16
	MaxTicks = 1200
	startLen = 3
)

// Moves, one byte per tick. A dot is "keep going", which is most of them.
const (
	Up    = 'u'
	Down  = 'd'
	Left  = 'l'
	Right = 'r'
	Keep  = '.'
)

var (
	ErrTooLong  = errors.New("gnosnake: run exceeds the tick limit")
	ErrBadMove  = errors.New("gnosnake: not a move")
	ErrBadSeed  = errors.New("gnosnake: seed must not be zero")
)

// Result is what a run produced. Every field is derived from (seed, moves), so
// two callers who disagree about any of them disagree about the rules.
type Result struct {
	Score  int    // food eaten
	Ticks  int    // ticks survived
	Alive  bool   // still alive when the moves ran out
	Length int    // final snake length
	Body   []int  // cells, head first, as y*Width+x
	Food   int    // the uneaten food, or -1
}

type point struct{ x, y int }

// Run replays a game. It is the only thing in this package that decides
// anything, so there is exactly one rulebook and no second one to drift.
//
// A run ends when the moves run out, when the snake hits a wall, or when it
// hits itself. Running out of moves is not death: a player who stops is alive
// with the score they had.
func Run(seed uint32, moves string) (Result, error) {
	var res Result
	res.Food = -1
	if seed == 0 {
		return res, ErrBadSeed
	}
	if len(moves) > MaxTicks {
		return res, ErrTooLong
	}

	rng := seed
	body := []point{}
	for i := 0; i < startLen; i++ {
		body = append(body, point{Width/2 - i, Height / 2})
	}
	dir := point{1, 0}
	food := spawn(&rng, body)

	for i := 0; i < len(moves); i++ {
		d, err := heading(moves[i], dir)
		if err != nil {
			return res, err
		}
		dir = d
		head := point{body[0].x + dir.x, body[0].y + dir.y}
		if head.x < 0 || head.x >= Width || head.y < 0 || head.y >= Height {
			return finish(res, body, food, i, false), nil
		}
		// The tail cell is about to be vacated, so moving into it is legal
		// unless the snake just ate and did not shorten. Getting this wrong
		// makes a legal turn fatal, and only on the tick after eating.
		grew := head == food
		limit := len(body)
		if !grew {
			limit--
		}
		for j := 0; j < limit; j++ {
			if body[j] == head {
				return finish(res, body, food, i, false), nil
			}
		}
		body = append([]point{head}, body...)
		if grew {
			res.Score++
			food = spawn(&rng, body)
		} else {
			body = body[:len(body)-1]
		}
	}
	return finish(res, body, food, len(moves), true), nil
}

func finish(res Result, body []point, food point, ticks int, alive bool) Result {
	res.Ticks = ticks
	res.Alive = alive
	res.Length = len(body)
	res.Body = make([]int, len(body))
	for i, p := range body {
		res.Body[i] = p.y*Width + p.x
	}
	if food.x >= 0 {
		res.Food = food.y*Width + food.x
	}
	return res
}

// heading turns a move byte into a direction, refusing a reversal into the
// snake's own neck the way every version of this game does: the input is
// ignored rather than being an error, because a player mashing keys is not
// cheating.
func heading(move byte, cur point) (point, error) {
	var want point
	switch move {
	case Up:
		want = point{0, -1}
	case Down:
		want = point{0, 1}
	case Left:
		want = point{-1, 0}
	case Right:
		want = point{1, 0}
	case Keep:
		return cur, nil
	default:
		return cur, ErrBadMove
	}
	if want.x == -cur.x && want.y == -cur.y {
		return cur, nil
	}
	return want, nil
}

// spawn places food on a free cell.
//
// It walks forward from a random cell rather than rejecting and retrying: a
// retry loop on a nearly full board is unbounded work, and unbounded work is
// the one thing a replay running on chain cannot have.
func spawn(rng *uint32, body []point) point {
	start := int(next(rng) % uint32(Width*Height))
	for k := 0; k < Width*Height; k++ {
		c := (start + k) % (Width * Height)
		p := point{c % Width, c / Width}
		taken := false
		for _, b := range body {
			if b == p {
				taken = true
				break
			}
		}
		if !taken {
			return p
		}
	}
	return point{-1, -1} // the board is full: a perfect game
}

// next is xorshift32. Small, exactly specified, and identical in gno and in
// JavaScript, which is what lets the browser and the chain agree about where
// the food went.
func next(s *uint32) uint32 {
	x := *s
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	*s = x
	return x
}
