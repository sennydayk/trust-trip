/**
 * 테스트 스크립트: 비동기 파이프라인 전체 흐름 검증
 *
 * 1. POST /api/search → sessionId 반환
 * 2. GET /api/pipeline/status/[sessionId] → 폴링으로 완료 대기
 * 3. GET /api/results/[sessionId] → 최종 결과
 *
 * 실행: npx tsx scripts/test-search.ts
 * 서버가 실행 중이어야 합니다 (npm run dev)
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 60;

const DIVIDER = '─'.repeat(60);

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testSearch() {
  console.log('\n🔍 TrustTrip 파이프라인 테스트 (비동기)');
  console.log(DIVIDER);

  // ── 1단계: 검색 시작 ─────────────────────────────
  console.log('\n📤 POST /api/search');
  console.log('   { destination: "오사카", category: "맛집" }');

  const searchRes = await fetch(`${API_URL}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: '오사카', category: '맛집' }),
  });

  if (!searchRes.ok) {
    console.error(`❌ HTTP ${searchRes.status}: ${searchRes.statusText}`);
    process.exit(1);
  }

  const searchData = await searchRes.json();
  const sessionId = searchData.session_id;

  console.log(`   ✓ 세션 생성: ${sessionId}`);
  console.log(`   상태: ${searchData.status}`);
  console.log(`   지역: ${searchData.region_type}`);

  // ── 2단계: 진행 상태 폴링 ────────────────────────
  console.log('\n⏳ 파이프라인 진행 상태 폴링...');

  let lastStage = '';
  let finalStatus = '';

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await delay(POLL_INTERVAL_MS);

    const statusRes = await fetch(`${API_URL}/api/pipeline/status/${sessionId}`);
    if (!statusRes.ok) {
      console.error(`   ❌ 상태 조회 실패: ${statusRes.status}`);
      continue;
    }

    const statusData = await statusRes.json();
    const { current_stage, progress, status, stages } = statusData;

    // 단계 변경 시 출력
    if (current_stage !== lastStage) {
      lastStage = current_stage;
      console.log(`   [${progress.current}/${progress.total}] ${progress.message}`);

      // 완료된 단계 결과 출력
      for (const stage of stages) {
        if (stage.status === 'completed' && stage.result) {
          const r = stage.result;
          switch (stage.stage) {
            case 'collecting':
              console.log(`         → ${r.total}건 수집 (네이버 ${r.naver} / Google ${r.google} / 카카오 ${r.kakao})`);
              break;
            case 'normalizing':
              console.log(`         → ${r.before}건 → ${r.after}건 (${r.merged}건 병합)`);
              break;
            case 'analyzing':
              console.log(`         → ${r.places_analyzed}개 장소, 블로그 ${r.total_blog_posts}건, 광고 ${r.total_ads_detected}건`);
              if (r.skipped_places?.length > 0) {
                console.log(`         ⚠ 건너뜀: ${r.skipped_places.join(', ')}`);
              }
              break;
            case 'scoring':
              console.log(`         → ${r.total_scored}개 산출, 평균 ${r.avg_trust_score}점`);
              if (r.highest) console.log(`         → 최고: ${r.highest.name} (${r.highest.score}점)`);
              break;
          }
        }
      }
    }

    if (status === 'completed' || status === 'failed') {
      finalStatus = status;
      break;
    }
  }

  if (!finalStatus) {
    console.error('❌ 타임아웃: 파이프라인이 시간 내에 완료되지 않았습니다.');
    process.exit(1);
  }

  if (finalStatus === 'failed') {
    console.error('❌ 파이프라인 실패');
    process.exit(1);
  }

  // ── 3단계: 결과 조회 ─────────────────────────────
  console.log('\n📊 GET /api/results/' + sessionId);

  const resultsRes = await fetch(`${API_URL}/api/results/${sessionId}`);
  const resultsData = await resultsRes.json();

  console.log(`   상태: ${resultsData.status}`);

  if (resultsData.pipeline_summary) {
    const ps = resultsData.pipeline_summary;
    console.log('\n📋 파이프라인 요약');
    if (ps.collect) console.log(`   수집:    ${ps.collect.total}건`);
    if (ps.normalize) console.log(`   정규화:  ${ps.normalize.before} → ${ps.normalize.after}건`);
    if (ps.analyze) console.log(`   분석:    ${ps.analyze.places_analyzed}개 장소`);
    if (ps.score) console.log(`   점수:    평균 ${ps.score.avg_trust_score}점`);
  }

  // 상세 결과가 있으면 출력
  if (resultsData.results) {
    console.log(`\n🏆 검증 결과 — ${resultsData.results.length}개 장소`);
    console.log(DIVIDER);

    for (const place of resultsData.results.slice(0, 5)) {
      const icon = place.trust_score >= 80 ? '🟢' : place.trust_score >= 60 ? '🟡' : '🔴';
      console.log(`  ${icon} #${place.rank} ${place.name}  [${place.trust_score}점]`);
      console.log(`     ${place.address ?? '-'} · ${place.category ?? '-'}`);
    }

    if (resultsData.results.length > 5) {
      console.log(`  ... 외 ${resultsData.results.length - 5}개`);
    }
  }

  console.log(`\n${DIVIDER}`);
  console.log(`✅ 전체 흐름 정상 완료`);
  console.log(`   세션: ${sessionId}`);
  console.log(`   상태 API: /api/pipeline/status/${sessionId}`);
  console.log(`   결과 API: /api/results/${sessionId}\n`);
}

testSearch().catch(err => {
  console.error('❌ 테스트 실패:', err.message);
  process.exit(1);
});
