// 맵 일괄 임포트 스크립트
// PNG 한 장 주면 → JPG 최적화 + spawn/layer JSON 자동 생성 → assets/maps/ 에 저장
//
// 사용법:
//   npx tsx scripts/import-map.ts <map-id> <source-image-path>
// 예:
//   npx tsx scripts/import-map.ts act2 /path/to/raw_act2.png
//   npx tsx scripts/import-map.ts act2 assets/maps/act2.png  (이미 있는 PNG 재처리)
//
// spawn 좌표는 shared/maps/<id>.spawns.ts 에 정의.
// 같은 정의를 클라 Scene 도 import 해서 단일 진실 원천을 유지.

import * as fs from 'node:fs';
import * as path from 'node:path';
import sharp from 'sharp';
import { SPAWN_REGISTRY, type SpawnDef } from '../shared/maps';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAPS_DIR = path.join(PROJECT_ROOT, 'assets', 'maps');

const TARGET_W = 1280;
const TARGET_H = 720;
const JPG_QUALITY = 85;
const TILE_SIZE = 32;

// 맵 spawn 정의는 shared/maps/<id>.spawns.ts 에서 자동 import.
// 새 맵 추가 시:
//   1) shared/maps/<id>.spawns.ts 작성
//   2) shared/maps/index.ts 에 export 한 줄 추가
// 그러면 이 스크립트가 자동 인식.

// ── Tiled 호환 JSON 생성 (map_maker 가 인식하는 포맷) ──
const makeTiledJson = (
  id: string,
  actNumber: number,
  spawns: SpawnDef[]
) => {
  const widthTiles = Math.round(TARGET_W / TILE_SIZE); // 40
  const heightTiles = Math.ceil(TARGET_H / TILE_SIZE); // 23 (720/32 = 22.5)
  return {
    id,
    name: id,
    actNumber,
    imageExt: 'jpg',
    imagePath: `/assets/maps/${id}.jpg`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content: {
      compressionlevel: -1,
      width: widthTiles,
      height: heightTiles,
      infinite: false,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tileheight: TILE_SIZE,
      tilewidth: TILE_SIZE,
      type: 'map',
      version: '1.10',
      tiledversion: '1.10.1',
      nextlayerid: 4,
      nextobjectid: spawns.length + 1,
      tilesets: [
        {
          firstgid: 1,
          name: 'CollisionTile',
          tilewidth: TILE_SIZE,
          tileheight: TILE_SIZE,
          tilecount: 1,
          columns: 1,
          margin: 0,
          spacing: 0,
          image: 'Wall',
          imagewidth: TILE_SIZE,
          imageheight: TILE_SIZE,
        },
      ],
      layers: [
        {
          id: 1,
          name: 'collision',
          type: 'tilelayer',
          width: widthTiles,
          height: heightTiles,
          x: 0,
          y: 0,
          opacity: 0.5,
          visible: true,
          data: new Array(widthTiles * heightTiles).fill(0),
        },
        {
          id: 2,
          name: 'overlay',
          type: 'tilelayer',
          width: widthTiles,
          height: heightTiles,
          x: 0,
          y: 0,
          opacity: 0.5,
          visible: true,
          data: new Array(widthTiles * heightTiles).fill(0),
        },
        {
          id: 3,
          name: 'spawn',
          type: 'objectgroup',
          x: 0,
          y: 0,
          opacity: 1,
          visible: true,
          draworder: 'topdown',
          objects: spawns.map((s, i) => ({
            id: i + 1,
            name: s.name,
            point: false,
            rotation: 0,
            type: '',
            visible: true,
            x: s.x,
            y: s.y,
            width: s.width ?? TILE_SIZE,
            height: s.height ?? TILE_SIZE,
          })),
        },
      ],
    },
  };
};

// ── 메인 ──
async function main() {
  const id = process.argv[2];
  const sourcePath = process.argv[3];
  if (!id || !sourcePath) {
    console.error('Usage: npx tsx scripts/import-map.ts <map-id> <source-image-path>');
    console.error(`Known maps: ${Object.keys(SPAWN_REGISTRY).join(', ')}`);
    process.exit(1);
  }
  const config = SPAWN_REGISTRY[id];
  if (!config) {
    console.error(
      `No spawn config for "${id}". Add shared/maps/${id}.spawns.ts and register in shared/maps/index.ts.`
    );
    process.exit(1);
  }
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source image not found: ${sourcePath}`);
    process.exit(1);
  }

  fs.mkdirSync(MAPS_DIR, { recursive: true });

  // 1. 이미지 → JPG 1280×720 변환
  // sharp 가 same file in/out 을 거부하므로 일단 buffer 로 읽음
  const jpgPath = path.join(MAPS_DIR, `${id}.jpg`);
  const sourceSize = fs.statSync(sourcePath).size;
  const sourceBuf = fs.readFileSync(sourcePath);
  await sharp(sourceBuf)
    .resize(TARGET_W, TARGET_H, { fit: 'fill' })
    .jpeg({ quality: JPG_QUALITY, progressive: true, mozjpeg: true })
    .toFile(jpgPath);
  const jpgSize = fs.statSync(jpgPath).size;
  console.log(
    `[import-map] image: ${(sourceSize / 1024).toFixed(0)}KB → ${(jpgSize / 1024).toFixed(0)}KB JPG`
  );

  // 2. spawn/layer JSON 생성
  const json = makeTiledJson(id, config.actNumber, config.spawns);
  const jsonPath = path.join(MAPS_DIR, `${id}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  console.log(`[import-map] json: ${config.spawns.length} spawn objects written`);

  // 3. 같은 ID 의 PNG/이전 확장자 정리 (소스가 그 폴더면 안 지움)
  const sourceAbs = path.resolve(sourcePath);
  for (const ext of ['png', 'jpeg', 'webp']) {
    const stale = path.join(MAPS_DIR, `${id}.${ext}`);
    if (fs.existsSync(stale) && path.resolve(stale) !== sourceAbs) {
      fs.unlinkSync(stale);
      console.log(`[import-map] cleaned stale ${path.basename(stale)}`);
    }
  }

  console.log(`[import-map] ✓ ${id} done`);
  console.log(`[import-map] spawns:`);
  for (const s of config.spawns) {
    console.log(`  - ${s.name} @ (${s.x}, ${s.y})`);
  }
}

main().catch((e) => {
  console.error('[import-map] FAILED:', e);
  process.exit(1);
});
