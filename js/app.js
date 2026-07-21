/* =========================================================
   Diario visual en 360°
   Toda la portada y las páginas de viaje se construyen en
   tiempo real a partir de data/viajes.md. Editar ese archivo
   (agregar, quitar o cambiar filas) actualiza el sitio: no
   hace falta tocar este código.
   ========================================================= */

const DATA_PATH = "data/viajes.md";

const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

/* ---------- utilidades ---------- */

function slugify(str) {
  return str
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "viaje";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- parseo del markdown ---------- */

function parseMarkdownTable(md) {
  const lines = md.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));

  const isSeparator = (l) => /^\|[\s:|-]+\|$/.test(l);
  const dataLines = lines.filter((l) => !isSeparator(l));
  if (dataLines.length < 2) return [];

  const cellsOf = (line) => line.slice(1, -1).split("|").map((c) => c.trim());
  const rows = dataLines.slice(1); // skip header row

  return rows
    .map((line) => {
      const c = cellsOf(line);
      return { lugar: c[0] || "", ubicacion: c[1] || "", viaje: c[2] || "", enlace: c[3] || "" };
    })
    .filter((r) => r.lugar && r.enlace);
}

function parseTripMeta(viaje) {
  const idx = viaje.lastIndexOf(",");
  let title = viaje.trim();
  let dateText = "";

  if (idx > -1) {
    const head = viaje.slice(0, idx).trim();
    const tail = viaje.slice(idx + 1).trim();
    if (/\d{4}/.test(tail) || Object.keys(MONTHS).some((m) => tail.toLowerCase().includes(m))) {
      title = head;
      dateText = tail;
    }
  }

  const yearMatch = viaje.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : null;

  let monthNum = 0;
  const lowerDate = dateText.toLowerCase();
  for (const [name, num] of Object.entries(MONTHS)) {
    if (lowerDate.includes(name)) { monthNum = num; break; }
  }

  const sortKey = year ? parseInt(year, 10) * 12 + monthNum : -1;
  return { title: title || viaje, dateText, year, sortKey };
}

function groupTrips(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    const key = r.viaje || "Sin viaje";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  const trips = [];
  const usedSlugs = new Set();
  let i = 0;
  for (const [viaje, photos] of groups.entries()) {
    const meta = parseTripMeta(viaje);
    let slug = slugify(viaje);
    while (usedSlugs.has(slug)) slug += "-2";
    usedSlugs.add(slug);
    trips.push({ slug, viaje, photos, hue: 197 + ((i * 17) % 46) - 18, ...meta });
    i++;
  }

  trips.sort((a, b) => {
    if (a.sortKey === -1 && b.sortKey === -1) return a.title.localeCompare(b.title, "es");
    if (a.sortKey === -1) return 1;
    if (b.sortKey === -1) return -1;
    return a.sortKey - b.sortKey;
  });

  return trips;
}

async function loadTrips() {
  const res = await fetch(DATA_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo leer " + DATA_PATH);
  const md = await res.text();
  const rows = parseMarkdownTable(md);
  const trips = groupTrips(rows);
  return { trips, totalPhotos: rows.length };
}

function orbStyle(hue, sat = 26, light = 34) {
  const oLight = `hsl(${hue}, ${sat + 10}%, ${light + 34}%)`;
  const oBase = `hsl(${hue}, ${sat}%, ${light}%)`;
  const oDark = `hsl(${hue}, ${sat + 6}%, ${Math.max(light - 16, 8)}%)`;
  return `--o-light:${oLight}; --o-base:${oBase}; --o-dark:${oDark};`;
}

/* ---------- estados de carga / error ---------- */

function renderState(container, message, isError = false) {
  container.innerHTML = `<div class="state-msg${isError ? " state-error" : ""}">${escapeHtml(message)}</div>`;
}

/* ---------- página: índice ---------- */

async function renderIndexPage() {
  const heroStats = document.getElementById("hero-stats");
  const timeline = document.getElementById("timeline");
  renderState(timeline, "Cargando viajes…");

  let data;
  try {
    data = await loadTrips();
  } catch (err) {
    renderState(
      timeline,
      "No se pudo cargar data/viajes.md. Si abriste este archivo directamente desde el disco, súbelo a un hosting o sírvelo con un servidor local (ej. \"python3 -m http.server\") para que el navegador pueda leer los datos.",
      true
    );
    return;
  }

  const { trips, totalPhotos } = data;

  if (heroStats) {
    heroStats.innerHTML = `
      <div class="stat"><b>${trips.length}</b><span>Viajes</span></div>
      <div class="stat"><b>${totalPhotos}</b><span>Panoramas</span></div>
      <div class="stat"><b>${yearRange(trips)}</b><span>Período</span></div>
    `;
  }

  if (trips.length === 0) {
    renderState(timeline, "Todavía no hay viajes en data/viajes.md.");
    return;
  }

  let html = "";
  let currentYear = null;
  trips.forEach((t) => {
    const yearLabel = t.year || "Sin fecha";
    if (yearLabel !== currentYear) {
      if (currentYear !== null) html += `</div>`;
      html += `<div class="year-group"><div class="year-label">${escapeHtml(yearLabel)}</div>`;
      currentYear = yearLabel;
    }
    const n = t.photos.length;
    const label = n === 1 ? "panorama" : "panoramas";
    const orbs = t.photos.slice(0, 4)
      .map(() => `<div class="orb card" style="${orbStyle(t.hue)}"></div>`)
      .join("");

    html += `
      <a class="trip-row" href="trip.html?t=${encodeURIComponent(t.slug)}">
        <div class="orb-stack">${orbs}</div>
        <div class="trip-info">
          <h2>${escapeHtml(t.title)}</h2>
          <div class="trip-meta">${escapeHtml(t.viaje)}</div>
        </div>
        <div class="trip-count">${n} ${label}</div>
        <div class="trip-arrow">→</div>
      </a>`;
  });
  html += `</div>`;

  timeline.innerHTML = html;

  const footerCount = document.getElementById("footer-count");
  if (footerCount) footerCount.textContent = `${totalPhotos} panoramas · ${trips.length} viajes`;
}

function yearRange(trips) {
  const years = trips.map((t) => t.year).filter(Boolean).sort();
  if (years.length === 0) return "—";
  const first = years[0], last = years[years.length - 1];
  return first === last ? first : `${first}–${last}`;
}

/* ---------- página: viaje ---------- */

async function renderTripPage() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get("t");
  const heroEl = document.getElementById("trip-hero-content");
  const gallery = document.getElementById("gallery-grid");

  renderState(gallery, "Cargando panoramas…");

  let data;
  try {
    data = await loadTrips();
  } catch (err) {
    renderState(
      gallery,
      "No se pudo cargar data/viajes.md. Sirve este sitio desde un servidor (hosting o \"python3 -m http.server\") para que el navegador pueda leer los datos.",
      true
    );
    return;
  }

  const { trips, totalPhotos } = data;
  const trip = trips.find((t) => t.slug === slug);

  if (!trip) {
    if (heroEl) {
      heroEl.innerHTML = `
        <div>
          <p class="eyebrow">Viaje no encontrado</p>
          <h1>Esta página ya no existe</h1>
          <p class="trip-hero-meta">Puede que el viaje se haya renombrado o eliminado de data/viajes.md.</p>
        </div>`;
    }
    renderState(gallery, "Vuelve al índice para ver los viajes disponibles.");
    return;
  }

  const n = trip.photos.length;
  const label = n === 1 ? "panorama" : "panoramas";
  const ubicaciones = [...new Set(trip.photos.map((p) => p.ubicacion).filter(Boolean))];

  if (heroEl) {
    heroEl.innerHTML = `
      <div class="orb med" style="${orbStyle(trip.hue)}"></div>
      <div>
        <p class="eyebrow">${escapeHtml(trip.dateText || "Sin fecha")}</p>
        <h1>${escapeHtml(trip.title)}</h1>
        <p class="trip-hero-meta">${n} ${label}${ubicaciones.length ? " — " + escapeHtml(ubicaciones.join(" · ")) : ""}</p>
      </div>`;
  }

  document.title = `${trip.title} — Diario visual en 360°`;

  gallery.innerHTML = trip.photos.map((p) => `
    <a class="photo-card" href="${escapeHtml(p.enlace)}" target="_blank" rel="noopener noreferrer">
      <div class="card-top">
        <div class="orb card" style="${orbStyle(trip.hue)}"></div>
      </div>
      <div>
        <h3>${escapeHtml(p.lugar)}</h3>
        <div class="place">${escapeHtml(p.ubicacion)}</div>
      </div>
      <span class="view-link">Ver panorama <span class="arrow">→</span></span>
    </a>`).join("");

  const footerCount = document.getElementById("footer-count");
  if (footerCount) footerCount.textContent = `${totalPhotos} panoramas · ${trips.length} viajes`;
}

/* ---------- arranque ---------- */

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "index") renderIndexPage();
  if (page === "trip") renderTripPage();
});
