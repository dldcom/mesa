# `assets/` — 게임 콘텐츠 저장소

이 폴더는 MESA 의 **캐릭터 · 아이템 · 맵 · NPC** 같은 게임 콘텐츠 에셋을 담습니다.

## 📦 구조

```
assets/
├── characters/    캐릭터 스프라이트 + 메타데이터
├── items/         게임 내 오브젝트 (코어, 단서 카드, 자물쇠 등)
├── maps/          1~4막 배경 맵 + 타일맵 데이터
└── npcs/          AI(MESA) 아바타 등 NPC
```

## 🎨 파일 형식

각 에셋은 보통 **2개 파일 세트**로 저장됩니다:

- `<name>.json` — 메타데이터 (ID, 이름, 애니메이션 프레임, 크기, 상호작용 타입 등)
- `<name>.png` — 스프라이트 이미지 (또는 맵의 경우 `<name>.tmj` Tiled 파일)

예시:
```
characters/
├── researcher.json    { "id": "researcher", "frames": [...] }
├── researcher.png
├── student.json
└── student.png
```

## 🛠 에셋은 어떻게 만드나

관리자 계정으로 로그인한 뒤 다음 도구 사용:

- **캐릭터 메이커** (`/admin/character-maker`)
- **아이템 메이커** (`/admin/item-maker`)
- **맵 메이커** (`/admin/map-maker`)

각 도구가 이 폴더에 파일을 저장합니다. **저장 후 반드시 `git commit` + `git push`** 해야 다른 PC 에서도 사용 가능.

## ❓ 왜 DB 가 아닌 파일인가

- **선생님 1명** 이 제작하므로 동시 편집 충돌 걱정 없음
- **고정 콘텐츠** — 한번 만들면 거의 안 바뀜
- **git 버전 관리** — "어느 커밋에서 캐릭터 디자인이 바뀌었나" 추적 가능
- **포터빌리티** — `git pull` 만으로 다른 PC 에 전파됨 (DB 데이터는 별도 덤프 필요)
- **시나리오와 함께 진화** — 맵이 바뀌면 씬 코드도 바뀌므로 같이 커밋되는 게 자연스러움

상세는 [`../docs/CONTEXT_FOR_CLAUDE.md`](../docs/CONTEXT_FOR_CLAUDE.md) 의 "에셋 저장 방식" 섹션 참조.
