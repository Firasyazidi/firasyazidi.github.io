const state = {
  lang: "en",
  filter: "all",
  openAdr: null,
  openNote: "alert-score-automation-rate",
  profile: null,
  experience: null,
  projects: [],
  notes: [],
};

const els = {
  spotlight: document.getElementById("spotlight"),
  availability: document.getElementById("availability-text"),
  langToggle: document.getElementById("lang-toggle"),
  name: document.getElementById("profile-name"),
  role: document.getElementById("profile-role"),
  bio: document.getElementById("profile-bio"),
  cvEn: document.getElementById("cv-en-link"),
  cvFr: document.getElementById("cv-fr-link"),
  github: document.getElementById("github-link"),
  linkedin: document.getElementById("linkedin-link"),
  copyEmail: document.getElementById("copy-email"),
  emailLabel: document.getElementById("email-label"),
  impactGrid: document.getElementById("impact-grid"),
  expList: document.getElementById("experience-list"),
  eduList: document.getElementById("education-list"),
  filterRow: document.getElementById("project-filters"),
  projectList: document.getElementById("project-list"),
  notesList: document.getElementById("notes-list"),
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderChrome() {
  const t = state.profile.copy[state.lang];
  document.documentElement.lang = state.lang;
  els.availability.textContent = t.availability;
  els.name.textContent = state.profile.name;
  els.role.textContent = t.role;
  els.bio.textContent = t.bio;
  els.cvEn.textContent = t.buttons.cv_en;
  els.cvFr.textContent = t.buttons.cv_fr;
  els.cvEn.href = state.profile.cv_en;
  els.cvFr.href = state.profile.cv_fr;
  els.github.href = state.profile.github;
  els.linkedin.href = state.profile.linkedin;
  els.emailLabel.textContent = state.profile.email;

  document.getElementById("nav-impact").textContent = t.nav.impact;
  document.getElementById("nav-experience").textContent = t.nav.experience;
  document.getElementById("nav-projects").textContent = t.nav.projects;
  document.getElementById("nav-notes").textContent = t.nav.notes;

  document.getElementById("heading-impact").textContent = t.sections.impact;
  document.getElementById("heading-experience").textContent = t.sections.experience;
  document.getElementById("heading-projects").textContent = t.sections.projects;
  document.getElementById("projects-sub").textContent = t.sections.projects_sub;
  document.getElementById("heading-notes").textContent = t.sections.notes;
}

function renderImpact() {
  const items = state.profile.copy[state.lang].impact;
  els.impactGrid.innerHTML = items.map((item) => `
    <article class="bento-card">
      <div class="bento-top">
        <span class="bento-val">${esc(item.value)}</span>
        <span class="bento-tag ${item.accent === "teal" ? "teal" : ""}">${esc(item.tag)}</span>
      </div>
      <p>${esc(item.label)}</p>
    </article>
  `).join("");
}

function renderExperience() {
  const L = state.lang;
  els.expList.innerHTML = state.experience.work.map((job) => `
    <article class="panel-card">
      <div class="card-header">
        <h3 class="card-title">${esc(job.role[L])} · ${esc(job.company)}</h3>
        <span class="card-meta">${esc(job.period[L])} · ${esc(job.location)}</span>
      </div>
      <p class="card-body">${esc(job.summary[L])}</p>
      <div class="tags">
        ${job.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}
      </div>
    </article>
  `).join("");

  els.eduList.innerHTML = state.experience.education.map((edu) => `
    <article class="panel-card">
      <div class="card-header">
        <h3 class="card-title">${esc(edu.school)}</h3>
        <span class="card-meta">${esc(edu.period[L])}</span>
      </div>
      <p class="card-body">${esc(edu.degree[L])}</p>
    </article>
  `).join("");
}

function renderFilters() {
  const labels = state.profile.copy[state.lang].filters;
  const keys = ["all", "mlops", "genai", "ml"];
  els.filterRow.innerHTML = keys.map((key) => `
    <button type="button" class="filter-pill ${state.filter === key ? "active" : ""}" data-filter="${key}" role="tab" aria-selected="${state.filter === key}">
      ${esc(labels[key])}
    </button>
  `).join("");

  els.filterRow.querySelectorAll(".filter-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderFilters();
      renderProjects();
    });
  });
}

function renderProjects() {
  const L = state.lang;
  const btns = state.profile.copy[L].buttons;
  const visible = state.filter === "all"
    ? state.projects
    : state.projects.filter((p) => p.category === state.filter);

  els.projectList.innerHTML = visible.map((p) => {
    const isLive = p.status === "live";
    const hasCode = Boolean(p.code_url);
    const hasDemo = Boolean(p.demo_url);
    const hasVideo = Boolean(p.video_url);
    const demoLabel = p.demo_label ? p.demo_label[L] : btns.demo;
    const adrOpen = state.openAdr === p.id;
    return `
      <article class="panel-card" id="project-${esc(p.id)}">
        <div class="card-header">
          <div>
            <div class="project-sub">${esc(p.subtitle[L])}</div>
            <h3 class="card-title">${esc(p.title[L])}</h3>
          </div>
          <span class="status-badge ${isLive ? "live" : "building"}">${isLive ? "Live · CI Passing" : esc(btns.building)}</span>
        </div>
        <p class="card-body">${esc(p.description[L])}</p>

        <div class="metric-bars">
          ${p.metrics.map((m) => `
            <div class="metric-row">
              <div class="metric-head">
                <span>${esc(m.label)}</span>
                <span>${esc(m.value)}</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${Number(m.pct)}%"></div></div>
            </div>
          `).join("")}
        </div>

        <div class="tags">
          ${p.stack.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}
        </div>

        <div class="project-actions">
          <div class="action-buttons">
            <a class="btn btn-secondary ${hasCode ? "" : "disabled"}" href="${hasCode ? esc(p.code_url) : "#"}" ${hasCode ? 'target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true" tabindex="-1"'}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11.03 11.03 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.39-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>
              <span>${esc(btns.code)}</span>
            </a>
            <a class="btn btn-primary ${hasDemo ? "" : "disabled"}" href="${hasDemo ? esc(p.demo_url) : "#"}" ${hasDemo ? 'target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true" tabindex="-1"'}>
              <span>${esc(demoLabel)} ↗</span>
            </a>
            ${hasVideo ? `
            <a class="btn btn-secondary" href="${esc(p.video_url)}" target="_blank" rel="noopener noreferrer">
              <span>▶ ${esc(btns.video || "Watch Video")}</span>
            </a>` : ""}
          </div>
          <button type="button" class="adr-toggle" data-adr="${esc(p.id)}">
            ${adrOpen ? esc(btns.adr_hide) + " ▲" : esc(btns.adr_show) + " ▼"}
          </button>
        </div>

        ${adrOpen ? `<div class="adr-box">${esc(p.adr[L])}</div>` : ""}
      </article>
    `;
  }).join("");

  els.projectList.querySelectorAll(".adr-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.openAdr = state.openAdr === btn.dataset.adr ? null : btn.dataset.adr;
      renderProjects();
    });
  });
}

function renderNotes() {
  const L = state.lang;
  els.notesList.innerHTML = state.notes.map((n) => {
    const open = state.openNote === n.id;
    return `
      <article class="panel-card" id="note-${esc(n.id)}">
        <button type="button" class="note-trigger" data-note="${esc(n.id)}" aria-expanded="${open}">
          <h3 class="card-title">${esc(n.title[L])}</h3>
          <span class="card-meta">${esc(n.tag)} · ${esc(n.read_time)} ${open ? "▲" : "▼"}</span>
        </button>
        ${open ? `<p class="card-body">${esc(n.body[L])}</p>` : ""}
      </article>
    `;
  }).join("");

  els.notesList.querySelectorAll(".note-trigger").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.openNote = state.openNote === btn.dataset.note ? null : btn.dataset.note;
      renderNotes();
    });
  });
}

function renderAll() {
  renderChrome();
  renderImpact();
  renderExperience();
  renderFilters();
  renderProjects();
  renderNotes();
}

function setupScrollSpy() {
  const links = [...document.querySelectorAll(".section-nav a")];
  const sections = links.map((a) => document.getElementById(a.dataset.section)).filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        links.forEach((a) => a.classList.toggle("active", a.dataset.section === entry.target.id));
      }
    }
  }, { rootMargin: "-25% 0px -60% 0px" });
  sections.forEach((s) => observer.observe(s));
}

function setupInteractions() {
  window.addEventListener("mousemove", (e) => {
    els.spotlight.style.background = `radial-gradient(560px at ${e.clientX}px ${e.clientY}px, rgba(45, 212, 191, 0.09), transparent 80%)`;
  });

  els.langToggle.addEventListener("click", () => {
    state.lang = state.lang === "en" ? "fr" : "en";
    renderAll();
  });

  els.copyEmail.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.profile.email);
      els.emailLabel.textContent = state.profile.copy[state.lang].buttons.copied + " ✓";
      setTimeout(() => { els.emailLabel.textContent = state.profile.email; }, 1800);
    } catch {
      window.location.href = `mailto:${state.profile.email}`;
    }
  });
}

async function init() {
  const opts = { cache: "no-store" };
  const [profile, experience, projects, notes] = await Promise.all([
    fetch("./data/profile.json", opts).then((r) => r.json()),
    fetch("./data/experience.json", opts).then((r) => r.json()),
    fetch("./data/projects.json", opts).then((r) => r.json()),
    fetch("./data/notes.json", opts).then((r) => r.json()),
  ]);
  state.profile = profile;
  state.experience = experience;
  state.projects = projects;
  state.notes = notes;
  renderAll();
  setupScrollSpy();
  setupInteractions();
  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) target.scrollIntoView({ behavior: "instant", block: "start" });
  }
}

init();
