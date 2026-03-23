// 감성 분석 — 리뷰/블로그 텍스트 긍정/부정 점수 산출
// Claude API로 감성 분석 (0.0 ~ 1.0)
// 배치 처리: 여러 리뷰를 한 번에 분석하여 API 비용 절감

import Anthropic from '@anthropic-ai/sdk';

// ─── 타입 정의 ─────────────────────────────────────────

export type SupportedLanguage = 'ko' | 'en' | 'ja' | 'auto';

export interface SentimentResult {
  score: number;         // 0.0 (부정) ~ 1.0 (긍정)
  label: 'positive' | 'neutral' | 'negative';
  language: string;      // 감지된 언어
}

export interface SentimentBatchItem {
  id: string;
  text: string;
}

export interface SentimentBatchResult {
  id: string;
  score: number;
  label: 'positive' | 'neutral' | 'negative';
}

// ─── 내부 유틸 ─────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경 변수가 설정되지 않았습니다.');
  return new Anthropic({ apiKey });
}

function toLabel(score: number): 'positive' | 'neutral' | 'negative' {
  if (score >= 0.6) return 'positive';
  if (score >= 0.4) return 'neutral';
  return 'negative';
}

function detectLanguageHint(text: string): string {
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[ぁ-んァ-ヶ]/.test(text)) return 'ja';
  return 'en';
}

// ─── 단일 텍스트 분석 ─────────────────────────────────

/**
 * 단일 텍스트의 감성을 분석한다.
 * @param text 분석할 텍스트
 * @param language 언어 힌트 ('auto'이면 자동 감지)
 * @returns 감성 점수 (0.0 ~ 1.0), 라벨, 감지된 언어
 */
export async function analyzeSentiment(
  text: string,
  language: SupportedLanguage = 'auto',
): Promise<SentimentResult> {
  if (!text.trim()) {
    return { score: 0.5, label: 'neutral', language: 'unknown' };
  }

  // 짧은 텍스트는 키워드 기반 빠른 분석
  if (text.length < 20) {
    return quickSentiment(text);
  }

  const client = getClient();
  const langHint = language === 'auto' ? detectLanguageHint(text) : language;

  const prompt = `다음 텍스트의 감성을 분석하세요.
텍스트가 어떤 언어든 (한국어, 영어, 일본어 등) 분석 가능합니다.

텍스트:
"${text.slice(0, 2000)}"

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.
{"score": 0.0~1.0, "language": "${langHint}"}

score 기준:
- 0.0: 매우 부정적
- 0.3: 부정적
- 0.5: 중립
- 0.7: 긍정적
- 1.0: 매우 긍정적`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { score: 0.5, label: 'neutral', language: langHint };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const score = Math.max(0, Math.min(1, parsed.score ?? 0.5));

    return {
      score,
      label: toLabel(score),
      language: parsed.language ?? langHint,
    };
  } catch (err) {
    console.error('[sentiment] LLM 호출 실패:', err instanceof Error ? err.message : err);
    return { score: 0.5, label: 'neutral', language: langHint };
  }
}

// ─── 배치 분석 (비용 절감) ────────────────────────────

// 한 번의 LLM 호출에 포함할 최대 리뷰 수
const BATCH_SIZE = 15;

/**
 * 여러 리뷰를 배치로 감성 분석한다.
 * BATCH_SIZE개씩 묶어 한 번의 LLM 호출로 처리하여 API 비용을 절감한다.
 */
export async function analyzeSentimentBatch(
  items: SentimentBatchItem[],
  language: SupportedLanguage = 'auto',
): Promise<SentimentBatchResult[]> {
  if (items.length === 0) return [];

  const results: SentimentBatchResult[] = [];

  // BATCH_SIZE개씩 청크로 분할
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const batchResults = await analyzeBatchChunk(chunk, language);
    results.push(...batchResults);
  }

  return results;
}

async function analyzeBatchChunk(
  items: SentimentBatchItem[],
  language: SupportedLanguage,
): Promise<SentimentBatchResult[]> {
  const client = getClient();

  const reviewList = items
    .map((item, idx) => `[${idx}] (id: ${item.id}) "${item.text.slice(0, 300)}"`)
    .join('\n');

  const prompt = `다음 리뷰들의 감성을 각각 분석하세요.
각 리뷰가 어떤 언어든 (한국어, 영어, 일본어 등) 분석 가능합니다.

${reviewList}

반드시 아래 JSON 배열 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요.
[{"id": "리뷰id", "score": 0.0~1.0}, ...]

score 기준:
- 0.0: 매우 부정적
- 0.3: 부정적
- 0.5: 중립
- 0.7: 긍정적
- 1.0: 매우 긍정적`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // 파싱 실패 시 기본값
      return items.map(item => ({ id: item.id, score: 0.5, label: 'neutral' as const }));
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ id: string; score: number }>;
    const resultMap = new Map(parsed.map(p => [p.id, p.score]));

    return items.map(item => {
      const score = Math.max(0, Math.min(1, resultMap.get(item.id) ?? 0.5));
      return { id: item.id, score, label: toLabel(score) };
    });
  } catch (err) {
    console.error('[sentiment] 배치 LLM 호출 실패:', err instanceof Error ? err.message : err);
    return items.map(item => ({ id: item.id, score: 0.5, label: 'neutral' as const }));
  }
}

// ─── 키워드 기반 빠른 분석 (짧은 텍스트용) ────────────

const POSITIVE_KEYWORDS = [
  '좋아', '좋았', '맛있', '최고', '추천', '만족', '깔끔', '친절',
  'good', 'great', 'excellent', 'amazing', 'love', 'best', 'nice',
  '美味しい', 'おいしい', '最高', '素晴らしい', 'いい',
];

const NEGATIVE_KEYWORDS = [
  '별로', '실망', '최악', '불친절', '더럽', '비싸', '느려', '안좋',
  'bad', 'terrible', 'worst', 'awful', 'horrible', 'disappointing',
  'まずい', 'ひどい', '最悪', 'がっかり',
];

function quickSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const lang = detectLanguageHint(text);

  let positiveCount = 0;
  let negativeCount = 0;

  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw)) positiveCount++;
  }
  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) return { score: 0.5, label: 'neutral', language: lang };

  const score = positiveCount / total;
  return { score, label: toLabel(score), language: lang };
}
