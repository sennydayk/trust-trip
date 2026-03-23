# CLAUDE.md — TrustTrip 프로젝트

## 프로젝트 요약
여행 리서치 자동화 서비스. 추천을 만드는 것이 아니라 추천의 신뢰도를 분석하는 서비스.
Google Maps, 네이버 블로그, 카카오맵 3개 소스를 교차 검증하여 장소별 신뢰도 점수를 산출한다.

## 기술 스택
- **Frontend**: Next.js 14 (App Router) + React + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes + Server Actions
- **DB**: Supabase (PostgreSQL + Auth + Realtime)
- **지도**: Google Maps JavaScript API + Places API
- **LLM**: Claude API (Anthropic) — 광고 판별 2차 분석용
- **크롤링**: Puppeteer (네이버 블로그), Cheerio (HTML 파싱)
- **외부 API**: Google Places API, 카카오맵 REST API

## 핵심 참조 파일
- `travel-research-agent-spec.md` — 전체 기술 스펙 (알고리즘, 스키마, UI 상세)
- `claude-code-prompts.md` — 단계별 구현 프롬프트

---

## 디자인 시스템 (v3 — Blue + Neutral Gray + White)

### 핵심 원칙
1. **화이트 비율 최대화** — 카드 배경, 페이지 배경 모두 #FFFFFF. 서피스(#F8F9FB)는 사이드바, 메트릭 카드 내부에만 사용.
2. **타이포 안정감** — 제목 weight 600 + negative letter-spacing. 본문 weight 500. 보조 텍스트 weight 400.
3. **컬러 수 제한** — 프라이머리 블루(#1B5EA4) + 뉴트럴 그레이(#64748B 계열) + 화이트. 의미 색상(녹/주/적)은 신뢰도 점수와 광고 판별에만 사용.
4. **일관된 버튼** — 모든 CTA 버튼은 bg #1B5EA4 + color #FFFFFF + radius 4px.
5. **날카로운 보더** — border-radius 4px 전체 통일. 둥글지 않고 깔끔한 직선 느낌.

### Tailwind 커스텀 설정
```javascript
// tailwind.config.ts colors 섹션에 추가
colors: {
  primary: { DEFAULT: '#1B5EA4', light: '#F0F5FF' },
  neutral: {
    dark: '#1E293B',
    mid: '#64748B',
    light: '#94A3B8',
    border: '#E2E6ED',
    surface: '#F8F9FB',
  },
  score: {
    high: '#16A34A', 'high-bg': '#F0FDF4', 'high-text': '#15803D',
    mid: '#D97706', 'mid-bg': '#FFFBEB', 'mid-text': '#B45309',
    low: '#DC2626', 'low-bg': '#FEF2F2',
  },
}
```

### 컴포넌트 스타일 규칙 (Tailwind 클래스)
```
카드:           bg-white border border-neutral-border rounded p-3.5
서피스 카드:     bg-neutral-surface rounded p-3
사이드바:       border-r border-neutral-border p-4 w-[200px] lg:w-[220px]
프라이머리 버튼: bg-primary text-white font-medium rounded px-6 py-2.5
보조 버튼:      bg-white border border-neutral-border text-neutral-mid rounded px-4 py-2
활성 칩:        bg-primary text-white text-xs rounded px-2.5 py-0.5
비활성 칩:      border border-neutral-border text-neutral-mid text-xs rounded px-2.5 py-0.5
섹션 레이블:    text-xs font-semibold text-neutral-light uppercase tracking-[0.5px]
신뢰도 점수:    text-2xl font-semibold tracking-tight + getTrustColor(score)
프로그레스 바:  h-[3px] bg-neutral-border rounded-sm 위에 색상 바
태그 (블루):    bg-primary-light text-primary text-[10px] font-medium rounded-sm px-1.5
태그 (광고):    bg-score-low-bg text-score-low text-[10px] font-medium rounded-sm px-1.5
태그 (의심):    bg-score-mid-bg text-score-mid-text text-[10px] font-medium rounded-sm px-1.5
태그 (진짜):    bg-score-high-bg text-score-high-text text-[10px] font-medium rounded-sm px-1.5
```

### 신뢰도 점수 색상 함수
```typescript
export function getTrustColor(score: number) {
  if (score >= 80) return { text: 'text-score-high', bg: 'bg-score-high-bg', badge: 'bg-score-high', textHex: '#15803D' };
  if (score >= 60) return { text: 'text-score-mid', bg: 'bg-score-mid-bg', badge: 'bg-score-mid', textHex: '#B45309' };
  return { text: 'text-score-low', bg: 'bg-score-low-bg', badge: 'bg-score-low', textHex: '#DC2626' };
}
```

---

## 핵심 알고리즘 요약

### 신뢰도 점수 (0~100)
```
final_score = (google_sub × w1 + kakao_sub × w2 + blog_sub × w3 - ad_penalty + freshness_bonus) × 100
```
- 각 소스 서브점수: 0~1 정규화
- 가중치: 국내/해외 + 데이터 가용성에 따라 동적 결정
- 임계값 미달 소스는 가중치 0, 나머지에 비례 배분

### 광고 판별
- 1차: 키워드 매칭 (확정 15개 + 의심 10개 패턴)
- 2차: Claude API (1차 통과 + 의심 건만)
- 결과: confirmed_ad → 제거, suspected_ad → 감점, organic → 반영

### Place 정규화
- 좌표 반경 50m + 이름 편집 거리 유사도
- match_score = 0.6 × 좌표근접도 + 0.4 × 이름유사도
- 0.7 이상이면 동일 장소로 병합

---

## A/B 테스트 레이아웃

### 버전 A (카드형)
- 풀스크린 중앙 정렬, 세로 리스트, 카드 접힘/펼침, 지도 별도 뷰

### 버전 B (대시보드형)
- 좌측 사이드바(200~220px) 고정 + 우측: 상단 지도 + 하단 카드 그리드(2열)
- 장소 상세: 좌측 점수 패널 + 우측 소스 데이터 + 블로그 테이블

두 버전은 동일 컴포넌트, 레이아웃 래퍼만 교체.

---

## 코딩 컨벤션
- TypeScript strict mode
- 컴포넌트: function 선언 + default export
- API: Next.js Route Handlers (app/api/)
- 상태 관리: React hooks + Supabase realtime subscription
- 스타일: Tailwind CSS only (인라인 스타일 금지, 커스텀 색상 변수 사용)
- i18n: 한국어 기본 + 영어 지원

## 환경 변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_API_KEY=
KAKAO_REST_API_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```