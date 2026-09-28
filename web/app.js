// The page. It plays the same simulator the chain runs, so the score on screen
// is the score the realm will recompute, and the thing it sends is the moves.
import * as e from "./engine.js";
import { NETWORKS, qevalString, wallet, gnokeyCommand } from "./chain.js";

const $ = (id) => document.getElementById(id);
const PX = 32;
const ctx = $("board").getContext("2d");

const state = {
  net: NETWORKS.mainnet, netName: "mainnet", account: null,
  seed: 0, moves: "", pending: ".", timer: null, result: e.run(1, ""),
};

const say = (m, cls = "") => { const s = $("status"); s.textContent = m; s.className = `status ${cls}`; };
const warn = (m) => { $("msg").textContent = m || ""; };

function draw() {
  const r = state.result;
  ctx.fillStyle = "#0b1120"; ctx.fillRect(0, 0, e.WIDTH * PX, e.HEIGHT * PX);
  ctx.fillStyle = "#16203a";
  for (let i = 1; i < e.WIDTH; i++) {
    ctx.fillRect(i * PX, 0, 1, e.HEIGHT * PX);
    ctx.fillRect(0, i * PX, e.WIDTH * PX, 1);
  }
  if (r.food >= 0) {
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.arc((r.food % e.WIDTH) * PX + PX / 2, Math.floor(r.food / e.WIDTH) * PX + PX / 2, PX / 3, 0, 7);
    ctx.fill();
  }
  (r.body || []).forEach((cell, i) => {
    ctx.fillStyle = i === 0 ? (r.alive ? "#bbf7d0" : "#f87171") : "#22c55e";
    ctx.fillRect((cell % e.WIDTH) * PX + 3, Math.floor(cell / e.WIDTH) * PX + 3, PX - 6, PX - 6);
  });
  $("score").textContent = r.score ?? 0;
  $("ticks").textContent = r.ticks ?? 0;
  $("state").textContent = state.timer ? "running" : r.alive ? "paused" : "dead — submit it or start again";
}

function tick() {
  if (state.moves.length >= e.MAX_TICKS) return stop("tick limit reached");
  const next = state.moves + state.pending;
  const r = e.run(state.seed, next);
  if (r.error) return stop(r.error);
  state.moves = next;
  state.pending = ".";
  state.result = r;
  draw();
  if (!r.alive) stop("");
}

function stop(msg) {
  clearInterval(state.timer);
  state.timer = null;
  if (msg) warn(msg);
  draw();
}

async function newRun() {
  warn("");
  stop("");
  if (!state.account) {
    // Playable with no wallet at all: a local seed, a real game, and a
    // submission that will be refused because the realm never issued it. That
    // is the honest version of "try it first".
    state.seed = (Math.random() * 0xffffffff) >>> 0 || 1;
    say("playing with a local seed — the chain will not accept this run", "bad");
  } else {
    try {
      say("taking a seed…");
      await wallet.call(state.net, state.account, "Start", []);
      await new Promise((r) => setTimeout(r, 1500));
      state.seed = Number(await qevalString(state.net, `PendingOf("${state.account}")`).catch(() => "0")) || 0;
      if (!state.seed) throw new Error("the realm issued no seed");
      say(`seed ${state.seed}`, "live");
    } catch (err) { return say(err.message, "bad"); }
  }
  state.moves = "";
  state.pending = ".";
  state.result = e.run(state.seed, "");
  draw();
  state.timer = setInterval(tick, 140);
}

async function submit() {
  if (!state.account) return warn("connect a wallet: the realm only accepts a seed it issued");
  if (!state.result.score) return warn("a run that ate nothing is not a submission");
  try {
    say("signing…");
    // Deliberately large: Submit replays every tick, so it costs far more than
    // a normal call. A browser cannot simulate, so it over-provides and the
    // page says so rather than quoting a number it did not measure.
    await wallet.call(state.net, state.account, "Submit", [state.moves]);
    say(`submitted ${state.result.score}`, "live");
    setTimeout(refresh, 1500);
  } catch (err) { warn(err.message); say("refused", "bad"); }
}

async function refresh() {
  try {
    const rows = (await qevalString(state.net, "Leaderboard()")).split("\n").filter(Boolean).map((r) => r.split("\t"));
    $("leaderboard").innerHTML = rows.length
      ? rows.map(([who, score, ticks], i) =>
          `<div>${i + 1}. ${who.slice(0, 8)}… <b>${score}</b> in ${ticks}</div>`).join("")
      : `<p class="fine">Nothing verified yet.</p>`;
    say(`${rows.length} verified runs on ${state.netName}`, "live");
  } catch (err) {
    // An empty panel reads as "still loading" forever. Say what happened.
    $("leaderboard").innerHTML = `<p class="fine">Nothing to read here: the realm is not deployed on this network yet, or the node did not answer.</p>`;
    say(`${state.netName}: ${err.message}`, "bad");
  }
}

addEventListener("keydown", (ev) => {
  const k = { ArrowUp: "u", ArrowDown: "d", ArrowLeft: "l", ArrowRight: "r",
              w: "u", s: "d", a: "l", d: "r" }[ev.key];
  if (!k) return;
  ev.preventDefault();
  state.pending = k;
  if (!state.timer && state.result.alive && state.seed) state.timer = setInterval(tick, 140);
});

document.addEventListener("click", async (ev) => {
  const t = ev.target;
  if (t.id === "play") return newRun();
  if (t.id === "submit") return submit();
  if (t.id === "share") {
    await navigator.clipboard.writeText(`seed ${state.seed}\n${state.moves}`);
    say("run copied — anybody can replay it", "live");
  }
  if (t.id === "connect") {
    try { state.account = await wallet.connect(); say(`connected ${state.account.slice(0, 10)}…`, "live"); refresh(); }
    catch (err) { say(err.message, "bad"); }
  }
});

$("network").addEventListener("change", (ev) => {
  state.netName = ev.target.value;
  state.net = NETWORKS[state.netName];
  $("link-realm").href = `https://gno.land/${state.net.realm.replace("gno.land/", "")}`;
  setCmd();
  refresh();
});

function setCmd() {
  $("cmd").textContent =
    gnokeyCommand(state.net, "Start", []) + "\n\n" + gnokeyCommand(state.net, "Submit", ["<moves>"]);
}

setCmd();
state.seed = 1;
state.result = e.run(1, "");
draw();
refresh();
