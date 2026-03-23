// 동선 설계 엔드포인트 — 위치 클러스터링 + 이동 시간 최적화
import { NextRequest, NextResponse } from 'next/server';
import { planRoute, type RoutePlace } from '@/lib/routing/route-planner';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { places } = body as { places: RoutePlace[] };

    if (!places || places.length === 0) {
      return NextResponse.json(
        { error: '장소를 선택해주세요.' },
        { status: 400 },
      );
    }

    const result = planRoute(places);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[route-plan] 동선 설계 실패:', error);
    return NextResponse.json(
      { error: '동선 설계 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
