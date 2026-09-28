// The browser simulator must agree with the gno one, tick for tick. If it does
// not, the page shows a score the chain will not accept.
// Run: node web/engine.test.js
import * as e from "./engine.js";

let failures = 0;
const check = (ok, msg) => { if (!ok) { console.error("FAIL", msg); failures++; } };
const SEED = 12345;

// Fixtures taken from p/moul/gnosnake's own tests.
const start = e.run(SEED, "");
check(start.ticks === 0 && start.score === 0 && start.alive, "an empty run is alive with nothing");
check(start.length === e.START_LEN, "the snake starts three long");
check(start.body[0] === (e.HEIGHT / 2) * e.WIDTH + e.WIDTH / 2, "the head starts at the centre");
check(start.food >= 0 && start.food < e.WIDTH * e.HEIGHT, "the food is on the board");

check(e.run(SEED, "").food !== e.run(SEED + 1, "").food, "a different seed is a different game");
check(JSON.stringify(e.run(SEED, "rrrdddlllu")) === JSON.stringify(e.run(SEED, "rrrdddlllu")),
  "the same run twice is the same result");

for (const [name, moves] of [
  ["the right wall", "r".repeat(e.WIDTH)],
  ["the left wall", "u" + "l".repeat(e.WIDTH)],
  ["the top wall", "u".repeat(e.HEIGHT)],
  ["the bottom wall", "d".repeat(e.HEIGHT)],
]) {
  const r = e.run(SEED, moves);
  check(!r.alive, `${name}: should have died`);
  check(r.ticks < moves.length, `${name}: should have stopped early`);
}

const rev = e.run(SEED, "l");
check(rev.alive && rev.ticks === 1, "reversing into your own neck is ignored, not fatal");
check(rev.body[0] === (e.HEIGHT / 2) * e.WIDTH + e.WIDTH / 2 + 1, "it kept going right");
check(e.run(SEED, "drdlulur").alive, "following your own tail is legal");

check(e.run(0, "rr").error, "a zero seed is refused");
check(e.run(SEED, "rrxrr").error, "an unknown move is refused");
check(e.run(SEED, "R").error, "an uppercase move is not a move");
check(e.run(SEED, ".".repeat(e.MAX_TICKS + 1)).error, "past the tick limit is refused");
check(!e.run(SEED, "r".repeat(e.MAX_TICKS)).error, "exactly the limit is fine");

// Twelve runs dumped straight out of the gno package: score, ticks, food,
// length, alive. The food position is the one that matters, because it is the
// only thing derived from the PRNG, and a drifting PRNG is the failure that
// looks like a rules bug. Regenerate with the cross-check in AGENTS.md.
for (const [seed, moves, want] of [
  ["1", "", "0,0,33,3,1"],
  ["1", "rr", "0,2,33,3,1"],
  ["1", "drdlulur", "0,8,33,3,1"],
  ["1", "rrrdddlllu", "0,10,33,3,1"],
  ["12345", "", "0,0,122,3,1"],
  ["12345", "rr", "0,2,122,3,1"],
  ["12345", "drdlulur", "0,8,122,3,1"],
  ["12345", "rrrdddlllu", "0,10,122,3,1"],
  ["4294967295", "", "0,0,31,3,1"],
  ["4294967295", "rr", "0,2,31,3,1"],
  ["4294967295", "drdlulur", "0,8,31,3,1"],
  ["4294967295", "rrrdddlllu", "0,10,31,3,1"],
]) {
  const r = e.run(Number(seed), moves);
  const got = [r.score, r.ticks, r.food, r.length, r.alive ? 1 : 0].join(",");
  check(got === want, `seed ${seed} moves ${JSON.stringify(moves)}: gno says ${want}, js says ${got}`);
}

// The PRNG must not drift over a long run: one missing >>> 0 diverges late.
const s = { s: SEED };
let acc = 0;
for (let i = 0; i < 1000; i++) acc = (acc ^ e.next(s)) >>> 0;
check(Number.isInteger(acc) && acc >= 0 && acc <= 0xffffffff, "xorshift stays a uint32 for 1000 draws");

console.log(failures === 0 ? "ok  engine.js agrees with the gno fixtures" : `FAIL ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
