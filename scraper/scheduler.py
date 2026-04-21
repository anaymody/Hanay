"""Long-running scheduler — invokes the scraper at midnight LA time daily."""
from __future__ import annotations

import time
import traceback
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from scrape import main as scrape_main, log

LA_TZ = ZoneInfo("America/Los_Angeles")
TARGET_HOUR = 0
TARGET_MINUTE = 0


def seconds_until_next_run() -> float:
    """Return seconds from now until the next midnight in LA time."""
    now = datetime.now(LA_TZ)
    target = now.replace(hour=TARGET_HOUR, minute=TARGET_MINUTE, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def run_loop() -> None:
    log("scheduler started — running initial scrape")
    try:
        scrape_main()
    except Exception:
        log(f"initial scrape failed:\n{traceback.format_exc()}")

    while True:
        wait = seconds_until_next_run()
        next_run = datetime.now(LA_TZ) + timedelta(seconds=wait)
        log(f"next scrape at {next_run.strftime('%Y-%m-%d %H:%M %Z')} ({wait/3600:.1f}h from now)")
        time.sleep(wait)
        log(f"waking up for scheduled scrape at {datetime.now(LA_TZ).isoformat()}")
        try:
            scrape_main()
        except Exception:
            log(f"scheduled scrape failed:\n{traceback.format_exc()}")


if __name__ == "__main__":
    run_loop()
