// 대기창에서 자기 캐릭터를 고르는 2x2 카드 그리드.
// 팀 배정 후에만 표시 — 팀 단위로 유니크하게 고를 수 있음.
// 흐름: 카드 탭으로 미리보기(focus) → 하단의 단일 [선택] 버튼으로 확정
// 호버 시 4방향(down→right→up→left) 프레임 순환.
// 같은 팀에서 이미 누가 고른 캐릭터는 잠금 표시.

import { useEffect, useState, useMemo } from 'react';
import { CHARACTERS } from '@shared/lib/characters';
import type { Character } from '@shared/types/game';
import { getSocket } from '@/services/socket';
import {
  useSessionStore,
  findMyTeam,
} from '@/store/useSessionStore';

// dragon.json 의 atlasData.meta.size
const SHEET_W = 288;
const SHEET_H = 256;
const FRAME_W = 48;
const FRAME_H = 64;
const SCALE = 2;

// 4방향 프레임의 첫 컷 좌표 (행 0~3, 열 0)
const PREVIEW_FRAMES: Array<[number, number]> = [
  [0, 0], // down_0
  [0, 2], // right_0  (행 2)
  [0, 1], // up_0     (행 1)
  [0, 3], // left_0   (행 3)
];

const HOVER_INTERVAL_MS = 280;

export default function CharacterPicker() {
  const studentId = useSessionStore((s) => s.studentId);
  const snapshot = useSessionStore((s) => s.snapshot);

  const myTeam = findMyTeam(snapshot, studentId);

  // 내 캐릭터 + 팀원 캐릭터 (팀 배정 후에만 의미 있음)
  const { mine, takenByOthers } = useMemo(() => {
    const taken = new Map<Character, string>();
    if (!myTeam) return { mine: null, takenByOthers: taken };
    const team = snapshot?.teams.find((t) => t.id === myTeam.id);
    let me: Character | null = null;
    for (const s of team?.students ?? []) {
      if (s.id === studentId) {
        me = s.character ?? null;
      } else if (s.character) {
        taken.set(s.character, s.name);
      }
    }
    return { mine: me, takenByOthers: taken };
  }, [snapshot, studentId, myTeam]);

  // 미리보기로 강조할 카드 (탭하면 여기에만 들어가고, 확정은 [선택] 버튼으로)
  const [focused, setFocused] = useState<Character | null>(null);

  // 초기/리셋: mine 이 있으면 그걸로, 없으면 첫 번째로 가능한 캐릭터를 자동 focus
  // (팀 충돌로 서버가 본인 캐릭터를 클리어한 경우에도 적절한 기본값 유지)
  useEffect(() => {
    if (mine) {
      setFocused(mine);
      return;
    }
    if (focused === null || takenByOthers.has(focused)) {
      const firstAvailable = CHARACTERS.find((c) => !takenByOthers.has(c.id));
      setFocused(firstAvailable?.id ?? null);
    }
  }, [mine, takenByOthers, focused]);

  const focusedLockedBy = focused ? takenByOthers.get(focused) : undefined;
  const focusedIsMine = focused !== null && focused === mine;

  // [선택] 버튼 상태
  let actionLabel: string;
  let actionDisabled: boolean;
  if (!focused) {
    actionLabel = '캐릭터를 골라주세요';
    actionDisabled = true;
  } else if (focusedLockedBy) {
    actionLabel = `🔒 ${focusedLockedBy} 친구가 선택`;
    actionDisabled = true;
  } else if (focusedIsMine) {
    actionLabel = '✓ 선택 해제';
    actionDisabled = false;
  } else {
    actionLabel = '선택';
    actionDisabled = false;
  }

  const handleAction = () => {
    if (actionDisabled || !focused) return;
    const socket = getSocket();
    if (focusedIsMine) {
      socket.emit('student:selectCharacter', { character: null });
    } else {
      socket.emit('student:selectCharacter', { character: focused });
    }
  };

  // 팀 배정 전에는 픽커 자체를 안 보여줌 (팀 단위 유니크가 의미 있도록)
  if (!myTeam) return null;

  return (
    <div style={styles.wrap}>
      <p style={styles.heading}>🎭 내 캐릭터 고르기</p>
      <p style={styles.sub}>
        카드를 눌러 미리보고, 마음에 드는 캐릭터에서 아래 [선택] 버튼을 누르세요.
        시작 직전까지 자유롭게 변경할 수 있어요.
      </p>
      <div style={styles.grid}>
        {CHARACTERS.map((c) => {
          const lockedBy = takenByOthers.get(c.id);
          const isMine = mine === c.id;
          const isFocused = focused === c.id;
          return (
            <CharacterCard
              key={c.id}
              id={c.id}
              name={c.name}
              description={c.description}
              isMine={isMine}
              isFocused={isFocused}
              lockedBy={lockedBy}
              onClick={() => {
                if (lockedBy) return;
                setFocused(c.id);
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        style={{
          ...styles.actionBtn,
          ...(focusedIsMine ? styles.actionBtnMine : null),
          ...(actionDisabled ? styles.actionBtnDisabled : null),
        }}
        disabled={actionDisabled}
        onClick={handleAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

type CardProps = {
  id: Character;
  name: string;
  description: string;
  isMine: boolean;
  isFocused: boolean;
  lockedBy?: string;
  onClick: () => void;
};

function CharacterCard({
  id,
  name,
  description,
  isMine,
  isFocused,
  lockedBy,
  onClick,
}: CardProps) {
  const [hovering, setHovering] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);

  // 호버하는 동안 4방향 프레임 순환 (down → right → up → left)
  useEffect(() => {
    if (!hovering) {
      setFrameIdx(0);
      return;
    }
    const id = setInterval(() => {
      setFrameIdx((i) => (i + 1) % PREVIEW_FRAMES.length);
    }, HOVER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hovering]);

  const [col, row] = PREVIEW_FRAMES[frameIdx];
  const bgX = -col * FRAME_W * SCALE;
  const bgY = -row * FRAME_H * SCALE;

  const disabled = !!lockedBy;
  const cardStyle: React.CSSProperties = {
    ...styles.card,
    ...(isFocused ? styles.cardFocused : null),
    ...(isMine ? styles.cardMine : null),
    ...(disabled ? styles.cardDisabled : null),
  };

  return (
    <button
      type="button"
      style={cardStyle}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      <div style={styles.spriteWrap}>
        <div
          style={{
            ...styles.spriteFrame,
            backgroundImage: `url(/assets/characters/${id}.png)`,
            backgroundPosition: `${bgX}px ${bgY}px`,
            backgroundSize: `${SHEET_W * SCALE}px ${SHEET_H * SCALE}px`,
          }}
        />
        {isMine && <div style={styles.selectedOverlay}>✓ 선택완료</div>}
      </div>
      <div style={styles.cardName}>{name}</div>
      <div style={styles.cardDesc}>{description}</div>
      {disabled && (
        <div style={styles.lockedTag}>🔒 {lockedBy}</div>
      )}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    width: '100%',
    maxWidth: 520,
    padding: 20,
    border: '1px solid #374151',
    borderRadius: 12,
    background: '#0f172a',
  },
  heading: {
    margin: 0,
    color: '#fde68a',
    fontSize: 17,
    fontWeight: 700,
    textAlign: 'center',
  },
  sub: {
    margin: '6px 0 16px',
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 14,
  },
  card: {
    position: 'relative',
    padding: '12px 8px 10px',
    background: '#1e293b',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#334155',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'border-color 120ms ease, background 120ms ease, box-shadow 120ms ease',
    color: '#e2e8f0',
    fontFamily: 'Pretendard, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  cardFocused: {
    borderColor: '#3b82f6',
    background: '#172554',
    boxShadow: '0 0 12px rgba(59, 130, 246, 0.4)',
  },
  cardMine: {
    borderColor: '#fbbf24',
    background: '#3a2e0e',
    boxShadow: '0 0 16px rgba(251, 191, 36, 0.45)',
  },
  cardDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  spriteWrap: {
    position: 'relative',
    width: FRAME_W * SCALE,
    height: FRAME_H * SCALE,
  },
  spriteFrame: {
    width: '100%',
    height: '100%',
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  },
  selectedOverlay: {
    position: 'absolute',
    top: -10,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '3px 8px',
    background: '#fbbf24',
    color: '#1c1917',
    fontSize: 11,
    fontWeight: 800,
    borderRadius: 999,
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
    pointerEvents: 'none',
  },
  cardName: {
    fontSize: 16,
    fontWeight: 700,
  },
  cardDesc: {
    fontSize: 11,
    color: '#94a3b8',
  },
  lockedTag: {
    fontSize: 10,
    color: '#94a3b8',
  },
  actionBtn: {
    width: '100%',
    padding: '12px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    fontFamily: 'Pretendard, sans-serif',
    cursor: 'pointer',
    transition: 'background 120ms ease',
  },
  actionBtnMine: {
    background: '#fbbf24',
    color: '#1c1917',
  },
  actionBtnDisabled: {
    background: '#374151',
    color: '#94a3b8',
    cursor: 'not-allowed',
  },
};
