'use client';

import { useEffect, useRef } from 'react';

interface RoutePoint {
  lat: number;
  lng: number;
}

interface RouteOverlayProps {
  map: google.maps.Map | null;
  path: RoutePoint[];
  strokeColor?: string;
  strokeWeight?: number;
}

export default function RouteOverlay({
  map,
  path,
  strokeColor = '#1B5EA4',
  strokeWeight = 3,
}: RouteOverlayProps) {
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || path.length < 2) return;

    const polyline = new google.maps.Polyline({
      path: path.map(p => ({ lat: p.lat, lng: p.lng })),
      geodesic: true,
      strokeColor,
      strokeOpacity: 0.8,
      strokeWeight,
      map,
    });

    polylineRef.current = polyline;

    return () => {
      polyline.setMap(null);
    };
  }, [map, path, strokeColor, strokeWeight]);

  return null;
}

// ─── 범례 컴포넌트 ────────────────────────────────────

export function MapLegend() {
  return (
    <div className="flex items-center gap-3 bg-white/90 rounded px-3 py-1.5 shadow-sm border border-neutral-border">
      <span className="flex items-center gap-1 text-[10px] text-neutral-mid">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#16A34A' }} />
        80+
      </span>
      <span className="flex items-center gap-1 text-[10px] text-neutral-mid">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#EAB308' }} />
        60–79
      </span>
      <span className="flex items-center gap-1 text-[10px] text-neutral-mid">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#F97316' }} />
        &lt;60
      </span>
      <span className="flex items-center gap-1 text-[10px] text-neutral-mid">
        <span className="inline-block h-3 w-4 border-t-2 border-primary" />
        경로
      </span>
    </div>
  );
}
