package gnosnake

import (
	"strings"

	"gno.land/p/nt/svg/v0"
)

const (
	cellPx = 26
	edgePx = Width * cellPx
)

// Fixed colours: gnoweb serves the SVG inside a data URI, which is its own
// document and inherits nothing from the page, so a theme-aware colour would
// resolve to nothing at all.
const (
	colBoard = "#0b1120"
	colGrid  = "#16203a"
	colBody  = "#22c55e"
	colHead  = "#bbf7d0"
	colFood  = "#ef4444"
	colDead  = "#f87171"
)

// SVG draws the final position of a run.
//
// A finished run is a picture, which is the whole reason a realm can show a
// leaderboard worth looking at: the score is a number, but the shape of the
// snake that got it is the thing people click.
func (r Result) SVG() string { return r.canvas().String() }

// Image wraps [Result.SVG] as a markdown image. The SVG travels inline as a
// data URI, so it needs no hosting and costs no storage: it is drawn at read
// time from the moves, which were going to be stored anyway.
func (r Result) Image(alt string) string { return r.canvas().Render(alt) }

func (r Result) canvas() *svg.Canvas {
	c := svg.NewCanvas(edgePx, edgePx).WithViewBox(0, 0, edgePx, edgePx)
	c.Append(svg.NewRectangle(0, 0, edgePx, edgePx, colBoard))
	for i := 1; i < Width; i++ {
		c.Append(svg.NewRectangle(i*cellPx, 0, 1, edgePx, colGrid))
		c.Append(svg.NewRectangle(0, i*cellPx, edgePx, 1, colGrid))
	}
	if r.Food >= 0 {
		c.Append(svg.NewCircle(r.Food%Width*cellPx+cellPx/2, r.Food/Width*cellPx+cellPx/2, cellPx/3, colFood))
	}
	for i, cell := range r.Body {
		fill := colBody
		if i == 0 {
			fill = colHead
			if !r.Alive {
				fill = colDead
			}
		}
		c.Append(svg.NewRectangle(cell%Width*cellPx+3, cell/Width*cellPx+3, cellPx-6, cellPx-6, fill))
	}
	return c
}

// Text renders the board as characters: the view that fits in a test failure,
// a chain event or a terminal, where an image cannot go.
func (r Result) Text() string {
	grid := make([]byte, Width*Height)
	for i := range grid {
		grid[i] = '.'
	}
	for i, cell := range r.Body {
		if cell < 0 || cell >= len(grid) {
			continue
		}
		if i == 0 {
			grid[cell] = '@'
		} else {
			grid[cell] = 'o'
		}
	}
	if r.Food >= 0 && r.Food < len(grid) {
		grid[r.Food] = '*'
	}
	var sb strings.Builder
	for y := 0; y < Height; y++ {
		sb.Write(grid[y*Width : (y+1)*Width])
		sb.WriteByte('\n')
	}
	return sb.String()
}
