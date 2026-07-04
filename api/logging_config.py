import os
import logging
import json
from datetime import datetime


class CloudJsonFormatter(logging.Formatter):
    """GCP Cloud Logging 구조화 JSON 포맷"""
    SEVERITY_MAP = {
        "DEBUG":    "DEBUG",
        "INFO":     "INFO",
        "WARNING":  "WARNING",
        "ERROR":    "ERROR",
        "CRITICAL": "CRITICAL",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity":  self.SEVERITY_MAP.get(record.levelname, "DEFAULT"),
            "message":   record.getMessage(),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "logger":    record.name,
            "module":    record.module,
            "funcName":  record.funcName,
            "lineNo":    record.lineno,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    is_cloud = os.environ.get("K_SERVICE")  # Cloud Run 환경 감지
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    handler = logging.StreamHandler()
    if is_cloud:
        handler.setFormatter(CloudJsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )

    if root.handlers:
        root.handlers.clear()
    root.addHandler(handler)
