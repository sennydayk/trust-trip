export function getTrustColor(score: number) {
  if (score >= 80) {
    return {
      text: 'text-score-high',
      bg: 'bg-score-high-bg',
      badge: 'bg-score-high',
      textHex: '#15803D',
    };
  }
  if (score >= 60) {
    return {
      text: 'text-score-mid',
      bg: 'bg-score-mid-bg',
      badge: 'bg-score-mid',
      textHex: '#B45309',
    };
  }
  return {
    text: 'text-score-low',
    bg: 'bg-score-low-bg',
    badge: 'bg-score-low',
    textHex: '#DC2626',
  };
}
