import logging

logger = logging.getLogger(__name__)

RISK_RULES = [
    {
        "key": "유치권",
        "score": 90,
        "label": "유치권 신고 — 낙찰 후 인도 불가 위험 (최고 위험)",
    },
    {
        "key": "법정지상권",
        "score": 70,
        "label": "법정지상권 성립 가능 — 토지/건물 분리 소유 위험",
    },
    {
        "key": "선순위임차인",
        "score": 55,
        "label": "선순위 임차인 존재 — 배당 후 잔여 여부 확인 필요",
    },
    {
        "key": "분묘기지권",
        "score": 65,
        "label": "분묘기지권 — 토지 이용 제한 가능성",
    },
    {
        "key": "가처분",
        "score": 60,
        "label": "가처분 등기 — 소유권 이전 제한 위험",
    },
    {
        "key": "농지취득",
        "score": 40,
        "label": "농지취득자격 확인 필요 — 비농업인 취득 제한",
    },
]


class RiskEngine:
    def analyze(self, item: dict) -> dict:
        rights: list[str] = item.get("rights", [])
        detected = []
        max_score = 0.0

        for rule in RISK_RULES:
            for right in rights:
                if rule["key"] in right:
                    detected.append(rule["label"])
                    if rule["score"] > max_score:
                        max_score = float(rule["score"])

        if not detected:
            score = 0.0
        else:
            score = max_score

        logger.debug(f"Risk analysis: case={item.get('case_number')}, score={score}, items={detected}")
        return {"score": score, "items": detected}
