// The three pieces of cryptography a gno address needs, and nothing else.
//
// secp256k1 is vendored (vendor/secp256k1.js); RIPEMD-160 and bech32 are here,
// because pulling them in would have cost more import graph than code. Both are
// fixed, published algorithms with published test vectors, and crypto.test.js
// checks this file against those vectors rather than against itself.
//
// A gno address is ripemd160(sha256(compressed pubkey)), rendered bech32 with
// the "g" prefix. A gno pubkey is the same 33 bytes behind a four-byte amino
// prefix, rendered bech32 with "gpub". Both are asserted against addresses
// gnokey itself printed.

// ---------------------------------------------------------------- RIPEMD-160

const R_R = [
  0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
  7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,
  3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,
  1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,
  4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13,
];
const R_RH = [
  5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,
  6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,
  15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,
  8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,
  12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11,
];
const R_S = [
  11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,
  7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,
  11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,
  11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,
  9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6,
];
const R_SH = [
  8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,
  9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,
  9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,
  15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,
  8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11,
];
const R_K  = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const R_KH = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

function rf(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0;
}

/** ripemd160 returns the 20-byte digest of msg. */
export function ripemd160(msg) {
  // Padding: 0x80, zeros, then the bit length as little-endian u64.
  const len = msg.length;
  const padded = new Uint8Array((((len + 8) >> 6) + 1) * 64);
  padded.set(msg);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (len << 3) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(len / 536870912), true);

  let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const x = new Uint32Array(16);

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) x[i] = view.getUint32(off + i * 4, true);
    let [a, b, c, d, e] = h;
    let [ah, bh, ch, dh, eh] = h;
    for (let j = 0; j < 80; j++) {
      const r = (j / 16) | 0;
      let t = (a + rf(j, b, c, d) + x[R_R[j]] + R_K[r]) >>> 0;
      t = (rol(t, R_S[j]) + e) >>> 0;
      a = e; e = d; d = rol(c, 10); c = b; b = t;

      let th = (ah + rf(79 - j, bh, ch, dh) + x[R_RH[j]] + R_KH[r]) >>> 0;
      th = (rol(th, R_SH[j]) + eh) >>> 0;
      ah = eh; eh = dh; dh = rol(ch, 10); ch = bh; bh = th;
    }
    // The state combination rotates: h0 takes h1's line, not its own. Writing
    // it as a rotated array instead put the right five words in the wrong five
    // slots, which produced a digest that was a rotation of the correct one and
    // passed nothing.
    h = [
      (h[1] + c + dh) >>> 0,
      (h[2] + d + eh) >>> 0,
      (h[3] + e + ah) >>> 0,
      (h[4] + a + bh) >>> 0,
      (h[0] + b + ch) >>> 0,
    ];
  }

  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  h.forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

// ------------------------------------------------------------------- bech32

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

const expand = (hrp) => [
  ...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0,
  ...[...hrp].map((c) => c.charCodeAt(0) & 31),
];

function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits > 0) out.push((acc << (to - bits)) & maxv); }
  else if (bits >= from || ((acc << (to - bits)) & maxv)) return null;
  return out;
}

/** bech32Encode renders bytes under a human-readable prefix. */
export function bech32Encode(hrp, bytes) {
  const data = convertBits([...bytes], 8, 5, true);
  const chk = polymod([...expand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const sum = [];
  for (let i = 0; i < 6; i++) sum.push((chk >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...sum].map((d) => CHARSET[d]).join("");
}

/** bech32Decode returns the bytes, or null if the checksum does not hold. */
export function bech32Decode(hrp, str) {
  if (!str.startsWith(hrp + "1")) return null;
  const body = str.slice(hrp.length + 1);
  const data = [];
  for (const c of body) {
    const i = CHARSET.indexOf(c);
    if (i < 0) return null;
    data.push(i);
  }
  if (polymod([...expand(hrp), ...data]) !== 1) return null;
  const bytes = convertBits(data.slice(0, -6), 5, 8, false);
  return bytes === null ? null : new Uint8Array(bytes);
}

// ------------------------------------------------------- addresses and keys

/** sha256 over bytes, via WebCrypto. */
export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

/**
 * addressOf derives the g1... address of a compressed (33-byte) public key:
 * bech32("g", ripemd160(sha256(pubkey))), which is what
 * PubKeySecp256k1.Address() does in tm2.
 */
export async function addressOf(pubkey) {
  return bech32Encode("g", ripemd160(await sha256(pubkey)));
}

// A gpub1 string is NOT the raw key behind a fixed prefix, which is what the
// cosmos-style four-byte amino prefix would give you and what gnokey does not
// print. It is the protobuf Any that amino writes for the PubKey interface:
//
//   Any{ type_url: "/tm.PubKeySecp256k1", value: { 1: <33 raw bytes> } }
//
// Decoding a real gnokey gpub1 is how this was settled (2026-09-30): the bytes
// begin 0a 13 "/tm.PubKeySecp256k1" 12 23 0a 21, and the raw key sits at offset
// 25. Getting it wrong yields a valid-looking bech32 string that the chain does
// not recognise, which is the worst kind of wrong.
const PUBKEY_TYPE_URL = "/tm.PubKeySecp256k1";

// Field tags are constants of the encoding: 0x0a is field 1 length-delimited,
// 0x12 is field 2. Every length here is below 128, so a varint is one byte;
// lengths are asserted rather than encoded generally, because a silent
// truncation would again produce a plausible string.
function protoField(tag, bytes) {
  if (bytes.length > 127) throw new Error("gnosession: field too long for a one-byte varint");
  const out = new Uint8Array(2 + bytes.length);
  out[0] = tag;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return out;
}

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** pubkeyBech32 renders a compressed public key as gpub1..., as gnokey prints it. */
export function pubkeyBech32(pubkey) {
  const inner = protoField(0x0a, pubkey);
  const any = concat(
    protoField(0x0a, new TextEncoder().encode(PUBKEY_TYPE_URL)),
    protoField(0x12, inner),
  );
  return bech32Encode("gpub", any);
}

export const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (s) => Uint8Array.from(s.match(/.{2}/g) ?? [], (b) => parseInt(b, 16));
