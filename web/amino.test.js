// The encoder must agree with gnokey, byte for byte.
//
// Every fixture below came out of gnokey itself: a MsgCall transaction signed
// offline against chain gnoland-1, account 42, sequence 7. A transaction that
// is merely plausible is rejected by the chain with nothing useful in the
// message, so "it looks right" is not a test.
//
// Run: node web/amino.test.js
import * as a from "./amino.js";
import * as c from "./crypto.js";

let failures = 0;
const check = (ok, msg) => { if (!ok) { console.error("FAIL", msg); failures++; } };

// --- the fixture, produced by:
//   gnokey sign -tx-path tx.json -chainid gnoland-1 -account-number 42 -account-sequence 7
const CALLER = "g1pp369gqpj8crdssagjgmdyzf47q69uhedsfv20";
const PUBKEY_B64 = "Av5DB1I8+TMs7frVctsf5mmDHXHVanT/xXWc2CROpVsN";
const GPUB = "gpub1pgfj7ard9eg82cjtv4u4xetrwqer2dntxyfzxz3pqtlyxp6j8nunxt8dlt2h9kclue5cx8t36448fl79wkwdsfzw54ds6xznhk2";
const SIG_B64 = "kv/L6qEMtSX8D/yREZff8NiUId8hfK9tfyWb2IfY0MAfueo7oZ3yJoNTMf8exOdlDPOKLT153tV6y2kYHTmDng==";
const WANT_HEX = "0a5a0a0a2f766d2e6d5f63616c6c124c0a28673170703336396771706a38637264737361676a676d64797a6634377136397568656473667632302214676e6f2e6c616e642f722f6d6f756c2f676e6f342a04506c6179320137320134121308809bee02120c3130303030303075676e6f741aa8010a3a0a132f746d2e5075624b6579536563703235366b3112230a2102fe4307523cf9332cedfad572db1fe669831d71d56a74ffc5759cd8244ea55b0d124092ffcbeaa10cb525fc0ffc911197dff0d89421df217caf6d7f259bd887d8d0c01fb9ea3ba19df226835331ff1ec4e7650cf38a2d3d79ded57acb69181d39839e1a2867317171717171717171717171717171717171717171717171717171717171717171716c75757865";
// Printed by tx.GetSignBytes on the same document.
const WANT_SIGN_BYTES = '{"account_number":"42","chain_id":"gnoland-1","fee":{"amount":[{"amount":"1000000","denom":"ugnot"}],"gas":"3000000"},"memo":"","msgs":[{"@type":"/vm.m_call","args":["7","4"],"caller":"g1pp369gqpj8crdssagjgmdyzf47q69uhedsfv20","func":"Play","max_deposit":"","pkg_path":"gno.land/r/moul/gno4","send":""}],"sequence":"7"}';

const pubkey = c.fromBase64(PUBKEY_B64);

// --- the pieces, against what gnokey printed when it made the key
check(await c.addressOf(pubkey) === CALLER, "address derivation");
check(c.pubkeyBech32(pubkey) === GPUB, "gpub encoding");
// The zero address is not a constant to type out: it is bech32 of twenty zero
// bytes, and typing it produced a string two characters too long that encoded
// cleanly and made the whole transaction two bytes wrong.
const ZERO = c.bech32Encode("g", new Uint8Array(20));
check(ZERO === "g1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqluuxe", `zero address: ${ZERO}`);

// --- the sign document
const sb = new TextDecoder().decode(a.signBytes({
  chainId: "gnoland-1", accountNumber: 42, sequence: 7,
  gasWanted: 3000000, gasFee: "1000000ugnot",
  msgs: [{
    "@type": "/vm.m_call", caller: CALLER, send: "", max_deposit: "",
    pkg_path: "gno.land/r/moul/gno4", func: "Play", args: ["7", "4"],
  }],
  memo: "",
}));
check(sb === WANT_SIGN_BYTES, `sign bytes:\n  got  ${sb}\n  want ${WANT_SIGN_BYTES}`);

// A zero fee is an empty list, not a list holding a zero coin. The Ledger app
// displays every coin it is handed, so the difference is visible and signed.
const zeroFee = JSON.parse(new TextDecoder().decode(a.signBytes({
  chainId: "x", accountNumber: 0, sequence: 0, gasWanted: 0, gasFee: "", msgs: [],
})));
check(Array.isArray(zeroFee.fee.amount) && zeroFee.fee.amount.length === 0, "a zero fee is an empty list");

// --- the whole transaction
const got = c.toHex(a.tx({
  msgs: [a.msgCall({ caller: CALLER, pkgPath: "gno.land/r/moul/gno4", func: "Play", args: ["7", "4"] })],
  fee: a.fee({ gasWanted: 3000000, gasFee: "1000000ugnot" }),
  signatures: [a.signature({
    pubkeyAny: c.bech32Decode("gpub", GPUB),
    sig: c.fromBase64(SIG_B64),
    sessionAddr: ZERO,
  })],
}));
if (got !== WANT_HEX) {
  let i = 0;
  while (i < Math.min(got.length, WANT_HEX.length) && got[i] === WANT_HEX[i]) i++;
  check(false, `amino binary diverges at hex index ${i}\n  got  …${got.slice(Math.max(0, i - 16), i + 32)}\n  want …${WANT_HEX.slice(Math.max(0, i - 16), i + 32)}`);
} else check(true, "");

// --- the two encodings that are easy to get silently wrong
check(c.toHex(a.svarint(3000000)) === "809bee02", "gas_wanted is zigzag, not a plain varint");
check(c.toHex(a.uvarint(3000000)) === "c08db701", "uvarint is not zigzag");
check(a.fieldString(4, "").length === 0, "an empty field is omitted, as amino omits it");

// The encoder refuses what it cannot encode instead of dropping it, because a
// silently dropped `send` is a transaction that moves no coins and says nothing.
let refused = false;
try { a.msgCall({ caller: CALLER, pkgPath: "x", func: "y", send: "1ugnot" }); }
catch { refused = true; }
check(refused, "msgCall refuses coins rather than dropping them");

console.log(failures === 0
  ? "ok  amino.js is byte-identical to gnokey on every fixture"
  : `FAIL ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
