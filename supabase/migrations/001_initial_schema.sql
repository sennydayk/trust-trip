-- TrustTrip 초기 스키마
-- 여행 리서치 자동화 서비스: 3개 소스 교차 검증 신뢰도 분석

-- ============================================================
-- search_sessions: 사용자 검색 세션
-- ============================================================
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

-- ============================================================
-- places: 정규화된 장소 정보
-- ============================================================
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
);

-- ============================================================
-- google_reviews: Google Maps 리뷰 데이터
-- ============================================================
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

-- ============================================================
-- kakao_reviews: 카카오맵 리뷰 데이터 (국내 전용)
-- ============================================================
CREATE TABLE kakao_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  rating NUMERIC(2,1),
  total_reviews INT,
  category_tags TEXT[],              -- 카카오맵 카테고리 태그 배열
  fetched_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- blog_posts: 네이버 블로그 크롤링 데이터
-- ============================================================
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

-- ============================================================
-- ad_analyses: 광고 판별 분석 결과
-- ============================================================
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

-- ============================================================
-- trust_scores: 교차 검증 신뢰도 점수
-- ============================================================
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
