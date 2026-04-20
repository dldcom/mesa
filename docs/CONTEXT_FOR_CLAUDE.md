# Claude Code 재개 컨텍스트

**이 문서를 먼저 읽어주세요.**

다른 컴퓨터 또는 새로운 세션에서 Claude Code 가 이 프로젝트를 이어서 작업할 때 필요한 모든 맥락을 여기에 담았습니다. 메모리(`~/.claude/projects/.../memory/`)는 컴퓨터마다 별도라 자동 전승되지 않으므로, 이 파일이 재개의 유일한 진실 원천입니다.

---

## 👤 사용자 프로필

- **직업**: 초등학교 교사 (`dldcom0701@gmail.com`)
- **목적**: 실제 수업에 쓸 교육용 게임 개발
- **기술 스택 선호**: Phaser + React + TypeScript (프론트) / Socket + Express + TypeScript (백) / PostgreSQL
- **Python 프로젝트 선호**: `uv` (이 프로젝트는 Node.js 이므로 해당 없음)
- **언어**: 한국어로 대화

---

## 🧭 설계 철학 (절대 잊지 말 것)

### 1. 로맨스 코드 절대 금지
- 시나리오/대사/연출 어디에도 로맨스 요소 금지
- "조용한 짝사랑", "몰래 준비한 선물", "못한 고백" 같은 뉘앙스도 포함
- 친구 간 정서적 연결은 OK, 애정/그리움 톤은 NO
- **이유**: 초등 교실용 콘텐츠, 사용자가 명시적으로 거부함

### 2. 멘사급 논리 퍼즐 선호
- "관찰해서 찾기" 수준 X
- 진짜 추론/연역/패턴/암호/저울/격자 퍼즐
- 퍼즐 제안 시 **실제 풀이 가능한 구체 정답 포함** 필수
- 빈 껍데기 "여기에 퍼즐이 들어갑니다" 금지

### 3. 공유 도전(Shared Challenge) 방식
- **역할 비대칭 안 씀** (각자 다른 역할/정보를 주는 설계 배제)
- 4명이 **같은 문제 화면** 을 보고 함께 머리 맞대는 구조
- 한국 초등 모둠활동 문화에 맞춤
- 단서가 필연적으로 분산되어야 할 때만 부분적 분산 (예: 2막 저울 단서 4개)

### 4. 감성 스토리가 게임의 80%
- 기술 구조만 설명하는 답변은 반쪽짜리
- 교실 맥락에서 어떤 감성이 유효한지 구체적으로 제시
- 단, **감성 = 감상주의 X**. 지적 호기심, 모험, 미지에의 경외, 정의 구현 등으로 풀 것

### 5. 소외되기 쉬운 학생 포용
- 조용한 아이, 느린 아이가 자연스럽게 참여할 장치를 설계에 먼저 반영
- 무임승차 방지 (특정 메커니즘: 단서 분산, 동시 입력, 개별 검증 등)

---

## 💻 기기 · 운영 환경

- **팀당 태블릿 4대** (학생 1인 1기기), 외장 키보드 없음
- **입력**: 터치 우선 (드래그, 탭, 회전). 필요하면 온스크린 키보드로 짧은 텍스트 가능
- **여러 팀 동시 운영** (한 반 6팀 정도)
- **교사 대시보드 = 관찰 전용**. 인게임 개입 기능 없음 (힌트 전송/시간연장/공지/강제종료 모두 X). 교사가 필요 시 대면으로 직접 지도

---

## 🎮 확정된 게임 설계 (바꾸지 말 것)

### 시나리오: 「프로젝트 M.E.S.A」
`docs/mesa-scenario.md` 에 4막 전체 · 정답 · 풀이 검증 완료.

- **1막 정답**: 경로 선택 **② — ① — ② — ①** (합 = 8/8)
- **2막 정답**: **파란색 코어** (= 7/4 = 1과 3/4)
- **3막 정답**: 암호 **3 — 1 — 4 — 2**
- **4막 정답**: 레버 **12시:3/8 · 3시:5/8 · 6시:6/8 · 9시:7/8** (합 = 2와 5/8)

### 역할 3계층
| 역할 | 로그인 | 접근 |
|---|---|---|
| **관리자 (ADMIN)** | ○ | 교사 기능 + 에셋 제작 도구 (Character/Item/Map Maker) |
| **교사 (TEACHER)** | ○ | 세션 생성, 팀 배정, 게임 시작/관찰 |
| **학생** | ✕ | 참여 코드로 입장 |

### 에셋 저장 방식 — **파일 기반 (DB 아님!)**

⚠️ **중요 설계 결정**: Character / Item / Map / NPC 같은 **게임 콘텐츠 에셋** 은 DB 가 아닌 **`mesa/assets/` 폴더에 파일로 저장**합니다.

```
mesa/assets/
├── characters/
│   ├── researcher.json     ← 메타데이터 (이름, 애니메이션 프레임 정의 등)
│   └── researcher.png      ← 스프라이트 이미지
├── items/
│   ├── cores/              ← 2막의 6개 색 코어
│   └── clues/              ← 2막의 4개 단서 카드
├── maps/
│   ├── act1_power_grid.json
│   ├── act2_scale_room.json
│   ├── act3_server_room.json
│   └── act4_control_room.json
└── npcs/
    └── ai_avatar.json      ← M.E.S.A AI 등
```

**왜 파일인가 (DB 대신)**:
- 에셋 제작자가 **선생님 1명** — 동시 수정 충돌 없음, DB 트랜잭션 불필요
- **고정 콘텐츠** (한 번 만들고 오래 씀) — 자주 변경되는 DB 의 강점 불필요
- **git 으로 버전 관리** — 누가 언제 무엇을 바꿨나 추적, 브랜치로 실험 가능
- **다른 PC 로 자동 전파** — `git clone` 만 하면 에셋 전부 따라옴. DB 데이터는 git 과 별개라 수동 덤프 필요
- **시나리오 코드와 함께 진화** — 1막 맵 바뀌면 1막 씬 코드도 바뀜. 같이 커밋되는 게 자연스러움

**왜 원래 DB 로 설계했다가 바꿨나 (역사)**:
레퍼런스인 `../safegame/` 이 DB 로 저장해서 그대로 따라갔음. 하지만 safegame 은 **학생들이 실시간으로 캐릭터 꾸미는 게이미피케이션** 이라 DB 가 맞았던 것. MESA 는 특성이 완전히 달라서 (단일 제작자 + 고정 콘텐츠) 파일이 훨씬 맞음. 이 판단 오류를 Maker 포팅 시점에 바로잡기로 함.

**적용 시점**: Maker 3종 포팅하는 단계에서 **동시에** 적용.
- `prisma/schema.prisma` 에서 `Character`, `Item`, `Map` 모델 제거 (NPC 도 추가될 예정이었다면 같이 제외)
- 새 Prisma 마이그레이션으로 해당 테이블 삭제
- Maker 백엔드 API (`POST /api/admin/characters` 등) 가 DB insert 대신 **파일 쓰기** 로 동작
- Phaser 씬이 DB fetch 가 아닌 **파일 로드** 로 에셋 사용

**DB 에 남기는 것** (절대 파일로 옮기지 말 것):
- `User` — 관리자/교사 로그인 계정 (비번 해시 등 민감 정보)
- `Session` — 세션 생성 기록 (코드, 교사, 시작/종료 시각)
- `TeamLog` — 게임 종료 후 팀별 소요 시간, 완료 막 수 등 분석 데이터

운영 데이터는 PC 마다 다른 게 정상이므로 DB 로 유지.

**에셋 → 게임 흐름**:
```
[관리자가 Maker 로 에셋 제작]
        ↓ POST /api/admin/...
[서버가 assets/ 폴더에 파일 저장]
        ↓ git commit (선생님이 수동으로)
        ↓ git push
        ↓ 다른 PC 에서 git pull
        ↓
[Phaser 씬이 파일에서 직접 로드]
```

**역할 분업**:
- 선생님: Maker 로 에셋 제작 + `git commit/push` 로 공유
- Claude: Phaser 씬에서 파일 읽어 게임 로직에 연결

---

## 🏛 아키텍처 원칙

### 1. 서버가 상태의 단일 진실 원천
- 팀 게임 상태(퍼즐 진행, 정답 판정 등)는 서버 메모리에 유지
- 클라이언트는 서버 상태를 **반영만**. 클라이언트끼리 직접 동기화 금지
- 정답 검증은 반드시 서버에서 (클라에서 하면 치팅 가능)

### 2. Socket.io 3층 룸 구조
```
session:<code>        ← 한 반 전체 (교사 + 모든 학생)
├── team:<id>         ← 한 팀 4명 (퍼즐 상태 격리)
└── teacher:<code>    ← 교사만 (집계 브로드캐스트)
```

### 3. 상태 저장소 구분
- **서버 메모리**: 실시간 게임 상태 (sessionManager 가 관리)
- **PostgreSQL**: 영속 데이터 — 유저 계정, 에셋(Character/Item/Map), 세션 완료 기록(TeamLog)

### 4. 타입 공유
- `shared/types/` 에 Socket 이벤트, 게임 상태, API 타입을 두고 클라/서버가 같은 파일 참조
- 경로 alias: `@shared/*` (클라 · 서버 tsconfig 양쪽에 설정됨)

---

## 📐 코드 스타일

- **TypeScript 전면 적용** (JS 쓰지 말 것). 단, Maker 포팅 시 처음엔 `any` 허용하되 돌아가게만 만들고 점진 개선
- **React**: 함수 컴포넌트 + Hooks. 클래스 컴포넌트 쓰지 말 것
- **상태 관리**: Zustand. Redux / Context 쓰지 말 것
- **주석 최소화**: 명명으로 의도를 전달. "왜" 가 비자명할 때만 한 줄 주석
- **과도한 추상화 금지**: 반복이 3번 이상 나오거나 실제 재사용 요구가 있을 때만 추상화 (YAGNI)
- **에러 처리는 경계에서만**: 내부 호출은 신뢰. 사용자 입력/외부 API 만 검증
- **불필요한 하위호환 가드 금지**: "나중에 필요할까봐"로 코드 남기지 말 것

---

## 🏗 인프라 결정 이력

### Docker Compose — 지금은 추가하지 않음 (검토 후 보류)

**결정**: 현재 시점에서는 `mesa` 에 docker-compose.yml 을 넣지 않음. Postgres 는 기존 safegame 과 **같은 네이티브 Postgres 인스턴스를 공유** (DB 이름만 `mesa` 로 분리).

**논의 맥락**:
- 다른 PC 에서 이어 작업할 때 Postgres 재세팅이 귀찮지 않냐는 질문 제기됨
- Docker Compose 쓰면 `docker compose up -d` 한 번에 Postgres 환경 복제 가능
- 하지만 선생님이 주로 쓰는 노트북 한 대에서 개발하는 단계라 지금은 오버킬

**나중에 추가해야 할 때**:
- 다른 PC 나 학교 노트북에 **실배포** 하는 단계
- 또는 여러 컴퓨터에서 자주 작업하게 될 때
- 이때 `docker-compose.yml` 에 Postgres 서비스 추가 + 포트 `5433:5432` 매핑 (safegame 의 5432 와 충돌 피해) + `.env.example` 포트 수정

**추가 시 고려**: 최종 배포 단계에서는 Postgres + 서버 + 클라이언트 3개 서비스 모두 컨테이너화 (safegame 의 docker-compose.yml 구조 참고).

### 포트 할당
- Postgres: **5432** (safegame 과 공유)
- MESA 서버: **3002** (3001 은 safegame 이 점유)
- MESA 클라: **5173** (Vite 기본)

### DB 생성 과정 (참고용)
- PostgreSQL 의 `admin` 계정이 기본적으로 `CREATEDB` 권한 없음 → `postgres` 슈퍼유저(비번 `safe1234`) 로 접속해 `ALTER USER admin CREATEDB;` 후 `CREATE DATABASE mesa OWNER admin;` 실행하여 DB 생성함
- 다른 PC 에서 동일 이슈 발생 시 같은 방법으로 해결

---

## ⚙️ 환경 설정 (실행 전 필수)

### 포트
- 클라이언트: **5173**
- 서버: **3002** (3001은 다른 프로젝트가 쓸 수도 있어 피함)
- Vite proxy 가 `/api` · `/socket.io` · `/uploads` 를 서버로 자동 라우팅

### PostgreSQL
- DB 이름: `mesa`
- 기본 접속: `postgresql://admin:safe1234@localhost:5432/mesa?schema=public`
- 만약 admin 계정이 CREATEDB 권한 없으면 postgres 슈퍼유저로 `ALTER USER admin CREATEDB;` 후 DB 생성
- 초기 관리자: `admin` / `changeme` (seed.ts)

### 환경 변수 (`server/.env`)
```
DATABASE_URL="postgresql://admin:safe1234@localhost:5432/mesa?schema=public"
JWT_SECRET="mesa-dev-secret-change-in-production"
PORT=3002
INITIAL_ADMIN_USERNAME="admin"
INITIAL_ADMIN_PASSWORD="changeme"
```

---

## 🔧 자주 쓰는 명령

```bash
# 개발 서버
npm run dev                       # 클라+서버 동시

# 타입 체크
npm run type-check --prefix client
npm run type-check --prefix server

# DB
npm run prisma:migrate            # 스키마 변경 후 마이그레이션
npm run prisma:studio --prefix server   # GUI 로 DB 보기
npm run seed --prefix server      # 관리자 계정 재생성

# tsx watch 가 변경 감지 실패할 때 — 수동 재시작 필요
# (현재 알려진 이슈: 파일 저장해도 서버 리로드 안 될 때가 있음)
netstat -ano | grep ":3002"       # PID 확인
taskkill //F //PID <PID>          # 죽이면 concurrently 가 알아서 재시작... 안 함
# → 그냥 전체 npm run dev 다시 실행이 안전
```

---

## 🔑 테스트용 계정 / 코드

- 관리자: `admin` / `changeme`
- 참여 코드: 세션 생성할 때마다 다르게 발급됨 (4자리, 혼동 글자 제외)
- 재접속 테스트: 학생으로 입장 후 localStorage `mesa_student_session` 키 확인

---

## 🚧 현재 작업 맥락 (커밋 시점 기준)

**마지막 완료된 것**: 재접속 기능 구현
- StudentInfo 에 `connected: boolean` 필드
- 서버: disconnect 시 제거하지 않고 표시만, `addStudent(reconnectId)` 로 재접속 경로 분기
- 클라: localStorage 에 `{sessionCode, studentId, name}` 저장 후 마운트 시 자동 재접속
- 교사 대시보드에서 🟢/🔴 아이콘으로 연결 상태 가시화

**다음으로 할 것**:
1. **3개 Maker 포팅 + 에셋 저장 방식 전환** (한 묶음으로 진행)
   - safegame 의 CharacterMaker / ItemMaker / MapMaker 를 TS 로 포팅
   - 동시에 **파일 기반 저장** 으로 설계 변경 (위 "에셋 저장 방식" 섹션 참조)
   - `prisma/schema.prisma` 에서 Character/Item/Map 모델 제거
   - API 가 파일로 저장하도록 구현
   - `mesa/assets/` 폴더 구조 확립
2. **1막 Phaser 씬 프로토타입** (분수 덧셈 퍼즐) — Maker 완료 후 에셋 사용
3. **2~4막 씬** 순차 구현
4. **교사 세션 복구** (새로고침 대비, 선택적)
5. **최종 배포 직전**: 전체 docker-compose 구성 (Postgres + server + client)

**사용자의 일반적 선호**:
- 작은 단위로 진행하며 확인 (한번에 너무 많이 하지 말 것)
- "ㄱ" / "ㅇㅇ" 식 간결한 확인 표현 자주 사용
- 모르는 기술 용어 설명 환영 (비유 잘 활용, 표로 정리)
- 설계 결정 전에 2~3개 선택지 제시 + 각 장단점 + 제 추천 방식
- 기능 구현 후 반드시 실제 동작 검증하고 결과 알려주기

---

## 🧑‍🏫 사용자와 대화할 때

- **한국어로 응답**
- **간결하게** — 불필요한 서두/맺음말 X
- **실제 코드 · 수치 · 정답 포함** — 추상적 설명만 금지
- **단계별 선택지 제시** — 진행 방향이 갈릴 수 있으면 2~3개로 제시, 각자 트레이드오프, 제 추천 언급
- **질문 환영 시 바로 답하기** — 사용자가 "이게 뭐야?" 물으면 **비유 + 표 + 구체 예시** 로 설명
- **이모지 금지** (사용자가 요청한 경우 제외). 단 UI 내 장식성 이모지는 문맥상 OK (🟢🔴 같은 상태 표시)
- **코드에 이모지 넣지 말 것** (로그 메시지, 주석 포함)

---

## 📎 참고 경로

- 시나리오 원본: `docs/mesa-scenario.md` (이 저장소)
- 사용자 메모리 (로컬 전용, 푸시 안 됨): `~/.claude/projects/C--Users-JY-Downloads-claude/memory/`
- 관련 레퍼런스 프로젝트(MESA와 별개): `../safegame/` — safegame 은 안전교육 게임이며, MESA 의 구조적 레퍼런스로만 참고
