from __future__ import annotations

import json
import smtplib
from dataclasses import asdict, dataclass
from email.message import EmailMessage
from typing import Any, Protocol


@dataclass(frozen=True)
class PromotionNotification:
    event: str
    strategy_id: str
    version: str
    status: str
    reason: str | None = None
    stages: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class NotificationSink(Protocol):
    def send(self, notification: PromotionNotification) -> None: ...


class WebhookNotifier:
    def __init__(self, url: str, timeout: float = 5.0, headers: dict[str, str] | None = None) -> None:
        self.url, self.timeout, self.headers = url, timeout, headers or {"Content-Type": "application/json"}

    def send(self, notification: PromotionNotification) -> None:
        import requests
        response = requests.post(self.url, json=notification.as_dict(), headers=self.headers, timeout=self.timeout)
        response.raise_for_status()


class SmtpNotifier:
    def __init__(self, host: str, port: int, sender: str, recipients: list[str],
                 username: str | None = None, password: str | None = None, use_tls: bool = True) -> None:
        self.host, self.port, self.sender, self.recipients = host, port, sender, recipients
        self.username, self.password, self.use_tls = username, password, use_tls

    def send(self, notification: PromotionNotification) -> None:
        message = EmailMessage()
        message["Subject"] = f"Quant promotion: {notification.event} {notification.strategy_id}:{notification.version}"
        message["From"], message["To"] = self.sender, ", ".join(self.recipients)
        message.set_content(json.dumps(notification.as_dict(), ensure_ascii=False, indent=2))
        with smtplib.SMTP(self.host, self.port, timeout=10) as smtp:
            if self.use_tls:
                smtp.starttls()
            if self.username:
                smtp.login(self.username, self.password or "")
            smtp.send_message(message)


class CompositeNotifier:
    def __init__(self, *sinks: NotificationSink, fail_open: bool = True) -> None:
        self.sinks, self.fail_open = sinks, fail_open

    def send(self, notification: PromotionNotification) -> None:
        errors = []
        for sink in self.sinks:
            try:
                sink.send(notification)
            except Exception as exc:
                errors.append(exc)
        if errors and not self.fail_open:
            raise RuntimeError(f"promotion notification failed: {errors[0]}") from errors[0]
