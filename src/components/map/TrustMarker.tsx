'use client';

import { useEffect, useRef } from 'react';

interface TrustMarkerProps {
  map: google.maps.Map | null;
  position: { lat: number; lng: number };
  label: string;
  score: number;
  title?: string;
  placeName?: string;
  placeId?: string;
  address?: string;
  onClick?: () => void;
}

function getMarkerColor(score: number): string {
  if (score >= 80) return '#16A34A'; // 녹색
  if (score >= 60) return '#EAB308'; // 노란색
  return '#F97316'; // 주황색
}

export default function TrustMarker({
  map,
  position,
  label,
  score,
  title,
  placeName,
  placeId,
  address,
  onClick,
}: TrustMarkerProps) {
  const markerRef = useRef<google.maps.Marker | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!map) return;

    const bgColor = getMarkerColor(score);

    // 커스텀 SVG 핀 마커
    const marker = new google.maps.Marker({
      map,
      position,
      label: {
        text: label,
        color: '#FFFFFF',
        fontSize: '11px',
        fontWeight: '600',
      },
      title: title ?? placeName,
      icon: {
        path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
        fillColor: bgColor,
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 1.5,
        scale: 1.6,
        anchor: new google.maps.Point(12, 22),
        labelOrigin: new google.maps.Point(12, 9),
      },
    });

    // Google Maps URL 생성
    // placeId 있으면 정확한 장소 페이지, 없으면 장소명+주소로 검색
    const name = placeName ?? title ?? '';
    const searchQuery = address ? `${name} ${address}` : name;
    const coords = `${position.lat},${position.lng}`;

    const googleMapsUrl = placeId
      ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`;

    const googleMapsDirectionsUrl = placeId
      ? `https://www.google.com/maps/dir/?api=1&destination=${coords}&destination_place_id=${placeId}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(searchQuery)}`;

    // InfoWindow 콘텐츠
    const infoContent = document.createElement('div');
    infoContent.style.padding = '4px';
    infoContent.style.maxWidth = '200px';
    infoContent.innerHTML = `
      <div style="font-family: -apple-system, sans-serif;">
        <div style="font-size: 13px; font-weight: 600; color: #1E293B; margin-bottom: 4px;">
          ${placeName ?? title ?? ''}
        </div>
        <div style="font-size: 11px; color: #64748B; margin-bottom: 8px;">
          신뢰도 ${score}점
        </div>
        <div style="display: flex; gap: 6px;">
          <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer"
            style="font-size: 11px; color: #1B5EA4; text-decoration: none; font-weight: 500;">
            Google Maps에서 보기
          </a>
          <span style="color: #E2E6ED;">|</span>
          <a href="${googleMapsDirectionsUrl}" target="_blank" rel="noopener noreferrer"
            style="font-size: 11px; color: #1B5EA4; text-decoration: none; font-weight: 500;">
            경로 안내
          </a>
        </div>
      </div>
    `;

    const infoWindow = new google.maps.InfoWindow({
      content: infoContent,
    });

    marker.addListener('click', () => {
      // 다른 InfoWindow 닫기
      if (infoWindowRef.current) {
        infoWindowRef.current.close();
      }
      infoWindow.open(map, marker);
      onClick?.();
    });

    markerRef.current = marker;
    infoWindowRef.current = infoWindow;

    return () => {
      infoWindow.close();
      marker.setMap(null);
    };
  }, [map, position.lat, position.lng, label, score, title, placeName, placeId, onClick]);

  return null;
}
