"""DHeli daily scraper.

Pulls today's menus from USC Dining for each hall, upserts into `menu_items`,
then triggers an AI recipe generation per hall+period.
"""
from __future__ import annotations

import json
import os
import random
import sys
import time
from datetime import datetime
from typing import Iterable
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
APP_INTERNAL_URL = os.environ.get("APP_INTERNAL_URL", "http://app:3000")
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")

BASE_URL = "https://hospitality.usc.edu/dining-hall-menus/"

WEEKDAY_PERIODS = ("breakfast", "lunch", "dinner")
WEEKEND_PERIODS = ("brunch", "dinner")
LA_TZ = ZoneInfo("America/Los_Angeles")


def meal_periods_for_today() -> tuple[str, ...]:
    """Return the correct meal periods based on day of week (LA timezone)."""
    now = datetime.now(LA_TZ)
    if now.weekday() >= 5:  # Saturday=5, Sunday=6
        return WEEKEND_PERIODS
    return WEEKDAY_PERIODS


def log(msg: str) -> None:
    print(f"[scraper] {msg}", flush=True)


def get_halls(conn) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, name, venue_id, active_meal_periods::text[] AS active_meal_periods
              FROM halls
             ORDER BY name
            """
        )
        return list(cur.fetchall())


def upsert_menu_items(conn, hall_id: str, day: str, period: str, items: Iterable[dict]) -> int:
    inserted = 0
    with conn.cursor() as cur:
        for it in items:
            cur.execute(
                """
                INSERT INTO menu_items (hall_id, date, meal_period, name, category, dietary_tags)
                VALUES (%s, %s, %s::meal_period, %s, %s, %s)
                ON CONFLICT (hall_id, date, meal_period, name) DO NOTHING
                """,
                (
                    hall_id,
                    day,
                    period,
                    it["name"],
                    it.get("category"),
                    it.get("dietary_tags", []),
                ),
            )
            if cur.rowcount > 0:
                inserted += 1
    conn.commit()
    return inserted


def scrape_hall_period(page, venue_id: str, day: str, period: str) -> list[dict]:
    try:
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_load_state("networkidle", timeout=15_000)
    except PlaywrightTimeoutError:
        log(f"page load timeout for {venue_id} {period}")
        return []
    except Exception as exc:
        log(f"page load error for {venue_id} {period}: {exc}")
        return []

    # Debug: log available venue filter buttons
    filters = page.query_selector_all('button.js-menu-filter[data-type="venue"]')
    if not filters:
        log(f"WARNING: no venue filter buttons found on page — site structure may have changed")
        title = page.title()
        log(f"page title: {title}")
        return []
    else:
        available = [f.get_attribute("data-value") for f in filters]
        log(f"available venue filters: {available}")

    try:
        btn = page.query_selector(f'button.js-menu-filter[data-type="venue"][data-value="{venue_id}"]')
        if not btn:
            log(f"venue filter button not found for venue_id={venue_id}")
            return []
        btn.click()
        # Wait for venue button to become active (client-side switch, no AJAX)
        page.wait_for_selector(
            f'button.js-menu-filter[data-value="{venue_id}"].active', timeout=5_000
        )
        page.wait_for_timeout(500)
        page.fill("#date", day)
        page.evaluate(
            "() => document.querySelector('#date').dispatchEvent(new Event('change', { bubbles: true }))"
        )
        page.wait_for_load_state("networkidle", timeout=15_000)
        page.wait_for_selector(
            f'.meal-container[data-meal="{period}"]', timeout=15_000
        )
    except PlaywrightTimeoutError:
        log(f"timeout waiting for meal container: {venue_id} {period}")
        # Debug: check what meal containers exist
        containers = page.query_selector_all(".meal-container")
        meals = [c.get_attribute("data-meal") for c in containers]
        log(f"available meal containers: {meals}")
        return []
    except Exception as exc:
        log(f"scrape error: {exc}")
        return []

    items: list[dict] = []
    stations = page.query_selector_all(
        f'.meal-container[data-meal="{period}"] .stations .station'
    )
    for station in stations:
        title_el = station.query_selector("p.title")
        category = title_el.inner_text().strip() if title_el else None
        entries = station.query_selector_all("ul li.js-menu-item")
        for li in entries:
            name = li.inner_text().strip()
            if not name:
                continue
            allergens_raw = li.get_attribute("data-allergens") or "[]"
            preferences_raw = li.get_attribute("data-preferences") or "[]"
            try:
                allergens = json.loads(allergens_raw)
            except json.JSONDecodeError:
                allergens = []
            try:
                preferences = json.loads(preferences_raw)
            except json.JSONDecodeError:
                preferences = []
            items.append(
                {
                    "name": name,
                    "category": category,
                    "dietary_tags": list({*allergens, *preferences}),
                }
            )
    return items


def trigger_generate(hall_id: str, period: str) -> None:
    try:
        r = requests.post(
            f"{APP_INTERNAL_URL}/api/recipes/generate?save=true",
            headers={
                "Content-Type": "application/json",
                "x-admin-secret": ADMIN_SECRET,
            },
            json={"hall_id": hall_id, "meal_period": period},
            timeout=60,
        )
        log(f"generate {period} -> {r.status_code}")
    except Exception as exc:
        log(f"generate {period} failed: {exc}")


def main() -> int:
    today = datetime.now(LA_TZ).date().isoformat()
    conn = psycopg2.connect(DATABASE_URL)
    try:
        halls = get_halls(conn)
    except Exception:
        conn.close()
        raise

    log(f"scraping {len(halls)} halls for {today}")
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, timeout=60_000)
        try:
            for hall in halls:
                today_valid = set(meal_periods_for_today())
                periods = [p for p in (hall["active_meal_periods"] or list(today_valid)) if p in today_valid]
                all_failed = True
                for period in periods:
                    context = browser.new_context()
                    page = context.new_page()
                    try:
                        items = scrape_hall_period(
                            page, hall["venue_id"], today, period
                        )
                    finally:
                        context.close()
                    if not items:
                        log(f"{hall['name']} {period}: no items")
                        continue
                    all_failed = False
                    inserted = upsert_menu_items(
                        conn, hall["id"], today, period, items
                    )
                    log(f"{hall['name']} {period}: inserted {inserted}/{len(items)}")
                    trigger_generate(hall["id"], period)
                if all_failed:
                    log(f"{hall['name']}: all periods failed — marking stale (no-op)")
                time.sleep(random.uniform(1.0, 3.0))
        finally:
            browser.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
