from datetime import datetime

from live.livesystem import LiveSystem
from utils.logger import close_logger, sys_logger
from utils.runtime import set_terminal_title

logger = sys_logger.getChild("LiveTest")


def main():
    start_time = datetime.now()

    with LiveSystem() as system:
        system.start()
        system._reset_daily_status()

        now = datetime.now()
        system.engine.on_date_change(now.date())
        system._pre_market()
        system._on_open()
        system._on_trade()
        system._on_close()
        system._post_market()

    logger.info("Runtime: %.2fs", (datetime.now() - start_time).total_seconds())


if __name__ == "__main__":
    set_terminal_title("QMT LiveTest", logger, mode="livetest")
    main()
    close_logger()
