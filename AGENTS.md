# Working in this repository

Read [CHECKLIST.md](./CHECKLIST.md) first. It is the spec; this file is how to not break it.

## The loop

```sh
make ci      # guards, lint, test. Green before every commit, and what CI runs.
make repin   # after any deliberate change to Render. Then read the diff.
```

`make ci` is the whole gate. There is no check in CI that does not run locally.

## Things that are permanent

1. **`private = true` on a realm.** Removing it publishes the path forever: it can never be
   redeployed, on any chain. Do not remove it as part of another change.
2. **A published package path.** `p/moul/gnosnake/v0` cannot be edited once it is on chain.
   A behaviour change is a `v1`, via `gnopm bump`, never an edit in place.
3. **The `Leaderboard()` format.** It is a contract with a program, and it is also the proof:
   a reader verifies a line by replaying the seed and the moves it carries. A column added in
   the middle is a broken front-end with nothing on chain to fix it with.
4. **The simulator's rules.** Every stored run was verified under them. Changing a rule
   invalidates every entry on the board, and there is no migration for that: it is a new
   package and a new leaderboard.

## Things that will bite

- **`testing.SetRealm` applies to the current frame.** Wrapped in a helper it sets the
  helper's frame, the helper returns, and the caller the realm sees is unchanged. The call
  still succeeds, so the test passes for the wrong reason. Always inline it in the test
  body. This is how two different players became the same address here once.
- **`avl.Tree.Get` returns one value**, not `(value, ok)`. Check for `nil`.
- **`ufmt` has no width verbs.** Zero-padding is written by hand.
- **gno has no `sort.Slice`.** Small slices get an insertion sort; large ones want a
  different data structure.
- **JavaScript bitwise operators produce signed 32-bit values.** `web/engine.js` coerces
  with `>>> 0` after every xorshift step. One missing coercion makes the food diverge from
  the chain several hundred ticks in, which reads as a rules bug and is not.
- **Two simulators must agree.** After any change to `p/moul/gnosnake`, regenerate the
  cross-check fixtures in `web/engine.test.js`: dump `Run` results for the same seeds out of
  a temporary gno test, and paste them in. A JS port that is merely self-consistent shows
  the player a score the chain will refuse.
- **A raw string literal cannot contain a backtick**, and the pinned pages contain fenced
  code blocks. `{BT}` stands in for one and the test restores it.

## The signing path in `web/`

`crypto.js`, `amino.js` and `session.js` put a real gno signature on the wire from a browser.
They are checked against documents `gnokey` itself produced (`web/amino.test.js`) and against
the live chain (`web/session.test.js`); both run in CI. Four things here are easy to get
wrong in a way that looks fine:

- **`gas_wanted` is zigzag, not a plain varint.** 3,000,000 goes on the wire as 6,000,000.
- **A `gpub1` string is a protobuf `Any`**, not the raw key behind a fixed prefix. The
  cosmos-style four-byte prefix produces a valid-looking string the chain does not know.
- **The sign bytes are `sortJSON(aminoJSON(signDocPayload))`**, with every number a string and
  the fee restated as `{amount:[{denom,amount}],gas}`. A key out of order is a signature
  rejected with nothing useful in the message.
- **A session's account number and sequence are its own**, read from
  `auth/accounts/<master>/session/<addr>`, one level deeper than a plain account. Decoding
  that path as a `BaseAccount` yields a silent zero.

Changing any of them means regenerating the fixtures from `gnokey`, not adjusting the
expected values by hand.

## Deploying

`make stage` builds `_stage/`, which is what actually goes on chain: source, README and
`gnomod.toml`, no tests. Nothing is ever published from the working tree, because
`addpkg` packs `*_test.gno` too and the storage deposit on them is permanent.
`make publish-print` prints the transactions and runs nothing.

## Adding a page to Render

1. Write it, with no current height and no clock in it.
2. Add the path to `pinnedPaths()`.
3. `make repin`, read the diff, commit both.

## Adding a dependency

`make deps` vendors it from `GNOROOT/examples`. Commit `vendor/`. `make guards` fails on an
import that is not there, because a build that reaches for the network is a build that
fails for reasons unrelated to the change.
