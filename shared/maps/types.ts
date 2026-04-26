// 맵 spawn 정의 타입 (단일 진실 원천)
// 같은 정의를 클라 Scene 과 import-map.ts 스크립트가 모두 import.
// 한 군데 고치면 코드와 JSON 둘 다 자동 반영.

export type SpawnDef = {
  name: string;       // 'playerspawn' | 'npc_<key>' | 'item_<key>' 형식
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type MapSpawnConfig = {
  actNumber: number;
  spawns: SpawnDef[];
};

// 이름으로 spawn 조회. 못 찾으면 throw — 누락 즉시 발견.
export const requireSpawn = (
  config: MapSpawnConfig,
  name: string
): SpawnDef => {
  const s = config.spawns.find((sp) => sp.name === name);
  if (!s) throw new Error(`[spawn] missing "${name}" in spawn config`);
  return s;
};

// 접두사로 시작하는 spawn 들을 모두 반환 (예: 'item_core_' → 6개 코어)
export const filterSpawns = (
  config: MapSpawnConfig,
  prefix: string
): SpawnDef[] => config.spawns.filter((s) => s.name.startsWith(prefix));
