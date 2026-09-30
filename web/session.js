// Account sessions, from the browser.
//
// A session is a delegated signing key: a separate account under the player's
// own, which signs on their behalf. The chain still sees the MASTER as the
// caller, so the seat, the record and the leaderboard entry are all the
// player's real address. That is the property that makes this worth doing: an
// ordinary throwaway account would be a different player.
//
// The bargain, stated plainly because the whole design rests on it: the private
// key lives in localStorage, so anything that can run script on this page can
// sign as the player inside the grant. The mitigation is the GRANT, never the
// secrecy of the key. Hence one realm, minutes or hours rather than months, and
// a spend limit measured in fractions of a GNOT.
//
// What this cannot do yet: create the grant. Adena's DoContract accepts
// /bank.MsgSend, /vm.m_call, /vm.m_addpkg and /vm.m_run and nothing else, so
// there is no wallet path to /auth.m_create_session today. The player runs one
// gnokey command, once. grantCommand builds it.

import * as secp from "./vendor/secp256k1.js";
import * as amino from "./amino.js";
import { addressOf, pubkeyBech32, bech32Decode, sha256, toBase64, toHex, fromHex } from "./crypto.js";

/** The offered lifetimes. Short on purpose: see the note at the top. */
export const LIFETIMES = [
  { id: "1h", label: "1 hour", seconds: 3600 },
  { id: "8h", label: "8 hours", seconds: 28800 },
  { id: "24h", label: "1 day", seconds: 86400 },
];

/** The offered budgets, in ugnot. A move costs gas in the thousands. */
export const BUDGETS = [
  { id: "0.1", label: "0.1 GNOT", ugnot: 100000 },
  { id: "0.5", label: "0.5 GNOT", ugnot: 500000 },
  { id: "2", label: "2 GNOT", ugnot: 2000000 },
];

const storageKey = (realm) => `gnosession:${realm}`;

/**
 * create mints a key and remembers it. It does NOT touch the chain: nothing is
 * delegated until the player runs the grant command, and a key with no grant
 * signs nothing.
 */
export async function create({ realm, master, lifetime, budget }) {
  const priv = secp.utils.randomPrivateKey();
  const pub = secp.getPublicKey(priv, true);
  const record = {
    realm,
    master,
    priv: toHex(priv),
    pub: toBase64(pub),
    address: await addressOf(pub),
    gpub: pubkeyBech32(pub),
    lifetime,
    budget,
    createdAt: Math.floor(Date.now() / 1000),
  };
  localStorage.setItem(storageKey(realm), JSON.stringify(record));
  return record;
}

/** load returns the stored session for a realm, or null. */
export function load(realm) {
  try {
    const raw = localStorage.getItem(storageKey(realm));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // corrupt storage is the same as none, and says so louder
  }
}

/** forget drops the local key. It does NOT revoke: see revokeCommand. */
export function forget(realm) {
  localStorage.removeItem(storageKey(realm));
}

/**
 * grantCommand is the one thing the player runs in a terminal.
 *
 * `-allow-paths` is a prefix over the realm alone, so the session cannot call
 * anything else with the player's identity. `-spend-period 0` makes the budget
 * a lifetime cap rather than a rolling window, which for a session measured in
 * hours is the same thing and one fewer number to explain.
 */
export function grantCommand({ session, keyName = "YOURKEY", chainId, rpc }) {
  const life = LIFETIMES.find((l) => l.id === session.lifetime) ?? LIFETIMES[0];
  const ugnot = BUDGETS.find((b) => b.id === session.budget)?.ugnot ?? 100000;
  // The id doubles as the duration gnokey parses ("1h", "24h"), so the player
  // reads the same number they picked. Nothing converts it to seconds and back.
  return [
    `gnokey maketx session create \\`,
    `  -pubkey ${session.gpub} \\`,
    `  -expires-at ${life.id} \\`,
    `  -allow-paths 'vm/exec:${session.realm}' \\`,
    `  -spend-limit ${ugnot}ugnot -spend-period 0 \\`,
    `  -gas-fee 1000000ugnot -gas-wanted 2000000 \\`,
    `  -broadcast -chainid ${chainId} -remote ${rpc} ${keyName}`,
  ].join("\n");
}

/** revokeCommand ends the grant early. It identifies the session by PUBKEY. */
export function revokeCommand({ session, keyName = "YOURKEY", chainId, rpc }) {
  return [
    `gnokey maketx session revoke \\`,
    `  -pubkey ${session.gpub} \\`,
    `  -gas-fee 1000000ugnot -gas-wanted 2000000 \\`,
    `  -broadcast -chainid ${chainId} -remote ${rpc} ${keyName}`,
  ].join("\n");
}

// ------------------------------------------------------------ chain queries

const hex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function abci(rpcUrl, path, data) {
  const url = `${rpcUrl}/abci_query?path=${encodeURIComponent(`"${path}"`)}` +
    (data === undefined ? "" : `&data=0x${hex(data)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${path}: ${body.error.data || body.error.message}`);
  const rb = body.result.response.ResponseBase || body.result.response;
  if (!rb.Data) return null; // "no such thing" and "it failed" are different; see the caller
  return JSON.parse(atob(rb.Data));
}

/**
 * grantOf returns the live grant for a session, or null.
 *
 * It reads the MASTER's session list and matches on the public key, rather than
 * asking about the session address: `auth/accounts/<session>` answers the JSON
 * literal null for a session, because a session is not a plain account, and
 * only `auth/accounts/<master>/session/<addr>` answers at all.
 */
export async function grantOf(rpcUrl, session) {
  const list = await abci(rpcUrl, `auth/accounts/${session.master}/sessions`);
  if (!Array.isArray(list)) return null; // null = grants none; an error would have thrown
  const found = list.find((s) => s?.BaseSessionAccount?.BaseAccount?.public_key?.value === session.pub);
  if (!found) return null;
  const base = found.BaseSessionAccount;
  const allowPaths = found.allow_paths ?? [];
  return {
    covers: covers(allowPaths, session.realm),
    address: base.BaseAccount.address,
    accountNumber: Number(base.BaseAccount.account_number),
    sequence: Number(base.BaseAccount.sequence),
    expiresAt: Number(base.expires_at),
    allowPaths,
    spendLimit: coinUgnot(base.spend_limit),
    spendUsed: coinUgnot(base.spend_used),
  };
}

/**
 * refreshSequence re-reads the session's own account number and sequence.
 *
 * They belong to the SESSION and not to the master, and they live one level
 * deeper than a plain account: decoding that path as a BaseAccount yields a
 * silent zero rather than an error, and since the sign bytes cover both, the
 * result is a signature the chain rejects with nothing useful in the message.
 */
export async function refreshSequence(rpcUrl, session, sessionAddr) {
  const acc = await abci(rpcUrl, `auth/accounts/${session.master}/session/${sessionAddr}`);
  const base = acc?.BaseSessionAccount?.BaseAccount;
  if (!base) throw new Error("the chain does not know this session");
  return { accountNumber: Number(base.account_number), sequence: Number(base.sequence) };
}

/**
 * covers reports whether a grant's AllowPaths let it call this realm.
 *
 * Worth checking rather than assuming: a key granted for another realm is a
 * perfectly live grant, and treating it as usable here means every move fails
 * with an authorization error the player cannot act on.
 *
 * The match is by PATH SEGMENT, not by string prefix. `vm/exec:.../gno4` must
 * not cover `.../gno42`, and a trailing version digit is not a segment either,
 * which is the same trap that made one session need five entries to cover
 * `bubblerumble` through `bubblerumble5`.
 */
export function covers(allowPaths, realm) {
  return allowPaths.some((entry) => {
    if (entry === "*") return true;
    const [route, path] = splitEntry(entry);
    if (route !== "vm/exec") return false;
    return realm === path || realm.startsWith(path + "/");
  });
}

function splitEntry(entry) {
  const i = entry.indexOf(":");
  return i < 0 ? [entry, ""] : [entry.slice(0, i), entry.slice(i + 1)];
}

const coinUgnot = (s) => {
  const m = /^(\d+)ugnot$/.exec(s ?? "");
  return m ? Number(m[1]) : 0;
};

// ------------------------------------------------------------------ signing

/**
 * call signs one realm call with the session key and broadcasts it.
 *
 * The caller in the message is the MASTER: that is what makes the realm see the
 * player. The signature carries the session address, which is what tells the
 * ante handler to look for a grant instead of expecting the master's own key.
 */
export async function call({ rpcUrl, chainId, session, grant, func, args = [], gasWanted = 3000000, gasFee = "1000000ugnot" }) {
  const { accountNumber, sequence } = await refreshSequence(rpcUrl, session, grant.address);

  const msgJson = {
    "@type": "/vm.m_call",
    caller: session.master,
    send: "",
    max_deposit: "",
    pkg_path: session.realm,
    func,
    args: args.map(String),
  };
  const bytes = amino.signBytes({
    chainId, accountNumber, sequence, gasWanted, gasFee, msgs: [msgJson], memo: "",
  });
  const sig = await secp.signAsync(await sha256(bytes), fromHex(session.priv), { lowS: true, prehash: false });
  const compact = sig.toCompactRawBytes ? sig.toCompactRawBytes() : sig.toBytes();

  const raw = amino.tx({
    msgs: [amino.msgCall({ caller: session.master, pkgPath: session.realm, func, args })],
    fee: amino.fee({ gasWanted, gasFee }),
    signatures: [amino.signature({
      pubkeyAny: bech32Decode("gpub", session.gpub),
      sig: compact,
      sessionAddr: grant.address,
    })],
  });

  return broadcast(rpcUrl, raw);
}

/** broadcast posts the encoded transaction and reports what the chain said. */
export async function broadcast(rpcUrl, raw) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: Date.now(), method: "broadcast_tx_commit",
      params: { tx: toBase64(raw) },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.data || body.error.message);
  const r = body.result;
  // check_tx rejects before the block, deliver_tx after it. Reporting only one
  // of them is how "it went through" gets said about a transaction that did not.
  for (const phase of ["check_tx", "deliver_tx"]) {
    if (r?.[phase]?.ResponseBase?.Error || r?.[phase]?.Error) {
      const log = r[phase].ResponseBase?.Log || r[phase].Log || phase;
      throw new Error(String(log).split("\n")[0]);
    }
  }
  return r;
}
