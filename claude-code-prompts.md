# Claude Code 프롬프트 모음 — TrustTrip

이 파일의 프롬프트를 순서대로 Claude Code에 입력하세요.
각 프롬프트는 이전 단계의 결과물 위에 쌓입니다.

---

## 사전 준비

프로젝트 루트에 다음 3개 파일을 배치한 후 시작:
1. `CLAUDE.md` — 프로젝트 컨텍스트 + 디자인 시스템
2. `travel-research-agent-spec.md` — 전체 기술 스펙
3. 이 파일 (`claude-code-prompts.md`) — 단계별 프롬프트

---

## 프롬프트 1: 프로젝트 초기화

```
CLAUDE.md와 travel-research-agent-spec.md를 읽고 프로젝트를 초기화해줘.

1. Next.js 14 (App Router) + TypeScript + Tailwind CSS 프로젝트 생성
2. 필요한 패키지 설치:
   - @supabase/supabase-js, @supabase/auth-helpers-nextjs
   - @googlemaps/js-api-loader
   - puppeteer, cheerio
   - @anthropic-ai/sdk
   - string-similarity (이름 유사도용)
   - geolib (좌표 거리 계산용)

3. tailwind.config.ts에 CLAUDE.md의 "Tailwind 커스텀 설정" 섹션 그대로 반영.
   borderRadius도 설정: DEFAULT/sm/md/lg 모두 '4px'.

4. 스펙 문서의 프로젝트 디렉토리 구조(섹션 9)대로 폴더와 빈 파일들 생성.
   빈 파일에는 주석으로 역할 설명을 남겨줘.

5. .env.local.example 파일 생성 (CLAUDE.md 환경 변수 참조)

6. supabase/migrations/001_initial_schema.sql 생성
   - 스펙 섹션 4의 전체 CREATE TABLE문 + 인덱스 포함

7. src/lib/supabase.ts에 클라이언트 초기화 코드

8. src/lib/utils/trust-color.ts에 CLAUDE.md의 getTrustColor 함수 구현
```

---

## 프롬프트 2: 데이터 수집 레이어

```
스펙 문서를 참조해서 데이터 수집 레이어를 구현해줘.

1. src/lib/scrapers/google-maps.ts
   - Google Places Text Search API로 장소 검색
   - Place Details API로 리뷰 상세 가져오기
   - 반환 타입: { name, rating, totalReviews, recentReviews, reviews[], lat, lng, placeId }
   - Rate limiting: 요청 간 200ms 딜레이
   - 에러 핸들링 + 재시도 (3회)

2. src/lib/scrapers/naver-blog.ts
   - Puppeteer로 네이버 블로그 검색 결과 크롤링
   - 검색 쿼리: "{여행지} {카테고리} 추천" + "{여행지} {카테고리} 후기"
   - 각 블로그 포스트에서 추출: url, title, bloggerName, content, imageCount, publishedDate
   - 페이지네이션: 최대 3페이지 (약 30건)
   - robots.txt 준수, 요청 간 1~2초 랜덤 딜레이

3. src/lib/scrapers/kakao-map.ts
   - 카카오 로컬 REST API 키워드 검색
   - 반환: { name, rating, reviewCount, categoryTags, lat, lng, address }
   - region_type이 'domestic'일 때만 호출

각 모듈에 TypeScript 타입 정의를 명확히 하고,
독립 테스트 가능하게 함수를 export 해줘.
```

---

## 프롬프트 3: 장소 정규화 + 광고 판별

```
스펙 문서 섹션 6, 7을 참조해서 분석 레이어를 구현해줘.

1. src/lib/analyzers/normalizer.ts
   - normalizePlace(newPlace, existingPlaces) 함수
   - 좌표 기반 필터: geolib으로 반경 50m 체크
   - 이름 유사도: string-similarity의 compareTwoStrings 사용
   - normalize_text: 공백 제거, 소문자 변환, 특수문자 제거
   - match_score = 0.6 × 좌표근접도 + 0.4 × 이름유사도
   - 0.7 이상이면 병합 (mention_count 증가)

2. src/lib/analyzers/ad-detector.ts
   - 스펙의 CONFIRMED_AD_KEYWORDS 배열 그대로 사용
   - 스펙의 SUSPECTED_AD_SIGNALS 객체 그대로 사용
   - analyzeAd(blogPost) 함수:
     - 1차: 키워드 룰 검사 → rule_result 반환
     - 2차: rule_result가 'clean'이고 의심 시그널 1개+ → Claude API 호출
     - Claude API 프롬프트: 블로그 본문 요약 + 의심 시그널 + JSON 응답 요청
     - 최종 판정 로직: 스펙 섹션 6-3 그대로
   - 반환: { ruleResult, llmResult, adConfidence, detectedKeywords, finalVerdict }

3. src/lib/analyzers/sentiment.ts
   - analyzeSentiment(text, language) 함수
   - Claude API로 감성 분석 (0.0 ~ 1.0)
   - 배치 처리: 여러 리뷰를 한 번에 분석 (비용 절감)
```

---

## 프롬프트 4: 신뢰도 점수 엔진

```
스펙 문서 섹션 5를 참조해서 신뢰도 점수 계산 엔진을 구현해줘.

1. src/lib/scoring/weights.ts
   - calculateWeights(place, regionType, dataCounts) 함수
   - 기본 가중치: 국내 { google: 0.30, kakao: 0.35, blog: 0.35 }, 해외 { google: 0.60, kakao: 0.15, blog: 0.25 }
   - 임계값: google 10건, kakao 10건, blog 5건
   - 미달 소스 가중치 0 → 나머지에 비례 배분

2. src/lib/scoring/trust-score.ts
   - calculateGoogleSubScore(googleReview) → 0~1
   - calculateKakaoSubScore(kakaoReview) → 0~1
   - calculateBlogSubScore(blogPosts, adAnalyses) → 0~1
   - calculateAdPenalty(adRatio) → 0~0.15
   - calculateFreshnessBonus(recentPositiveRatio, overallPositiveRatio) → 0~0.10
   - calculateTrustScore(place, allData) → { finalScore, breakdown }

3. src/lib/scoring/breakdown.ts
   - generateBreakdown 함수 — UI에 표시할 breakdown_json 생성

모든 숫자는 소수점 2자리 반올림.
```

---

## 프롬프트 5: 파이프라인 오케스트레이터 + API

```
스펙 문서 섹션 3의 파이프라인을 구현해줘.

1. src/lib/pipeline/orchestrator.ts
   - runPipeline(query, destination, category, regionType) 함수
   - 5단계: 수집 → 정규화 → 분석(병렬) → 점수 계산 → DB 저장
   - 각 단계 완료 시 Supabase에 상태 업데이트
   - 에러 시 해당 장소만 건너뛰기

2. src/app/api/search/route.ts (POST)
   - 입력: { query, destination, category }
   - region_type 자동 판별 → 세션 생성 → 파이프라인 비동기 시작
   - 즉시 sessionId 반환

3. src/app/api/pipeline/status/[sessionId]/route.ts (GET)
   - 파이프라인 진행 상태 + 각 단계 결과

4. src/app/api/results/[sessionId]/route.ts (GET)
   - 완료된 리서치 결과 (장소 + trust_scores + breakdowns)

5. src/app/api/place/[placeId]/route.ts (GET)
   - 장소 상세 (모든 소스 데이터 + 광고 판별 + 블로그 리스트)
```

---

## 프롬프트 6: 공통 UI 컴포넌트

```
CLAUDE.md의 디자인 시스템과 컴포넌트 스타일 규칙을 그대로 따라서 공통 UI 컴포넌트를 구현해줘.

디자인 핵심:
- 컬러: 프라이머리 블루(#1B5EA4) + 뉴트럴 그레이 + 화이트
- 보더: 1px solid #E2E6ED, radius 4px 통일
- 버튼: 모든 CTA bg-primary text-white rounded
- 인라인 스타일 금지 — Tailwind 클래스만 사용
- CLAUDE.md의 "컴포넌트 스타일 규칙" 섹션의 클래스를 그대로 사용

1. src/components/layout/
   - Header.tsx: 좌측 로고 "TrustTrip" (text-primary font-semibold), 중앙 검색바, 우측 아바타(rounded bg-primary-light)
   - Sidebar.tsx: 사이드바 네비 (대시보드 버전 B용). 활성 메뉴는 bg-primary-light text-primary, 비활성은 text-neutral-mid
   - MobileNav.tsx: 하단 탭바 — 640px 미만에서만 표시
   - PageContainer.tsx: max-w-[1200px] mx-auto

2. src/components/cards/
   - PlaceCard.tsx: 순위 뱃지 + 장소명 + 신뢰도 점수(getTrustColor) + 태그(G평점/블로그/광고) + 프로그레스 바
   - ScoreBreakdown.tsx: 2열 그리드 분해 근거
   - MetricCard.tsx: 섹션 레이블(11px uppercase) + 큰 숫자(20px font-semibold)

3. src/components/score/
   - TrustBadge.tsx: 점수에 따라 자동 색상. props: score, size('sm'|'md'|'lg')
   - AdTag.tsx: variant prop ('confirmed_ad'|'suspected_ad'|'organic')
   - SubScoreBar.tsx: 소스명 + 서브점수 + bg-primary 프로그레스 바 + 가중치

4. src/components/pipeline/
   - ProgressTracker.tsx: 5단계 세로 스텝
   - StepIndicator.tsx: 완료(녹색체크 rounded bg-score-high-bg) / 진행중(블루스피너 bg-primary-light) / 대기(bg-neutral-surface)

5. src/components/data/
   - BlogTable.tsx: 4열 테이블(판정/제목/근거/감성). 행 구분선 border-neutral-border. AdTag 사용.
   - SourceDetail.tsx: Google/블로그 소스 상세 카드 (bg-neutral-surface rounded p-3.5)
```

---

## 프롬프트 7: 페이지 — 인증 + 메인

```
스펙 문서 섹션 8의 화면 1, 2를 구현해줘. CLAUDE.md 디자인 시스템 엄격히 준수.

1. src/app/auth/login/page.tsx
   대시보드 버전: 2패널 레이아웃
   - 좌측: bg-neutral-surface, 브랜딩 (TrustTrip 로고 + 서비스 가치 3개, 불릿은 작은 사각형 bg-primary)
   - 우측: 로그인 폼 (이메일/비밀번호 input → border-neutral-border rounded)
   - 프라이머리 버튼: "로그인" (bg-primary text-white rounded 풀 와이드)
   - 구분선 "또는" + 보조 버튼: Google/카카오 (bg-white border-neutral-border)
   - Supabase Auth 연동

2. src/app/auth/register/page.tsx — 동일 레이아웃, 이름 필드 추가

3. src/app/page.tsx (메인 검색)
   대시보드 버전: 좌측 Sidebar + 우측 검색 메인
   - 좌측: 메뉴(새 리서치/내 리서치/저장한 코스) + 최근 리서치 히스토리
   - 우측 중앙: 헤드 "어디로 떠나시나요?" (text-2xl font-semibold text-neutral-dark tracking-title)
   - 서브 (text-sm text-neutral-mid)
   - 입력 3열: 여행지 | 카테고리 | "리서치 시작" 버튼(bg-primary)
   - 카테고리 칩 (비활성 칩 스타일)
   - 하단 가치 제안 3열 (bg-neutral-surface rounded p-3.5)

4. src/middleware.ts — 인증 라우트 가드
```

---

## 프롬프트 8: 페이지 — 로딩 + 결과

```
1. src/app/research/[sessionId]/page.tsx (로딩)
   대시보드 버전: 좌측 파이프라인 스텝 + 우측 실시간 로그 피드
   - 좌측: ProgressTracker 사용. 쿼리명 + "보통 1~3분"
   - 우측: 수집 로그 리스트 (bg-neutral-surface rounded 행)
     - 각 행: 소스 태그(Google=bg-primary-light, 블로그=border-neutral-border) + 내용 + 상태
     - 광고 확정: text-score-low font-medium
     - LLM 분석 중: text-primary font-medium + 블루 스피너
     - 진짜 후기: text-score-high font-medium
   - 하단: 전체 진행률 바 (bg-primary)
   - 3초 폴링 또는 Supabase Realtime. 완료 시 /results/[sessionId]로 이동.

2. src/app/results/[sessionId]/page.tsx (결과 대시보드)
   대시보드 버전: 좌측 사이드바 + 우측 (지도 + 카드 그리드)
   - 좌측 사이드바:
     - 리서치 요약 MetricCard 2×2 (수집/광고제거/검증/평균신뢰도)
     - 필터: 최소 신뢰도 슬라이더, 카테고리 칩, 정렬 셀렉트
     - 하단: "동선 설계 시작" (bg-primary 풀 와이드)
   - 우측 상단: 지도 영역 (Google Maps, 높이 180px)
     - 마커: 정사각형 rounded-sm, 80+ bg-score-high / 60~79 bg-score-mid / <60 bg-score-low
     - 우하단 범례
   - 우측 하단: PlaceCard 2열 그리드
     - 각 카드: 순위뱃지 + 점수(getTrustColor) + 이름 + 위치 + 태그 3개 + 프로그레스 바
     - 뷰 전환: 카드/테이블 탭 (활성 bg-primary, 비활성 border-neutral-border)
```

---

## 프롬프트 9: 페이지 — 장소 상세 + 마이페이지

```
1. src/app/place/[placeId]/page.tsx (장소 상세)
   대시보드 버전: 좌측 점수 패널(220px) + 우측 소스 상세
   - 좌측:
     - 신뢰도 점수 (text-[44px] font-semibold tracking-tight + getTrustColor)
     - 장소명 (text-base font-semibold text-neutral-dark) + 위치/카테고리/가격
     - 섹션 레이블 "서브점수" (uppercase)
     - 3개 서브점수 바: SubScoreBar 컴포넌트 (바 색상은 전부 bg-primary)
     - 섹션 레이블 "보정"
     - 광고 패널티 (text-score-low) / 최신성 보너스 (text-score-high)
     - "동선에 추가" 버튼 (bg-primary 풀 와이드)
   - 우측 상단: SourceDetail 2열 (Google Maps / 네이버 블로그)
     - 각 카드: bg-neutral-surface, 제목 앞 작은 사각형(bg-primary w-2 h-2 rounded-sm)
   - 우측 하단: BlogTable 컴포넌트 (bg-neutral-surface)
     - 열: 판정(AdTag) | 제목(말줄임) | 근거(text-neutral-light) | 감성(진짜면 text-score-high)

2. src/app/mypage/page.tsx
   대시보드 버전: 좌측 프로필(140px) + 우측 히스토리
   - 좌측: 아바타(rounded bg-primary-light text-primary font-semibold) + 이름/이메일 + 2열 스탯(리서치/저장) + 로그아웃 보조 버튼
   - 우측: 
     - 섹션 레이블 "리서치 히스토리"
     - 5열 테이블: 상태(AdTag variant) | 검색어(text-primary cursor-pointer) | 검증 수 | 평균점수(getTrustColor) | 날짜(text-neutral-light)
     - 섹션 레이블 "저장한 코스"
     - 코스 카드 리스트 (bg-neutral-surface) + "보기" 링크(text-primary)
```

---

## 프롬프트 10: 동선 설계

```
1. src/lib/routing/route-planner.ts
   - planRoute(selectedPlaces[]) 함수
   - Nearest neighbor TSP 근사
   - 클러스터링 + 시간대 배정 (점심/카페/관광/저녁)
   - 반환: { orderedPlaces[], legs[], totalDuration }

2. src/app/route/[sessionId]/page.tsx
   대시보드 버전: 좌측 타임라인(260px) + 우측 지도
   - 좌측: 코스 제목/요약 + 번호 스텝
     - 번호 원형: rounded bg-score-high-bg text-score-high-text (80+) 또는 bg-score-mid-bg (60~79)
     - 장소명/시간/TrustBadge + 구간 이동 (text-neutral-light)
     - "코스 저장하기" (bg-primary)
   - 우측: Google Maps + 경로 Polyline + 색상 마커 + 범례

3. src/components/map/
   - MapView.tsx: @googlemaps/js-api-loader
   - TrustMarker.tsx: 정사각형 마커 rounded-sm, getTrustColor
   - RouteOverlay.tsx: Polyline + 범례
```

---

## 프롬프트 11: A/B 테스트 레이아웃 래퍼

```
A/B 테스트를 위해 카드형(버전 A) 레이아웃을 추가해줘.
기존 대시보드형(버전 B) 컴포넌트를 재사용하고 레이아웃만 다르게 구성.

1. src/components/layout/LayoutWrapper.tsx
   - props: variant ('card' | 'dashboard')
   - 'dashboard': Sidebar + 메인 (기존 구현)
   - 'card': 풀스크린 중앙 정렬 (max-w-[640px] mx-auto)

2. 버전 A (카드형) 결과 페이지:
   - 상단 메트릭 4열 → PlaceCard 세로 리스트 (접힘/펼침)
   - 클릭 시 ScoreBreakdown 토글
   - 지도는 별도 탭/뷰

3. 버전 전환:
   - URL 파라미터 ?layout=card 또는 ?layout=dashboard
   - 기본값: dashboard
   - localStorage에 선호 레이아웃 저장

디자인 시스템(색상, 타이포, 보더)은 동일하게 유지.
```

---

## 추가 팁

### 디자인 체크리스트 (매 컴포넌트 구현 후 확인)
```
□ 프라이머리 블루(#1B5EA4)만 액센트 컬러로 사용했는가?
□ 의미 색상(녹/주/적)이 신뢰도 점수와 광고 판별에만 사용됐는가?
□ 모든 CTA 버튼이 bg-primary text-white rounded인가?
□ border-radius가 4px(rounded)로 통일됐는가?
□ 섹션 레이블이 text-xs font-semibold uppercase tracking-[0.5px] text-neutral-light인가?
□ 인라인 스타일 없이 Tailwind 클래스만 사용했는가?
□ 제목에 font-semibold + tracking-tight(또는 tracking-subtitle) 적용했는가?
```

### 에러 발생 시
```
에러가 발생했어: [에러 메시지].
travel-research-agent-spec.md의 관련 섹션을 다시 확인하고 수정해줘.
CLAUDE.md의 디자인 시스템도 참조해서 스타일이 일관되게 유지되는지 확인해.
```

### 전체 검증
```
전체 프로젝트를 빌드하고 TypeScript 에러를 수정해줘.
그리고 CLAUDE.md의 디자인 체크리스트를 모든 컴포넌트에 대해 확인하고,
위반 사항이 있으면 수정해줘.
```