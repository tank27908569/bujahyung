import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


REAL_ESTATE_STRONG = (
    "경매", "공매", "낙찰", "입찰", "패찰", "유찰", "권리분석", "매각물건명세서",
    "사건번호", "타경", "감정가", "최저가", "명도", "배당", "대항력", "우선변제",
    "유치권", "법정지상권", "근저당", "임차인", "채무자", "채권자", "담보대출",
    "대부업", "대부", "npl", "부실채권", "입찰표", "보증금", "매각기일",
)
REAL_ESTATE_GENERAL = (
    "부동산", "등기부", "실거래가", "대지권", "재건축", "재개발", "토지", "상가",
    "아파트", "오피스텔", "다세대", "다가구", "빌라", "임대차", "전세", "월세",
    "소유권", "점유자", "현장 임장", "매물", "시세차익", "수익률", "매수인",
)
BOOK_MARKERS = (
    "부자형의 서재", "오늘의 책", "독서모임", "책을 읽", "읽은 책", "서평",
    "안톤 체호프", "도스토옙스키", "톨스토이", "플로베르", "헤밍웨이", "카프카",
)
SOCIAL_NOISE = (
    "맞팔", "선팔", "팔로워", "팔로잉", "스친", "좋아요 눌러", "리포스트 부탁",
    "댓글로", "응원합니다", "감사합니다. 응원합니다", "좋은 글 감사합니다",
)


def repair_text(value: str) -> str:
    if not isinstance(value, str):
        return ""
    try:
        return value.encode("latin1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def clean_text(value: str) -> str:
    value = repair_text(value).replace("\u00a0", " ")
    value = re.sub(r"\r\n?", "\n", value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def is_seodang(text: str) -> bool:
    if "스레드 서당" in text:
        return True
    first = next((line.strip() for line in text.splitlines() if line.strip()), "")
    return bool(re.match(r"^[\u3400-\u9fff]{4}\s*[\(（]", first))


def is_library(text: str) -> bool:
    lower = text.lower()
    if any(marker.lower() in lower for marker in BOOK_MARKERS):
        return True
    if re.search(r"《[^》]{1,80}》", text):
        return True
    return False


def real_estate_score(text: str) -> tuple[int, list[str]]:
    lower = text.lower()
    hits = [word for word in REAL_ESTATE_STRONG if word.lower() in lower]
    general = [word for word in REAL_ESTATE_GENERAL if word.lower() in lower]
    score = len(hits) * 3 + len(general)
    if re.search(r"\d{4}\s*타경\s*\d+", text):
        score += 8
        hits.append("사건번호형식")
    if re.search(r"\d+(?:\.\d+)?\s*억", text) and general:
        score += 2
    return score, hits + general


def classify(text: str) -> tuple[str, list[str]]:
    if is_seodang(text):
        return "seodang", ["사자성어/서당 형식"]
    if is_library(text):
        return "library", ["책/서재 형식"]
    score, hits = real_estate_score(text)
    # The import is intentionally conservative: even one explicit auction or
    # real-estate term keeps a post out of the public daily-life archive.
    if score >= 1:
        return "real-estate", hits
    # Short reflections and greeting posts are still part of the author's
    # everyday record, so they belong in the daily-life archive too.
    return "daily", hits


def make_title(text: str) -> str:
    lines = [re.sub(r"^[\s\-—•·]+", "", line).strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return "살아가는 이야기"
    first = re.sub(r"\s+", " ", lines[0]).strip('"“”‘’')
    if len(first) < 12 and len(lines) > 1:
        second = re.sub(r"\s+", " ", lines[1]).strip('"“”‘’')
        if len(first) + len(second) <= 52:
            first = f"{first} {second}"
    sentence = re.split(r"(?<=[.!?。！？])\s+", first)[0]
    title = sentence if len(sentence) <= 60 else sentence[:57].rstrip() + "…"
    return title or "살아가는 이야기"


def extract_posts(source: Path) -> list[dict]:
    data = json.loads(source.read_text(encoding="utf-8"))["text_post_app_text_posts"]
    posts = []
    seen = set()
    for item in data:
        media = item.get("media") or []
        if not media:
            continue
        app_post = media[0].get("text_app_post") or {}
        if app_post.get("is_reply", False):
            continue
        raw = item.get("title", "") or next((entry.get("title", "") for entry in media if entry.get("title")), "")
        text = clean_text(raw)
        if not text:
            continue
        key = normalized(text)
        if key in seen:
            continue
        seen.add(key)
        timestamp = int(item.get("creation_timestamp") or media[0].get("creation_timestamp") or 0)
        category, reasons = classify(text)
        posts.append({
            "external_id": hashlib.sha256(f"{timestamp}\n{key}".encode("utf-8")).hexdigest()[:24],
            "timestamp": timestamp,
            "published_at": datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z"),
            "title": make_title(text),
            "body": text,
            "classification": category,
            "reasons": reasons,
        })
    return sorted(posts, key=lambda post: (post["timestamp"], post["external_id"]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    posts = extract_posts(args.source)
    daily = [post for post in posts if post["classification"] == "daily"]
    for number, post in enumerate(daily, 1):
        post["source_no"] = number
        post["category"] = "life-stories"
        post["is_published"] = True
    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": str(args.source),
        "counts": dict(Counter(post["classification"] for post in posts)),
        "daily": daily,
        "excluded": [post for post in posts if post["classification"] != "daily"],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"total": len(posts), "counts": result["counts"], "daily": len(daily)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
