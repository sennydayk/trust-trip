// 지역 자동완성 API — Google Places Autocomplete + Geocoding 병합
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');
  if (!query) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ predictions: [] });
  }

  try {
    // 두 API 병렬 호출
    const [autocompleteRes, geocodeRes] = await Promise.all([
      // 1. Places Autocomplete (types 제한 없이 — 모든 지역/장소)
      fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${new URLSearchParams({
        input: query,
        language: 'ko',
        key: apiKey,
      })}`),
      // 2. Geocoding (주소/지역명 → 좌표)
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({
        address: query,
        language: 'ko',
        key: apiKey,
      })}`),
    ]);

    const predictions: Array<{
      place_id: string;
      description: string;
      structured_formatting: unknown;
    }> = [];
    const seen = new Set<string>();

    // Autocomplete 결과
    if (autocompleteRes.ok) {
      const data = await autocompleteRes.json();
      for (const p of data.predictions ?? []) {
        const desc = p.description as string;
        if (!seen.has(desc)) {
          seen.add(desc);
          predictions.push({
            place_id: p.place_id,
            description: desc,
            structured_formatting: p.structured_formatting,
          });
        }
      }
    }

    // Geocoding 결과 보강 (Autocomplete에 없는 결과 추가)
    if (geocodeRes.ok) {
      const data = await geocodeRes.json();
      for (const r of data.results ?? []) {
        const desc = r.formatted_address as string;
        if (!seen.has(desc) && predictions.length < 8) {
          seen.add(desc);
          predictions.push({
            place_id: r.place_id,
            description: desc,
            structured_formatting: {
              main_text: (r.address_components?.[0] as Record<string, unknown>)?.long_name ?? query,
              secondary_text: desc,
            },
          });
        }
      }
    }

    return NextResponse.json({ predictions: predictions.slice(0, 6) });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
