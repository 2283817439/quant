import sys
from datetime import datetime
from typing import NoReturn

from config.config import config
from live.livesystem import LiveSystem
from utils.logger import close_logger, sys_logger
from utils.runtime import ExitController, allow_sleep, log_shutdown, log_startup, prevent_sleep

logger = sys_logger.getChild("Main")


def main() -> NoReturn:
    start_time = datetime.now()
    exit_controller = ExitController(logger)

    try:
        exit_controller.install()
        log_startup(
            logger,
            "Quant Live Trading Platform",
            extra_lines=[f"QMT path: {config.get('xt.plugin_path')}"],
        )

        with LiveSystem() as system:
            logger.info("Live trading system initialized")

            try:
                prevent_sleep(logger)
                system.set_terminal_title(f"QMT LiveSystem - {config.get('account.account_id')}")
                system.start()

                logger.info("Entering main loop")
                while not exit_controller.exit_requested:
                    try:
                        system.run()
                    except KeyboardInterrupt:
                        logger.warning("Keyboard interrupt detected")
                        break
                    except Exception as exc:
                        logger.critical("Main loop failed: %s", str(exc), exc_info=True)
                        raise
            except Exception as exc:
                logger.critical("Live runtime failed: %s", str(exc), exc_info=True)
                raise

        logger.info("Live trading system stopped safely")
    except Exception as exc:
        logger.critical("Fatal runtime error: %s", str(exc), exc_info=True)
        sys.exit(255)
    finally:
        allow_sleep(logger)
        log_shutdown(logger, start_time)
        close_logger()


if __name__ == "__main__":
    main()
    sys.exit(0)
