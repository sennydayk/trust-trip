// 동선 설계 로직 — 위치 클러스터링 + 이동 시간 최적화 + 일정 배분
// Nearest neighbor TSP 근사 + 시간대별 카테고리 배정

import { getDistance } from 'geolib';

// ─── 타입 정의 ─────────────────────────────────────────

export interface RoutePlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  category?: string;
  trustScore: number;
}

export type TimeSlot = 'morning' | 'lunch' | 'afternoon_cafe' | 'afternoon' | 'dinner' | 'evening';

export interface RouteLeg {
  from: string;        // place name
  to: string;          // place name
  distanceMeters: number;
  durationMinutes: number;
  mode: '도보' | '지하철' | '택시';
}

export interface OrderedPlace extends RoutePlace {
  order: number;
  timeSlot: TimeSlot;
  scheduledTime: string;  // "11:30" 형태
}

export interface RouteResult {
  title: string;
  summary: string;
  orderedPlaces: OrderedPlace[];
  legs: RouteLeg[];
  totalDurationMinutes: number;
  totalDistanceMeters: number;
}

// ─── 상수 ──────────────────────────────────────────────

const TIME_SLOTS: { slot: TimeSlot; startTime: string; label: string; categories: string[] }[] = [
  { slot: 'morning', startTime: '10:00', label: '오전', categories: ['관광지', '공원', '사원', '신사', '시장'] },
  { slot: 'lunch', startTime: '11:30', label: '점심', categories: ['맛집', '라멘', '스시', '오마카세', '해산물', '오코노미야키', '쿠시카츠', '타코야키', '양식'] },
  { slot: 'afternoon_cafe', startTime: '13:30', label: '카페', categories: ['카페', '디저트', '베이커리'] },
  { slot: 'afternoon', startTime: '14:30', label: '오후', categories: ['관광지', '공원', '쇼핑'] },
  { slot: 'dinner', startTime: '18:00', label: '저녁', categories: ['맛집', '라멘', '스시', '오마카세', '해산물', '오코노미야키', '쿠시카츠'] },
  { slot: 'evening', startTime: '20:00', label: '저녁', categories: ['바/술집', '바', '펍'] },
];

// 이동 수단 추정
function estimateTransport(distanceMeters: number): { mode: RouteLeg['mode']; durationMinutes: number } {
  if (distanceMeters <= 800) {
    return { mode: '도보', durationMinutes: Math.ceil(distanceMeters / 80) }; // 80m/min ≈ 4.8km/h
  }
  if (distanceMeters <= 5000) {
    return { mode: '지하철', durationMinutes: Math.ceil(distanceMeters / 400) + 5 }; // 대기 5분 포함
  }
  return { mode: '택시', durationMinutes: Math.ceil(distanceMeters / 500) + 3 };
}

// ─── Nearest Neighbor TSP ─────────────────────────────

function nearestNeighborOrder<T extends RoutePlace>(places: T[]): T[] {
  if (places.length <= 1) return [...places];

  const remaining = [...places];
  const ordered: T[] = [];

  // 첫 번째 장소: 가장 북쪽(또는 지정)
  remaining.sort((a, b) => b.latitude - a.latitude);
  ordered.push(remaining.shift()!);

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = getDistance(
        { latitude: last.latitude, longitude: last.longitude },
        { latitude: remaining[i].latitude, longitude: remaining[i].longitude },
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    ordered.push(remaining.splice(nearestIdx, 1)[0]);
  }

  return ordered;
}

// ─── 시간대 배정 ──────────────────────────────────────

function assignTimeSlots(places: RoutePlace[]): OrderedPlace[] {
  const assigned: OrderedPlace[] = [];
  const used = new Set<string>();

  // 카테고리 기반 시간대 매칭
  for (const slot of TIME_SLOTS) {
    if (assigned.length >= places.length) break;

    const candidate = places.find(p =>
      !used.has(p.id) &&
      slot.categories.some(cat =>
        p.category?.toLowerCase().includes(cat.toLowerCase()) ||
        cat.toLowerCase().includes(p.category?.toLowerCase() ?? ''),
      ),
    );

    if (candidate) {
      used.add(candidate.id);
      assigned.push({
        ...candidate,
        order: assigned.length + 1,
        timeSlot: slot.slot,
        scheduledTime: slot.startTime,
      });
    }
  }

  // 매칭되지 않은 장소를 남은 슬롯에 배정
  for (const place of places) {
    if (used.has(place.id)) continue;

    const nextSlotIdx = assigned.length % TIME_SLOTS.length;
    const slot = TIME_SLOTS[nextSlotIdx];

    assigned.push({
      ...place,
      order: assigned.length + 1,
      timeSlot: slot.slot,
      scheduledTime: incrementTime(
        assigned.length > 0 ? assigned[assigned.length - 1].scheduledTime : '10:00',
        90,
      ),
    });
    used.add(place.id);
  }

  return assigned;
}

function incrementTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// ─── 메인 함수 ─────────────────────────────────────────

/**
 * 선택된 장소들로 최적 동선을 설계한다.
 *
 * 1. 카테고리 기반 시간대 배정 (점심/카페/관광/저녁)
 * 2. 배정된 순서에 대해 Nearest Neighbor TSP 근사로 이동 거리 최적화
 * 3. 구간별 이동 수단/시간 계산
 */
export function planRoute(selectedPlaces: RoutePlace[]): RouteResult {
  if (selectedPlaces.length === 0) {
    return {
      title: '코스 없음',
      summary: '장소를 선택해주세요',
      orderedPlaces: [],
      legs: [],
      totalDurationMinutes: 0,
      totalDistanceMeters: 0,
    };
  }

  // 1단계: 시간대 배정
  const slotAssigned = assignTimeSlots(selectedPlaces);

  // 2단계: TSP 최적화 (시간대 순서 유지하면서 같은 시간대 내 최적화)
  const optimized = nearestNeighborOrder(slotAssigned);

  // 시간대 순서로 재정렬
  optimized.sort((a, b) => {
    const timeA = a.scheduledTime.replace(':', '');
    const timeB = b.scheduledTime.replace(':', '');
    return timeA.localeCompare(timeB);
  });

  // 순서 번호 재배정
  optimized.forEach((p, i) => { p.order = i + 1; });

  // 3단계: 구간 계산
  const legs: RouteLeg[] = [];
  let totalDistance = 0;
  let totalDuration = 0;

  for (let i = 0; i < optimized.length - 1; i++) {
    const from = optimized[i];
    const to = optimized[i + 1];

    const distanceMeters = getDistance(
      { latitude: from.latitude, longitude: from.longitude },
      { latitude: to.latitude, longitude: to.longitude },
    );

    const transport = estimateTransport(distanceMeters);

    legs.push({
      from: from.name,
      to: to.name,
      distanceMeters,
      durationMinutes: transport.durationMinutes,
      mode: transport.mode,
    });

    totalDistance += distanceMeters;
    totalDuration += transport.durationMinutes;
  }

  // 제목/요약
  const destination = guessDestination(selectedPlaces);
  const title = `${destination} 1일 코스`;
  const summary = `${optimized.length}곳 · 총 이동 ${totalDuration}분`;

  return {
    title,
    summary,
    orderedPlaces: optimized,
    legs,
    totalDurationMinutes: totalDuration,
    totalDistanceMeters: totalDistance,
  };
}

function guessDestination(places: RoutePlace[]): string {
  for (const p of places) {
    if (p.address) {
      const parts = p.address.split(/[,·]/);
      const city = parts[parts.length - 1]?.trim();
      if (city && city.length >= 2) return city;
    }
  }
  return '여행';
}
