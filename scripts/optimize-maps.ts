// 맵 PNG 일괄 최적화: 1280×720 으로 리사이즈 + JPG 변환 (q=85).
// 원본 PNG 는 보존 (필요 시 사람이 수동 삭제).
//
// 사용법:
//   npx tsx scripts/optimize-maps.ts          # assets/maps/*.png 전부 변환
//   npx tsx scripts/optimize-maps.ts act2     # 특정 맵 한 장만

import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAPS_DIR = path.join(PROJECT_ROOT, 'assets', 'maps');

const TARGET_W = 1280;
const TARGET_H = 720;
const JPG_QUALITY = 85;

async function optimize(pngPath: string) {
  const base = path.basename(pngPath, '.png');
  const outPath = path.join(MAPS_DIR, `${base}.jpg`);
  const before = fs.statSync(pngPath).size;

  await sharp(pngPath)
    .resize(TARGET_W, TARGET_H, { fit: 'fill' }) // 비율 어차피 16:9 라 fill 로 정확히 채움
    .jpeg({ quality: JPG_QUALITY, progressive: true, mozjpeg: true })
    .toFile(outPath);

  const after = fs.statSync(outPath).size;
  const ratio = ((1 - after / before) * 100).toFixed(1);
  console.log(
    `[optimize] ${base}: ${(before / 1024).toFixed(0)}KB → ${(after / 1024).toFixed(0)}KB (${ratio}% 절감)`
  );
}

async function main() {
  const filter = process.argv[2]; // 선택적: 특정 맵 id
  const all = fs
    .readdirSync(MAPS_DIR)
    .filter((f) => f.endsWith('.png'))
    .filter((f) => !filter || path.basename(f, '.png') === filter);

  if (all.length === 0) {
    console.error(`No PNG files matched (filter: ${filter ?? 'none'})`);
    process.exit(1);
  }

  console.log(`[optimize] target: ${all.length} file(s) → ${TARGET_W}×${TARGET_H} JPG q=${JPG_QUALITY}\n`);
  let totalBefore = 0;
  let totalAfter = 0;
  for (const f of all) {
    const p = path.join(MAPS_DIR, f);
    totalBefore += fs.statSync(p).size;
    await optimize(p);
    totalAfter += fs.statSync(path.join(MAPS_DIR, path.basename(f, '.png') + '.jpg')).size;
  }
  console.log(
    `\n[optimize] TOTAL: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(2)}MB`
  );
  console.log(
    `[optimize] 다음 단계: BootScene 의 .png 경로를 .jpg 로 변경하세요.`
  );
}

main().catch((e) => {
  console.error('[optimize] FAILED:', e);
  process.exit(1);
});
