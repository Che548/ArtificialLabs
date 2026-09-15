export function analysisMascotMood(score: number) {
  if (score <= 15) return 'sad';
  if (score <= 60) return 'neutral';
  return 'happy';
}
