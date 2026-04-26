// shared/maps barrel export
// 새 맵의 spawn 정의 추가 시 여기에 export 한 줄 추가하면 import-map.ts 가 자동 인식.

export * from './types';

import type { MapSpawnConfig } from './types';
import { ACT2_SPAWNS } from './act2.spawns';

// 맵 id → spawn config 레지스트리
export const SPAWN_REGISTRY: Record<string, MapSpawnConfig> = {
  act2: ACT2_SPAWNS,
  // act3: ACT3_SPAWNS,
  // act4: ACT4_SPAWNS,
};
