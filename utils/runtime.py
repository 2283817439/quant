import ctypes
import os
import signal
import subprocess
import sys
from datetime import datetime
from typing import Iterable, Optional


ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_DISPLAY_REQUIRED = 0x00000002


class ExitController:
    def __init__(self, logger):
        self._logger = logger
        self._exit_requested = False

    @property
    def exit_requested(self) -> bool:
        return self._exit_requested

    def handle_signal(self, signum, _frame) -> None:
        self._logger.warning("Received system signal %d, starting graceful shutdown", signum)
        self._exit_requested = True

    def install(self) -> None:
        signal.signal(signal.SIGINT, self.handle_signal)
        signal.signal(signal.SIGTERM, self.handle_signal)


def prevent_sleep(logger) -> None:
    if os.name != "nt":
        return

    logger.info("Enabling sleep prevention mode")
    ctypes.windll.kernel32.SetThreadExecutionState(
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
    )


def allow_sleep(logger) -> None:
    if os.name != "nt":
        return

    logger.info("Restoring default sleep policy")
    ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)


def set_terminal_title(title: str, logger, mode: str = "") -> None:
    if os.name != "nt":
        return

    try:
        suffix = f" mode: {mode}" if mode else ""
        full_title = f"{title}{suffix} {os.getcwd()}"
        command = f'$Host.UI.RawUI.WindowTitle = "{full_title}"'
        subprocess.run(["powershell", "-Command", command], check=True)
        logger.debug("Terminal title updated: %s", full_title)
    except subprocess.CalledProcessError as exc:
        logger.warning("Failed to update terminal title: %s", str(exc))


def log_startup(logger, title: str, extra_lines: Optional[Iterable[str]] = None) -> None:
    logger.info("=" * 60)
    logger.info(title)
    logger.info("Start time: %s", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("Python version: %s", sys.version.replace("\n", ""))
    logger.info("Working directory: %s", os.getcwd())
    if extra_lines:
        for line in extra_lines:
            logger.info("%s", line)
    logger.info("=" * 60)


def log_shutdown(logger, start_time: datetime) -> None:
    logger.info("=" * 60)
    logger.info("Exit time: %s", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("Runtime: %.2fs", (datetime.now() - start_time).total_seconds())
    logger.info("=" * 60)
