// 광고 판별 시스템 — 스펙 섹션 6
// 1차 키워드 룰 기반 필터 + 2차 Claude LLM 분석
// 확정 광고 키워드 매칭 → 의심 시그널 감지 → LLM 판별 → 최종 판정

import Anthropic from '@anthropic-ai/sdk';

// ─── 스펙 섹션 6-1: 확정 광고 키워드 ──────────────────

const CONFIRMED_AD_KEYWORDS = [
  // 기존 확정 키워드
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
  // 하단 광고 고지 변형
  '원고료를 받고 작성',
  '원고료를 제공받',
  '대가를 받고 작성',
  '무료로 제공받아 작성',
  '업체로부터 지원받',
  '마케팅 목적으로 작성',
  '이 포스팅은 업체',
  '광고를 포함하고',
  '광고 포스팅',
  '업체 협찬으로',
  '제공받은 제품',
  '파트너스 활동',
  '일정 커미션',
  '쿠팡 파트너스',
  '이 포스팅은 제휴',
];

// ─── 스펙 섹션 6-1: 의심 시그널 ───────────────────────

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
  },
};

// 예약 관련 링크 패턴
const RESERVATION_PATTERNS = [
  'booking.com', 'agoda.com', 'naver.me', 'map.naver.com',
  'catchtable', 'tabling', 'reservation', '예약하기', '예약링크',
];

// 템플릿 하단 패턴
const TEMPLATE_FOOTER_PATTERNS = [
  '영업시간', '주소 :', '전화번호', '주차 :', '위치 :',
  '찾아가는 길', '오시는 길', '운영시간',
];

// ─── 타입 정의 ─────────────────────────────────────────

export type RuleResult = 'confirmed_ad' | 'suspected' | 'clean';
export type FinalVerdict = 'confirmed_ad' | 'suspected_ad' | 'organic';

export interface BlogPostInput {
  content: string;
  content_summary?: string;
  title?: string;
  blogger_id?: string;
  image_count?: number;
  text_length?: number;
  published_date?: string | null;
  place_name?: string;
}

export interface BloggerHistory {
  blogger_id: string;
  post_count_30d: number;
}

export interface SuspectedSignal {
  type: 'keyword' | 'behavioral';
  name: string;
  detail: string;
}

export interface AdAnalysisResult {
  rule_result: RuleResult;
  llm_result: 'ad' | 'organic' | null;
  ad_confidence: number;
  detected_keywords: string[];
  suspected_signals: SuspectedSignal[];
  final_verdict: FinalVerdict;
  llm_reason: string | null;
}

// ─── 1차: 키워드 룰 검사 ──────────────────────────────

function checkConfirmedKeywords(content: string): string[] {
  const detected: string[] = [];
  for (const keyword of CONFIRMED_AD_KEYWORDS) {
    if (content.includes(keyword)) {
      detected.push(keyword);
    }
  }
  return detected;
}

// ─── 의심 시그널 감지 ─────────────────────────────────

function detectSuspectedSignals(
  post: BlogPostInput,
  bloggerHistory?: BloggerHistory,
): SuspectedSignal[] {
  const signals: SuspectedSignal[] = [];

  // 키워드 패턴
  for (const pattern of SUSPECTED_AD_SIGNALS.keyword_patterns) {
    if (post.content.includes(pattern)) {
      signals.push({
        type: 'keyword',
        name: pattern,
        detail: `본문에 "${pattern}" 포함`,
      });
    }
  }

  // 동일 블로거 30일 내 다수 리뷰
  if (bloggerHistory && bloggerHistory.post_count_30d >= SUSPECTED_AD_SIGNALS.behavioral_patterns.same_blogger_30d) {
    signals.push({
      type: 'behavioral',
      name: 'same_blogger_30d',
      detail: `동일 블로거 30일 내 ${bloggerHistory.post_count_30d}건 리뷰 (임계값: ${SUSPECTED_AD_SIGNALS.behavioral_patterns.same_blogger_30d})`,
    });
  }

  // 이미지 대비 텍스트 비율 (이미지 많고 텍스트 적음)
  const imageCount = post.image_count ?? 0;
  const textLength = post.text_length ?? post.content.length;
  if (
    imageCount >= SUSPECTED_AD_SIGNALS.behavioral_patterns.image_text_ratio.high_images &&
    textLength < SUSPECTED_AD_SIGNALS.behavioral_patterns.image_text_ratio.low_text
  ) {
    signals.push({
      type: 'behavioral',
      name: 'image_text_ratio',
      detail: `이미지 ${imageCount}장, 텍스트 ${textLength}자 (과도한 이미지 비율)`,
    });
  }

  // 예약 링크 포함
  const contentLower = post.content.toLowerCase();
  if (RESERVATION_PATTERNS.some(p => contentLower.includes(p))) {
    signals.push({
      type: 'behavioral',
      name: 'has_reservation_link',
      detail: '예약 링크 또는 예약 안내 포함',
    });
  }

  // 업체명 반복
  if (post.place_name) {
    const nameCount = (post.content.match(new RegExp(escapeRegExp(post.place_name), 'g')) || []).length;
    if (nameCount >= SUSPECTED_AD_SIGNALS.behavioral_patterns.business_name_repeats) {
      signals.push({
        type: 'behavioral',
        name: 'business_name_repeats',
        detail: `업체명 "${post.place_name}" ${nameCount}회 반복 (임계값: ${SUSPECTED_AD_SIGNALS.behavioral_patterns.business_name_repeats})`,
      });
    }
  }

  // 템플릿 하단 (지도/주소 정보)
  const footerSection = post.content.slice(-300);
  const footerMatches = TEMPLATE_FOOTER_PATTERNS.filter(p => footerSection.includes(p));
  if (footerMatches.length >= 2) {
    signals.push({
      type: 'behavioral',
      name: 'template_footer',
      detail: `하단에 템플릿 요소 ${footerMatches.length}개 감지: ${footerMatches.join(', ')}`,
    });
  }

  return signals;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 2차: Claude LLM 분석 (스펙 섹션 6-2) ────────────

interface LlmAdResult {
  verdict: 'ad' | 'organic';
  confidence: number;
  reason: string;
}

async function analyzeWithLlm(
  post: BlogPostInput,
  signals: SuspectedSignal[],
): Promise<LlmAdResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[ad-detector] ANTHROPIC_API_KEY 미설정, LLM 분석 건너뜀');
    return { verdict: 'organic', confidence: 0, reason: 'API 키 미설정' };
  }

  const anthropic = new Anthropic({ apiKey });

  const contentSummary = post.content_summary ?? post.content.slice(0, 1500);
  const signalList = signals.map(s => `- [${s.type}] ${s.name}: ${s.detail}`).join('\n');

  const prompt = `다음 네이버 블로그 포스트가 광고/협찬인지 분석해주세요.

## 블로그 정보
- 제목: ${post.title ?? '(제목 없음)'}
- 본문 요약:
${contentSummary}

## 감지된 의심 시그널
${signalList || '(없음)'}

## 판별 기준
- 광고성 글은 보통 과도한 칭찬, 단점 미언급, 예약 유도, 정보 나열 위주
- 진짜 후기는 개인적 경험, 장단점 균형, 자연스러운 문체가 특징
- "내돈내산", "솔직후기" 같은 표현이 오히려 광고 위장에 자주 사용됨

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.
{"verdict": "ad" | "organic", "confidence": 0.0~1.0, "reason": "판단 근거 1~2문장"}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[ad-detector] LLM JSON 파싱 실패:', text);
      return { verdict: 'organic', confidence: 0, reason: 'JSON 파싱 실패' };
    }

    const parsed = JSON.parse(jsonMatch[0]) as LlmAdResult;

    // 값 범위 보정
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));
    if (parsed.verdict !== 'ad' && parsed.verdict !== 'organic') {
      parsed.verdict = 'organic';
    }

    return parsed;
  } catch (err) {
    console.error('[ad-detector] LLM 호출 실패:', err instanceof Error ? err.message : err);
    return { verdict: 'organic', confidence: 0, reason: 'LLM 호출 실패' };
  }
}

// ─── 최종 판정 (스펙 섹션 6-3) ────────────────────────

function determineFinalVerdict(
  ruleResult: RuleResult,
  llmResult: LlmAdResult | null,
): { final_verdict: FinalVerdict; ad_confidence: number } {
  // confirmed_ad → 즉시 제거
  if (ruleResult === 'confirmed_ad') {
    return { final_verdict: 'confirmed_ad', ad_confidence: 1.0 };
  }

  // suspected → LLM 결과 기반 판정
  if (ruleResult === 'suspected' && llmResult) {
    if (llmResult.verdict === 'ad' && llmResult.confidence >= 0.7) {
      return { final_verdict: 'confirmed_ad', ad_confidence: llmResult.confidence };
    }
    if (llmResult.verdict === 'ad' && llmResult.confidence >= 0.4) {
      return { final_verdict: 'suspected_ad', ad_confidence: llmResult.confidence };
    }
    return { final_verdict: 'organic', ad_confidence: llmResult.confidence };
  }

  // clean → organic
  return { final_verdict: 'organic', ad_confidence: 0 };
}

// ─── 메인 함수: 단일 포스트 분석 ──────────────────────

/**
 * 블로그 포스트 하나를 광고 판별한다.
 * 1차 룰 → 의심 시그널 → (필요 시) 2차 LLM → 최종 판정
 */
export async function analyzeAd(
  post: BlogPostInput,
  bloggerHistory?: BloggerHistory,
): Promise<AdAnalysisResult> {
  // 1차: 확정 키워드 검사
  const confirmedKeywords = checkConfirmedKeywords(post.content);

  if (confirmedKeywords.length > 0) {
    return {
      rule_result: 'confirmed_ad',
      llm_result: null,
      ad_confidence: 1.0,
      detected_keywords: confirmedKeywords,
      suspected_signals: [],
      final_verdict: 'confirmed_ad',
      llm_reason: null,
    };
  }

  // 의심 시그널 감지
  const signals = detectSuspectedSignals(post, bloggerHistory);

  // clean이고 의심 시그널 없음 → organic
  if (signals.length === 0) {
    return {
      rule_result: 'clean',
      llm_result: null,
      ad_confidence: 0,
      detected_keywords: [],
      suspected_signals: [],
      final_verdict: 'organic',
      llm_reason: null,
    };
  }

  // 의심 시그널 1개 이상 → 2차 LLM 분석
  const ruleResult: RuleResult = 'suspected';
  const llmResult = await analyzeWithLlm(post, signals);
  const { final_verdict, ad_confidence } = determineFinalVerdict(ruleResult, llmResult);

  return {
    rule_result: ruleResult,
    llm_result: llmResult.verdict,
    ad_confidence,
    detected_keywords: signals.filter(s => s.type === 'keyword').map(s => s.name),
    suspected_signals: signals,
    final_verdict,
    llm_reason: llmResult.reason,
  };
}

// ─── 배치 분석 ─────────────────────────────────────────

/**
 * 여러 블로그 포스트를 순차 분석 (LLM 호출 비용 관리).
 * 1차 룰에서 걸리는 건은 LLM 호출 없이 즉시 판정.
 */
export async function analyzeAdBatch(
  posts: BlogPostInput[],
  bloggerHistories?: Map<string, BloggerHistory>,
): Promise<AdAnalysisResult[]> {
  const results: AdAnalysisResult[] = [];

  for (const post of posts) {
    const history = post.blogger_id
      ? bloggerHistories?.get(post.blogger_id)
      : undefined;

    const result = await analyzeAd(post, history);
    results.push(result);
  }

  return results;
}

// ─── 동기 버전 (LLM 없이 룰만) ───────────────────────

/**
 * LLM 없이 1차 키워드 룰 + 의심 시그널만으로 판별.
 * 테스트나 빠른 사전 필터에 사용.
 */
export function analyzeAdByRules(
  content: string,
  post?: Partial<BlogPostInput>,
): AdAnalysisResult {
  const confirmedKeywords = checkConfirmedKeywords(content);

  if (confirmedKeywords.length > 0) {
    return {
      rule_result: 'confirmed_ad',
      llm_result: null,
      ad_confidence: 1.0,
      detected_keywords: confirmedKeywords,
      suspected_signals: [],
      final_verdict: 'confirmed_ad',
      llm_reason: null,
    };
  }

  const fullPost: BlogPostInput = { content, ...post };
  const signals = detectSuspectedSignals(fullPost);

  if (signals.length > 0) {
    return {
      rule_result: 'suspected',
      llm_result: null,
      ad_confidence: 0.5,
      detected_keywords: signals.filter(s => s.type === 'keyword').map(s => s.name),
      suspected_signals: signals,
      final_verdict: 'suspected_ad',
      llm_reason: null,
    };
  }

  return {
    rule_result: 'clean',
    llm_result: null,
    ad_confidence: 0,
    detected_keywords: [],
    suspected_signals: [],
    final_verdict: 'organic',
    llm_reason: null,
  };
}
