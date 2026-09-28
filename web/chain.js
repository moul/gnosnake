// Reading a gno chain, and asking a wallet to write to one.
//
// Two rules shape this file. Reading needs nothing from the visitor: no wallet,
// no account, no signature, so the whole app works on a first visit and a
// shared link opens for anybody. Writing needs a signature and nothing else, so
// the write path is one function and the fallback is a command you can paste.

export const NETWORKS = {
  mainnet: { rpc: "https://rpc.gno.land:443", chainId: "gnoland-1", realm: "gno.land/r/moul/gnosnake" },
  preview: { rpc: "https://rpc.gno.land:443", chainId: "gnoland-1", realm: "gno.land/r/moul/gnosnake/preview" },
  local:   { rpc: "http://127.0.0.1:26657",   chainId: "dev",       realm: "gno.land/r/moul/gnosnake" },
};

const hex = (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function abci(net, path, data) {
  const url = `${net.rpc}/abci_query?path=${encodeURIComponent(`"${path}"`)}&data=0x${hex(data)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${path}: ${body.error.data || body.error.message}`);
  const rb = body.result.response.ResponseBase || body.result.response;
  // A gno query reports its failure in Log with a 200 and no Data. Treating a
  // null Data as "empty" instead of "error" is how a broken query turns into a
  // page that looks merely empty.
  if (!rb.Data) throw new Error(rb.Log ? String(rb.Log).split("\n")[0] : `${path}: empty response`);
  return atob(rb.Data);
}

export const qrender = (net, path) => abci(net, "vm/qrender", `${net.realm}:${path}`);

// qeval answers with a Go-ish tuple: ("text" string). Only single-string
// returns are used here, which is why the realm exposes Feed and Line: one
// string each, so this parser stays three lines and cannot drift.
export async function qevalString(net, expr) {
  const raw = await abci(net, "vm/qeval", `${net.realm}.${expr}`);
  const m = raw.match(/^\("((?:[^"\\]|\\.)*)" string\)$/s);
  if (!m) throw new Error(`unexpected qeval shape: ${raw.slice(0, 120)}`);
  return JSON.parse(`"${m[1]}"`);
}

// A feed row is id, red, yellow, moves, state. Nothing is derived from the
// rendered page: scraping markdown means a wording change breaks the app.
export function parseFeed(text) {
  return text.split("\n").filter(Boolean).map((row) => {
    const [id, red, yellow, moves, state] = row.split("\t");
    return { id: Number(id), red, yellow, moves: moves || "", state };
  });
}

export const wallet = {
  available: () => typeof window !== "undefined" && !!window.adena,

  async connect() {
    if (!this.available()) throw new Error("no Adena wallet in this browser");
    await window.adena.AddEstablish("gnosnake");
    const { data } = await window.adena.GetAccount();
    return data.address;
  },

  async call(net, caller, fn, args) {
    const res = await window.adena.DoContract({
      messages: [{
        type: "/vm.m_call",
        value: { caller, send: "", pkg_path: net.realm, func: fn, args: args.map(String) },
      }],
      // Deliberately generous and deliberately flagged in the UI: these are not
      // measured numbers. A front-end cannot simulate, so it over-provides and
      // says so, rather than quoting a figure it did not obtain.
      gasFee: 1000000,
      gasWanted: 3000000,
    });
    if (res.code !== 0) throw new Error(res.message || `transaction failed (code ${res.code})`);
    return res;
  },
};

// The fallback, and the thing to paste into an issue when something is wrong:
// the exact command that does what the button would have done.
export function gnokeyCommand(net, fn, args, key = "YOURKEY") {
  const a = args.map((v) => `-args ${v}`).join(" ");
  return [
    `gnokey maketx call -pkgpath ${net.realm} -func ${fn}${a ? " " + a : ""} \\`,
    `  -gas-fee 1000000ugnot -gas-wanted 3000000 -broadcast \\`,
    `  -chainid ${net.chainId} -remote ${net.rpc} ${key}`,
  ].join("\n");
}
