const DATA_URL = "data/news.json";
const $ = (s) => document.querySelector(s);
let data = { items: [], topics: [] };
let tab = "Все";
let query = "";
let shown = 50;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let readSet = new Set(store.get("read", []));

const ICON_EXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function linkify(s) {
  return esc(s).replace(/(https?:\/\/[^\s<]+)/g, (u) => {
    const short = u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    return `<a href="${u}" target="_blank" rel="noopener">${short.length > 40 ? short.slice(0, 38) + "…" : short}</a>`;
  });
}
function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function initials(s) { return s.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "•"; }
const sameDay = (a, b) => a.toDateString() === b.toDateString();
function dayLabel(d) {
  const now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return "Сегодня";
  if (sameDay(d, y)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}
const hhmm = (d) => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function ago(iso) {
  const d = new Date(iso), m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return "только что";
  if (m < 60) return m + " мин назад";
  if (sameDay(d, new Date())) return "в " + hhmm(d);
  return dayLabel(d).toLowerCase() + " в " + hhmm(d);
}

// первая строка поста — заголовок
function split(text) {
  const t = (text || "").trim();
  const nl = t.indexOf("\n");
  const first = (nl === -1 ? t : t.slice(0, nl)).trim();
  if (first && first.length <= 160 && (nl !== -1 || t.length <= 160)) {
    return { title: first, body: nl === -1 ? "" : t.slice(nl + 1).replace(/^\s+/, "") };
  }
  return { title: "", body: t };
}

function filtered() {
  const q = query.trim().toLowerCase();
  return data.items.filter((p) =>
    (tab === "Все" || (p.topics || []).includes(tab)) &&
    (!q || ((p.text || "") + " " + (p.channel_title || "")).toLowerCase().includes(q))
  );
}

function renderTabs() {
  const all = ["Все", ...(data.topics || [])];
  $("#tabs").innerHTML = all.map((t) => {
    const items = t === "Все" ? data.items : data.items.filter((p) => (p.topics || []).includes(t));
    const unread = items.filter((p) => !readSet.has(p.id)).length;
    return `<button class="${t === tab ? "active" : ""}" data-t="${esc(t)}">${esc(t)}${unread ? `<span class="n">${unread}</span>` : ""}</button>`;
  }).join("");
}

function card(p) {
  const name = p.channel_title || p.channel;
  const { title, body } = split(p.text);
  const long = body.length > 320;
  const ava = p.avatar
    ? `<img src="${esc(p.avatar)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${esc(initials(name))}'))">`
    : esc(initials(name));
  return `<article class="card ${readSet.has(p.id) ? "read" : ""}" data-id="${esc(p.id)}">
    <div class="head">
      <div class="ava" style="--h:${hue(p.channel)}">${ava}</div>
      <div class="who"><div class="ch">${esc(name)}</div><div class="time">${ago(p.date)}</div></div>
      <span class="dot"></span>
    </div>
    ${p.image ? `<div class="photo"><img loading="lazy" src="${esc(p.image)}" alt="" onerror="this.parentNode.remove()"></div>` : ""}
    ${title ? `<h2 class="title">${linkify(title)}</h2>` : ""}
    ${body ? `<div class="text ${long ? "clip" : ""}">${linkify(body)}</div>` : ""}
    <div class="foot">
      <div class="tags">${(p.topics || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div>
      <div class="links">
        ${long ? `<button data-more>Ещё</button>` : ""}
        <a href="${esc(p.url)}" target="_blank" rel="noopener">Telegram ${ICON_EXT}</a>
      </div>
    </div>
  </article>`;
}

function renderList() {
  const items = filtered();
  if (!items.length) {
    $("#list").innerHTML = data.items.length
      ? `<div class="empty"><b>🔍</b>Ничего не найдено</div>`
      : `<div class="empty"><b>📭</b>Новостей пока нет</div>`;
    return;
  }
  let html = "", last = "";
  for (const p of items.slice(0, shown)) {
    const label = dayLabel(new Date(p.date));
    if (label !== last) { html += `<div class="day">${esc(label)}</div>`; last = label; }
    html += card(p);
  }
  if (items.length > shown) html += `<button class="more-btn" id="more">Показать ещё</button>`;
  $("#list").innerHTML = html;
}

function render() { renderTabs(); renderList(); }

function setStatus(online, updated) {
  const el = $("#status");
  const when = updated ? "обновлено " + ago(updated) : "нет данных";
  el.textContent = online ? when : "офлайн · " + when;
  el.classList.toggle("off", !online);
}

function applyTitle() {
  const t = data.title || "Мои новости";
  $("#title").innerHTML = `<span>${esc(t)}</span>`;
  document.title = t;
}

async function load() {
  $("#refresh").classList.add("spin");
  const cached = store.get("data", null);
  if (cached && !data.items.length) { data = cached; applyTitle(); render(); setStatus(navigator.onLine, data.updated); }
  try {
    const r = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
    store.set("data", data);
    setStatus(true, data.updated);
  } catch {
    setStatus(false, data.updated);
  }
  applyTitle(); render();
  setTimeout(() => $("#refresh").classList.remove("spin"), 400);
}

function markRead(id) {
  if (readSet.has(id)) return;
  readSet.add(id);
  store.set("read", [...readSet].slice(-3000));
}

$("#today").textContent = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  tab = b.dataset.t; shown = 50; render();
  const top = $(".hero").offsetHeight;
  if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
});
$("#search").addEventListener("input", (e) => { query = e.target.value; shown = 50; renderList(); });
$("#refresh").addEventListener("click", load);
$("#list").addEventListener("click", (e) => {
  if (e.target.id === "more") { shown += 50; renderList(); return; }
  const c = e.target.closest(".card"); if (!c) return;
  const more = e.target.closest("[data-more]");
  if (more) { c.querySelector(".text")?.classList.remove("clip"); more.remove(); }
  markRead(c.dataset.id); c.classList.add("read"); renderTabs();
});
window.addEventListener("scroll", () => $("#bar").classList.toggle("scrolled", window.scrollY > $(".hero").offsetHeight - 4), { passive: true });
window.addEventListener("online", load);
window.addEventListener("offline", () => setStatus(false, data.updated));
setInterval(() => setStatus(navigator.onLine, data.updated), 60000);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
load();
