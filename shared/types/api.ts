// HTTP API 요청/응답 타입

export type Role = 'ADMIN' | 'TEACHER';

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: {
    id: number;
    username: string;
    role: Role;
  };
};

export type CreateSessionResponse = {
  sessionCode: string;
};

// 에셋 API
export type CharacterAsset = {
  id: number;
  name: string;
  spriteData: unknown; // TODO: Maker 포팅 시 구체화
  createdAt: string;
};

export type ItemAsset = {
  id: number;
  name: string;
  imageUrl: string;
  type: string;
  metadata?: unknown;
  createdAt: string;
};

export type MapAsset = {
  id: number;
  name: string;
  actNumber: number;
  mapData: unknown;
  previewImage?: string;
  createdAt: string;
};
