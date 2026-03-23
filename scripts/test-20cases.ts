/**
 * 20개 테스트 케이스 자동 실행
 * npx tsx scripts/test-20cases.ts
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3099';

interface TestCase {
  id: string;
  destination: string;
  category: string;
  label: string;
}

const CASES: TestCase[] = [
  // A. 넓은 범위
  { id: 'A1', destination: '도쿄', category: '카페', label: '해외 대도시 + 영문 장소명' },
  { id: 'A2', destination: '오사카', category: '맛집', label: '해외 + 블로그 풍부' },
  { id: 'A3', destination: '방콕', category: '맛집', label: '동남아 + 태국어 장소명' },
  { id: 'A4', destination: '파리', category: '카페', label: '유럽 + 프랑스어 장소명' },
  { id: 'A5', destination: '제주', category: '카페', label: '국내 인기 + 카카오맵' },
  { id: 'A6', destination: '서울', category: '맛집', label: '국내 대도시 + 장소 많음' },
  { id: 'A7', destination: '강릉', category: '숙소', label: '국내 소도시 + 숙소' },
  { id: 'A8', destination: '후쿠오카', category: '관광지', label: '해외 + 관광지' },
  { id: 'A9', destination: '다낭', category: '숙소', label: '동남아 + 숙소' },
  { id: 'A10', destination: '부산', category: '바/술집', label: '국내 + 니치 카테고리' },
  // B. 좁은 범위
  { id: 'B1', destination: '오사카', category: '라멘', label: '특정 음식' },
  { id: 'B2', destination: '서귀포', category: '브런치카페', label: '소도시 + 복합 카테고리' },
  { id: 'B3', destination: '교토', category: '말차디저트', label: '특정 메뉴' },
  { id: 'B4', destination: '도쿄 시부야', category: '카페', label: '세부 구역' },
  { id: 'B5', destination: '홍대', category: '이자카야', label: '국내 동네 + 일본식' },
  { id: 'B6', destination: '싱가포르', category: '칠리크랩', label: '특정 메뉴 극소' },
  { id: 'B7', destination: '경주', category: '한옥카페', label: '소도시 + 특색' },
  { id: 'B8', destination: '삿포로', category: '수프카레', label: '지역 특산 음식' },
  { id: 'B9', destination: '전주', category: '한옥마을 맛집', label: '관광지 포함 키워드' },
  { id: 'B10', destination: '하노이', category: '쌀국수', label: '동남아 + 로컬 음식' },
];

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface Result {
  id: string;
  destination: string;
  category: string;
  label: string;
  status: string;
  regionType: string;
  totalPlaces: number;
  totalBlogs: number;
  adsRemoved: number;
  avgScore: number;
  topPlace: string;
  topScore: number;
  topBlogCount: number;
  places: Array<{ rank: number; name: string; score: number; blogReal: number; blogRelevant: number }>;
  elapsed: number;
}

async function runCase(tc: TestCase): Promise<Result> {
  const start = Date.now();

  // 검색 시작
  const searchRes = await fetch(`${API_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: tc.destination, category: tc.category }),
  });
  const searchData = await searchRes.json();
  const sessionId = searchData.session_id;
  const regionType = searchData.region_type;

  // 완료 대기 (최대 120초)
  let resultData: any = null;
  for (let i = 0; i < 40; i++) {
    await delay(3000);
    const res = await fetch(`${API_URL}/api/results/${sessionId}`);
    const data = await res.json();
    if (data.status === 'completed' || data.status === 'failed') {
      resultData = data;
      break;
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);

  if (!resultData || resultData.status !== 'completed') {
    return {
      id: tc.id, destination: tc.destination, category: tc.category, label: tc.label,
      status: 'TIMEOUT', regionType, totalPlaces: 0, totalBlogs: 0, adsRemoved: 0,
      avgScore: 0, topPlace: '', topScore: 0, topBlogCount: 0, places: [], elapsed,
    };
  }

  const results = resultData.results ?? [];
  const summary = resultData.summary ?? {};

  const places = results.slice(0, 5).map((r: any) => {
    const posts = r.blog_posts ?? [];
    const real = posts.filter((p: any) => !p.url.includes('/sim_'));
    const placeLower = r.name.toLowerCase();
    const uniqueWords = placeLower.split(/[\s·,()\-]+/).filter((w: string) => w.length >= 3);
    const relevant = real.filter((p: any) => {
      const t = (p.title + ' ' + (p.content_snippet ?? '')).toLowerCase();
      return uniqueWords.some((w: string) => t.includes(w)) || t.includes(placeLower);
    });
    return {
      rank: r.rank,
      name: r.name,
      score: r.trust_score,
      blogReal: real.length,
      blogRelevant: relevant.length,
    };
  });

  return {
    id: tc.id,
    destination: tc.destination,
    category: tc.category,
    label: tc.label,
    status: 'OK',
    regionType,
    totalPlaces: summary.total_places ?? results.length,
    totalBlogs: summary.total_blog_posts ?? 0,
    adsRemoved: summary.ads_removed ?? 0,
    avgScore: summary.avg_trust_score ?? 0,
    topPlace: results[0]?.name ?? '',
    topScore: results[0]?.trust_score ?? 0,
    topBlogCount: (results[0]?.blog_posts ?? []).filter((p: any) => !p.url.includes('/sim_')).length,
    places,
    elapsed,
  };
}

async function main() {
  console.log('=== TrustTrip 20 Case Test ===\n');

  const allResults: Result[] = [];

  // 5개씩 배치 실행 (서버 부하 관리)
  for (let batch = 0; batch < 4; batch++) {
    const batchCases = CASES.slice(batch * 5, (batch + 1) * 5);
    console.log(`[Batch ${batch + 1}/4] ${batchCases.map(c => c.id).join(', ')}...`);

    const batchResults = await Promise.all(batchCases.map(tc => runCase(tc)));
    allResults.push(...batchResults);

    for (const r of batchResults) {
      console.log(`  ${r.id} ${r.status} ${r.elapsed}s — ${r.destination} ${r.category}: ${r.totalPlaces}곳, blog ${r.totalBlogs}, ad ${r.adsRemoved}, avg ${r.avgScore}`);
    }

    if (batch < 3) await delay(2000);
  }

  // 종합 리포트
  console.log('\n' + '═'.repeat(80));
  console.log('                        종합 리포트');
  console.log('═'.repeat(80));

  console.log('\n[ 전체 요약 ]');
  const ok = allResults.filter(r => r.status === 'OK');
  const timeout = allResults.filter(r => r.status === 'TIMEOUT');
  console.log(`  성공: ${ok.length}/20, 타임아웃: ${timeout.length}/20`);
  console.log(`  평균 장소 수: ${(ok.reduce((s, r) => s + r.totalPlaces, 0) / ok.length).toFixed(1)}`);
  console.log(`  평균 블로그 수: ${(ok.reduce((s, r) => s + r.totalBlogs, 0) / ok.length).toFixed(1)}`);
  console.log(`  평균 광고 제거: ${(ok.reduce((s, r) => s + r.adsRemoved, 0) / ok.length).toFixed(1)}`);
  console.log(`  평균 신뢰도: ${(ok.reduce((s, r) => s + r.avgScore, 0) / ok.length).toFixed(1)}`);
  console.log(`  평균 응답시간: ${(ok.reduce((s, r) => s + r.elapsed, 0) / ok.length).toFixed(0)}초`);

  console.log('\n[ 케이스별 상세 ]');
  console.log('─'.repeat(80));
  console.log(`${'ID'.padEnd(5)} ${'검색어'.padEnd(18)} ${'상태'.padEnd(5)} ${'시간'.padEnd(5)} ${'장소'.padEnd(5)} ${'블로그'.padEnd(6)} ${'광고'.padEnd(5)} ${'평균점수'.padEnd(8)} ${'1위 장소'.padEnd(20)} ${'1위블로그'}`);
  console.log('─'.repeat(80));

  for (const r of allResults) {
    const query = `${r.destination} ${r.category}`;
    console.log(
      `${r.id.padEnd(5)} ${query.padEnd(18).substring(0, 18)} ${r.status.padEnd(5)} ${(r.elapsed + 's').padEnd(5)} ${String(r.totalPlaces).padEnd(5)} ${String(r.totalBlogs).padEnd(6)} ${String(r.adsRemoved).padEnd(5)} ${String(r.avgScore).padEnd(8)} ${r.topPlace.substring(0, 20).padEnd(20)} ${r.topBlogCount}`
    );
  }

  // 국내 vs 해외 비교
  console.log('\n[ 국내 vs 해외 ]');
  const domestic = ok.filter(r => r.regionType === 'domestic');
  const overseas = ok.filter(r => r.regionType === 'overseas');
  if (domestic.length > 0) {
    console.log(`  국내 (${domestic.length}건): 평균 점수 ${(domestic.reduce((s, r) => s + r.avgScore, 0) / domestic.length).toFixed(1)}, 평균 블로그 ${(domestic.reduce((s, r) => s + r.totalBlogs, 0) / domestic.length).toFixed(0)}건`);
  }
  if (overseas.length > 0) {
    console.log(`  해외 (${overseas.length}건): 평균 점수 ${(overseas.reduce((s, r) => s + r.avgScore, 0) / overseas.length).toFixed(1)}, 평균 블로그 ${(overseas.reduce((s, r) => s + r.totalBlogs, 0) / overseas.length).toFixed(0)}건`);
  }

  // 넓은 범위 vs 좁은 범위
  console.log('\n[ 넓은 범위(A) vs 좁은 범위(B) ]');
  const groupA = ok.filter(r => r.id.startsWith('A'));
  const groupB = ok.filter(r => r.id.startsWith('B'));
  if (groupA.length > 0) {
    console.log(`  A 넓은범위 (${groupA.length}건): 평균 장소 ${(groupA.reduce((s, r) => s + r.totalPlaces, 0) / groupA.length).toFixed(0)}, 평균 블로그 ${(groupA.reduce((s, r) => s + r.totalBlogs, 0) / groupA.length).toFixed(0)}, 평균 점수 ${(groupA.reduce((s, r) => s + r.avgScore, 0) / groupA.length).toFixed(1)}`);
  }
  if (groupB.length > 0) {
    console.log(`  B 좁은범위 (${groupB.length}건): 평균 장소 ${(groupB.reduce((s, r) => s + r.totalPlaces, 0) / groupB.length).toFixed(0)}, 평균 블로그 ${(groupB.reduce((s, r) => s + r.totalBlogs, 0) / groupB.length).toFixed(0)}, 평균 점수 ${(groupB.reduce((s, r) => s + r.avgScore, 0) / groupB.length).toFixed(1)}`);
  }

  // 상위 5개 장소 블로그 매칭율 분석
  console.log('\n[ 블로그 매칭 품질 (상위 5곳 기준) ]');
  console.log('─'.repeat(80));
  for (const r of allResults) {
    if (r.status !== 'OK' || r.places.length === 0) continue;
    const avgBlog = r.places.reduce((s, p) => s + p.blogReal, 0) / r.places.length;
    const avgRelevant = r.places.reduce((s, p) => s + p.blogRelevant, 0) / r.places.length;
    const matchRate = avgBlog > 0 ? Math.round((avgRelevant / avgBlog) * 100) : 0;
    console.log(`  ${r.id} ${(r.destination + ' ' + r.category).padEnd(18).substring(0, 18)} 평균 ${avgBlog.toFixed(1)}건/장소, 관련성 ${matchRate}%, 1위: ${r.places[0]?.name.substring(0, 15)} (${r.places[0]?.blogReal}건)`);
  }

  console.log('\n' + '═'.repeat(80));
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
