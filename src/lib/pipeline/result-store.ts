// 파이프라인 결과를 JSON 파일로 영구 저장/복원
// 인메모리(globalThis)가 사라져도 파일에서 복원 가능

import { promises as fs } from 'fs';
import path from 'path';

const RESULTS_DIR = path.join(process.cwd(), 'data', 'results');

interface StoredResult {
  session_id: string;
  query: string;
  destination: string;
  category: string;
  region_type: string;
  created_at: string;
  summary: {
    total_places: number;
    total_blog_posts: number;
    ads_removed: number;
    verified: number;
    avg_trust_score: number;
  };
  results: unknown[];
}

async function ensureDir() {
  try {
    await fs.mkdir(RESULTS_DIR, { recursive: true });
  } catch {}
}

/**
 * 파이프라인 결과를 JSON 파일로 저장한다.
 */
export async function saveResult(sessionId: string, data: StoredResult): Promise<void> {
  try {
    await ensureDir();
    const filePath = path.join(RESULTS_DIR, `${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
    console.log(`[result-store] 저장: ${sessionId}`);
  } catch (err) {
    console.warn('[result-store] 저장 실패:', err instanceof Error ? err.message : err);
  }
}

/**
 * 저장된 결과를 파일에서 복원한다.
 */
export async function loadResult(sessionId: string): Promise<StoredResult | null> {
  try {
    const filePath = path.join(RESULTS_DIR, `${sessionId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as StoredResult;
  } catch {
    return null;
  }
}

/**
 * 저장된 모든 세션 목록을 반환한다 (마이페이지용).
 */
export async function listResults(): Promise<Array<{
  session_id: string;
  query: string;
  avg_trust_score: number;
  verified: number;
  created_at: string;
}>> {
  try {
    await ensureDir();
    const files = await fs.readdir(RESULTS_DIR);
    const results = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(RESULTS_DIR, file), 'utf-8');
        const data = JSON.parse(content) as StoredResult;
        results.push({
          session_id: data.session_id,
          query: data.query,
          avg_trust_score: data.summary.avg_trust_score,
          verified: data.summary.verified,
          created_at: data.created_at,
        });
      } catch {}
    }

    // 최신순 정렬
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return results;
  } catch {
    return [];
  }
}
