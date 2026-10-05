/* =========================================================
   MAIN
   1. Loads the content from content/*.json
   2. Fills in all text + images
   3. Runs the one-screen "views" (Home, Work, Project,
      About, Contact), switched by the URL hash:
        #/            home
        #/work        work slider / grid
        #/work/<id>   a single project
        #/about       about
        #/contact     contact

   You shouldn't need to edit this file to change content.
   ========================================================= */

(async () => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, "0");
  const root = document.documentElement;
  const isTouch = matchMedia("(hover: none)").matches;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toArray = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);

  /* =========================================================
     1. LOAD CONTENT
     ========================================================= */

  const FILES = {
    text: "content/text.json",
    projects: "content/projects.json",
    images: "content/images.json"
  };

  async function loadJSON(file) {
    let res;
    try { res = await fetch(file, { cache: "no-cache" }); }
    catch (_) { throw new Error(`Couldn't open ${file}.`); }
    if (!res.ok) throw new Error(`${file} was not found (error ${res.status}).`);

    const raw = await res.text();
    try {
      return JSON.parse(raw);
    } catch (err) {
      // Point to the line with the typo
      const m = /position (\d+)/.exec(err.message) || /line (\d+)/.exec(err.message);
      let line = 0;
      if (m && /position/.test(m[0])) line = raw.slice(0, +m[1]).split("\n").length;
      else if (m) line = +m[1];
      const where = line ? ` on line ${line} (or at the end of line ${line - 1})` : "";
      throw new Error(`${file} has a typo${where}. Check for a missing comma or quote, or an extra comma after the last item. (${err.message})`);
    }
  }

  function showError(message) {
    const fileHint = location.protocol === "file:"
      ? `<p>You opened index.html as a file. Browsers don't let a file read the JSON content, so open the preview instead: double-click <code>start-preview.bat</code> (next to the portfolio folder) (or use “Open with Live Server” in VS Code).</p>`
      : "";
    document.body.insertAdjacentHTML("beforeend", `
      <div class="load-error" role="alert">
        <p class="eyebrow">Content error</p>
        <h2>The content couldn't be loaded</h2>
        <p>${esc(message)}</p>
        ${fileHint}
      </div>`);
  }

  let T, projectData, imageData;
  try {
    [T, projectData, imageData] = await Promise.all([loadJSON(FILES.text), loadJSON(FILES.projects), loadJSON(FILES.images)]);
  } catch (err) {
    showError(err.message);
    return;
  }

  /* =========================================================
     2. CONTENT HELPERS
     ========================================================= */

  // Read a value like "person.firstName" from text.json
  const get = (path, obj = T) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

  // Values that are calculated instead of typed
  const runtime = {};

  // Replace {person.firstName}-style references with their value
  function fill(value, depth = 0) {
    if (value == null) return "";
    return String(value).replace(/\{([\w.]+)\}/g, (match, path) => {
      const v = path in runtime ? runtime[path] : get(path);
      if (v == null || typeof v === "object" || depth > 5) return match;
      return fill(v, depth + 1);
    });
  }

  // Text from text.json by key, with a fallback if the key is missing
  function t(path, fallback = "") {
    const v = get(path);
    if (v == null) {
      console.warn(`[portfolio] Missing text in text.json: "${path}"`);
      return fallback;
    }
    return fill(v);
  }

  // Hint text: [x] becomes a keyboard key
  const hint = (path) => esc(t(path)).replace(/\[([^\]]+)\]/g, "<kbd>$1</kbd>");

  // Video files play in the page; YouTube / Vimeo links become an embedded player
  const VIDEO_FILE = /\.(mp4|webm|ogv|mov|m4v)([?#].*)?$/i;
  function embed(url) {
    let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { src: `https://www.youtube-nocookie.com/embed/${m[1]}`, thumb: `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` };
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return { src: `https://player.vimeo.com/video/${m[1]}`, thumb: "" };
    return null;
  }

  // Normalise an image slot to { url, alt, fit, kind } (kind: image / video / embed)
  function img(slot) {
    if (!slot) return { url: "", alt: "", fit: "cover", kind: "image" };
    if (typeof slot === "string") slot = { url: slot };
    const url = String(slot.url || "").trim();
    const player = embed(url);
    const kind = player ? "embed" : VIDEO_FILE.test(url) || (!url && slot.type === "video") ? "video" : "image";
    const position = String(slot.position || "").replace(/[^\w%. -]/g, "");   // focal point, e.g. "right" or "85% 50%"
    return { url, alt: fill(slot.alt || ""), fit: slot.fit === "contain" ? "contain" : "cover", kind, player, position };
  }

  // An image or video if there's a url, otherwise a gradient placeholder.
  // thumb = small preview (no controls, no player)
  function media(image, gradient, label, cls, thumb = false) {
    const fit = image.fit === "contain" ? " is-contain" : "";
    const play = thumb && image.kind !== "image" ? " is-video" : "";
    if (image.kind === "embed") {
      if (thumb) {
        return image.player.thumb
          ? `<div class="${cls}${play}"><img src="${esc(image.player.thumb)}" alt="" loading="lazy" decoding="async"></div>`
          : `<div class="${cls} placeholder${play}" style="--ph:${gradient}"></div>`;
      }
      return `<div class="${cls} is-embed"><iframe src="${esc(image.player.src)}" title="${esc(image.alt || label)}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe></div>`;
    }
    if (image.url && image.kind === "video") {
      return thumb
        ? `<div class="${cls}${play}"><video src="${esc(image.url)}#t=0.1" muted playsinline preload="metadata" aria-hidden="true"></video></div>`
        : `<div class="${cls}${fit} is-player"><video src="${esc(image.url)}" controls playsinline preload="metadata" aria-label="${esc(image.alt || label)}"></video></div>`;
    }
    if (image.url) {
      const focus = image.position ? ` style="object-position:${image.position}"` : "";
      return `<div class="${cls}${fit}"><img src="${esc(image.url)}" alt="${esc(image.alt)}"${focus} loading="lazy" decoding="async"></div>`;
    }
    return `<div class="${cls} placeholder${play}" style="--ph:${gradient}" data-label="${esc(label)}"></div>`;
  }

  // Web addresses in text become clickable links (shown without https:// and trailing /)
  // (runs on escaped text, so it stops before an escaped quote: &quot; or &#39;)
  const linkify = (html) => html.replace(/https?:\/\/(?:(?!&quot;|&#39;)[^\s<])*[^\s<.,;:!?)&]/g, (url) =>
    `<a href="${url}" class="text-link" target="_blank" rel="noopener">${url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>`);

  const paragraphs = (v) => toArray(v).map((p) => `<p>${linkify(esc(fill(p)))}</p>`).join("");

  // Age from birthDate (if filled in)
  const birth = get("person.birthDate");
  if (birth && !isNaN(new Date(birth))) {
    const b = new Date(birth), now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
    T.person.age = String(age);
  }

  /* =========================================================
     3. PROJECTS (projects.json + images.json)
     ========================================================= */

  // Placeholder gradients, used in turn when a project has no images
  const GRADIENTS = [
    "linear-gradient(135deg, #ffffff 0%, #6b6b6b 45%, #0a0a0a 100%)",
    "radial-gradient(circle at 30% 30%, #ffffff 0%, #3a3a3a 50%, #000000 100%)",
    "linear-gradient(200deg, #0a0a0a 0%, #9a9a9a 60%, #f5f5f5 100%)",
    "conic-gradient(from 180deg at 50% 50%, #000000, #ffffff, #4a4a4a, #000000)",
    "radial-gradient(circle at 70% 80%, #f0f0f0 0%, #555555 40%, #050505 100%)",
    "linear-gradient(45deg, #111111 0%, #eeeeee 50%, #222222 100%)"
  ];

  const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const projectImages = (imageData && imageData.projects) || {};
  const usedIds = new Set();

  const PROJECTS = toArray(projectData && projectData.projects)
    .filter((p) => p && typeof p === "object" && !p.hidden)
    .map((p, i) => {
      let id = slug(p.id || p.title || `project-${i + 1}`) || `project-${i + 1}`;
      if (usedIds.has(id)) {
        console.warn(`[portfolio] Two projects share the id "${id}". Give each project its own id in projects.json.`);
        id = `${id}-${i + 1}`;
      }
      usedIds.add(id);

      const images = projectImages[p.id] || projectImages[id] || {};
      return {
        id,
        title: fill(p.title || `Project ${i + 1}`),
        type: fill(p.type || ""),
        course: fill(p.course || ""),
        year: fill(p.year == null ? "" : p.year),
        tools: toArray(p.tools).map(fill),
        summary: fill(p.summary || ""),
        overview: p.overview,
        process: p.process,
        result: p.result,
        link: String(p.link || "").trim(),
        gradient: GRADIENTS[i % GRADIENTS.length],
        cover: img(images.cover),
        gallery: toArray(images.gallery).map(img)
      };
    });

  // Warn about image blocks that don't match any project
  Object.keys(projectImages).forEach((key) => {
    if (!key.startsWith("_") && !PROJECTS.some((p) => p.id === slug(key))) {
      console.warn(`[portfolio] images.json has images for "${key}", but there's no visible project with that id in projects.json.`);
    }
  });

  const N = PROJECTS.length;
  runtime.projectCount = pad(N);

  /* =========================================================
     4. FILL STATIC TEXT + IMAGES
     ========================================================= */

  $$("[data-text]").forEach((el) => { el.textContent = t(el.dataset.text, el.textContent); });

  document.title = t("meta.pageTitle");
  $('meta[name="description"]').setAttribute("content", t("meta.description"));
  root.lang = get("meta.language") || root.lang;

  const site = (imageData && imageData.site) || {};

  const favicon = img(site.favicon);
  if (favicon.url) $("#favicon").href = favicon.url;

  const logo = img(site.logo);
  if (logo.url) $("#brandMark").innerHTML = `<img src="${esc(logo.url)}" alt="">`;
  $("#brand").setAttribute("aria-label", `${t("meta.brandName")} — ${t("interface.nav.home")}`);

  const portrait = img(site.portrait);
  if (portrait.url) {
    const el = $("#portrait");
    el.classList.remove("placeholder");
    el.innerHTML = `<img src="${esc(portrait.url)}" alt="${esc(portrait.alt)}">`;
  }

  // Home facts
  $("#homeFacts").innerHTML = toArray(get("home.facts"))
    .map((f) => `<div><dt>${esc(fill(f.label))}</dt><dd>${esc(fill(f.value))}</dd></div>`)
    .join("");

  // About columns
  $("#aboutCols").innerHTML = toArray(get("about.columns"))
    .map((c) => `<div><h4>${esc(fill(c.title))}</h4><ul>${toArray(c.items).map((it) => `<li>${esc(fill(it))}</li>`).join("")}</ul></div>`)
    .join("");

  // Contact
  const email = t("person.email");
  $("#contactMail").href = `mailto:${email}`;
  if (get("contact.showBadge") === false || !t("contact.badge")) $("#contactBadge").hidden = true;
  const socials = toArray(get("contact.socials")).filter((s) => s && String(s.url || "").trim());
  $("#contactLinks").innerHTML = socials
    .map((s) => `<li><a class="btn btn--ghost btn--sm" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(fill(s.label))} <span class="btn__arrow">↗</span></a></li>`)
    .join("");

  // The same links, smaller, on the home page
  $("#homeLinks").innerHTML = socials
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(fill(s.label))} <span>↗</span></a></li>`)
    .join("");

  /* =========================================================
     THEME
     ========================================================= */

  function syncParticleColor() {
    Particles.setColor(getComputedStyle(root).getPropertyValue("--particle").trim());
  }

  $("#themeToggle").addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (_) {}
    syncParticleColor();
  });
  syncParticleColor();

  /* =========================================================
     WORK — slider + grid
     ========================================================= */

  const state = { view: null, index: 0, project: null, image: 0, images: 0 };
  const go = (hash) => { location.hash = hash; };
  // Is the user deliberately on a link/button (reached with Tab)? Then Enter should press it.
  // A button that's only focused because it was clicked earlier shouldn't steal Enter.
  let tabbed = false;
  addEventListener("keydown", (e) => { if (e.key === "Tab") tabbed = true; }, true);
  addEventListener("pointerdown", () => { tabbed = false; }, true);
  const onControl = () => tabbed && document.activeElement && document.activeElement.closest("a, button");

  const workView = $(".view--work");
  const stage = $("#workStage");
  const info = $("#workInfo");
  const progress = $("#workProgress");
  const grid = $("#workGrid");
  const cursorOpen = esc(t("interface.cursorOpen", "Open"));

  if (!N) {
    workView.classList.add("is-empty");
    info.innerHTML = `<p class="work__summary">${esc(t("work.empty"))}</p>`;
  }

  PROJECTS.forEach((p, i) => {
    stage.insertAdjacentHTML("beforeend", `
      <button class="card" data-i="${i}" aria-label="${esc(p.title)}">
        <span class="card__inner">
          ${media(p.cover, p.gradient, "Cover", "card__media")}
          <span class="card__tag">${pad(i + 1)}${p.type ? ` — ${esc(p.type)}` : ""}</span>
          <span class="card__open">${esc(t("work.cardHover"))}</span>
        </span>
      </button>`);

    progress.insertAdjacentHTML("beforeend", `
      <button class="progress__seg" data-i="${i}" aria-label="${esc(p.title)}">
        <span class="progress__tip">${esc(p.title)}</span>
      </button>`);

    grid.insertAdjacentHTML("beforeend", `
      <a class="grid__item" href="#/work/${p.id}" data-cursor="${cursorOpen}" style="--i:${Math.min(i, 12)}">
        ${media(p.cover, p.gradient, "Cover", "grid__media")}
        <span class="grid__meta"><span>${pad(i + 1)}</span>${esc(p.title)}<em>${esc(p.type)}</em></span>
      </a>`);
  });

  function setIndex(i) {
    if (!N) return;
    state.index = (i + N) % N;
    const p = PROJECTS[state.index];

    // Position the cards as a stacked deck
    $$(".card", stage).forEach((card, j) => {
      const o = (j - state.index + N) % N; // 0 = front
      let transform, opacity, z;
      if (o === 0) {
        transform = "translate(0, 0) scale(1)"; opacity = 1; z = 10;
      } else if (o === N - 1 && N > 3) {
        // the previous card flies out to the left (with 3 or fewer projects, all cards stay in the stack)
        transform = "translate(-55%, 4%) rotate(-6deg) scale(.92)"; opacity = 0; z = 11;
      } else {
        const k = Math.min(o, 3);
        transform = `translate(${k * 4}%, ${-k * 5}%) scale(${1 - k * 0.07})`;
        opacity = o > 2 ? 0 : 1 - o * 0.4;
        z = 10 - Math.min(o, 9);
      }
      card.style.transform = transform;
      card.style.opacity = opacity;
      card.style.zIndex = z;
      card.style.visibility = opacity === 0 && o !== N - 1 ? "hidden" : "";
      // Invisible cards (like the one flying out on top) must not catch clicks meant for the front card
      card.style.pointerEvents = opacity === 0 ? "none" : "";
      // Only the front card opens the project, so only it shows the "Open" cursor
      if (o === 0) card.dataset.cursor = cursorOpen;
      else delete card.dataset.cursor;
      card.classList.toggle("is-active", o === 0);
      card.tabIndex = o === 0 ? 0 : -1;
    });

    const meta = [p.type, p.course, p.year].filter(Boolean).map(esc).join(" · ");
    info.innerHTML = `
      <div class="work__count">
        <span class="mask"><span>${pad(state.index + 1)}</span></span>
        <span class="work__total">/ ${pad(N)}</span>
      </div>
      ${meta ? `<p class="eyebrow reveal" style="--i:1">${meta}</p>` : ""}
      <h2 class="work__title"><span class="mask"><span style="--i:1">${esc(p.title)}</span></span></h2>
      <p class="work__summary reveal" style="--i:2">${esc(p.summary)}</p>
      <div class="reveal" style="--i:3">
        <a href="#/work/${p.id}" class="btn btn--primary">${esc(t("work.openButton"))} <span class="btn__arrow">→</span></a>
      </div>`;

    $$(".progress__seg", progress).forEach((s, j) => s.classList.toggle("is-active", j === state.index));
  }

  stage.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const i = +card.dataset.i;
    if (i === state.index) go(`#/work/${PROJECTS[i].id}`);
    else setIndex(i);
  });

  // 3D tilt + light sheen on the front card
  stage.addEventListener("pointermove", (e) => {
    const card = e.target.closest(".card.is-active");
    if (!card || isTouch) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const inner = $(".card__inner", card);
    inner.style.transform = `rotateY(${px * 8}deg) rotateX(${-py * 8}deg)`;
    inner.style.setProperty("--mx", `${(px + 0.5) * 100}%`);
    inner.style.setProperty("--my", `${(py + 0.5) * 100}%`);
  });
  stage.addEventListener("pointerleave", () => {
    $$(".card__inner", stage).forEach((el) => { el.style.transform = ""; });
  });

  progress.addEventListener("click", (e) => {
    const seg = e.target.closest(".progress__seg");
    if (seg) setIndex(+seg.dataset.i);
  });
  $("#workPrev").addEventListener("click", () => setIndex(state.index - 1));
  $("#workNext").addEventListener("click", () => setIndex(state.index + 1));

  // Slides / Grid switch
  function setMode(mode) {
    workView.dataset.mode = mode;
    $$(".switch__btn").forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on);
    });
    try { localStorage.setItem("workMode", mode); } catch (_) {}
    updateHints();
  }
  $$(".switch__btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  try { if (localStorage.getItem("workMode") === "grid") setMode("grid"); } catch (_) {}

  /* =========================================================
     PROJECT DETAIL
     ========================================================= */

  const projectView = $("#projectView");
  const TABS = ["overview", "process", "result"];

  function renderProject(p) {
    const i = PROJECTS.indexOf(p);
    const prev = PROJECTS[(i - 1 + N) % N];
    const next = PROJECTS[(i + 1) % N];
    const images = [p.cover, ...p.gallery];
    const tabs = TABS.filter((key) => toArray(p[key]).length);   // hide empty tabs
    const label = (key) => esc(t(`project.labels.${key}`));
    const metaRow = (key, value) => (value ? `<div><dt>${label(key)}</dt><dd>${esc(value)}</dd></div>` : "");

    state.project = p;
    state.image = 0;
    state.images = images.length;

    projectView.innerHTML = `
      <div class="project__info">
        <a href="#/work" class="back reveal" style="--i:0"><span>←</span> ${esc(t("project.back"))}</a>
        <p class="eyebrow reveal" style="--i:1">${pad(i + 1)} / ${pad(N)}${p.type ? ` — ${esc(p.type)}` : ""}</p>
        <h2 class="project__title"><span class="mask"><span style="--i:1">${esc(p.title)}</span></span></h2>

        <dl class="project__meta reveal" style="--i:2">
          ${metaRow("course", p.course)}
          ${metaRow("year", p.year)}
          ${metaRow("type", p.type)}
          ${metaRow("tools", p.tools.join(", "))}
        </dl>

        ${tabs.length ? `
          <div class="ptabs reveal" style="--i:3" role="tablist">
            ${tabs.map((key, n) => `<button class="ptab${n === 0 ? " is-active" : ""}" role="tab" aria-selected="${n === 0}" data-tab="${key}">${esc(t(`project.tabs.${key}`))}</button>`).join("")}
          </div>
          <div class="ptab-panel reveal" style="--i:4" role="tabpanel" id="ptabPanel">${paragraphs(p[tabs[0]])}</div>` : ""}

        ${p.link ? `<a href="${esc(p.link)}" class="btn btn--ghost btn--sm project__link reveal" style="--i:5" target="_blank" rel="noopener">${esc(t("project.visitLink"))} <span class="btn__arrow">↗</span></a>` : ""}

        ${N > 1 ? `
          <nav class="project__pager reveal" style="--i:6" aria-label="Other projects">
            <a href="#/work/${prev.id}"><small>← ${esc(t("project.previous"))}</small><span>${esc(prev.title)}</span></a>
            <a href="#/work/${next.id}"><small>${esc(t("project.next"))} →</small><span>${esc(next.title)}</span></a>
          </nav>` : ""}
      </div>

      <div class="project__media reveal${images.length < 2 ? " is-single" : ""}" style="--i:2">
        <div class="viewer">
          ${images.map((im, k) => media(im, p.gradient, k === 0 ? "Cover" : im.kind !== "image" ? "Video" : `Image ${k}`, `viewer__slide${k === 0 ? " is-active" : ""}`)).join("")}
          <span class="viewer__count" id="viewerCount">01 / ${pad(images.length)}</span>
          <button class="round-btn viewer__btn viewer__btn--prev" data-img="-1" aria-label="Previous image"><span>←</span></button>
          <button class="round-btn viewer__btn viewer__btn--next" data-img="1" aria-label="Next image"><span>→</span></button>
        </div>
        <div class="thumbs">
          ${images.map((im, k) => `
            <button class="thumb${k === 0 ? " is-active" : ""}" data-thumb="${k}" aria-label="Image ${k + 1}">
              ${media({ ...im, alt: "", fit: "cover" }, p.gradient, "", "thumb__media", true)}
            </button>`).join("")}
        </div>
      </div>`;
  }

  // Long project titles shrink to fit on one line, so every project page has the same layout.
  // Below the minimum size the title wraps after all.
  function fitTitle() {
    const title = $(".project__title", projectView);
    const text = title && $(".mask > span", title);
    if (!text) return;
    title.style.fontSize = "";
    title.style.whiteSpace = "nowrap";
    const width = text.offsetWidth, room = title.clientWidth;
    if (width > room) {
      const min = 1.6 * parseFloat(getComputedStyle(root).fontSize);
      const size = parseFloat(getComputedStyle(title).fontSize) * (room / width) * 0.98;
      title.style.fontSize = `${Math.max(size, min)}px`;
      if (size < min) title.style.whiteSpace = "";
    }
  }
  addEventListener("resize", () => { if (state.view === "project") fitTitle(); });
  if (document.fonts) document.fonts.ready.then(() => { if (state.view === "project") fitTitle(); });

  function setImage(k) {
    if (!state.images) return;
    // Stop a video that is still playing on the slide we're leaving
    const leaving = $(".viewer__slide.is-active", projectView);
    if (leaving) {
      $$("video", leaving).forEach((v) => v.pause());
      $$("iframe", leaving).forEach((f) => { f.src = f.src; });
    }
    state.image = (k + state.images) % state.images;
    $$(".viewer__slide", projectView).forEach((s, j) => s.classList.toggle("is-active", j === state.image));
    $$(".thumb", projectView).forEach((th, j) => th.classList.toggle("is-active", j === state.image));
    $("#viewerCount").textContent = `${pad(state.image + 1)} / ${pad(state.images)}`;
    const active = $(".thumb.is-active", projectView);
    if (active) active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  projectView.addEventListener("click", (e) => {
    const tab = e.target.closest(".ptab");
    if (tab) {
      $$(".ptab", projectView).forEach((b) => {
        const on = b === tab;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on);
      });
      const panel = $("#ptabPanel");
      panel.innerHTML = paragraphs(state.project[tab.dataset.tab]);
      panel.scrollTop = 0;
      panel.classList.remove("swap");
      void panel.offsetWidth; // restart animation
      panel.classList.add("swap");
      return;
    }
    const arrow = e.target.closest("[data-img]");
    if (arrow) return setImage(state.image + Number(arrow.dataset.img));
    const thumb = e.target.closest("[data-thumb]");
    if (thumb) setImage(Number(thumb.dataset.thumb));
  });

  /* =========================================================
     VIEWS + ROUTER
     ========================================================= */

  const NAV_FOR = { home: "home", work: "work", project: "work", about: "about", contact: "contact" };
  const pill = $(".menu__pill");

  function movePill() {
    const a = $(".menu a.is-active");
    if (!a || !a.offsetWidth) { pill.style.opacity = 0; return; }
    pill.style.opacity = 1;
    pill.style.width = `${a.offsetWidth}px`;
    pill.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  addEventListener("resize", movePill);

  function show(name, label) {
    const prev = state.view;
    state.view = name;

    $$(".view").forEach((v) => {
      const on = v.dataset.view === name;
      const leaving = v.dataset.view === prev && !on;
      v.classList.toggle("is-active", on);
      v.inert = !on;
      if (leaving) {
        v.classList.add("is-leaving");
        setTimeout(() => v.classList.remove("is-leaving"), 500);
      }
      if (on) v.scrollTop = 0;
    });

    $$(".menu a").forEach((a) => {
      const on = a.dataset.nav === NAV_FOR[name];
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    movePill();

    const title = label || t(`interface.nav.${NAV_FOR[name]}`);
    $("#statusView").textContent = title;
    document.title = name === "home" ? t("meta.pageTitle") : `${title} — ${t("meta.brandName")}`;
    updateHints();
    Particles.setView(name);
  }

  function route() {
    const [section, id] = location.hash.replace(/^#\/?/, "").split("/");

    if (section === "work" && id) {
      const p = PROJECTS.find((x) => x.id === id);
      if (p) {
        state.index = PROJECTS.indexOf(p);
        setIndex(state.index);
        renderProject(p);
        fitTitle();
        show("project", p.title);
        return;
      }
    }
    if (section === "work") { setIndex(state.index); show("work"); return; }
    if (section === "about" || section === "contact") { show(section); return; }
    show("home");
  }

  addEventListener("hashchange", route);

  /* ---------- Hints in the status bar ---------- */

  function updateHints() {
    const slides = workView.dataset.mode === "slides";
    let key = "";
    if (isTouch) {
      if (state.view === "work" && slides) key = "touchWork";
      if (state.view === "project") key = "touchProject";
    } else {
      key = { home: "home", work: slides ? "work" : "workGrid", project: "project" }[state.view] || "other";
    }
    $("#statusHints").innerHTML = key ? hint(`interface.hints.${key}`) : "";
  }

  /* =========================================================
     INPUT — keyboard, wheel, swipe
     ========================================================= */

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;
    if (e.target instanceof HTMLMediaElement && key.startsWith("Arrow")) return;   // arrows seek the video
    const jump = { 0: "#/", 1: "#/work", 2: "#/about", 3: "#/contact" };
    if (jump[key]) return go(jump[key]);

    const v = state.view;
    const slides = workView.dataset.mode === "slides" && N > 0;

    if (v === "home") {
      if (key === "ArrowDown" || key === "ArrowRight" || (key === "Enter" && !onControl())) {
        e.preventDefault();
        go("#/work");
      }
    } else if (v === "work") {
      if (slides && (key === "ArrowRight" || key === "ArrowDown")) { e.preventDefault(); setIndex(state.index + 1); }
      else if (slides && (key === "ArrowLeft" || key === "ArrowUp")) { e.preventDefault(); setIndex(state.index - 1); }
      else if (slides && key === "Enter" && !onControl()) { e.preventDefault(); go(`#/work/${PROJECTS[state.index].id}`); }
      else if (key === "Escape") go("#/");
    } else if (v === "project") {
      if (key === "ArrowRight") setImage(state.image + 1);
      else if (key === "ArrowLeft") setImage(state.image - 1);
      else if (key === "Escape") go("#/work");
    } else if (key === "Escape") {
      go("#/");
    }
  });

  // One scroll gesture = one step (instead of scrolling a page)
  let wheelLock = 0;
  addEventListener("wheel", (e) => {
    const now = Date.now();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (now < wheelLock) { wheelLock = Math.max(wheelLock, now + 180); return; }
    if (Math.abs(d) < 20) return;

    if (state.view === "home" && d > 0) {
      wheelLock = now + 900;
      go("#/work");
    } else if (state.view === "work" && workView.dataset.mode === "slides" && N > 1) {
      wheelLock = now + 650;
      setIndex(state.index + (d > 0 ? 1 : -1));
    }
  }, { passive: true });

  let touch = null;
  addEventListener("touchstart", (e) => {
    const tp = e.touches[0];
    touch = { x: tp.clientX, y: tp.clientY, target: e.target };
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (!touch) return;
    const tp = e.changedTouches[0];
    const dx = tp.clientX - touch.x, dy = tp.clientY - touch.y;
    const horizontal = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2;
    if (horizontal && state.view === "work" && workView.dataset.mode === "slides") {
      setIndex(state.index + (dx < 0 ? 1 : -1));
    } else if (horizontal && state.view === "project" && touch.target.closest(".viewer")) {
      setImage(state.image + (dx < 0 ? 1 : -1));
    }
    touch = null;
  }, { passive: true });

  // Click empty space on the home screen to scatter the particles
  $(".view--home").addEventListener("pointerdown", (e) => {
    if (!e.target.closest("a, button")) Particles.burst();
  });

  /* =========================================================
     SMALL DETAILS
     ========================================================= */

  // Rotating word on the home screen
  const rotator = $("#rotator");
  const words = toArray(get("home.rotatingWords")).map(fill).filter(Boolean);
  rotator.textContent = words[0] || "";
  if (words.length > 1) {
    let w = 0;
    setInterval(() => {
      w = (w + 1) % words.length;
      rotator.classList.add("is-out");
      setTimeout(() => {
        rotator.textContent = words[w];
        rotator.classList.remove("is-out");
      }, 300);
    }, 2600);
  }

  // Copy e-mail address
  $("#copyMail").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(email);
      btn.textContent = t("contact.copiedMessage");
    } catch (_) {
      btn.textContent = email;
    }
    setTimeout(() => { btn.textContent = t("contact.copyButton"); }, 1800);
  });

  // Local time in the status bar
  const clock = $("#clock");
  const timeOptions = { hour: "2-digit", minute: "2-digit" };
  let fmt;
  try { fmt = new Intl.DateTimeFormat("en-GB", { ...timeOptions, timeZone: t("person.timezone") || undefined }); }
  catch (_) {
    console.warn("[portfolio] person.timezone in text.json isn't a valid time zone; using the visitor's time.");
    fmt = new Intl.DateTimeFormat("en-GB", timeOptions);
  }
  const tick = () => { clock.textContent = fmt.format(new Date()); };
  tick();
  setInterval(tick, 15000);

  // Custom cursor (mouse only)
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    root.classList.add("has-cursor");
    const cursor = $(".cursor");
    const label = $(".cursor__label");

    addEventListener("pointermove", (e) => {
      cursor.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      cursor.classList.add("is-visible");
    });
    root.addEventListener("pointerleave", () => cursor.classList.remove("is-visible"));
    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest("a, button, [data-cursor]");
      const text = el && el.dataset.cursor;
      cursor.classList.toggle("is-hover", !!el);
      cursor.classList.toggle("has-label", !!text);
      if (text) label.textContent = text;
    });
    addEventListener("pointerdown", () => cursor.classList.add("is-down"));
    addEventListener("pointerup", () => cursor.classList.remove("is-down"));
  }

  /* ---------- Start ---------- */
  root.classList.remove("is-loading");
  route();
  if (document.fonts) document.fonts.ready.then(movePill);
})();
