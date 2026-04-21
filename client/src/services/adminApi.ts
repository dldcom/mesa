// 관리자(ADMIN) 전용 에셋 CRUD 클라이언트 API
// 파일 기반 저장 (DB 아님) — mesa/assets/ 에 저장됨

import { getToken } from './api';

export type AssetType = 'characters' | 'items' | 'maps' | 'npcs';

export type AssetMetadata = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  imagePath?: string; // 이미지 있는 에셋은 /assets/<type>/<id>.<ext>
  [key: string]: unknown;
};

const authHeader = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ===== 목록 =====
export const listAssets = async (type: AssetType): Promise<AssetMetadata[]> => {
  const res = await fetch(`/api/admin/${type}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`목록 조회 실패 (${res.status})`);
  const data = (await res.json()) as { assets: AssetMetadata[] };
  return data.assets;
};

// ===== 단건 조회 =====
export const getAsset = async (
  type: AssetType,
  id: string
): Promise<AssetMetadata> => {
  const res = await fetch(`/api/admin/${type}/${id}`, { headers: authHeader() });
  if (!res.ok) throw new Error(`조회 실패 (${res.status})`);
  return res.json();
};

// ===== 삭제 =====
export const deleteAsset = async (type: AssetType, id: string): Promise<void> => {
  const res = await fetch(`/api/admin/${type}/${id}`, {
    method: 'DELETE',
    headers: authHeader(),
  });
  if (!res.ok) throw new Error(`삭제 실패 (${res.status})`);
};

// ===== 통합 업로드 (이미지 선택적) =====
// 모든 에셋 타입 (characters/items/maps/npcs) 에 사용
// - imageBlob 제공 시: 이미지 + JSON 저장
// - imageBlob 없을 때: JSON 만 저장
export const uploadAsset = async (
  type: AssetType,
  metadata: Record<string, unknown>,
  imageBlob?: Blob,
  imageFilename?: string
): Promise<AssetMetadata> => {
  const formData = new FormData();
  formData.append('metadata', JSON.stringify(metadata));
  if (imageBlob) {
    formData.append('image', imageBlob, imageFilename ?? 'asset.png');
  }

  const res = await fetch(`/api/admin/${type}/upload`, {
    method: 'POST',
    headers: authHeader(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `업로드 실패 (${res.status})`);
  }
  const data = (await res.json()) as { asset: AssetMetadata };
  return data.asset;
};
