export const faMention = '@치즈';

export function stripFaMention(text) {
  return String(text ?? '').trim().replace(/^@(?:FA\b|치즈(?=$|[\s,，:：]))[\s,，:：]*/iu, '');
}

export function mentionsFa(text) {
  return /(?:^|\s)(?:@?FA\b|@치즈(?=$|[\s,.!?，。！？:：]))/iu.test(text);
}
