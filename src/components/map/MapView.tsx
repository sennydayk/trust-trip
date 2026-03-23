'use client';

import { useRef, useEffect, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

interface MapViewProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  onMapReady?: (map: google.maps.Map) => void;
}

let optionsSet = false;

export default function MapView({
  center = { lat: 34.6687, lng: 135.5013 },
  zoom = 13,
  className = '',
  onMapReady,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey || !containerRef.current) {
      setError(true);
      return;
    }

    async function initMap() {
      try {
        if (!optionsSet) {
          setOptions({ key: apiKey! });
          optionsSet = true;
        }

        const { Map } = await importLibrary('maps') as google.maps.MapsLibrary;

        if (!containerRef.current) return;

        const map = new Map(containerRef.current, {
          center,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
          ],
        });

        mapRef.current = map;
        onMapReady?.(map);
      } catch {
        setError(true);
      }
    }

    initMap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-neutral-surface border border-neutral-border rounded ${className}`}>
        <div className="text-center p-4">
          <svg className="mx-auto h-8 w-8 text-neutral-light mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-12.052l-1.503.78-3-1.56-3 1.56-1.503-.78A1.125 1.125 0 005.25 6.41V17.59a1.125 1.125 0 001.247 1.118l1.503-.78 3 1.56 3-1.56 1.503.78a1.125 1.125 0 001.247-1.118V6.41a1.125 1.125 0 00-1.247-1.118z" />
          </svg>
          <p className="text-xs text-neutral-light">Google Maps API 키를 설정해주세요</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={`rounded ${className}`} />;
}
