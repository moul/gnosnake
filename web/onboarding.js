// The session onboarding panel: one form, one command, then no more popups.
//
// Four states and nothing else, because every extra state here is a way for a
// player to end up holding a key the chain has never heard of:
//
//   no wallet   -> nothing to grant against; connect first
//   no key      -> pick a lifetime and a budget, mint a key locally
//   ungranted   -> one command to paste; poll the chain until it appears
//   granted     -> time and budget left, and how to end it early
//
// The panel owns no game logic. It hands back a `session` and a `grant` and the
// app signs with them, or falls back to the wallet when there is none.
import * as session from "./session.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function remaining(expiresAt) {
  if (!expiresAt) return "no expiry"; // a grant may carry none; say so rather than "NaN hours"
  const left = expiresAt - Math.floor(Date.now() / 1000);
  if (left <= 0) return null;
  if (left < 3600) return plural(Math.ceil(left / 60), "minute");
  if (left < 172800) return plural(Math.round(left / 3600), "hour");
  return plural(Math.round(left / 86400), "day");
}

/**
 * mount renders the panel into el and keeps it current.
 *
 * getAccount returns the connected address or null; onChange is called with
 * {session, grant} whenever the app's signing path should change, and with
 * nulls when it should go back to the wallet.
 */
export function mount({ el, net, getAccount, setAccount, onChange, keyName = "YOURKEY" }) {
  let record = null;      // the local key, or null
  let grant = null;       // the live grant, or null
  let polling = null;
  let busy = "";

  const realm = () => net().realm;
  const rpc = () => net().rpc;

  function emit() {
    // Usable means all three: granted, unexpired, and scoped to this realm.
    const usable = grant && grant.covers && remaining(grant.expiresAt);
    onChange(usable ? { session: record, grant } : { session: null, grant: null });
  }

  async function refresh() {
    record = session.load(realm());
    if (!record || record.master !== getAccount()) {
      // A key minted for another account signs for that account and not this
      // one. Treat it as absent rather than offering it: the grant would be
      // real and the player would be somebody else.
      grant = null;
      render();
      emit();
      return;
    }
    try {
      grant = await session.grantOf(rpc(), record);
    } catch {
      grant = null; // the node did not answer; the panel says so rather than guessing
    }
    render();
    emit();
  }

  function render() {
    const account = getAccount();
    if (!account) {
      // A wallet is one way to name yourself, not the only one. Whoever can run
      // the grant command already has a key; making them install an extension
      // to use it would be the sort of requirement this whole exploration is
      // about removing.
      el.innerHTML = `
        <p>Playing needs an account. Connect a wallet above, or just say which
        address is yours: a session is granted by a command you run yourself, so
        nothing here has to hold your keys.</p>
        <div class="sess-row">
          <input id="sess-addr" placeholder="g1…" spellcheck="false" aria-label="your address">
          <button id="sess-use" type="button">Use it</button>
        </div>`;
      return;
    }
    if (!record || record.master !== account) return renderForm();
    if (!grant) return renderPending();
    const left = remaining(grant.expiresAt);
    if (!left) return renderExpired();
    if (!grant.covers) return renderWrongScope();
    return renderGranted(left);
  }

  function renderForm() {
    el.innerHTML = `
      <p>A session is a key this page holds, delegated by your account. The chain still
      sees <b>you</b> as the player, so your seat and your record are yours, and moves
      stop asking the wallet.</p>
      <div class="sess-row">
        <label>lasts <select id="sess-life">${session.LIFETIMES
          .map((l, i) => `<option value="${l.id}"${i === 0 ? " selected" : ""}>${l.label}</option>`).join("")}</select></label>
        <label>budget <select id="sess-budget">${session.BUDGETS
          .map((b, i) => `<option value="${b.id}"${i === 0 ? " selected" : ""}>${b.label}</option>`).join("")}</select></label>
      </div>
      <button id="sess-create" type="button">Create a session key</button>
      <p class="fine">The key is generated here and kept in this browser. Anything that can
      run script on this page can sign with it, so what protects you is the grant itself:
      one realm, one budget, and it expires. Nothing is delegated until you run the command
      on the next screen.</p>`;
  }

  function renderPending() {
    const cmd = session.grantCommand({ session: record, keyName, chainId: net().chainId, rpc: rpc() });
    el.innerHTML = `
      <p><b>One command, once.</b> No wallet can grant a session today: Adena signs
      <code>/vm.m_call</code> and three siblings, and <code>/auth.m_create_session</code>
      is not among them. Run this with the key that owns
      <code>${esc(record.master.slice(0, 10))}…</code>:</p>
      <pre class="mono" id="sess-cmd">${esc(cmd)}</pre>
      <div class="sess-row">
        <button id="sess-copy" type="button">Copy command</button>
        <button id="sess-forget" type="button" class="link">start over</button>
      </div>
      <p class="fine" id="sess-wait">Watching the chain for the grant${busy}</p>`;
  }

  function renderGranted(left) {
    const used = (grant.spendUsed / 1000000).toFixed(3);
    const cap = (grant.spendLimit / 1000000).toFixed(2);
    const scope = grant.allowPaths.join(", ");
    el.innerHTML = `
      <p class="sess-live"><b>Session live.</b> ${esc(left)} left,
        ${used} of ${cap} GNOT used. Moves sign here, with no popup.</p>
      <p class="fine">Scope: <code>${esc(scope)}</code>. It can do nothing else with your
      account, it cannot spend past its budget, and it stops on its own.</p>
      <details>
        <summary>End it now</summary>
        <pre class="mono">${esc(session.revokeCommand({ session: record, keyName, chainId: net().chainId, rpc: rpc() }))}</pre>
        <button id="sess-forget" type="button" class="link">forget the key in this browser</button>
      </details>`;
  }

  function renderWrongScope() {
    el.innerHTML = `
      <p><b>That key is granted, but not for this realm.</b> Its scope is
      <code>${esc(grant.allowPaths.join(", "))}</code>, and a session can only call what its
      grant names. AllowPaths cannot be widened after the fact, so this one needs replacing
      rather than extending.</p>
      <button id="sess-forget" type="button">Make one for this realm</button>`;
  }

  function renderExpired() {
    el.innerHTML = `
      <p><b>The session expired.</b> That is what it was for. Moves are back to asking the
      wallet until you make another.</p>
      <button id="sess-forget" type="button">Make a new one</button>`;
  }

  el.addEventListener("click", async (ev) => {
    const t = ev.target;
    if (t.id === "sess-use") {
      const addr = el.querySelector("#sess-addr").value.trim();
      // Checked here rather than at signing time: a typo becomes a grant to an
      // account that is not yours, which fails later and much less clearly.
      if (!/^g1[02-9ac-hj-np-z]{38}$/.test(addr)) {
        el.querySelector("#sess-addr").setAttribute("aria-invalid", "true");
        return;
      }
      setAccount?.(addr);
      await refresh();
      return;
    }
    if (t.id === "sess-create") {
      record = await session.create({
        realm: realm(),
        master: getAccount(),
        lifetime: el.querySelector("#sess-life").value,
        budget: el.querySelector("#sess-budget").value,
      });
      render();
      startPolling();
    }
    if (t.id === "sess-copy") {
      await navigator.clipboard.writeText(el.querySelector("#sess-cmd").textContent);
      t.textContent = "Copied";
      setTimeout(() => { t.textContent = "Copy command"; }, 1500);
    }
    if (t.id === "sess-forget") {
      session.forget(realm());
      record = null;
      grant = null;
      stopPolling();
      render();
      emit();
    }
  });

  function startPolling() {
    stopPolling();
    let ticks = 0;
    polling = setInterval(async () => {
      ticks++;
      busy = ".".repeat((ticks % 3) + 1);
      const before = grant;
      await refresh();
      if (grant && !before) stopPolling(); // it landed
    }, 4000);
  }

  const stopPolling = () => { clearInterval(polling); polling = null; };

  // The countdown is the honest part of the panel: a session that quietly
  // expired while the tab was open would otherwise look live until a move
  // failed.
  setInterval(() => { if (grant) { render(); emit(); } }, 30000);

  refresh();
  return { refresh, current: () => (grant ? { session: record, grant } : null) };
}
