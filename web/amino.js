// Just enough amino to put a transaction on the wire.
//
// The RPC takes a transaction as amino BINARY, not the JSON gnokey writes to a
// file, so a browser that wants to broadcast has to encode it. Amino's binary
// form here is proto3 with two twists: an interface value (a Msg, a PubKey) is
// a protobuf `Any`, and a signed integer is zigzag-encoded.
//
// This encodes exactly one transaction shape: a single MsgCall, a fee, one
// signature. Not because the rest is hard, but because every case it does not
// cover is a case nothing tests, and an encoder that is quietly wrong produces
// a transaction the chain rejects with nothing useful in the message.
// amino.test.js checks the output byte for byte against a transaction gnokey
// itself produced.

const enc = new TextEncoder();

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** uvarint encodes an unsigned integer, LEB128. */
export function uvarint(n) {
  const out = [];
  let v = BigInt(n);
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
  return Uint8Array.from(out);
}

/**
 * svarint encodes a signed integer zigzag, which is what amino does for every
 * int64 field. `gas_wanted: 3000000` goes on the wire as 6000000; reading that
 * as a plain varint is how a fee silently doubles.
 */
export const svarint = (n) => uvarint(BigInt(n) >= 0n ? BigInt(n) * 2n : -BigInt(n) * 2n - 1n);

const tag = (field, wire) => uvarint(field * 8 + wire);
const WIRE_VARINT = 0, WIRE_LEN = 2;

/** fieldBytes writes a length-delimited field. Empty is omitted, as amino omits it. */
export function fieldBytes(field, bytes) {
  if (!bytes || bytes.length === 0) return new Uint8Array(0);
  return concat(tag(field, WIRE_LEN), uvarint(bytes.length), bytes);
}

export const fieldString = (field, s) => fieldBytes(field, enc.encode(s ?? ""));

/** fieldInt writes a zigzag varint field. Zero is omitted. */
export function fieldInt(field, n) {
  if (!n) return new Uint8Array(0);
  return concat(tag(field, WIRE_VARINT), svarint(n));
}

/** any wraps a concrete value as the protobuf Any amino uses for interfaces. */
export const any = (typeUrl, value) =>
  concat(fieldString(1, typeUrl), fieldBytes(2, value));

// ------------------------------------------------------------ the tx shapes

/**
 * msgCall encodes /vm.m_call. Fields 2 (send) and 3 (max_deposit) are Coins and
 * are deliberately unsupported: every call this signs sends nothing, and an
 * encoder for a case with no test is worse than no encoder.
 */
export function msgCall({ caller, pkgPath, func: fn, args = [], send, maxDeposit }) {
  if (send || maxDeposit) throw new Error("gnosession: this encoder does not carry coins");
  return any("/vm.m_call", concat(
    fieldString(1, caller),
    fieldString(4, pkgPath),
    fieldString(5, fn),
    ...args.map((a) => fieldString(6, String(a))),
  ));
}

/** fee encodes std.Fee: a zigzag gas_wanted and the gas fee as one coin string. */
export const fee = ({ gasWanted, gasFee }) =>
  concat(fieldInt(1, gasWanted), fieldString(2, gasFee));

/**
 * signature encodes std.Signature. sessionAddr is what makes this a delegated
 * signature: the ante handler loads /a/<signer>/s/<sessionAddr> when it is set,
 * and treats the transaction as master-signed when it is not.
 */
export const signature = ({ pubkeyAny, sig, sessionAddr }) =>
  concat(fieldBytes(1, pubkeyAny), fieldBytes(2, sig), fieldString(3, sessionAddr ?? ""));

/** tx encodes std.Tx: msgs, fee, signatures, memo. */
export const tx = ({ msgs, fee: f, signatures, memo = "" }) =>
  concat(
    ...msgs.map((m) => fieldBytes(1, m)),
    fieldBytes(2, f),
    ...signatures.map((s) => fieldBytes(3, s)),
    fieldString(4, memo),
  );

// -------------------------------------------------------------- sign bytes

/**
 * sortValue orders object keys recursively. The signature covers
 * sortJSON(aminoJSON(signDocPayload)), so a key out of order is a signature the
 * chain rejects with no indication of why.
 */
function sortValue(v) {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortValue(v[k])]));
  }
  return v;
}

/**
 * signBytes builds the document the signature covers.
 *
 * The fee is NOT std.Fee here: the payload restates it as {amount:[{denom,
 * amount}], gas}, which is the shape the Ledger Cosmos app allows, and a zero
 * fee is an EMPTY LIST rather than a list holding a zero coin. Every number is
 * a string, because amino JSON renders integers that way.
 */
export function signBytes({ chainId, accountNumber, sequence, gasWanted, gasFee, msgs, memo = "" }) {
  const m = /^(\d+)([a-z]+)$/.exec(gasFee ?? "");
  const amount = !m || m[1] === "0" ? [] : [{ denom: m[2], amount: m[1] }];
  if (gasFee && !m) throw new Error(`gnosession: cannot read the fee "${gasFee}"`);
  return enc.encode(JSON.stringify(sortValue({
    chain_id: chainId,
    account_number: String(accountNumber),
    sequence: String(sequence),
    fee: { amount, gas: String(gasWanted) },
    msgs,
    memo,
  })));
}
