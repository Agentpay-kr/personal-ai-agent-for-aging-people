/** Tiny Korean text helpers so chat messages read naturally ("엄마가", "해지는", "송금을"). */

type Pair = '은/는' | '이/가' | '을/를' | '과/와';

/** Picks the particle by the last syllable's final consonant; falls back to "은(는)" for non-Hangul. */
export function josa(word: string, pair: Pair): string {
  const [withFinal, withoutFinal] = pair.split('/') as [string, string];
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (Number.isNaN(code) || code < 0 || code > 11171) return `${withFinal}(${withoutFinal})`;
  return code % 28 !== 0 ? withFinal : withoutFinal;
}

const SERVICE_LABELS: Record<string, string> = {
  netflix: '넷플릭스',
  coupang: '쿠팡',
  youtube: '유튜브',
  tving: '티빙',
  wavve: '웨이브',
  melon: '멜론',
  naver: '네이버',
  kakao: '카카오',
  gmail: '지메일',
};

export const serviceLabel = (service: string): string => SERVICE_LABELS[service.toLowerCase()] ?? service;
