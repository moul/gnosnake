// The same snake, in the browser. It must produce byte-identical results to
// gno.land/p/moul/gnosnake/v0, because the score the player sees is the score
// the chain will recompute, and a disagreement means a submission the realm
// refuses for reasons the page cannot explain.
//
// The seams where two implementations drift are the PRNG and the self-collision
// rule, so both are written the same way here and cross-checked against the gno
// package's own fixtures in engine.test.js.
export const WIDTH = 16, HEIGHT = 16, MAX_TICKS = 1200, START_LEN = 3;

// xorshift32. The >>> 0 matters: JavaScript bitwise operators produce signed
// 32-bit values, and one missing coercion makes the food diverge from the
// chain's several hundred ticks in, which looks like a rules bug and is not.
export function next(state) {
  let x = state.s;
  x ^= (x << 13) >>> 0; x >>>= 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0; x >>>= 0;
  state.s = x;
  return x;
}

const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

export function run(seed, moves) {
  if (!seed) return { error: "seed must not be zero" };
  if (moves.length > MAX_TICKS) return { error: "run exceeds the tick limit" };

  const state = { s: seed >>> 0 };
  let body = [];
  for (let i = 0; i < START_LEN; i++) body.push([WIDTH / 2 - i, HEIGHT / 2]);
  let dir = [1, 0];
  let food = spawn(state, body);
  let score = 0;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m !== "." && !DIRS[m]) return { error: "not a move" };
    if (m !== ".") {
      const [wx, wy] = DIRS[m];
      if (!(wx === -dir[0] && wy === -dir[1])) dir = [wx, wy];
    }
    const head = [body[0][0] + dir[0], body[0][1] + dir[1]];
    if (head[0] < 0 || head[0] >= WIDTH || head[1] < 0 || head[1] >= HEIGHT)
      return done(body, food, score, i, false);
    const grew = food && head[0] === food[0] && head[1] === food[1];
    // The tail is about to vacate, so moving into it is legal unless the snake
    // just ate. Same rule as the gno package, same off-by-one to get wrong.
    const limit = grew ? body.length : body.length - 1;
    for (let j = 0; j < limit; j++)
      if (body[j][0] === head[0] && body[j][1] === head[1]) return done(body, food, score, i, false);
    body.unshift(head);
    if (grew) { score++; food = spawn(state, body); }
    else body.pop();
  }
  return done(body, food, score, moves.length, true);
}

function done(body, food, score, ticks, alive) {
  return {
    score, ticks, alive, length: body.length,
    body: body.map(([x, y]) => y * WIDTH + x),
    food: food ? food[1] * WIDTH + food[0] : -1,
  };
}

// Walk forward from a random cell rather than rejecting and retrying: a retry
// loop on a nearly full board is unbounded, and the chain cannot have that.
function spawn(state, body) {
  const start = next(state) % (WIDTH * HEIGHT);
  for (let k = 0; k < WIDTH * HEIGHT; k++) {
    const c = (start + k) % (WIDTH * HEIGHT);
    const p = [c % WIDTH, Math.floor(c / WIDTH)];
    if (!body.some(([x, y]) => x === p[0] && y === p[1])) return p;
  }
  return null;
}
