import { Supermarket3D } from "./supermarket3d.js";

const REPLAY_MODE = window.GROCERY_REPLAY_MODE === true;

const state = {
  demo: null,
  experiments: null,
  selectedId: "B1",
  simTime: 0,
  playing: true,
  speed: 1.0,
  lastFrameMs: performance.now(),
};

const els = {
  canvas: document.getElementById("scene-canvas"),
  badgeLayer: document.getElementById("badge-layer"),
  modeEyebrow: document.getElementById("mode-eyebrow"),
  replayBadge: document.getElementById("replay-badge"),
  btnPlay: document.getElementById("btn-play"),
  btnRestart: document.getElementById("btn-restart"),
  btnOverview: document.getElementById("btn-overview"),
  btnFlagship: document.getElementById("btn-flagship"),
  btnExperiments: document.getElementById("btn-experiments"),
  btnLiveLlm: document.getElementById("btn-live-llm"),
  btnCompare: document.getElementById("btn-compare"),
  basketBudget: document.getElementById("basket-budget"),
  groupPill: document.getElementById("group-pill"),
  tallyA: document.getElementById("tally-a"),
  tallyB: document.getElementById("tally-b"),
  simClock: document.getElementById("sim-clock"),
  inspPair: document.getElementById("insp-pair"),
  inspName: document.getElementById("insp-name"),
  shopperChips: document.getElementById("shopper-chips"),
  inspRequest: document.getElementById("insp-request"),
  inspConstraints: document.getElementById("insp-constraints"),
  inspItemCount: document.getElementById("insp-item-count"),
  inspBasket: document.getElementById("insp-basket"),
  inspRecs: document.getElementById("insp-recs"),
  inspEvents: document.getElementById("insp-events"),
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  scrubber: document.getElementById("time-scrubber"),
  speedSelect: document.getElementById("speed-select"),
  expModal: document.getElementById("experiments-modal"),
  expBody: document.getElementById("experiments-body"),
  llmModal: document.getElementById("llm-modal"),
  llmForm: document.getElementById("llm-form"),
  llmStatus: document.getElementById("llm-status"),
  llmOutput: document.getElementById("llm-output"),
};

function esc(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const scene3d = new Supermarket3D(els.canvas, els.badgeLayer, (id, follow) => {
  selectShopper(id, follow);
});

function getShopper(id) {
  return state.demo?.shoppers.find((s) => s.shopper_id === id) || state.demo?.shoppers[0];
}

function selectShopper(id, follow = false) {
  const s = getShopper(id);
  if (!s) return;
  state.selectedId = s.shopper_id;
  scene3d.setSelection(s.shopper_id, s.matched_shopper_id, follow);
  renderInspector();
  updateDynamicHud();
}

function renderChips() {
  if (!state.demo) return;
  els.shopperChips.innerHTML = state.demo.shoppers.map((s) => {
    const cls = [
      "chip",
      `arm-${s.arm.toLowerCase()}`,
      s.shopper_id === state.selectedId ? "active" : "",
      s.checkout_valid ? "ok" : "fail",
    ].filter(Boolean).join(" ");
    return `<button type="button" class="${cls}" data-id="${esc(s.shopper_id)}">${esc(s.shopper_id)}</button>`;
  }).join("");
  els.shopperChips.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => selectShopper(btn.dataset.id, true));
  });
}

function renderInspector() {
  const s = getShopper(state.selectedId);
  if (!s) return;
  renderChips();

  els.inspPair.textContent = `MATCHED PAIR #${s.pair_id}${s.is_flagship ? " · FLAGSHIP €15 DEMO" : ""}`;
  els.inspName.textContent = `${s.shopper_name} · ${s.shopper_profile_label}`;
  els.btnCompare.textContent = `Compare → ${s.matched_shopper_id}`;
  els.groupPill.textContent = s.shopper_id;
  els.groupPill.className = `group-pill group-${s.arm.toLowerCase()}`;

  els.inspRequest.textContent = s.request_text;
  const tags = [
    `Budget €${s.budget_eur.toFixed(2)}`,
    ...s.dietary_req.map((d) => d.replaceAll("_", " ")),
    ...(s.preferred_brand ? [`Brand: ${s.preferred_brand}`] : []),
    `Group ${s.arm}`,
  ];
  els.inspConstraints.innerHTML = tags
    .map((t) => `<span class="ctag${t === "Group A" ? " ctag-a" : ""}">${esc(t)}</span>`)
    .join("");

  if (s.recommendations && s.recommendations.length) {
    els.inspRecs.innerHTML = s.recommendations.map((r) => `
      <div class="rec-box ${r.accepted ? "" : "rejected"}">
        <strong>${r.offered_name ? esc(r.offered_name) : "No suitable substitute"}</strong>
        ${r.offered_price_eur ? ` (€${Number(r.offered_price_eur).toFixed(2)})` : ""}
        <div>${r.accepted ? "Accepted by shopper" : `Rejected / Unresolved (${esc(r.reason)})`}</div>
      </div>
    `).join("");
  } else {
    els.inspRecs.innerHTML = `<div class="insp-text" style="color:var(--muted)">${
      s.arm === "A"
        ? `Group A (stockout reported only · ${s.extra_searches} independent search${s.extra_searches === 1 ? "" : "es"})`
        : "No substitution needed."
    }</div>`;
  }
}

function updateDynamicHud() {
  if (!state.demo) return;
  const t = state.simTime;
  const s = getShopper(state.selectedId);
  if (!s) return;

  // Live tallies up to simTime
  let aOk = 0, bOk = 0;
  for (const sh of state.demo.shoppers) {
    const done = sh.timeline.some((ev) => ev.t <= t && ev.type === "checkout_complete");
    if (done) {
      if (sh.arm === "A") aOk++;
      else bOk++;
    }
  }
  els.tallyA.textContent = `${aOk}/${state.demo.summary.group_a_total}`;
  els.tallyB.textContent = `${bOk}/${state.demo.summary.group_b_total}`;
  els.simClock.textContent = `${t.toFixed(1)}s`;
  els.scrubber.value = String(t);

  // Selected shopper current event & live basket
  const reached = s.timeline.filter((ev) => ev.t <= t);
  const currentEv = reached[reached.length - 1] || s.timeline[0];
  const currentTotal = Number(currentEv?.basket_total ?? 0);
  els.basketBudget.textContent = `€${currentTotal.toFixed(2)} / €${s.budget_eur.toFixed(2)}`;

  // Live basket items accumulated up to t
  const pickedSkus = reached
    .filter((ev) => ev.type === "pickup" || ev.type === "substitute_accepted" || ev.type === "missing_dietary_flag")
    .map((ev) => ev.sku);
  const visibleBasket = s.basket.filter((item) => pickedSkus.includes(item.sku));
  els.inspItemCount.textContent = String(visibleBasket.length);
  els.inspBasket.innerHTML = visibleBasket.length
    ? visibleBasket.map((item) => `
        <li class="basket-item">
          <span>${esc(item.name)}${item.substituted_for ? '<span class="sub-tag">SUB</span>' : ""}</span>
          <strong class="mono">€${Number(item.line_total_eur).toFixed(2)}</strong>
        </li>
      `).join("")
    : `<li style="color:var(--muted);font-size:11.5px;">Cart empty so far…</li>`;

  // Event log highlight
  els.inspEvents.innerHTML = s.timeline.map((ev) => {
    const isCur = ev === currentEv;
    const isDone = ev.t <= t;
    return `<li class="${isCur ? "active" : ""}" style="opacity:${isDone ? 1 : 0.42}">[${ev.t.toFixed(1)}s] ${esc(ev.detail)}</li>`;
  }).join("");

  // Bottom-left status pill
  els.statusText.textContent = `[${s.shopper_id} · ${s.shopper_name}] ${currentEv.detail}`;
  els.statusDot.className = "status-dot" + (
    currentEv.type === "stockout" || currentEv.type === "substitute_rejected" || currentEv.type === "extra_search"
      ? " warn"
      : (currentEv.type === "abandon" || currentEv.type === "checkout_failed" ? " err" : "")
  );
}

function renderExperimentsModal() {
  const exp = state.experiments;
  if (!exp || (!exp.prompt_eval && !exp.ab_simulation)) {
    els.expBody.innerHTML = "<p>Run experiments first to view verified local results.</p>";
    return;
  }
  const parts = [];
  if (exp.prompt_eval) {
    const pe = exp.prompt_eval;
    const v1 = pe.prompts.v1_minimal;
    const v2 = pe.prompts.v2_structured_constraints;
    parts.push(`
      <h3>Experiment 1 — Prompt Comparison (100 Held-Out Requests · ${esc(pe.model_version)})</h3>
      <div class="exp-grid">
        <div class="exp-card"><div class="hud-eyebrow">Prompt v1 (Minimal)</div><div class="val">${v1.correct}/100</div><div>Median ${v1.latency_ms.p50} ms · p95 ${v1.latency_ms.p95} ms</div></div>
        <div class="exp-card"><div class="hud-eyebrow">Prompt v2 (Structured)</div><div class="val">${v2.correct}/100</div><div>Median ${v2.latency_ms.p50} ms · p95 ${v2.latency_ms.p95} ms</div></div>
        <div class="exp-card"><div class="hud-eyebrow">Delta (v2 − v1)</div><div class="val">${pe.delta_v2_minus_v1_pp >= 0 ? "+" : ""}${pe.delta_v2_minus_v1_pp} pp</div><div>Selected: ${esc(pe.selected_prompt)}</div></div>
      </div>
    `);
  }
  if (exp.ab_simulation) {
    const ab = exp.ab_simulation;
    const p = ab.primary.stats;
    const subs = ab.primary.substitutions_group_b;
    const sensRows = Object.entries(ab.sensitivity).map(([name, d]) => `
      <tr>
        <td>${esc(name.replaceAll("_", " "))}</td>
        <td>${d.stats.a_valid_rate_pct}% (${d.stats.a_valid_count}/300)</td>
        <td>${d.stats.b_valid_rate_pct}% (${d.stats.b_valid_count}/300)</td>
        <td><strong>${d.stats.diff_pp >= 0 ? "+" : ""}${d.stats.diff_pp} pp</strong></td>
        <td>[${d.stats.ci95_low_pp}, ${d.stats.ci95_high_pp}] pp</td>
      </tr>
    `).join("");
    parts.push(`
      <h3>Experiment 2 — Simulated A/B Comparison (300 Matched Pairs)</h3>
      <p style="color:var(--amber);margin:0 0 8px;">Note: ${esc(ab.label)}. Real customer conversion requires testing with real shoppers.</p>
      <div class="exp-grid">
        <div class="exp-card"><div class="hud-eyebrow">Group A (Stockout Only)</div><div class="val">${p.a_valid_rate_pct}%</div><div>${p.a_valid_count}/300 valid · ${ab.primary.extra_searches.group_a_total} extra searches</div></div>
        <div class="exp-card"><div class="hud-eyebrow">Group B (+ Replacement)</div><div class="val">${p.b_valid_rate_pct}%</div><div>${p.b_valid_count}/300 valid · ${subs.accepted}/${subs.offered} subs accepted (${subs.acceptance_rate_pct}%)</div></div>
        <div class="exp-card"><div class="hud-eyebrow">Paired Difference (B − A)</div><div class="val">${p.diff_pp >= 0 ? "+" : ""}${p.diff_pp} pp</div><div>95% CI [${p.ci95_low_pp}, ${p.ci95_high_pp}] pp · p=${p.mcnemar_exact_p}</div></div>
      </div>
      <table class="exp-table">
        <thead><tr><th>Shopper Mix</th><th>Group A</th><th>Group B</th><th>Diff (B − A)</th><th>Paired 95% CI</th></tr></thead>
        <tbody>
          <tr><td><strong>balanced (primary)</strong></td><td>${p.a_valid_rate_pct}% (${p.a_valid_count}/300)</td><td>${p.b_valid_rate_pct}% (${p.b_valid_count}/300)</td><td><strong>${p.diff_pp >= 0 ? "+" : ""}${p.diff_pp} pp</strong></td><td>[${p.ci95_low_pp}, ${p.ci95_high_pp}] pp</td></tr>
          ${sensRows}
        </tbody>
      </table>
    `);
  }
  els.expBody.innerHTML = parts.join("");
}

function loadDemoData(demo) {
  state.demo = demo;
  state.simTime = 0;
  els.scrubber.max = String(demo.total_duration_sec || 20);
  scene3d.loadShoppers(demo.shoppers);
  const flagshipB = demo.shoppers.find((s) => s.is_flagship && s.arm === "B") || demo.shoppers[0];
  selectShopper(flagshipB.shopper_id, false);
}

function animate(now) {
  const dt = Math.min((now - state.lastFrameMs) / 1000, 0.1);
  state.lastFrameMs = now;
  if (state.playing && state.demo) {
    state.simTime += dt * state.speed;
    if (state.simTime > state.demo.total_duration_sec + 1.5) {
      state.simTime = 0;
    }
    updateDynamicHud();
  }
  scene3d.update(state.simTime);
  requestAnimationFrame(animate);
}

// Controls wiring
els.btnPlay.addEventListener("click", () => {
  state.playing = !state.playing;
  els.btnPlay.textContent = state.playing ? "Pause" : "Play";
});
els.btnRestart.addEventListener("click", () => {
  state.simTime = 0;
  state.playing = true;
  els.btnPlay.textContent = "Pause";
  updateDynamicHud();
});
els.btnOverview.addEventListener("click", () => scene3d.resetOverview());
els.btnFlagship.addEventListener("click", () => {
  const f = state.demo?.shoppers.find((s) => s.is_flagship && s.arm === "B") || state.demo?.shoppers[0];
  if (f) {
    state.simTime = 0;
    state.playing = true;
    els.btnPlay.textContent = "Pause";
    selectShopper(f.shopper_id, true);
  }
});
els.btnCompare.addEventListener("click", () => {
  const s = getShopper(state.selectedId);
  if (s?.matched_shopper_id) selectShopper(s.matched_shopper_id, true);
});
els.scrubber.addEventListener("input", () => {
  state.simTime = Number(els.scrubber.value);
  updateDynamicHud();
});
els.speedSelect.addEventListener("change", () => {
  state.speed = Number(els.speedSelect.value);
});
els.btnExperiments.addEventListener("click", () => {
  renderExperimentsModal();
  els.expModal.showModal();
});
document.getElementById("close-experiments").addEventListener("click", () => els.expModal.close());

if (REPLAY_MODE) {
  if (els.replayBadge) els.replayBadge.hidden = false;
  if (els.modeEyebrow) els.modeEyebrow.textContent = "INTERACTIVE 3D REPLAY · SAVED SIMULATION RUN";
  if (els.btnLiveLlm) els.btnLiveLlm.hidden = true;
} else {
  els.btnLiveLlm.addEventListener("click", () => els.llmModal.showModal());
  document.getElementById("close-llm").addEventListener("click", () => els.llmModal.close());
  els.llmForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.llmStatus.textContent = "Calling local Ollama Qwen2.5 1.5B…";
    els.llmOutput.hidden = true;
    try {
      const resp = await fetch("/api/assistant/trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_text: document.getElementById("llm-request").value,
          prompt_version: document.getElementById("llm-prompt").value,
          shopper_profile: document.getElementById("llm-profile").value,
          stockout_sku: document.getElementById("llm-stockout").value || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail));
      els.llmStatus.textContent = `Parsed in ${data.llm.latency_ms} ms (${data.llm.model_version}) — loaded pair into 3D store!`;
      els.llmOutput.textContent = JSON.stringify(data.llm.parsed, null, 2);
      els.llmOutput.hidden = false;
      const maxDur = Math.max(...data.shoppers.map((x) => x.duration_sec));
      loadDemoData({
        run_id: data.run_id,
        seed: 2026,
        total_duration_sec: maxDur,
        summary: { total_shoppers: 2, group_a_total: 1, group_b_total: 1 },
        shoppers: data.shoppers,
      });
    } catch (err) {
      els.llmStatus.textContent = `Error: ${err.message}`;
    }
  });
}

// Expose deterministic hooks for automated video recording & browser verification
window.__GROCERY_LAB__ = {
  selectShopper: (id, follow = true) => selectShopper(id, follow),
  setTime: (t) => { state.simTime = t; updateDynamicHud(); scene3d.update(t); },
  setPlaying: (v) => { state.playing = v; els.btnPlay.textContent = v ? "Pause" : "Play"; },
  resetOverview: () => scene3d.resetOverview(),
  getState: () => ({ selectedId: state.selectedId, simTime: state.simTime, shoppers: state.demo?.shoppers?.length || 0 }),
};

async function init() {
  if (REPLAY_MODE) {
    const [demo, experiments] = await Promise.all([
      fetch("./data/replay_store.json", { cache: "no-store" }).then((r) => r.json()),
      fetch("./data/experiments.json", { cache: "no-store" }).then((r) => r.json()),
    ]);
    state.experiments = experiments;
    loadDemoData(demo);
  } else {
    const [demo, experiments] = await Promise.all([
      fetch("/api/store/demo?seed=2026").then((r) => r.json()),
      fetch("/api/experiments").then((r) => r.json()),
    ]);
    state.experiments = experiments;
    loadDemoData(demo);
  }
  requestAnimationFrame(animate);
}

init();
