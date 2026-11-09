// Family shared memory as Markdown notes, importable into GBrain
// (`gbrain import family-memory`). One note per family member + a decision log.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MEMORY_DIR = process.env.FA_MEMORY_DIR ?? path.join(here, '..', 'family-memory');
const enabled = process.env.FA_MEMORY !== 'off';

function ensure(file, title) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const p = path.join(MEMORY_DIR, file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, `---\ntitle: ${title}\ntags: [family-agent]\n---\n\n# ${title}\n\n`);
  }
  return p;
}

export function remember(subjectName, line) {
  if (!enabled) return;
  try {
    const p = ensure(`${subjectName}.md`, `${subjectName} — 가족 메모리`);
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    fs.appendFileSync(p, `- ${stamp} ${line}\n`);
  } catch {
    // Memory is best-effort; never break the demo over it.
  }
}

export function logDecision(line) {
  remember('decision-log', line);
}
