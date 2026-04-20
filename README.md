# 프로젝트 M.E.S.A

> **Mathematical Energy Stabilization Array**
> 초등 4학년 수학 "분수" 단원을 위한 4인 협동 방탈출 게임

교실에서 팀당 태블릿 4대씩 둘러앉아, 분수 퍼즐 4막을 협동으로 풀어나가는 교육용 게임입니다.

---

## 🎯 개요

| 항목 | 내용 |
|---|---|
| **대상** | 초등학교 4학년 |
| **교과 목표** | 분수의 덧셈/뺄셈(동분모), 가분수↔대분수, 부분과 전체, 크기 비교 |
| **플레이 구조** | 팀당 4명, 각자 태블릿 1대 |
| **세션 시간** | 약 40~50분 (1차시 수업) |
| **게임 구성** | 프롤로그 + 4막 + 엔딩 |

시나리오·퍼즐·정답은 [`docs/mesa-scenario.md`](docs/mesa-scenario.md) 참조.

---

## 🏗 기술 스택

- **클라이언트**: React 18 · TypeScript · Vite · Phaser 3 · Zustand · React Router
- **서버**: Express · Socket.io · TypeScript · Prisma
- **DB**: PostgreSQL
- **인증**: JWT (localStorage 저장)
- **실시간 통신**: Socket.io (3층 룸 구조)

### Socket 3층 룸 구조
```
session:<code>        ← 한 반 전체 (전체 공지, 대기창 상태)
├── team:<id>         ← 각 팀 4명 (퍼즐 상태 격리)
└── teacher:<code>    ← 교사 전용 (집계 정보)
```

---

## 📦 폴더 구조

```
mesa/
├── shared/types/            ← 클라/서버 공유 타입 (Socket 이벤트, 게임 상태)
│   ├── game.ts              Fraction, TeamState, SessionState, ActState, StudentInfo
│   ├── events.ts            ServerToClientEvents, ClientToServerEvents, PuzzleAction
│   └── api.ts               HTTP 요청/응답 타입
│
├── client/                  ← React + Phaser
│   ├── index.html / vite.config.ts / tsconfig.json
│   └── src/
│       ├── App.tsx          ← React Router (역할별 접근 가드 포함)
│       ├── views/
│       │   ├── StudentEntryPage.tsx    참여 코드 + 이름 입력, 자동 재접속 지원
│       │   ├── StudentWaitPage.tsx     대기창
│       │   ├── LoginPage.tsx           교사/관리자 로그인
│       │   ├── TeacherDashboard.tsx    세션 생성, 팀 배정, 게임 시작/관찰
│       │   ├── GamePage.tsx            Phaser 씬 마운트 (TODO)
│       │   └── admin/
│       │       ├── CharacterMaker.tsx  (포팅 대기)
│       │       ├── ItemMaker.tsx       (포팅 대기)
│       │       └── MapMaker.tsx        (포팅 대기)
│       ├── scenes/          ← Phaser 씬 (현재 비어있음, 1~4막 TODO)
│       ├── components/
│       │   └── ProtectedRoute.tsx     인증/역할 가드
│       ├── store/
│       │   ├── useAuthStore.ts        JWT + user role
│       │   └── useSessionStore.ts     세션 · 학생 정체성 · localStorage 영속
│       ├── services/
│       │   ├── socket.ts              Socket.io 싱글톤
│       │   └── api.ts                 HTTP 래퍼 (자동 Authorization 헤더)
│       └── utils/
│           └── fraction.ts            분수 연산 (add, subtract, compare, toMixed ...)
│
└── server/                  ← Express + Socket.io
    ├── prisma/
    │   ├── schema.prisma    User, Session, TeamLog, Character, Item, Map
    │   ├── seed.ts          초기 관리자 계정 생성
    │   └── migrations/
    └── src/
        ├── index.ts         진입점
        ├── app.ts           Express 앱 팩토리
        ├── lib/
        │   ├── prisma.ts    Prisma 클라이언트 싱글톤
        │   └── jwt.ts       JWT sign / verify
        ├── middleware/
        │   └── auth.ts      requireAuth · requireAdmin
        ├── routes/
        │   ├── auth.ts      POST /api/auth/login · GET /api/auth/me
        │   └── session.ts   POST /api/session · GET /api/session/:code
        ├── sockets/
        │   ├── index.ts     Socket.io 셋업
        │   ├── teacherHandlers.ts   교사 이벤트 (세션 참가, 팀 관리, 게임 시작)
        │   └── studentHandlers.ts   학생 이벤트 (입장, 재접속, disconnect)
        └── game/
            └── sessionManager.ts    메모리 기반 세션 상태 매니저
```

---

## ✅ 구현된 기능

### 인증 시스템
- JWT 기반 로그인 (`POST /api/auth/login`, `GET /api/auth/me`)
- `ADMIN` / `TEACHER` 역할 구분
- `requireAuth` · `requireAdmin` 미들웨어
- 클라이언트: `ProtectedRoute` 컴포넌트로 라우트 가드
- 토큰은 localStorage 에 저장 (키: `mesa_auth_token`)

### 세션 · 팀 관리
- 교사가 세션 생성 시 4자리 코드 발급 (혼동 글자 제외)
- 학생은 코드 + 이름으로 입장 (로그인 없음)
- 교사 대시보드에서:
  - 팀 생성 (+ 새 팀 버튼, 이름 자유)
  - 학생 카드 → 팀 버튼 클릭으로 배정
  - 자동 배정 (🎲) — 미배정 학생을 랜덤 셔플 후 4명씩 채움
  - 팀 삭제 (학생은 미배정 풀로 되돌아감)
  - 게임 시작 (모든 팀 4명 꽉 차야 활성화)
- 학생 대기창에서 실시간 배정 상태 반영

### 재접속 (Resilience)
- 학생 입장 성공 시 localStorage 에 `{ sessionCode, studentId, name }` 저장 (키: `mesa_student_session`)
- 브라우저 크래시/탭 닫힘 등으로 튕겨도 같은 URL 재접속 시 자동 복귀
- 서버는 학생을 **제거하지 않고** `connected: false` 표시만
- 게임 진행 중(`phase: 'playing'`)에도 기존 학생 재접속 허용 (신규 참가는 차단)
- 교사 대시보드에서 🟢 / 🔴 아이콘으로 연결 상태 표시

### Socket 이벤트 (현재 구현)
**학생 → 서버**
- `student:enter { sessionCode, name, reconnectId? }` — 입장 또는 재접속
- `student:leave` — 명시적 나가기 (영구 제거)

**교사 → 서버**
- `teacher:joinSession { sessionCode }`
- `teacher:createTeam { teamName }`
- `teacher:removeTeam { teamId }`
- `teacher:assignToTeam { studentId, teamId }`
- `teacher:unassignStudent { studentId }`
- `teacher:autoAssign` — 자동 배정
- `teacher:startGame`

**서버 → 클라**
- `session:joined { sessionCode, studentId, phase }`
- `session:state { phase, unassignedStudents, teams }`
- `teacher:sessionState { ...full }` — 교사에게만
- `game:started { teamId }`
- `error { code, message }`

---

## 🚧 TODO (다음 단계)

### 가까운 우선순위
- [ ] **3개 Maker 포팅** — safegame 의 CharacterMaker / ItemMaker / MapMaker 를 TypeScript 로 포팅 (관리자 전용, DB 저장)
- [ ] **1막 Phaser 씬** — 전력망 동기화 (분수 덧셈/뺄셈 + 4인 동시 선택)
- [ ] **2막** — 냉각수 코어 식별 (저울 추리 + 단서 분산)
- [ ] **3막** — AI 오버라이드 암호 (원판 중첩 시각)
- [ ] **4막** — 최종 제어실 (레버 동기화 + 제약 만족)

### 중기 과제
- [ ] 게임 상태 매니저 (팀별 진행 상태 메모리 관리)
- [ ] 막별 정답 검증 로직 (서버에서 권위 있게 판정)
- [ ] 교사 관찰 대시보드 (팀별 진행률, 정체 감지)
- [ ] 프롤로그 · 엔딩 시네마틱 씬
- [ ] 게임 종료 후 결과 페이지 + `TeamLog` 저장

### 장기 · 선택 과제
- [ ] 교사 세션 복구 (교사 페이지 새로고침 시 sessionCode 유지)
- [ ] 힌트 시스템 (각 막 단계별 힌트)
- [ ] 배경 음악 · 효과음
- [ ] 컨텐츠 확장 툴 (관리자 에셋 CRUD UI)

미해결 설계 항목은 [`docs/mesa-scenario.md#미해결--차후-결정-사항`](docs/mesa-scenario.md) 참조.

---

## 🚀 설정 및 실행

### 사전 요구사항
- Node.js 20+ (npm 포함)
- PostgreSQL 14+ 실행 중 (로컬 또는 docker)

### 최초 설정
```bash
# 1. 의존성 일괄 설치
npm run install:all

# 2. 서버 환경변수
cd server
cp .env.example .env
# .env 파일 열어서 DATABASE_URL 을 본인 Postgres 에 맞게 수정
# JWT_SECRET 는 운영 전 반드시 변경

# 3. DB 마이그레이션 + 초기 관리자 계정 생성
npm run prisma:migrate
npm run seed
# 기본 관리자: admin / changeme

cd ..
```

### 개발 모드
```bash
npm run dev
# → 클라이언트(5173) + 서버(3002) 동시 실행
```

태블릿 여러 대에서 접속하려면 `http://<개발PC-IP>:5173` 사용 (Vite 가 `host: true` 로 설정됨).

### 주요 URL
| 경로 | 용도 |
|---|---|
| `/` | 학생 진입 (참여 코드 입력) |
| `/wait` | 학생 대기창 |
| `/login` | 교사/관리자 로그인 |
| `/teacher` | 교사 대시보드 (세션 관리) |
| `/game` | 게임 화면 (Phaser, TODO) |
| `/admin/character-maker` | 캐릭터 메이커 (관리자 전용, TODO) |
| `/admin/item-maker` | 아이템 메이커 (관리자 전용, TODO) |
| `/admin/map-maker` | 맵 메이커 (관리자 전용, TODO) |

---

## 📚 관련 문서

- [`docs/mesa-scenario.md`](docs/mesa-scenario.md) — **시나리오 · 퍼즐 정답 · 풀이 · 설계 노트** (진실의 원천)
- [`docs/CONTEXT_FOR_CLAUDE.md`](docs/CONTEXT_FOR_CLAUDE.md) — **Claude Code 재개용 컨텍스트** (다른 컴퓨터에서 이어 작업 시 필독)

---

## 🤝 협업 모델

이 프로젝트는 초등학교 교사(도메인/교육 설계 · 에셋 제작)와 Claude Code(게임 엔지니어링)의 협업으로 개발됩니다.

- **교사**: 시나리오 · 퍼즐 교과 의도 · 캐릭터/아이템/맵 에셋 제작 · 실제 수업 테스트
- **Claude**: 게임 로직 · 서버 아키텍처 · Phaser 씬 구현 · 디버깅

각 역할의 책임은 `docs/CONTEXT_FOR_CLAUDE.md` 에 명시.

---

## 📝 라이선스

Private / 교육용 내부 사용.
