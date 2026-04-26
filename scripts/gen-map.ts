// 맵 배경 이미지 생성 스크립트 — Gemini 2.5 Flash Image (aka "Nano Banana") 사용
//
// 사용법:
//   npx tsx scripts/gen-map.ts <map-id>
// 예:
//   npx tsx scripts/gen-map.ts act2
//
// 환경변수: GEMINI_API_KEY (root .env 에서 로드)
// 출력: assets/maps/<map-id>.png + <map-id>.json (빈 Tiled 레이어 골격)
//
// 정책: 배경은 "오브젝트 자리 단서 없는" 완전 중립 환경만. 게임 오브젝트는 코드가 위에 덮어 그림.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── 간이 .env 파서 (의존성 X) ──
const loadEnv = (envPath: string) => {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
};

const PROJECT_ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(PROJECT_ROOT, '.env'));

// ── 맵별 프롬프트 정의 ──
// 핵심 원칙: 빈 환경만. 받침대·플랫폼·구멍·슈트 같은 "여기 뭐 놓일 자리" 일체 X.
//          톱다운 시점 + 16:9 + 1280×720 + 일관된 톤.

type MapPromptDef = {
  prompt: string;
  negative?: string;
};

const MAP_PROMPTS: Record<string, MapPromptDef> = {
  act2: {
    prompt: `Top-down bird's-eye-view 2D game map background, hand-painted illustrative style with crisp cel-shaded textures.

Scene: An empty industrial sci-fi cooling chamber inside an underground research facility. Camera looks straight down at the floor.

Floor: dark steel-gray metal plating with riveted seams forming a 32px grid pattern, faint cyan-blue ambient lighting from off-screen, mild oil stains and scratches showing wear, no objects placed.

Walls: thicker dark gray steel border around the perimeter, with subtle decorative pipes and cables running along walls, a few flush wall-mounted indicator lights with soft cyan glow, no doorways visible.

Atmosphere: cold, industrial, slightly ominous; muted color palette dominated by dark blue-gray with cyan accent lighting; uniform soft top lighting; no characters, no interactive objects, no pedestals, no platforms, no holes, no chutes, no labels, no text, no UI.

Aspect ratio: 16:9 widescreen (1280×720). Tile-friendly.

Style cues: top-down JRPG dungeon map, similar mood to a sci-fi facility floor in a 2D adventure game, painterly but clean.`,
    negative: `3D perspective, isometric, oblique angle, characters, people, animals, objects placed on floor, pedestals, platforms, machines, scales, balances, cores, cubes, levers, buttons, chutes, holes, pits, doors, signs, text, labels, UI, watermark, photographic, low resolution, blurry, jpeg artifacts.`,
  },
};

// ── Gemini API 호출 ──
const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function generateImage(apiKey: string, prompt: string): Promise<Buffer> {
  const url = `${GEMINI_URL}?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  console.log(`[gen-map] calling Gemini ${GEMINI_MODEL}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData);
  if (!imgPart?.inlineData) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(
      `No image in response. Text response: ${textPart ?? '(none)'}\nFull: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  return Buffer.from(imgPart.inlineData.data, 'base64');
}

// ── 동반 JSON (Tiled 형식 빈 골격 — 메이커가 인식하도록) ──
const makeMapJson = (id: string, actNumber: number, widthTiles: number, heightTiles: number) => ({
  id,
  name: id,
  actNumber,
  content: {
    compressionlevel: -1,
    height: heightTiles,
    infinite: false,
    layers: [
      {
        data: new Array(widthTiles * heightTiles).fill(0),
        height: heightTiles,
        id: 1,
        name: 'ground',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: widthTiles,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 2,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tileheight: 32,
    tilewidth: 32,
    type: 'map',
    version: '1.10',
    width: widthTiles,
  },
});

// ── 메인 ──
async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: npx tsx scripts/gen-map.ts <map-id>');
    console.error(`Known maps: ${Object.keys(MAP_PROMPTS).join(', ')}`);
    process.exit(1);
  }
  const def = MAP_PROMPTS[id];
  if (!def) {
    console.error(`No prompt defined for map id "${id}". Add to MAP_PROMPTS in scripts/gen-map.ts.`);
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set. Add it to .env at project root.');
    process.exit(1);
  }

  const fullPrompt = def.negative
    ? `${def.prompt}\n\nNEGATIVE PROMPT (do not include): ${def.negative}`
    : def.prompt;

  const imgBuf = await generateImage(apiKey, fullPrompt);

  const outDir = path.join(PROJECT_ROOT, 'assets', 'maps');
  fs.mkdirSync(outDir, { recursive: true });
  const pngPath = path.join(outDir, `${id}.png`);
  fs.writeFileSync(pngPath, imgBuf);
  console.log(`[gen-map] saved ${pngPath} (${imgBuf.length} bytes)`);

  // 동반 JSON — 1280×720 / 32px 타일 = 40×22.5 → 40×23 으로 반올림 (메이커가 보정)
  const json = makeMapJson(id, id === 'act2' ? 2 : 0, 40, 23);
  const jsonPath = path.join(outDir, `${id}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  console.log(`[gen-map] saved ${jsonPath}`);

  console.log('[gen-map] done. Reload BootScene + replace placeholder background in scene.');
}

main().catch((e) => {
  console.error('[gen-map] FAILED:', e);
  process.exit(1);
});
