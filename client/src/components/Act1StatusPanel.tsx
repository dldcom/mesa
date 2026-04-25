// 1막 우상단 상태 패널 — 내 "원래 분수"만 표시.
// 도착값/팀 합 계산은 의도적으로 보여주지 않는다 (학생이 직접 계산).

import { useAct1Store } from '@/store/useAct1Store';
import { ACT1_PUZZLE } from '@shared/lib/act1Logic';
import { format } from '@shared/lib/fraction';

export default function Act1StatusPanel() {
  const visible = useAct1Store((s) => s.visible);
  const currentSlot = useAct1Store((s) => s.currentSlot);

  if (!visible) return null;

  const myStart = ACT1_PUZZLE[currentSlot].start;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.actTag}>1막</span>
        <span style={styles.title}>전력망 동기화</span>
      </div>

      <div style={styles.mySection}>
        <div style={styles.slotBadge}>{currentSlot} 방</div>
        <div style={styles.myLine}>
          <span style={styles.myLabel}>내 분수</span>
          <strong style={styles.myValue}>{format(myStart)}</strong>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 200,
    padding: '14px 16px 12px',
    background: 'rgba(15, 23, 42, 0.94)',
    border: '1.5px solid #3b82f6',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    color: '#e2e8f0',
    fontFamily: 'Pretendard, sans-serif',
    fontSize: 13,
    zIndex: 500,
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  actTag: {
    padding: '2px 8px',
    background: '#3b82f6',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#fff',
  },
  title: {
    fontSize: 13,
    color: '#93c5fd',
    fontWeight: 600,
  },
  mySection: {
    background: 'rgba(251, 191, 36, 0.08)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    borderRadius: 6,
    padding: '10px 12px',
  },
  slotBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#fbbf24',
    color: '#0f172a',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  myLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  myLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  myValue: {
    color: '#fde68a',
    fontSize: 24,
    fontWeight: 700,
    fontFamily: '"Courier New", monospace',
  },
};
