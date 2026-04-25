// 캐릭터 메타데이터 — 픽커 UI / 자동 배정 / 스프라이트 키 매핑 단일 출처.
// id 는 assets/characters/<id>.png + .json 파일명과 정확히 일치해야 함.

import type { Character } from '../types/game';

export type CharacterMeta = {
  id: Character;
  name: string;        // 한글 표시명
  description: string; // 카드 한 줄 설명
};

export const CHARACTERS: readonly CharacterMeta[] = [
  { id: 'dragon', name: '드래곤', description: '용맹한 탐험가' },
  { id: 'mibam', name: '미밤',   description: '호기심 많은 탐색가' },
  { id: 'kotbam', name: '꽃밤',  description: '꽃밭의 수호자' },
  { id: 'subam', name: '수밤',   description: '물의 지혜를 가진 자' },
] as const;

export const CHARACTER_IDS: readonly Character[] = CHARACTERS.map((c) => c.id);

export const isCharacter = (v: unknown): v is Character =>
  typeof v === 'string' && (CHARACTER_IDS as readonly string[]).includes(v);

export const getCharacterMeta = (id: Character): CharacterMeta =>
  CHARACTERS.find((c) => c.id === id)!;
