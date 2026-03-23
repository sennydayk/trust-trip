'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import TrustBadge from '@/components/score/TrustBadge';
import MapView from '@/components/map/MapView';
import TrustMarker from '@/components/map/TrustMarker';
import RouteOverlay, { MapLegend } from '@/components/map/RouteOverlay';
import { getTrustColor } from '@/lib/utils/trust-color';
import { planRoute, type RouteResult, type RoutePlace } from '@/lib/routing/route-planner';

// ─── 목 데이터 ─────────────────────────────────────────

const MOCK_PLACES: RoutePlace[] = [
  { id: '1', name: '스시 오마카세 하루', latitude: 34.6627, longitude: 135.5015, address: '난바', category: '스시/오마카세', trustScore: 87 },
  { id: '2', name: '% Arabica 난바', latitude: 34.6654, longitude: 135.5023, address: '난바', category: '카페', trustScore: 79 },
  { id: '3', name: '오사카성 공원', latitude: 34.6873, longitude: 135.5262, address: '모리노미야', category: '관광지', trustScore: 72 },
  { id: '4', name: '이치란 라멘 도톤보리', latitude: 34.6687, longitude: 135.5013, address: '도톤보리', category: '라멘', trustScore: 82 },
];

// ─── 페이지 ───────────────────────────────────────────

export default function RoutePage({
  params,
}: {
  params: { sessionId: string };
}) {
  const { sessionId } = params;
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRoute() {
      try {
        // 결과 API에서 장소 목록 가져오기 시도
        const res = await fetch(`/api/results/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const places: RoutePlace[] = data.results.slice(0, 6).map((r: Record<string, unknown>) => ({
              id: String(r.place_id ?? r.rank),
              name: r.name as string,
              latitude: (r.location as { lat: number })?.lat ?? 0,
              longitude: (r.location as { lng: number })?.lng ?? 0,
              address: (r.address as string) ?? '',
              category: (r.category as string) ?? '',
              trustScore: (r.trust_score as number) ?? 0,
            }));
            setRouteResult(planRoute(places));
            setLoading(false);
            return;
          }
        }
      } catch {
        // 폴백
      }

      // DB/API 실패 시 목 데이터
      setRouteResult(planRoute(MOCK_PLACES));
      setLoading(false);
    }
    loadRoute();
  }, [sessionId]);

  const handleMapReady = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);

    // 경로에 맞게 bounds 조정
    if (routeResult && routeResult.orderedPlaces.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      for (const p of routeResult.orderedPlaces) {
        bounds.extend({ lat: p.latitude, lng: p.longitude });
      }
      mapInstance.fitBounds(bounds, 60);
    }
  }, [routeResult]);

  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 800);
  }

  if (loading || !routeResult) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const { orderedPlaces, legs, title, summary } = routeResult;

  // 경로 좌표 배열
  const routePath = orderedPlaces.map(p => ({ lat: p.latitude, lng: p.longitude }));

  // 중심점
  const center = orderedPlaces.length > 0
    ? {
        lat: orderedPlaces.reduce((s, p) => s + p.latitude, 0) / orderedPlaces.length,
        lng: orderedPlaces.reduce((s, p) => s + p.longitude, 0) / orderedPlaces.length,
      }
    : { lat: 34.6687, lng: 135.5013 };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      {/* 모바일: 지도 상단 */}
      <div className="relative lg:hidden">
        <MapView
          center={center}
          zoom={13}
          className="h-[200px] w-full"
          onMapReady={handleMapReady}
        />
        {map && (
          <>
            {orderedPlaces.map(p => (
              <TrustMarker
                key={p.id}
                map={map}
                position={{ lat: p.latitude, lng: p.longitude }}
                label={String(p.order)}
                score={p.trustScore}
                title={`${p.name} (${p.trustScore}점)`}
              />
            ))}
            <RouteOverlay map={map} path={routePath} />
          </>
        )}
        <div className="absolute bottom-2 right-2">
          <MapLegend />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── 좌측 타임라인 패널 ───────────────────── */}
        <aside className="w-full shrink-0 overflow-y-auto border-r border-neutral-border p-5 lg:w-[260px]">
          {/* 코스 제목 */}
          <h1 className="text-base font-semibold text-neutral-dark tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-xs text-neutral-mid">{summary}</p>

          {/* 타임라인 */}
          <div className="mt-5 flex flex-col">
            {orderedPlaces.map((place, i) => {
              const colors = getTrustColor(place.trustScore);
              const leg = i < legs.length ? legs[i] : null;
              const isLast = i === orderedPlaces.length - 1;

              const slotLabels: Record<string, string> = {
                morning: '오전',
                lunch: '점심',
                afternoon_cafe: '카페',
                afternoon: '오후',
                dinner: '저녁',
                evening: '야간',
              };

              return (
                <div key={place.id}>
                  {/* 장소 */}
                  <div className="flex gap-3">
                    {/* 번호 원형 */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          place.trustScore >= 80
                            ? 'bg-score-high-bg text-score-high-text'
                            : place.trustScore >= 60
                            ? 'bg-score-mid-bg text-score-mid-text'
                            : 'bg-score-low-bg text-score-low'
                        }`}
                      >
                        {place.order}
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 min-h-[16px] bg-neutral-border" />
                      )}
                    </div>

                    {/* 장소 정보 */}
                    <div className="flex-1 pb-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-neutral-dark tracking-tight">
                          {place.name}
                        </p>
                        <TrustBadge score={place.trustScore} size="sm" />
                      </div>
                      <p className="mt-0.5 text-[11px] text-neutral-mid">
                        {place.address} · {slotLabels[place.timeSlot] ?? ''} {place.scheduledTime}
                      </p>
                    </div>
                  </div>

                  {/* 구간 이동 */}
                  {leg && (
                    <div className="ml-[14px] flex items-center gap-2 border-l border-neutral-border py-2 pl-[18px]">
                      <svg className="h-3 w-3 shrink-0 text-neutral-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                      </svg>
                      <span className="text-[11px] text-neutral-light">
                        {leg.mode} {leg.durationMinutes}분
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 코스 저장 */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved}
            className="mt-5 w-full bg-primary text-white font-medium rounded px-6 py-2.5 text-sm disabled:opacity-50"
          >
            {saved ? '저장 완료' : saving ? '저장 중...' : '코스 저장하기'}
          </button>

          {saved && (
            <p className="mt-2 text-center text-[11px] text-score-high-text">
              마이페이지에서 확인할 수 있습니다.
            </p>
          )}
        </aside>

        {/* ── 우측 지도 (데스크톱) ─────────────────── */}
        <div className="relative hidden flex-1 lg:block">
          <MapView
            center={center}
            zoom={13}
            className="h-full w-full"
            onMapReady={handleMapReady}
          />
          {map && (
            <>
              {orderedPlaces.map(p => (
                <TrustMarker
                  key={p.id}
                  map={map}
                  position={{ lat: p.latitude, lng: p.longitude }}
                  label={String(p.order)}
                  score={p.trustScore}
                  title={`${p.name} (${p.trustScore}점)`}
                />
              ))}
              <RouteOverlay map={map} path={routePath} />
            </>
          )}
          <div className="absolute bottom-4 right-4">
            <MapLegend />
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}
