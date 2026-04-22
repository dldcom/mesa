// 1막 퍼즐 오버레이 모달
// 4명의 학생(A/B/C/D) 각자 시작값 + 경로 ①/② 중 1개 선택 → 확정 → 정답 판정.
// 현재는 솔로 테스트용 — 한 화면에서 4명분 전부 직접 눌러봄.

import { useEffect } from 'react';
import { usePuzzleStore, ACT1_PUZZLE } from '@/store/usePuzzleStore';
import { gameEventBus } from '@/lib/gameEventBus';
import { format } from '@shared/lib/fraction';
import type { StudentSlot, PathChoice } from '@shared/lib/act1Logic';

const SLOTS: StudentSlot[] = ['A', 'B', 'C', 'D'];

export default function Act1Puzzle() {
  const open = usePuzzleStore((s) => s.open);
  const phase = usePuzzleStore((s) => s.phase);
  const selections = usePuzzleStore((s) => s.selections);
  const evaluation = usePuzzleStore((s) => s.evaluation);
  const selectPath = usePuzzleStore((s) => s.selectPath);
  const confirmAct1 = usePuzzleStore((s) => s.confirmAct1);
  const closeAct1 = usePuzzleStore((s) => s.closeAct1);
  const resetAct1 = usePuzzleStore((s) => s.resetAct1);

  // 해결 시 Phaser 씬에 알림 (다음 방 문 열기 등)
  useEffect(() => {
    if (phase === 'solved') gameEventBus.emit('act1:solved');
  }, [phase]);

  if (!open) return null;

  const allSelected = SLOTS.every((s) => selections[s] != null);
  const locked = phase === 'submitting' || phase === 'solved';

  const handleClose = () => {
    closeAct1();
    gameEventBus.emit('act1:close');
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <header style={styles.header}>
          <h2 style={styles.title}>🔋 1막 — 전력망 동기화</h2>
          <button onClick={handleClose} style={styles.closeBtn} aria-label="닫기">
            ✕
          </button>
        </header>

        <p style={styles.subtitle}>
          네 학생의 도착값 합이 정확히 <b>8/8 (= 1)</b> 이 되어야 합니다. 각자
          두 경로 중 하나를 선택하세요.
        </p>

        <div style={styles.grid}>
          {SLOTS.map((slot) => (
            <StudentCard
              key={slot}
              slot={slot}
              choice={selections[slot]}
              onPick={(c) => !locked && selectPath(slot, c)}
              locked={locked}
            />
          ))}
        </div>

        <div style={styles.footer}>
          <ResultPanel phase={phase} evaluation={evaluation} />

          {phase === 'solved' ? (
            <button style={styles.primary} onClick={handleClose}>
              계속 진행 →
            </button>
          ) : phase === 'failed' ? (
            <button style={styles.primary} onClick={resetAct1}>
              다시 시도
            </button>
          ) : (
            <button
              style={{
                ...styles.primary,
                opacity: allSelected ? 1 : 0.4,
                cursor: allSelected ? 'pointer' : 'not-allowed',
              }}
              disabled={!allSelected || locked}
              onClick={confirmAct1}
            >
              확정
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 학생 1명 카드
// ─────────────────────────────────────────────
function StudentCard({
  slot,
  choice,
  onPick,
  locked,
}: {
  slot: StudentSlot;
  choice: PathChoice | null;
  onPick: (c: PathChoice) => void;
  locked: boolean;
}) {
  const def = ACT1_PUZZLE[slot];
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.badge}>{slot}</span>
        <span style={styles.startLabel}>
          시작값 <b>{format(def.start)}</b>
        </span>
      </div>

      <div style={styles.pathRow}>
        {([1, 2] as const).map((n) => {
          const p = def.paths[n];
          const active = choice === n;
          return (
            <button
              key={n}
              onClick={() => onPick(n)}
              disabled={locked}
              style={{
                ...styles.pathBtn,
                ...(active ? styles.pathBtnActive : null),
                ...(locked ? styles.pathBtnLocked : null),
              }}
            >
              <div style={styles.pathNum}>{n === 1 ? '①' : '②'}</div>
              <div style={styles.pathOp}>
                {p.op} {format(p.operand)}
              </div>
              <div style={styles.pathArrival}>→ {format(p.arrival)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 결과 패널
// ─────────────────────────────────────────────
function ResultPanel({
  phase,
  evaluation,
}: {
  phase: 'selecting' | 'submitting' | 'solved' | 'failed';
  evaluation: ReturnType<typeof usePuzzleStore.getState>['evaluation'];
}) {
  if (!evaluation) {
    return (
      <div style={styles.resultBox}>
        <span style={styles.resultLabel}>합계</span>
        <span style={styles.resultValue}>—</span>
      </div>
    );
  }

  const { sum, target, status, diff } = evaluation;
  const color =
    status === 'solved'
      ? '#22c55e'
      : status === 'overload'
        ? '#ef4444'
        : '#f59e0b';
  const msg =
    status === 'solved'
      ? '배터리 완충 — 통로 개방'
      : status === 'overload'
        ? `과부하 (+${format(diff)})`
        : `에너지 부족 (${format(diff)})`;

  return (
    <div style={{ ...styles.resultBox, borderColor: color }}>
      <div>
        <span style={styles.resultLabel}>합계</span>
        <span style={styles.resultValue}>
          {format(sum)} / {format(target)}
        </span>
      </div>
      <div style={{ ...styles.resultMsg, color }}>{msg}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 인라인 스타일 (임시 — 디자인 패스는 나중에)
// ─────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(5, 8, 20, 0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'Pretendard, sans-serif',
  },
  modal: {
    width: 'min(900px, 92vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
    border: '1px solid #334155',
    borderRadius: 16,
    padding: 28,
    color: '#e2e8f0',
    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { margin: 0, fontSize: 22, letterSpacing: '-0.02em' },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: 20,
    cursor: 'pointer',
    padding: 4,
  },
  subtitle: {
    margin: '0 0 20px',
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 14,
    marginBottom: 20,
  },
  card: {
    background: '#0b1220',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: 16,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: '#3b82f6',
    color: 'white',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
  },
  startLabel: { color: '#cbd5e1', fontSize: 14 },
  pathRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  pathBtn: {
    background: '#0f172a',
    border: '2px solid #1e293b',
    borderRadius: 10,
    padding: '12px 10px',
    cursor: 'pointer',
    color: '#e2e8f0',
    transition: 'all 0.15s ease',
    textAlign: 'center',
    fontFamily: 'inherit',
  },
  pathBtnActive: {
    borderColor: '#22d3ee',
    background: 'rgba(34,211,238,0.1)',
    boxShadow: '0 0 0 1px rgba(34,211,238,0.3)',
  },
  pathBtnLocked: { cursor: 'not-allowed', opacity: 0.6 },
  pathNum: { fontSize: 18, marginBottom: 4 },
  pathOp: { fontSize: 15, fontWeight: 600, color: '#93c5fd' },
  pathArrival: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    paddingTop: 16,
    borderTop: '1px solid #1e293b',
  },
  resultBox: {
    flex: 1,
    padding: '10px 14px',
    background: '#0b1220',
    border: '2px solid #1e293b',
    borderRadius: 10,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: { color: '#64748b', fontSize: 12, marginRight: 8 },
  resultValue: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' },
  resultMsg: { fontSize: 13, fontWeight: 600 },
  primary: {
    padding: '12px 24px',
    background: '#22d3ee',
    color: '#0f172a',
    border: 'none',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
