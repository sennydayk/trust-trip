'use client';

import { useState, useRef, useEffect } from 'react';

interface Suggestion {
  name: string;
  placeId: string;
  description: string;
}

interface DestinationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 여행지 자동완성 입력.
 * Google Places Autocomplete API 사용 시도 → 실패 시 로컬 매칭 폴백.
 */
export default function DestinationInput({
  value,
  onChange,
  placeholder = '여행지 (예: 도쿄, 제주도)',
  className = '',
}: DestinationInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputText, setInputText] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // 로컬 폴백 데이터
  const LOCAL_DESTINATIONS = [
    // 주요 도시
    { name: '서울', description: '대한민국 서울특별시' },
    { name: '부산', description: '대한민국 부산광역시' },
    { name: '제주', description: '대한민국 제주특별자치도' },
    { name: '강릉', description: '대한민국 강원특별자치도 강릉시' },
    { name: '경주', description: '대한민국 경상북도 경주시' },
    { name: '여수', description: '대한민국 전라남도 여수시' },
    { name: '전주', description: '대한민국 전라북도 전주시' },
    { name: '속초', description: '대한민국 강원특별자치도 속초시' },
    { name: '통영', description: '대한민국 경상남도 통영시' },
    { name: '서귀포', description: '대한민국 제주특별자치도 서귀포시' },
    { name: '대구', description: '대한민국 대구광역시' },
    { name: '인천', description: '대한민국 인천광역시' },
    { name: '대전', description: '대한민국 대전광역시' },
    { name: '광주', description: '대한민국 광주광역시' },
    { name: '양양', description: '대한민국 강원특별자치도 양양군' },
    { name: '밀양', description: '대한민국 경상남도 밀양시' },
    // 서울 세부 지역
    { name: '강남', description: '서울 강남구' },
    { name: '홍대', description: '서울 마포구 홍대입구역' },
    { name: '이태원', description: '서울 용산구 이태원동' },
    { name: '성수', description: '서울 성동구 성수동' },
    { name: '연남동', description: '서울 마포구 연남동' },
    { name: '을지로', description: '서울 중구 을지로' },
    { name: '명동', description: '서울 중구 명동' },
    { name: '신촌', description: '서울 서대문구 신촌동' },
    { name: '잠실', description: '서울 송파구 잠실동' },
    { name: '압구정', description: '서울 강남구 압구정동' },
    // 부산 세부 지역
    { name: '해운대', description: '부산 해운대구' },
    { name: '서면', description: '부산 부산진구 서면' },
    { name: '광안리', description: '부산 수영구 광안리' },
    // 해외
    { name: '도쿄', description: '일본 도쿄도' },
    { name: '오사카', description: '일본 오사카부' },
    { name: '교토', description: '일본 교토부' },
    { name: '후쿠오카', description: '일본 후쿠오카현' },
    { name: '삿포로', description: '일본 홋카이도 삿포로시' },
    { name: '시부야', description: '일본 도쿄도 시부야구' },
    { name: '신주쿠', description: '일본 도쿄도 신주쿠구' },
    { name: '방콕', description: '태국 방콕' },
    { name: '싱가포르', description: '싱가포르' },
    { name: '하노이', description: '베트남 하노이' },
    { name: '다낭', description: '베트남 다낭' },
    { name: '파리', description: '프랑스 파리' },
    { name: '런던', description: '영국 런던' },
    { name: '뉴욕', description: '미국 뉴욕' },
    { name: '바르셀로나', description: '스페인 바르셀로나' },
    { name: '로마', description: '이탈리아 로마' },
    { name: '홍콩', description: '중국 홍콩' },
    { name: '타이베이', description: '대만 타이베이' },
  ];

  function searchLocal(query: string): Suggestion[] {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    return LOCAL_DESTINATIONS
      .filter(d => d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q))
      .slice(0, 6)
      .map(d => ({ name: d.name, placeId: '', description: d.description }));
  }

  async function searchGoogle(query: string): Promise<Suggestion[]> {
    try {
      const res = await fetch(`/api/places/autocomplete?query=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.predictions ?? []).slice(0, 6).map((p: Record<string, unknown>) => ({
        name: (p.structured_formatting as Record<string, string>)?.main_text ?? p.description,
        placeId: p.place_id as string,
        description: p.description as string,
      }));
    } catch {
      return [];
    }
  }

  function handleInputChange(text: string) {
    setInputText(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      // Google API 시도 → 실패 시 로컬
      let results = await searchGoogle(text);
      if (results.length === 0) {
        results = searchLocal(text);
      }
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    }, 300);
  }

  function handleSelect(suggestion: Suggestion) {
    setInputText(suggestion.name);
    onChange(suggestion.name);
    setShowDropdown(false);
    setSuggestions([]);
  }

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-light"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        <input
          type="text"
          value={inputText}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          autoComplete="off"
          className={`h-11 w-full rounded border border-neutral-border bg-white pl-9 pr-3.5 text-sm text-neutral-dark placeholder:text-neutral-light focus:border-primary focus:outline-none ${className}`}
        />
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded border border-neutral-border bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(s)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-neutral-surface transition-colors first:rounded-t last:rounded-b"
            >
              <svg
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-light"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-dark">{s.name}</p>
                <p className="text-[10px] text-neutral-light truncate">{s.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
