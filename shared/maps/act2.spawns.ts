// 2막 (냉각수 코어 식별) spawn 정의 — 단일 진실 원천.
// Act2Scene 과 scripts/import-map.ts 가 모두 여기서 좌표를 읽음.
// 위치 바꾸려면 이 파일만 수정. 그 다음 import-map.ts 다시 돌리면 JSON 갱신.

import type { MapSpawnConfig } from './types';
import { ACT2_CORE_COLORS } from '../lib/act2Logic';

const VIEW_W = 1280;
const CORE_SIZE = 56;
const CORE_GAP = 24;
const CORES_BASE_Y = 620;

// 6 코어 가로 정렬 (중앙) — Act2Scene 이 동일 계산식으로 spawn 매핑
const computeCoreSpawns = () => {
  const totalW =
    ACT2_CORE_COLORS.length * CORE_SIZE +
    (ACT2_CORE_COLORS.length - 1) * CORE_GAP;
  const startX = (VIEW_W - totalW) / 2 + CORE_SIZE / 2;
  return ACT2_CORE_COLORS.map((c, i) => ({
    name: `item_core_${c}`,
    x: Math.round(startX + i * (CORE_SIZE + CORE_GAP)),
    y: CORES_BASE_Y,
    width: CORE_SIZE,
    height: CORE_SIZE,
  }));
};

export const ACT2_SPAWNS: MapSpawnConfig = {
  actNumber: 2,
  spawns: [
    { name: 'playerspawn', x: 220, y: 500 },
    { name: 'npc_researcher', x: 160, y: 220 },
    { name: 'item_scale_center', x: 640, y: 360 },
    { name: 'item_inlet', x: 1100, y: 180, width: 180, height: 130 },
    ...computeCoreSpawns(),
  ],
};
