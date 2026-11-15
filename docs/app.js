const DATA_URL = "data/news.json";
const $ = (s) => document.querySelector(s);
let data = { items: [], topics: [] };
let tab = "Все";
let query = "";
let shown = 60;

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let readSet = new Set(store.get("read", []));

function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function linkify(s) {
  return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function fmtDate(iso) {
  const d = new Date(iso), now = new Date();
  const t = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return "сегодня " + t;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "вчера " + t;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + " " + t;
}

function filtered() {
  const q = query.trim().toLowerCase();
  return data.items.filter((p) =>
    (tab === "Все" || (p.topics || []).includes(tab)) &&
    (!q || (p.text + " " + p.channel_title).toLowerCase().includes(q))
  );
}

function renderTabs() {
  const all = ["Все", ...data.topics];
  $("#tabs").innerHTML = all.map((t) => {
    const items = t === "Все" ? data.items : data.items.filter((p) => (p.topics || []).includes(t));
    const unread = items.filter((p) => !readSet.has(p.id)).length;
    return `<button class="${t === tab ? "active" : ""}" data-t="${esc(t)}">${esc(t)}${unread ? `<span class="n">${unread}</span>` : ""}</button>`;
  }).join("");
}

function renderList() {
  const items = filtered();
  if (!items.length) {
    $("#list").innerHTML = `<div class="empty">${data.items.length ? "Ничего не найдено" : "Новостей пока нет"}</div>`;
    return;
  }
  $("#list").innerHTML = items.slice(0, shown).map((p) => {
    const long = (p.text || "").length > 400;
    return `<article class="card ${readSet.has(p.id) ? "read" : ""}" data-id="${esc(p.id)}">
      ${p.image ? `<img loading="lazy" src="${esc(p.image)}" alt="" onerror="this.remove()">` : ""}
      <div class="body">
        <div class="meta"><span class="ch">${esc(p.channel_title || p.channel)}</span><span>${fmtDate(p.date)}</span></div>
        <div class="text ${long ? "clip" : ""}">${linkify(p.text || "")}</div>
        ${(p.topics || []).length ? `<div class="tags">${p.topics.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
        <div class="actions">
          ${long ? `<button data-more>Читать полностью</button>` : "<span></span>"}
          <a href="${esc(p.url)}" target="_blank" rel="noopener">Открыть в Telegram</a>
        </div>
      </div>
    </article>`;
  }).join("") + (items.length > shown ? `<div class="empty"><button id="more" style="background:var(--card);color:var(--text);border:0;border-radius:10px;padding:10px 20px">Показать ещё</button></div>` : "");
}

function render() { renderTabs(); renderList(); }

function setStatus(online, updated) {
  const el = $("#status");
  const when = updated ? "обновлено " + fmtDate(updated) : "";
  el.textContent = online ? when : "офлайн · " + when;
  el.classList.toggle("off", !online);
}

async function load() {
  $("#refresh").classList.add("spin");
  // сначала показываем сохранённое
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
  $("#refresh").classList.remove("spin");
}

function applyTitle() {
  if (data.title) { $("#title").textContent = data.title; document.title = data.title; }
}

function markRead(id) {
  if (readSet.has(id)) return;
  readSet.add(id);
  store.set("read", [...readSet].slice(-3000));
}

$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  tab = b.dataset.t; shown = 60; render(); window.scrollTo(0, 0);
});
$("#search").addEventListener("input", (e) => { query = e.target.value; shown = 60; renderList(); });
$("#refresh").addEventListener("click", load);
$("#list").addEventListener("click", (e) => {
  if (e.target.id === "more") { shown += 60; renderList(); return; }
  const card = e.target.closest(".card"); if (!card) return;
  if (e.target.matches("[data-more]")) {
    card.querySelector(".text").classList.remove("clip"); e.target.remove();
  }
  markRead(card.dataset.id); card.classList.add("read"); renderTabs();
});
window.addEventListener("online", load);
window.addEventListener("offline", () => setStatus(false, data.updated));

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
load();
