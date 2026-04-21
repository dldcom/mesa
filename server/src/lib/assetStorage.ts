// 파일 기반 에셋 저장소
// mesa/assets/{characters,items,maps,npcs}/ 폴더에 JSON + 이미지 파일로 저장
// DB 저장 X — 이유: 선생님 1명 제작 / 고정 콘텐츠 / git 버전 관리 필요 / PC 간 이전 용이

import fs from 'node:fs/promises';
import path from 'node:path';

export type AssetType = 'characters' | 'items' | 'maps' | 'npcs';

export const ASSET_TYPES: readonly AssetType[] = [
  'characters',
  'items',
  'maps',
  'npcs',
] as const;

export const isAssetType = (x: string): x is AssetType =>
  (ASSET_TYPES as readonly string[]).includes(x);

// 메타데이터 기본 형태 (각 Maker 가 추가 필드를 확장)
export type AssetMetadata = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

// assets/ 폴더 경로 — 프로젝트 루트 기준
const ASSETS_ROOT = path.resolve(__dirname, '../../../assets');

const typeDir = (type: AssetType) => path.join(ASSETS_ROOT, type);
const metaPath = (type: AssetType, id: string) =>
  path.join(typeDir(type), `${id}.json`);
const imagePathOf = (type: AssetType, id: string, ext: string) =>
  path.join(typeDir(type), `${id}.${ext}`);

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const safeId = (raw: string): string => {
  // 파일 시스템 안전한 ID: 영숫자 + 하이픈 + 언더스코어만
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
};

export const generateAssetId = (baseName?: string): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const base = baseName ? safeId(baseName) : 'asset';
  return `${base}-${timestamp}${random}`;
};

// ===== 저장 (이미지 포함) =====
export const saveAssetWithImage = async (
  type: AssetType,
  id: string,
  metadata: { name: string; imageExt: string } & Record<string, unknown>,
  imageBuffer: Buffer
): Promise<AssetMetadata> => {
  await ensureDir(typeDir(type));
  const now = new Date().toISOString();

  const ext = metadata.imageExt.replace(/^\./, '');
  await fs.writeFile(imagePathOf(type, id, ext), imageBuffer);

  const fullMeta: AssetMetadata = {
    ...metadata,
    id,
    name: metadata.name,
    createdAt: now,
    updatedAt: now,
    imagePath: `/assets/${type}/${id}.${ext}`,
  };
  await fs.writeFile(
    metaPath(type, id),
    JSON.stringify(fullMeta, null, 2),
    'utf-8'
  );
  return fullMeta;
};

// ===== 저장 (JSON only, 예: 맵) =====
export const saveAssetJson = async (
  type: AssetType,
  id: string,
  metadata: { name: string } & Record<string, unknown>
): Promise<AssetMetadata> => {
  await ensureDir(typeDir(type));
  const now = new Date().toISOString();

  // 기존 createdAt 유지 (업데이트인 경우)
  let createdAt = now;
  try {
    const existing = JSON.parse(await fs.readFile(metaPath(type, id), 'utf-8'));
    if (existing.createdAt) createdAt = existing.createdAt;
  } catch {
    /* 파일 없으면 새로 생성 */
  }

  const fullMeta: AssetMetadata = {
    ...metadata,
    id,
    name: metadata.name,
    createdAt,
    updatedAt: now,
  };
  await fs.writeFile(
    metaPath(type, id),
    JSON.stringify(fullMeta, null, 2),
    'utf-8'
  );
  return fullMeta;
};

// ===== 목록 =====
export const listAssets = async (type: AssetType): Promise<AssetMetadata[]> => {
  await ensureDir(typeDir(type));
  const files = await fs.readdir(typeDir(type));
  const out: AssetMetadata[] = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const content = await fs.readFile(path.join(typeDir(type), f), 'utf-8');
      out.push(JSON.parse(content));
    } catch (err) {
      console.warn(`[assetStorage] 읽기 실패: ${f}`, err);
    }
  }
  // 최신 순 정렬
  return out.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

// ===== 단건 조회 =====
export const getAsset = async (
  type: AssetType,
  id: string
): Promise<AssetMetadata | null> => {
  try {
    const content = await fs.readFile(metaPath(type, id), 'utf-8');
    return JSON.parse(content) as AssetMetadata;
  } catch {
    return null;
  }
};

// ===== 삭제 =====
export const deleteAsset = async (
  type: AssetType,
  id: string
): Promise<boolean> => {
  const meta = await getAsset(type, id);
  if (!meta) return false;

  // 메타 파일 삭제
  try {
    await fs.unlink(metaPath(type, id));
  } catch {
    /* ignore */
  }

  // 이미지 파일 삭제 (확장자 추측)
  for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
    try {
      await fs.unlink(imagePathOf(type, id, ext));
      break; // 하나라도 지우면 충분
    } catch {
      /* 해당 확장자 없음 */
    }
  }
  return true;
};
