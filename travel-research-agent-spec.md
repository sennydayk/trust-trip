# 여행 리서치 에이전트 — 기술 스펙 문서

## 1. 프로젝트 개요

### 서비스 포지션
- **기존 여행 서비스**: 추천 생성 ("여기 가보세요")
- **이 서비스**: 추천 검증 ("이 장소는 신뢰도 87점, 근거는 이렇습니다")

### 핵심 가치
여행 추천 자동화가 아니라 **여행 리서치 자동화**. 특히 리뷰 검증, 추천 신뢰도 분석, 교차 데이터 검증을 자동화한다.

### MVP 형태
- 웹 대시보드 (React + TypeScript)
- 해외 포함 전 지역 대상

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| Frontend | React + TypeScript | 웹 대시보드 |
| Backend | Node.js (or Next.js API Routes) | API 서버 |
| DB | Supabase (PostgreSQL + API) | 인증, 실시간 기능 포함 |
| 지도 | Google Maps JavaScript API | 동선 설계 시각화 |
| LLM | Claude API (Anthropic) | 광고 판별 2차 분석, 리뷰 감성 분석 |
| 크롤링 | Puppeteer / Cheerio | 네이버 블로그, 웹 스크래핑 |
| 외부 API | Google Maps Places API, 카카오맵 API | 장소 정보, 리뷰 데이터 |

---

## 3. 에이전트 파이프라인

```
사용자 입력 (여행지 + 카테고리)
    │
    ▼
[1단계] 후보 수집
    │  - 네이버 블로그 크롤링: "{여행지} {카테고리} 추천" 검색
    │  - Google Maps Places API: 텍스트 검색
    │  - 카카오맵 API: 키워드 검색 (국내만)
    │
    ▼
[2단계] 장소 정규화
    │  - 좌표 기반 (반경 50m) + 이름 유사도 (편집 거리) 조합
    │  - 중복 장소 병합
    │  - 추천 빈도 (mention_count) 계산
    │
    ▼
[3단계] 데이터 수집 (병렬 실행)
    │
    ├─ [3-A] 광고 블로그 분석
    │   ├─ 1차: 키워드 룰 기반 필터
    │   └─ 2차: LLM 판별 (1차 통과 + 의심 건만)
    │
    ├─ [3-B] Google Maps 리뷰 분석
    │   ├─ 평점, 총 리뷰 수
    │   ├─ 최근 3개월 리뷰 비율 및 감성
    │   └─ 리뷰 텍스트 감성 분석
    │
    └─ [3-C] 카카오맵 리뷰 분석 (국내만)
        ├─ 평점, 리뷰 수
        └─ 카테고리 태그
    │
    ▼
[4단계] 교차 검증 신뢰도 점수 생성
    │  - 동적 가중치 적용
    │  - 점수 분해 근거 생성
    │
    ▼
[5단계] 검증된 후보 리스트 (신뢰도 순위)
    │
    ▼
[6단계] AI 동선 설계 (선택)
    - 위치 클러스터링
    - 이동 시간 최적화
```

---

## 4. 데이터베이스 스키마 (Supabase / PostgreSQL)

### search_sessions
```sql
CREATE TABLE search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,              -- 사용자 검색어 (예: "오사카 맛집")
  destination TEXT NOT NULL,         -- 여행지 (예: "오사카")
  category TEXT,                     -- 카테고리 (예: "맛집", "카페")
  region_type TEXT NOT NULL,         -- 'domestic' | 'overseas'
  status TEXT DEFAULT 'pending',     -- 'pending' | 'processing' | 'completed' | 'failed'
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### places
```sql
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES search_sessions(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,      -- 정규화된 이름 (소문자, 공백 제거 등)
  category TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  country TEXT,
  mention_count INT DEFAULT 0,        -- 추천 빈도
  google_place_id TEXT,               -- Google Places API ID (정규화 키)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_places_session ON places(session_id);
CREATE INDEX idx_places_location ON places USING gist (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);  -- PostGIS 활용: 좌표 기반 검색용
```

### google_reviews
```sql
CREATE TABLE google_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  rating NUMERIC(2,1),               -- 평점 (1.0 ~ 5.0)
  total_reviews INT,
  recent_reviews_3m INT,             -- 최근 3개월 리뷰 수
  recent_positive_ratio NUMERIC(3,2),-- 최근 긍정 리뷰 비율 (0.00 ~ 1.00)
  sentiment_score NUMERIC(3,2),      -- 전체 감성 점수 (0.00 ~ 1.00)
  fetched_at TIMESTAMPTZ DEFAULT now()
);
```

### kakao_reviews
```sql
CREATE TABLE kakao_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  rating NUMERIC(2,1),
  total_reviews INT,
  category_tags TEXT[],              -- 카카오맵 카테고리 태그 배열
  fetched_at TIMESTAMPTZ DEFAULT now()
);
```

### blog_posts
```sql
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  url TEXT NOT NULL UNIQUE,
  blogger_id TEXT,                    -- 블로거 식별자
  title TEXT,
  content_summary TEXT,              -- 본문 요약 (LLM 분석용)
  ad_status TEXT DEFAULT 'pending',  -- 'confirmed_ad' | 'suspected_ad' | 'organic' | 'pending'
  sentiment_score NUMERIC(3,2),
  image_count INT,
  text_length INT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_blog_posts_place ON blog_posts(place_id);
CREATE INDEX idx_blog_posts_blogger ON blog_posts(blogger_id);
```

### ad_analyses
```sql
CREATE TABLE ad_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_post_id UUID REFERENCES blog_posts(id),
  rule_result TEXT,                   -- 'confirmed_ad' | 'suspected' | 'clean'
  llm_result TEXT,                    -- 'ad' | 'organic' | null (미분석)
  ad_confidence NUMERIC(3,2),        -- 광고 확신도 (0.00 ~ 1.00)
  detected_keywords TEXT[],          -- 감지된 광고 키워드 배열
  final_verdict TEXT NOT NULL,       -- 'confirmed_ad' | 'suspected_ad' | 'organic'
  analyzed_at TIMESTAMPTZ DEFAULT now()
);
```

### trust_scores
```sql
CREATE TABLE trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) UNIQUE,
  
  -- 소스별 서브 점수 (0.00 ~ 1.00 정규화)
  google_sub_score NUMERIC(3,2),
  kakao_sub_score NUMERIC(3,2),
  blog_sub_score NUMERIC(3,2),
  
  -- 보정 요소
  ad_penalty NUMERIC(3,2),           -- 광고 비율에 따른 감점
  freshness_bonus NUMERIC(3,2),      -- 최근 리뷰 비중 보너스
  
  -- 최종 점수
  final_score NUMERIC(5,2),          -- 최종 신뢰도 점수 (0.00 ~ 100.00)
  
  -- 투명성 데이터
  weight_profile JSONB,              -- {"google": 0.6, "kakao": 0.0, "blog": 0.4}
  breakdown_json JSONB,              -- UI에 표시할 점수 분해 근거
  
  calculated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_trust_scores_final ON trust_scores(final_score DESC);
```

---

## 5. 신뢰도 점수 알고리즘

### 5-1. 소스별 정규화 (0 ~ 1)

#### Google Maps 서브 점수
```
google_sub = (
  rating_norm × 0.35          -- 평점: (rating - 1) / 4
  + review_count_norm × 0.25  -- 리뷰 수: min(total / 1000, 1.0)
  + recency_norm × 0.20       -- 최근성: recent_3m / total
  + sentiment_norm × 0.20     -- 감성: sentiment_score 그대로
)
```

#### 카카오맵 서브 점수
```
kakao_sub = (
  rating_norm × 0.50          -- 평점: (rating - 1) / 4
  + review_count_norm × 0.50  -- 리뷰 수: min(total / 500, 1.0)
)
```

#### 블로그 서브 점수
```
blog_sub = (
  mention_freq_norm × 0.40    -- 추천 빈도: min(mention_count / 10, 1.0)
  + organic_ratio × 0.35      -- 진짜 후기 비율: organic_count / total_blog_count
  + avg_sentiment × 0.25      -- 진짜 후기 평균 감성: organic 게시물만
)
```

### 5-2. 동적 가중치

```
function calculateWeights(place, region_type):
  
  // 기본 가중치 프로필
  if region_type == 'domestic':
    base = { google: 0.30, kakao: 0.35, blog: 0.35 }
  else:  // overseas
    base = { google: 0.60, kakao: 0.15, blog: 0.25 }
  
  // 데이터 가용성 체크 — 임계값 미달 시 가중치 0
  thresholds = {
    google: { min_reviews: 10 },
    kakao:  { min_reviews: 10 },
    blog:   { min_posts: 5 }
  }
  
  available = {}
  for source in [google, kakao, blog]:
    if source_data_count >= threshold:
      available[source] = base[source]
    else:
      available[source] = 0
  
  // 비활성 소스 가중치를 활성 소스에 비례 배분
  total_active = sum(available.values())
  if total_active > 0:
    for source in available:
      available[source] = available[source] / total_active
  
  return available
```

### 5-3. 광고 패널티

```
ad_penalty = ad_ratio × 0.15
// ad_ratio = confirmed_ad_count / total_blog_count
// 최대 0.15 감점
```

### 5-4. 최신성 보너스

```
freshness_bonus = recent_positive_change × 0.10
// 최근 3개월 긍정률이 전체 대비 높으면 보너스
// 최대 0.10 가점
```

### 5-5. 최종 점수

```
raw_score = (
  google_sub × weight.google
  + kakao_sub × weight.kakao
  + blog_sub × weight.blog
)

final_score = (raw_score - ad_penalty + freshness_bonus) × 100
// 범위: 0 ~ 100
// 소수점 첫째 자리까지 표시
```

---

## 6. 광고 판별 시스템

### 6-1. 1차 필터: 키워드 룰 기반

#### 확정 광고 키워드 (즉시 제거)
```javascript
const CONFIRMED_AD_KEYWORDS = [
  '소정의 원고료를 받아',
  '업체로부터 제공받아',
  '협찬을 받아 작성',
  '체험단으로 방문',
  '광고임을 알려드립니다',
  '경제적 대가를 받',
  '무상으로 제공받',
  '대가성 포스팅',
  '본 포스팅은 광고',
  '내돈내산 아님',
  '업체 측의 요청으로',
  '#광고', '#협찬', '#체험단',
  '원고료를 지급받',
  '제품을 무료로 제공',
  '서비스를 제공받아',
];
```

#### 의심 시그널 (LLM 2차 판별 대상)
```javascript
const SUSPECTED_AD_SIGNALS = {
  keyword_patterns: [
    '내돈내산',           // 역설적 의심 — 실제 광고에서 위장용으로 자주 사용
    '솔직후기',           // 과도한 솔직함 강조
  ],
  behavioral_patterns: {
    same_blogger_30d: 5,  // 동일 블로거 30일 내 5건+ 리뷰
    excessive_praise_ratio: 0.9, // 칭찬 비율 90%+
    image_text_ratio: {   // 이미지 수 대비 텍스트 비율
      high_images: 15,    // 이미지 15장+
      low_text: 500,      // 텍스트 500자 미만
    },
    has_reservation_link: true,
    business_name_repeats: 3, // 업체명 3회+ 반복
    template_footer: true,    // 하단 지도/주소 템플릿
  }
};
```

### 6-2. 2차 필터: LLM 분석

1차 필터 결과가 `clean`이지만 의심 시그널 1개 이상 해당하는 경우에만 LLM에 전달.

```
LLM 프롬프트 구조:
- 블로그 본문 요약 (content_summary)
- 감지된 의심 시그널 목록
- 판별 요청: "이 블로그 포스트가 광고/협찬인지 분석하고, 확신도를 0.0~1.0으로 반환"
- 응답 형식: JSON { verdict: "ad" | "organic", confidence: 0.0~1.0, reason: "..." }
```

### 6-3. 최종 판정 로직

```
if rule_result == 'confirmed_ad':
  final_verdict = 'confirmed_ad'    → 점수 계산에서 제거
elif rule_result == 'suspected':
  if llm_result == 'ad' AND llm_confidence >= 0.7:
    final_verdict = 'confirmed_ad'  → 제거
  elif llm_result == 'ad' AND llm_confidence >= 0.4:
    final_verdict = 'suspected_ad'  → 감점 반영
  else:
    final_verdict = 'organic'       → 정상 반영
else:
  final_verdict = 'organic'         → 정상 반영
```

---

## 7. Place 정규화 알고리즘

### 좌표 + 이름 유사도 조합

```
function normalizePlace(newPlace, existingPlaces):
  
  candidates = []
  
  for existing in existingPlaces:
    // 1단계: 좌표 필터 (반경 50m)
    distance = haversine(newPlace.lat, newPlace.lng, existing.lat, existing.lng)
    if distance > 50:
      continue
    
    // 2단계: 이름 유사도 (편집 거리)
    name_similarity = 1 - (levenshtein(
      normalize_text(newPlace.name),
      normalize_text(existing.name)
    ) / max(len(newPlace.name), len(existing.name)))
    
    // 3단계: 복합 점수
    match_score = (0.6 × coordinate_proximity) + (0.4 × name_similarity)
    // coordinate_proximity = 1 - (distance / 50)
    
    if match_score >= 0.7:
      candidates.append({ existing, match_score })
  
  if candidates:
    best_match = max(candidates, key=match_score)
    return merge(best_match.existing, newPlace)  // mention_count++
  else:
    return createNew(newPlace)

function normalize_text(name):
  // 공백 제거, 소문자 변환, 특수문자 제거
  // 한글 자모 분리 비교 (ㅋㅏㅍㅔ → 카페)
  // 영문 변환 매칭 (cafe → 카페)
  return cleaned_name
```

---

## 8. 웹 대시보드 UI 구조

### 디자인 시스템 — v3 (Blue + Neutral Gray + White)

#### 컬러 토큰
```
// 프라이머리 블루 (버튼, 링크, 활성 상태, 서브점수 바)
--primary:          #1B5EA4
--primary-light:    #F0F5FF    // 활성 메뉴 배경, 블루 태그 배경
--primary-text:     #FFFFFF    // 프라이머리 버튼 위 텍스트

// 뉴트럴 그레이
--text-dark:        #1E293B    // 제목, 본문 (최상위 위계)
--text-mid:         #64748B    // 보조 텍스트, 라벨
--text-light:       #94A3B8    // 플레이스홀더, 비활성, 섹션 레이블
--border:           #E2E6ED    // 모든 보더, 구분선
--surface:          #F8F9FB    // 카드 내부 서피스, 사이드바 배경
--white:            #FFFFFF    // 카드 배경, 페이지 배경

// 의미 색상 (신뢰도 점수 + 광고 판별에만 사용)
--score-high:       #16A34A    // 신뢰도 80+
--score-high-bg:    #F0FDF4
--score-high-text:  #15803D
--score-mid:        #D97706    // 신뢰도 60~79
--score-mid-bg:     #FFFBEB
--score-mid-text:   #B45309
--score-low:        #DC2626    // 신뢰도 60 미만, 광고 확정
--score-low-bg:     #FEF2F2
```

#### 타이포그래피
```
// 위계 (font-weight + size + letter-spacing)
페이지 제목:    24px / weight 600 / spacing -0.5px
섹션 제목:      15~16px / weight 600 / spacing -0.2px
카드 제목:      14px / weight 600 / spacing -0.2px
본문:           12~13px / weight 500 / spacing 0
보조 텍스트:    11~12px / weight 400 / color --text-mid
섹션 레이블:    11px / weight 600 / uppercase / spacing 0.5px / color --text-light
신뢰도 점수:    26~44px / weight 600 / spacing -1px
```

#### 보더 & 레이아웃
```
border-radius:    4px (전체 통일, 모바일 디바이스 프레임만 12px)
border:           1px solid #E2E6ED (0.5px 사용 금지)
카드 패딩:        14~16px
섹션 간격:        16~20px
사이드바 폭:      200~220px
```

#### 버튼 규칙
```
프라이머리 CTA:   bg #1B5EA4 / color #FFFFFF / radius 4px / weight 500
보조 버튼:        bg #FFFFFF / border 1px solid #E2E6ED / color #64748B
활성 칩/탭:       bg #1B5EA4 / color #FFFFFF
비활성 칩/탭:     bg transparent / border 1px solid #E2E6ED / color #64748B
```

#### A/B 테스트 레이아웃
- **버전 A (카드형)**: 풀스크린 중앙 정렬, 세로 리스트, 장소 카드 접힘/펼침
- **버전 B (대시보드형)**: 좌측 사이드바(200~220px) + 우측 메인 (지도+카드 그리드)
- 공유 컴포넌트 동일, 레이아웃 래퍼만 교체하여 A/B 전환

### 전체 페이지 맵

```
/ (메인 검색)
├── /auth/login (로그인)
├── /auth/register (회원가입)
├── /research/[sessionId] (리서치 진행 중 로딩)
├── /results/[sessionId] (결과 대시보드)
├── /place/[placeId] (장소 상세 분석)
├── /route/[sessionId] (동선 설계)
└── /mypage (마이페이지)
```

### 화면 1: 메인 검색 (/)

**레이아웃**: 세로 중앙 정렬, 최대 폭 480px
- 헤드라인: "어디로 떠나시나요?"
- 서브: "추천이 아닌 검증. 신뢰할 수 있는 장소만 찾아드립니다."
- 입력 필드 2개 (가로 배치): 여행지 + 카테고리
- 카테고리 퀵 칩: 맛집, 카페, 관광지, 숙소, 바/술집
- CTA 버튼: "리서치 시작" (풀 와이드, 다크 배경)
- 하단 가치 제안 3개: "3개 소스 교차 검증" | "AI 광고 필터" | "투명한 신뢰도 점수"

**모바일**: 입력 필드 세로 스택, 나머지 동일

### 화면 2: 로그인/회원가입 (/auth)

**인증 방식** (Supabase Auth 활용):
- 이메일 + 비밀번호
- Google OAuth
- 카카오 OAuth

**레이아웃**: 세로 중앙, 최대 폭 320px
- 로고 + 서브카피
- 이메일/비밀번호 입력
- "로그인" CTA
- 구분선 "또는"
- 소셜 로그인 버튼 2개
- 하단: "계정이 없으신가요? 회원가입"

### 화면 3: 리서치 진행 중 (/research/[sessionId])

**핵심**: 단순 스피너가 아닌 파이프라인 단계별 실시간 진행 표시

**레이아웃**: 세로 중앙, 최대 폭 440px
- 헤드: "[검색어] 리서치 중..." + "보통 1~3분 소요"
- 5단계 스텝 인디케이터 (세로):
  1. 후보 수집 — 완료 시 "32개 발견 (네이버 18건, Google 14건)"
  2. 장소 정규화 — 완료 시 "중복 7개 병합 → 25개 고유 장소"
  3. 광고 분석 — 진행 중일 때 프로그레스 바 + "18/25"
  4. 리뷰 교차 검증 — 대기 상태
  5. 신뢰도 점수 계산 — 대기 상태

**상태 표시**:
- 완료: 녹색 체크 아이콘 + 결과 수치
- 진행 중: 파란색 스피너 + 프로그레스 바 + 현재/전체
- 대기: 회색 점

**실시간 업데이트**: Supabase Realtime 또는 Server-Sent Events

### 화면 4: 결과 대시보드 (/results/[sessionId])

**상단 요약 메트릭** (4열 그리드):
- 수집 후보: 32
- 광고 제거: 13 (빨강)
- 검증 완료: 19 (녹색)
- 평균 신뢰도: 74.2

**액션 버튼**: 필터 | 지도 보기 | 동선 설계

**장소 카드 리스트** (신뢰도 순, 세로 스택):

카드 접힌 상태:
```
[순위 뱃지] 장소명
위치 · 카테고리
                    G 4.3 · 블로그 18건 · 광고 28%    [82]
```

카드 펼친 상태 (클릭 시):
```
[1위] 스시 오마카세 하루
오사카 · 난바역 도보 3분 · 스시/오마카세              [87]
┌─ 점수 분해 근거 ─────────────────────┐
│ Google 평점   4.3 (2,847건)          │
│ 블로그 추천   23건 중 진짜 15건       │
│ 광고 비율     35% 제거됨 (빨강)       │
│ 최근 3개월    긍정 78%               │
│ 카카오맵      해외 — 미적용           │
│ 적용 가중치   G 0.60 / B 0.40        │
└───────────────────────────────────────┘
[Google 리뷰 보기] [블로그 원문 보기] [동선에 추가]
```

**순위 뱃지 색상**: 1~3위 녹색 배경, 4위~ 주황 배경

**모바일**: 카드 전체 폭, 메트릭 3열(수집/광고/검증), 뷰 전환은 탭 형태

### 화면 5: 장소 상세 분석 (/place/[placeId])

**상단**:
- 뒤로가기 링크
- 장소명 (20px) + 위치/카테고리/가격대
- 신뢰도 점수 (36px, 색상 코딩)

**서브점수 카드** (3열):
- Google 서브점수: 0.82 (가중치 0.60)
- 블로그 서브점수: 0.74 (가중치 0.40)
- 카카오맵: N/A (해외 미적용)

**소스별 상세** (2열 그리드):

Google Maps 분석 카드:
- 평점, 총 리뷰, 최근 3개월 리뷰 수/비율, 최근 긍정률, 감성 점수

네이버 블로그 분석 카드:
- 수집 포스트 수, 확정 광고(빨강), 의심 광고(주황), 진짜 후기(녹색), 후기 감성

**광고 판별 상세** (하단, 전체 폭):
- 각 블로그 포스트 한 줄씩
- 태그: [광고] 빨강 / [의심] 주황 / [진짜] 녹색
- 포스트 제목 (말줄임) + 판별 근거 (키워드 or LLM 확신도)

**모바일**: 서브점수 3열 유지 (축소), 소스 상세 세로 스택, 광고 판별 전체 폭 유지

### 화면 6: 동선 설계 (/route/[sessionId])

**데스크톱 레이아웃**: 좌측 패널(260px) + 우측 지도

좌측 패널:
- 제목: "오사카 1일 코스"
- 요약: "4곳 · 총 이동 42분"
- 타임라인 형태 코스:
  ```
  ① 스시 오마카세 하루     [87]
     난바 · 점심 11:30
          ↓ 도보 8분
  ② % Arabica 난바         [79]
     난바 · 카페 13:00
          ↓ 지하철 12분
  ③ 오사카성 공원           [72]
     모리노미야 · 관광 14:30
          ↓ 지하철 22분
  ④ 이치란 라멘 도톤보리    [82]
     도톤보리 · 저녁 18:00
  ```
- "코스 저장하기" CTA

우측 지도:
- Google Maps + 경로 표시
- 마커 색상: 80+ 녹색, 60~79 주황, 60 미만 빨강
- 범례 표시

**모바일**: 지도 상단(높이 200px) + 하단 타임라인 스크롤

### 화면 7: 마이페이지 (/mypage)

**상단 프로필**:
- 아바타 (이니셜 원형) + 이름
- 요약: "리서치 4건 · 저장 12곳"

**저장된 리서치** (카드 리스트):
- 각 항목: 검색어 + 검증 개수 + 날짜 + 상태 뱃지(완료/진행중)

**저장한 코스** (카드 리스트):
- 각 항목: 코스명 + 장소 수 + 총 이동시간 + "보기" 링크

### 공통 컴포넌트

```
components/
├── layout/
│   ├── Header.tsx          -- 네비게이션 (로고, 검색, 마이페이지)
│   ├── MobileNav.tsx       -- 모바일 하단 탭바
│   └── PageContainer.tsx   -- 반응형 컨테이너 (max-width: 1200px)
├── cards/
│   ├── PlaceCard.tsx       -- 장소 카드 (접힘/펼침)
│   ├── ScoreBreakdown.tsx  -- 점수 분해 근거
│   ├── MetricCard.tsx      -- 상단 요약 메트릭
│   └── ResearchCard.tsx    -- 마이페이지 리서치 카드
├── score/
│   ├── TrustBadge.tsx      -- 신뢰도 점수 뱃지 (색상 자동)
│   ├── AdTag.tsx           -- 광고/의심/진짜 태그
│   └── SourceBar.tsx       -- 소스별 서브점수 바
├── map/
│   ├── MapView.tsx         -- Google Maps 래퍼
│   ├── TrustMarker.tsx     -- 신뢰도 색상 마커
│   └── RouteOverlay.tsx    -- 경로 오버레이
├── pipeline/
│   ├── ProgressTracker.tsx -- 파이프라인 진행 표시
│   └── StepIndicator.tsx   -- 단계별 상태 (완료/진행/대기)
├── form/
│   ├── SearchInput.tsx     -- 여행지/카테고리 입력
│   ├── CategoryChips.tsx   -- 카테고리 퀵 선택
│   └── FilterPanel.tsx     -- 결과 필터/정렬
└── auth/
    ├── LoginForm.tsx       -- 이메일 + 소셜 로그인
    └── AuthGuard.tsx       -- 인증 라우트 가드
```

### 반응형 브레이크포인트

```
모바일: < 640px   — 1열 레이아웃, 하단 탭바
태블릿: 640~1024px — 2열 그리드, 사이드 패널 접힘
데스크톱: > 1024px  — 풀 레이아웃, 사이드 패널 노출
```

---

## 9. 프로젝트 디렉토리 구조

```
travel-research-agent/
├── package.json
├── .env.local                    # API 키 (Google, Kakao, Anthropic, Supabase)
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # 메인 검색 페이지
│   │   ├── results/
│   │   │   └── [sessionId]/
│   │   │       └── page.tsx      # 검색 결과 대시보드
│   │   ├── place/
│   │   │   └── [placeId]/
│   │   │       └── page.tsx      # 장소 상세 분석
│   │   └── route/
│   │       └── page.tsx          # 동선 설계
│   │
│   ├── api/                      # API Routes
│   │   ├── search/
│   │   │   └── route.ts          # 검색 시작 엔드포인트
│   │   ├── pipeline/
│   │   │   ├── collect.ts        # 1단계: 후보 수집
│   │   │   ├── normalize.ts      # 2단계: 장소 정규화
│   │   │   ├── analyze.ts        # 3단계: 데이터 수집 + 분석
│   │   │   └── score.ts          # 4단계: 신뢰도 점수 계산
│   │   └── route-plan/
│   │       └── route.ts          # 동선 설계 엔드포인트
│   │
│   ├── lib/
│   │   ├── supabase.ts           # Supabase 클라이언트
│   │   ├── scrapers/
│   │   │   ├── naver-blog.ts     # 네이버 블로그 크롤러
│   │   │   ├── google-maps.ts    # Google Maps API 래퍼
│   │   │   └── kakao-map.ts      # 카카오맵 API 래퍼
│   │   ├── analyzers/
│   │   │   ├── ad-detector.ts    # 광고 판별 (룰 + LLM)
│   │   │   ├── sentiment.ts      # 감성 분석
│   │   │   └── normalizer.ts     # 장소 정규화
│   │   ├── scoring/
│   │   │   ├── trust-score.ts    # 신뢰도 점수 계산
│   │   │   ├── weights.ts        # 동적 가중치
│   │   │   └── breakdown.ts      # 점수 분해 근거 생성
│   │   └── routing/
│   │       └── route-planner.ts  # 동선 설계 로직
│   │
│   └── components/
│       ├── SearchInput.tsx
│       ├── PlaceCard.tsx          # 신뢰도 점수 카드
│       ├── ScoreBreakdown.tsx     # 점수 분해 근거
│       ├── MapView.tsx            # 지도 뷰
│       ├── FilterPanel.tsx
│       └── RouteView.tsx          # 동선 시각화
│
└── scripts/
    └── seed-test-data.ts         # 테스트 데이터 시드
```

---

## 10. 환경 변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_API_KEY=

# Kakao
KAKAO_REST_API_KEY=

# Anthropic (광고 판별 LLM)
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 11. 구현 우선순위 (단계별)

### Phase 1: 코어 파이프라인
1. Supabase 프로젝트 설정 + 스키마 마이그레이션
2. Google Maps Places API 연동 (장소 검색 + 리뷰)
3. 네이버 블로그 크롤러 구현
4. 장소 정규화 로직
5. 광고 판별 시스템 (룰 기반 1차)
6. 신뢰도 점수 계산 엔진

### Phase 2: 웹 대시보드
7. 검색 입력 UI
8. 결과 대시보드 (장소 카드 + 지도)
9. 점수 분해 근거 표시
10. 필터/정렬

### Phase 3: 고도화
11. LLM 광고 2차 판별 연동
12. 카카오맵 API 연동
13. 동선 설계 기능
14. 감성 분석 고도화

---

## 12. 주의사항

### 크롤링 관련
- 네이버 블로그 크롤링은 robots.txt 준수
- Rate limiting 필수 (요청 간 1~2초 딜레이)
- User-Agent 적절히 설정
- IP 차단 대비 재시도 로직

### API 비용 관리
- Google Places API: 요청당 과금 주의
- Claude API: 광고 판별에만 선별적 사용 (1차 룰 필터로 API 호출 최소화)
- 캐싱 전략: 동일 장소 재검색 시 기존 데이터 재활용 (24시간 TTL)

### 데이터 정확성
- 평점 정규화: Google (1-5), 카카오 (1-5) → (rating - 1) / 4 로 통일
- 리뷰 수 정규화: log 스케일 또는 상한선(cap) 적용
- 감성 분석: 한국어 + 일본어 + 영어 지원 필요