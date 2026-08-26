import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


CORE_TERMS = (
    '경매', '공매', '낙찰', '입찰', '패찰', '유찰', '권리분석', '매각물건명세서',
    '명도', '배당', '대항력', '우선변제', '유치권', '법정지상권', '매각기일',
    'npl', '부실채권', '입찰표',
)
LOVE_TERMS = ('사랑', '연애', '인연', '배우자', '부부의 인연', '마음의 낙찰')
DAILY_DIVERSION = (
    '오늘은 경매 얘기는 잠시', '오늘은 경매보다 더 중요한', '경매 이야기는 잠시',
    '경매 얘기보다 더 깊은', '경매 기술보다 더 중요한', '경매보다 더 중요한 얘기',
)
SOCIAL_OR_PROMO = (
    '사칭 계정', '팔로워 1만', '좋아요와 리포스트', '맞팔', '선팔',
    '경매하면, \'경매하는 부자형\'이', '무료 특강', '강의 신청', '수강 신청',
)
LISTING_PHRASES = (
    '오늘 아침, 시장에 단 하나뿐인 매물이', '오늘 아침,\n시장에 단 하나뿐인 매물이',
    '추천 물건', '추천물건', '물건 추천', '물건추천', '경매 물건 소개', '경매물건 소개',
    '내일 또 좋은 물건', '매일 좋은 물건', '관심 가져보세요', '관심가져 보세요',
    '관심 있게 볼 만한 물건', '검토해볼 만한 기회', '입찰 d-', '성투하고',
)
LISTING_STATS = (
    '사건번호', '감정가', '최저가', '실거래', '호가', '평형', '세대', '대단지',
    '역세권', '전용면적', '대지 ', '건물 ', '매각기일', '입찰기일', '경매 나왔어',
    '경매 나왔다', '경매로 나왔', '유찰되어', '유찰 되어',
)
EDUCATIONAL_OR_STORY = (
    '경린아', '실전썰', '실전 썰', '명도전', '권리분석이', '초보자가', '실수',
    '배운', '경험', '공부', '원칙', '협상', '복기', '주의해야', '확인해야',
    '낙찰받았더니', '낙찰받은 곳', '강제집행', '수강생', '제자', '임차인과',
)
DAILY_TITLE_MARKERS = (
    '인생', '오늘이라는', '오늘 하루', '굿모닝', '좋은 아침', '마음속', '나 자신',
    '삶의 ', '삶이', '꿈이 먼저', '성공은 속도', '재능은', '건강', '색소폰',
    '샴페인', '봄이 왔', '일요일 아침', '노자는', '한비자는', '소학은', '주자는',
    '사마천', '비바람', '세월의 무게', '당신 삶', '요즘 일이', '8월 첫날',
    '유연함과 원칙', '가로등마저', '낙찰은 구름', '대항력도 강해져야',
    '오늘의 피로', '오늘도 조금', '이번 주 ‘행복 낙찰’', '행복 낙찰',
    '인적 자산', '곧 부자가', '로또만', '자신을 함부로', '역전의 보너스',
    '머릿속을', '몇 마디 섞어', '보석세공사', '식사 시간', '실패라는 감정',
    '슬픔의 틀', '나의 마음', '설 연휴', '남들이 외로움', '이른 아침',
    '생각은 공짜', '프랑스어에', '천계', '삑사리', '자신의 수준',
    '살 만한 이유', '손자는', '세상은 꿈', '돈으로 남는', '기다림도',
    '숭구리당당', '진리는 나누어', '후생가외', '수익률 100%',
    '매일 아침 우리에게', '띵동', '법원으로 향하는 발걸음마다',
    '진짜 실력은 잘될 때가 아니라',
)
DAILY_BODY_MARKERS = (
    '오늘은 돈 얘기보다', '오늘은 돈 이야기가 아니라', '성장에 대해 말해',
    '돈보다 더 큰 자산인', '돈을 버는 기술보다 더 중요한 이야기',
    '형의 꿈은 뭐예요', '돈 만들기는 눈사람', '오늘 하루도',
)
PROPERTY_TITLE_MARKERS = (
    '아파트', '푸르지오', '자이', '아이파크', '래미안', '빌라', '오피스텔',
    '상가', '평형', '㎡', '대단지', '신도시', '킹스몰', '부영', '파크', '시티',
)


def normalize(value: str) -> str:
    return re.sub(r'\s+', ' ', value).strip()


def listing_score(text: str) -> int:
    score = sum(marker.lower() in text.lower() for marker in LISTING_STATS)
    if re.search(r'\d{4}\s*타경\s*\d+', text):
        score += 3
    if re.search(r'\d+(?:\.\d+)?\s*억', text):
        score += 1
    if re.search(r'\d+(?:\.\d+)?\s*평(?:형)?', text):
        score += 1
    return score


def classify(post: dict) -> tuple[bool, str]:
    body = post['body']
    lower = body.lower()
    title = post['title'].lower()
    core_hits = [term for term in CORE_TERMS if term.lower() in lower]
    if not core_hits:
        return False, 'no-direct-auction-topic'
    if any(term in body for term in LOVE_TERMS):
        return False, 'love-philosophy'
    if any(marker in body for marker in DAILY_DIVERSION):
        return False, 'daily-diversion'
    if any(marker.lower() in lower for marker in DAILY_BODY_MARKERS):
        return False, 'daily-diversion'
    if any(marker.lower() in lower for marker in SOCIAL_OR_PROMO):
        return False, 'social-or-promotion'
    if any(marker.lower() in title for marker in DAILY_TITLE_MARKERS):
        return False, 'daily-or-metaphor'
    if ('책' in title or '독서' in title) and '경매' not in title:
        return False, 'daily-or-metaphor'
    if any(marker.lower() in lower for marker in LISTING_PHRASES):
        return False, 'property-recommendation'
    if re.search(r'\d+(?:\.\d+)?\s*억', body) and any(marker.lower() in title for marker in PROPERTY_TITLE_MARKERS):
        return False, 'property-recommendation'
    score = listing_score(body)
    educational = any(marker.lower() in lower for marker in EDUCATIONAL_OR_STORY)
    # Structured location/price/spec posts are recommendations. Narrative case
    # studies stay in when they contain an explicit teaching or story marker.
    if score >= 3:
        return False, 'property-recommendation'
    if score >= 2 and any(marker in lower for marker in ('경매 나왔', '네이버', '실거래', '관심 있는', '관심있는')):
        return False, 'property-recommendation'
    # A single metaphorical auction word is not enough to make a daily post an
    # auction article. Require either repeated core vocabulary or an explicit
    # educational/story signal.
    core_occurrences = sum(lower.count(term.lower()) for term in CORE_TERMS)
    if core_occurrences < 2 and not educational:
        return False, 'daily-or-metaphor'
    return True, 'auction-practice'


def sql_literal(value: str, tag: str) -> str:
    safe_tag = tag
    while f'${safe_tag}$' in value:
        safe_tag += 'x'
    return f'${safe_tag}${value}${safe_tag}$'


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('classification', type=Path)
    parser.add_argument('output_json', type=Path)
    parser.add_argument('--sql', type=Path)
    args = parser.parse_args()

    raw = json.loads(args.classification.read_text(encoding='utf-8'))
    candidates = [post for post in raw['excluded'] if post['classification'] == 'real-estate']
    decisions = []
    seen = set()
    selected = []
    for post in candidates:
        include, reason = classify(post)
        key = normalize(post['body'])
        if include and key in seen:
            include, reason = False, 'duplicate'
        if include:
            seen.add(key)
            selected.append(post)
        decisions.append({**post, 'selected': include, 'selection_reason': reason})
    selected.sort(key=lambda post: (post['timestamp'], post['external_id']))
    for number, post in enumerate(selected, 1):
        post['source_no'] = number
        post['category'] = 'auction-stories'
        post['is_published'] = True

    result = {
        'selected_count': len(selected),
        'counts': dict(Counter(item['selection_reason'] for item in decisions)),
        'selected': selected,
        'excluded': [item for item in decisions if not item['selected']],
    }
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

    if args.sql:
        rows = []
        for post in selected:
            external_id = f"threads-export-{post['external_id']}"
            rows.append(
                "(" + ", ".join([
                    sql_literal(external_id, 'external'),
                    "'auction-stories'",
                    str(post['source_no']),
                    sql_literal(post['title'], 'title'),
                    sql_literal(post['body'], 'body'),
                    'true',
                    sql_literal(post['published_at'], 'published') + '::timestamptz',
                ]) + ")"
            )
        sql = """insert into public.posts (
  external_id, category, source_no, title, body, is_published, published_at
)
values
""" + ",\n".join(rows) + "\non conflict (category, external_id) do nothing;\n"
        args.sql.write_text(sql, encoding='utf-8')

    print(json.dumps({'selected': len(selected), 'counts': result['counts']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
