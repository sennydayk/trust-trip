// 검색 시작 엔드포인트 — 세션 생성만 수행, 파이프라인은 별도 엔드포인트에서 실행
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { destination, category } = body;

    if (!destination) {
      return NextResponse.json(
        { error: '여행지를 입력해주세요.' },
        { status: 400 },
      );
    }

    const regionType = 'domestic' as 'domestic' | 'overseas';
    const cat = category ?? '맛집';
    const query = `${destination} ${cat}`;

    // 세션 생성
    let sessionId: string;

    const db = getDb();
    if (db) {
      const { data, error } = await db
        .from('search_sessions')
        .insert({
          query,
          destination,
          category: cat,
          region_type: regionType,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error || !data) {
        console.warn('[search] Supabase 세션 생성 실패, UUID 생성:', error?.message);
        sessionId = crypto.randomUUID();
      } else {
        sessionId = data.id;
      }
    } else {
      sessionId = crypto.randomUUID();
    }

    return NextResponse.json({
      session_id: sessionId,
      query,
      destination,
      category: cat,
      region_type: regionType,
      status: 'pending',
    });
  } catch (error) {
    console.error('[search] 요청 처리 실패:', error);
    return NextResponse.json(
      { error: '검색 요청 처리 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

function getDb() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}
