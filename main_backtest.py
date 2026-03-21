import sys
from datetime import datetime
from typing import NoReturn

from backtest.backtestsystem import BackTestSystem
from config.config import config
from utils.logger import close_logger, sys_logger
from utils.runtime import ExitController, allow_sleep, log_shutdown, log_startup, prevent_sleep

logger = sys_logger.getChild("Main")


def main() -> NoReturn:
    start_time = datetime.now()
    exit_controller = ExitController(logger)

    try:
        exit_controller.install()
        log_startup(logger, "Quant Backtest Platform")

        with BackTestSystem(config) as system:
            logger.info("Backtest system initialized")

            try:
                prevent_sleep(logger)
                system.set_terminal_title("QMT BackTestSystem")
                system.start()

                logger.info("Entering main loop")
                keep_running = True
                while not exit_controller.exit_requested and keep_running:
                    try:
                        keep_running = system.run()
                    except KeyboardInterrupt:
                        logger.warning("Keyboard interrupt detected")
                        break
                    except Exception as exc:
                        logger.critical("Main loop failed: %s", str(exc), exc_info=True)
                        raise

                system.engine.report()
                system.engine.plot()
            except Exception as exc:
                logger.critical("Backtest runtime failed: %s", str(exc), exc_info=True)
                raise

        logger.info("Backtest system stopped safely")
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
