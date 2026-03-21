import glob
import logging
import os
from logging.handlers import RotatingFileHandler

from config.config import config


class LogTheme:
    SYMBOL = "\033[1;36m"
    DATE = "\033[34m"
    NUMERIC = "\033[33m"
    RESET = "\033[0m"


def clean_old_logs(log_path: str) -> None:
    """
    Remove rotated log files from previous runs without polluting stdout.
    """
    bootstrap_logger = logging.getLogger(f"{config.get('logging.name', 'QMT')}.bootstrap")

    try:
        log_dir = os.path.dirname(log_path)
        base_name = os.path.basename(log_path)
        pattern = os.path.join(log_dir, f"{base_name}*")

        for file_path in glob.glob(pattern):
            try:
                os.remove(file_path)
                bootstrap_logger.debug("已删除旧日志文件: %s", file_path)
            except Exception as exc:
                bootstrap_logger.warning("删除日志文件失败 %s: %s", file_path, str(exc))
    except Exception as exc:
        bootstrap_logger.warning("清理日志异常: %s", str(exc))


def setup_logger() -> logging.Logger:
    mode = config.get("mode")

    if mode == "backtest":
        log_path = config.get("logging.backtest_file_path")
        if log_path:
            clean_old_logs(log_path)
    elif mode == "livetest":
        log_path = config.get("logging.livetest_file_path")
        if log_path:
            clean_old_logs(log_path)
    elif mode == "optimize":
        log_path = config.get("logging.optimize_file_path")
    else:
        log_path = config.get("logging.live_file_path")

    log_dir = os.path.dirname(log_path)
    os.makedirs(log_dir, exist_ok=True)

    logger = logging.getLogger(config.get("logging.name"))
    logger.setLevel("INFO")

    for handler in logger.handlers[:]:
        handler.close()
        logger.removeHandler(handler)

    file_handler = RotatingFileHandler(
        filename=log_path,
        maxBytes=100 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)-14s - %(levelname)-8s - %(message)s")
    )

    console_handler = logging.StreamHandler()
    if hasattr(console_handler.stream, "reconfigure"):
        try:
            console_handler.stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    if mode == "optimize":
        console_handler.setLevel("WARNING")
        file_handler.setLevel("WARNING")
    else:
        console_handler.setLevel(config.get("logging.level"))

    console_handler.setFormatter(
        logging.Formatter("%(asctime)s - %(name)-14s - %(levelname)-8s - %(message)s")
    )

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

    return logger


def close_logger() -> None:
    logger = logging.getLogger(config.get("logging.name"))

    for handler in logger.handlers[:]:
        handler.close()
        logger.removeHandler(handler)

    logging.shutdown()


sys_logger = setup_logger()
