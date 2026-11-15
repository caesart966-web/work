"""Собирает посты из публичных Telegram-каналов (t.me/s/...) и фильтрует по темам.

Результат: docs/data/news.json - его читает приложение.
"""
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent
CONFIG = ROOT / "config.json"
OUT = ROOT / "docs" / "data" / "news.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36"}


def norm(s: str) -> str:
    return s.lower().replace("ё", "е")


def compile_topic(keywords):
    """Обычное слово - совпадение по началу слова (сро -> сро, сроки).
    Слово в кавычках "сро" - только целое слово."""
    pats = []
    for kw in keywords:
        kw = norm(kw.strip())
        if not kw:
            continue
        if len(kw) > 2 and kw[0] == kw[-1] == '"':
            pats.append(r"(?<!\w)" + re.escape(kw[1:-1]) + r"(?!\w)")
        else:
            pats.append(r"(?<!\w)" + re.escape(kw))
    return re.compile("|".join(pats)) if pats else None


def text_of(node):
    if node is None:
        return ""
    for br in node.find_all("br"):
        br.replace_with("\n")
    return node.get_text().strip()


def bg_url(style):
    m = re.search(r"url\(['\"]?(.*?)['\"]?\)", style or "")
    return m.group(1) if m else None


def parse_page(html, channel):
    soup = BeautifulSoup(html, "html.parser")
    title_el = soup.select_one(".tgme_channel_info_header_title")
    ch_title = title_el.get_text(strip=True) if title_el else channel
    ava_el = soup.select_one(".tgme_page_photo_image img") or soup.select_one(".tgme_widget_message_user_photo img")
    avatar = ava_el.get("src") if ava_el else None
    posts = []
    for msg in soup.select(".tgme_widget_message[data-post]"):
        post_id = msg["data-post"]
        num = int(post_id.split("/")[-1])
        t = msg.select_one(".tgme_widget_message_date time[datetime]") or msg.select_one("time[datetime]")
        if not t:
            continue
        text = text_of(msg.select_one(".tgme_widget_message_text"))
        image = None
        for sel in (".tgme_widget_message_photo_wrap", ".tgme_widget_message_video_thumb", ".link_preview_image"):
            el = msg.select_one(sel)
            if el and bg_url(el.get("style")):
                image = bg_url(el.get("style"))
                break
        if not text and not image:
            continue
        posts.append({
            "id": post_id,
            "num": num,
            "channel": channel,
            "channel_title": ch_title,
            "avatar": avatar,
            "date": t["datetime"],
            "text": text,
            "image": image,
            "url": f"https://t.me/{post_id}",
        })
    return posts


def fetch_channel(channel, pages):
    out, before = [], None
    for _ in range(max(1, pages)):
        url = f"https://t.me/s/{channel}" + (f"?before={before}" if before else "")
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        posts = parse_page(r.text, channel)
        if not posts:
            break
        out.extend(posts)
        before = min(p["num"] for p in posts)
        time.sleep(1)
    return out


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    topics = [(t["name"], compile_topic(t.get("keywords", []))) for t in cfg.get("topics", [])]
    show_unmatched = cfg.get("show_unmatched", False)
    keep_days = cfg.get("keep_days", 30)

    old = {}
    if OUT.exists():
        try:
            for p in json.loads(OUT.read_text(encoding="utf-8")).get("items", []):
                old[p["id"]] = p
        except Exception:
            pass

    errors = []
    for ch in cfg.get("channels", []):
        ch = re.sub(r"^(https?://)?t\.me/(s/)?", "", ch.strip()).lstrip("@").strip("/").split("/")[0]
        if not ch:
            continue
        try:
            for p in fetch_channel(ch, cfg.get("pages_per_channel", 2)):
                old[p["id"]] = p
            print(f"ok  {ch}")
        except Exception as e:
            errors.append(f"{ch}: {e}")
            print(f"ERR {ch}: {e}", file=sys.stderr)

    cutoff = datetime.now(timezone.utc) - timedelta(days=keep_days)
    items = []
    for p in old.values():
        try:
            if datetime.fromisoformat(p["date"]) < cutoff:
                continue
        except Exception:
            pass
        txt = norm(p.get("text", ""))
        p["topics"] = [name for name, rx in topics if rx and rx.search(txt)]
        if p["topics"] or show_unmatched:
            items.append(p)
    items.sort(key=lambda p: p["date"], reverse=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "title": cfg.get("app_title", "Новости"),
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "topics": [t["name"] for t in cfg.get("topics", [])],
        "errors": errors,
        "items": items,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(items)} items")


if __name__ == "__main__":
    main()
