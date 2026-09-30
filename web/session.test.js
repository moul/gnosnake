// The session module, checked against the live chain and against gnokey's own
// grammar. Run: node web/session.test.js
//
// The parts that touch mainnet are read-only and free. They are here because
// the shape of `auth/accounts/<master>/sessions` is the one thing no local
// fixture can keep honest: it is a chain response, and a chain upgrade is
// exactly what would change it.
import * as s from "./session.js";

let failures = 0;
const check = (ok, msg) => { if (!ok) { console.error("FAIL", msg); failures++; } };

const RPC = "https://rpc.gno.land:443";
// moul's account, and one of its live sessions: a public, read-only fixture.
const MASTER = "g1manfred47kzduec920z88wfr64ylksmdcedlf5";
const HOME_SESSION_PUB = "A8g7B5TnlpoWM6SkUIz871TXJ/hBMzgmyQYSSuxsIm6s";

// --- the grant command, which is the whole onboarding
const fake = {
  realm: "gno.land/r/moul/gnosnake",
  master: MASTER,
  gpub: "gpub1pgfj7ard9eg82cjtv4u4xetrwqer2dntxyfzxz3pqtlyxp6j8nunxt8dlt2h9kclue5cx8t36448fl79wkwdsfzw54ds6xznhk2",
  lifetime: "1h",
  budget: "0.1",
};
const cmd = s.grantCommand({ session: fake, keyName: "moul", chainId: "gnoland-1", rpc: RPC });
check(cmd.includes("-expires-at 1h"), "the lifetime the player picked is the duration gnokey reads");
check(cmd.includes("-allow-paths 'vm/exec:gno.land/r/moul/gnosnake'"), "the grant names one realm and nothing else");
check(cmd.includes("-spend-limit 100000ugnot"), "the budget is in ugnot");
check(cmd.includes("-spend-period 0"), "a lifetime cap, not a rolling window");
check(cmd.includes(" moul"), "the command names the player's key");
check(!cmd.includes("<"), "no placeholders: the command is meant to be pasted");

// Every offered lifetime must be something gnokey's parser accepts: it takes
// Go durations plus d and w, so "1h" and "24h" are fine and "1day" is not.
for (const l of s.LIFETIMES) {
  check(/^\d+(\.\d+)?(ns|us|ms|s|m|h|d|w)$/.test(l.id), `lifetime ${l.id} is not a duration gnokey parses`);
  check(l.seconds > 0 && l.seconds <= 86400, `lifetime ${l.id} is longer than a day`);
}
// A session key in a browser is only as safe as its ceiling, so the ceiling is
// asserted rather than trusted to review.
for (const b of s.BUDGETS) check(b.ugnot <= 2000000, `budget ${b.id} is over 2 GNOT`);

const rev = s.revokeCommand({ session: fake, keyName: "moul", chainId: "gnoland-1", rpc: RPC });
check(rev.includes("-pubkey gpub1"), "revoke identifies the session by pubkey, not by address");

// --- the chain, read-only
try {
  const granted = await s.grantOf(RPC, { master: MASTER, pub: HOME_SESSION_PUB, realm: "gno.land/r/moul/home" });
  check(granted !== null, "a live session is found in the master's list");
  if (granted) {
    check(/^g1[a-z0-9]{38}$/.test(granted.address), `session address looks wrong: ${granted.address}`);
    check(granted.expiresAt > 1700000000, "expires_at is a unix timestamp");
    check(granted.spendLimit > 0, "spend_limit parses as ugnot");
    check(granted.allowPaths.length > 0, "allow_paths is carried through");
    check(granted.covers === true, "a grant is reported as covering the realm it names");
    const elsewhere = await s.grantOf(RPC, { master: MASTER, pub: HOME_SESSION_PUB, realm: "gno.land/r/moul/gnosnake" });
    check(elsewhere.covers === false, "and as NOT covering a realm it does not name");
    const seq = await s.refreshSequence(RPC, { master: MASTER }, granted.address);
    // The session's own numbers, one level deeper than a plain account. A
    // BaseAccount decode of this path yields a silent zero, and account_number
    // is never zero for a real account.
    check(seq.accountNumber > 0, `account number read as ${seq.accountNumber}: decoded at the wrong depth?`);
    check(Number.isInteger(seq.sequence), "sequence is a number");
  }

  // A key the master never granted must come back null, not throw and not
  // match somebody else's session.
  const absent = await s.grantOf(RPC, { master: MASTER, pub: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", realm: "x" });
  check(absent === null, "an ungranted key is not found");
} catch (err) {
  // The public RPC 403s under load, and that is not this module being wrong.
  // But skipping on ANY error makes a real bug look like a quiet network day:
  // the first version of this swallowed a TypeError and still printed ok. Only
  // a transport failure is a skip; anything else fails.
  if (/HTTP \d|fetch failed|ENOTFOUND|ETIMEDOUT|network/i.test(err.message)) {
    console.error(`SKIP  chain checks, the node did not answer: ${err.message}`);
  } else {
    check(false, `chain checks threw: ${err.stack || err.message}`);
  }
}

// --- AllowPaths, which decides whether a live grant is usable at all
const R = "gno.land/r/moul/gnosnake";
check(s.covers(["vm/exec:gno.land/r/moul/gnosnake"], R), "the exact realm is covered");
check(s.covers(["vm/exec:gno.land/r/moul"], R), "a parent path covers it");
check(s.covers(["vm/exec:gno.land/r"], R), "a broad grant covers it");
check(s.covers(["*"], R), "a wildcard covers everything");
check(s.covers(["vm/exec:gno.land/r/other", "vm/exec:gno.land/r/moul/gnosnake"], R), "any one entry is enough");
// The trap: a trailing digit is not a path segment, so prefix matching alone
// would let a grant for gno4 be used against gno42, and the other way round.
check(!s.covers(["vm/exec:gno.land/r/moul/gnosnake2"], R), "a longer sibling does not cover it");
check(!s.covers(["vm/exec:gno.land/r/moul/gnosnake"], "gno.land/r/moul/gnosnake2"), "nor the reverse");
check(!s.covers(["vm/exec:gno.land/r/moul/home"], R), "another realm does not cover it");
check(!s.covers(["bank/send:gno.land/r/moul/gnosnake"], R), "another route does not cover it");
check(!s.covers([], R), "no entries cover nothing");

console.log(failures === 0 ? "ok  session.js" : `FAIL ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
