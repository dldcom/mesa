// 2막 우상단 단서 패널 — 본인 슬롯 단서 1장 + 코어 무게 후보 박스.
// 각 학생은 자기 단서만 보고, 친구들과 입으로 공유해야 풀린다 (강제 협력).

import { useState } from 'react';
import { useAct2Store } from '@/store/useAct2Store';
import { ACT2_CLUES, ACT2_CANDIDATE_WEIGHTS } from '@shared/lib/act2Logic';
import { format, formatMixed } from '@shared/lib/fraction';

export default function Act2CluePanel() {
  const visible = useAct2Store((s) => s.visible);
  const slot = useAct2Store((s) => s.slot);
  const [collapsed, setCollapsed] = useState(false);

  if (!visible || !slot) return null;

  const clue = ACT2_CLUES[slot];

  return (
    <div style={styles.panel}>
      <div style={styles.header} onClick={() => setCollapsed((c) => !c)}>
        <span style={styles.actTag}>2막</span>
        <span style={styles.title}>냉각수 코어 식별</span>
        <span style={styles.toggle}>{collapsed ? '▼' : '▲'}</span>
      </div>

      {!collapsed && (
        <>
          <div style={styles.section}>
            <div style={styles.sectionLabel}>📋 내 단서 ({slot})</div>
            <div style={styles.clueCard}>{clue.text}</div>
          </div>

          <div style={styles.section}>
            <div style={styles.sectionLabel}>⚖️ 코어 무게 후보 (각 1개씩)</div>
            <div style={styles.weights}>
              {ACT2_CANDIDATE_WEIGHTS.map((w) => (
                <span key={format(w)} style={styles.weightChip} title={formatMixed(w)}>
                  {format(w)}
                </span>
              ))}
            </div>
          </div>

          <div style={styles.hint}>
            친구들과 단서를 말해서 공유하세요.<br />
            저울로 무게를 비교할 수 있어요.
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 260,
    padding: '12px 14px',
    background: 'rgba(15, 23, 42, 0.95)',
    border: '2px solid #3b82f6',
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
    color: '#e2e8f0',
    fontFamily: 'Pretendard, sans-serif',
    zIndex: 400,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    paddingBottom: 8,
    borderBottom: '1px solid #1e293b',
  },
  actTag: {
    padding: '2px 8px',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 4,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 13,
    fontWeight: 700,
    color: '#fde68a',
    flex: 1,
  },
  toggle: {
    color: '#64748b',
    fontSize: 11,
  },
  section: {
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 6,
    fontWeight: 600,
  },
  clueCard: {
    padding: '10px 12px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    color: '#fde68a',
  },
  weights: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  weightChip: {
    padding: '4px 10px',
    background: '#1e293b',
    border: '1px solid #475569',
    borderRadius: 999,
    fontSize: 13,
    color: '#cbd5e1',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  hint: {
    marginTop: 10,
    padding: '8px 10px',
    background: '#0c1424',
    borderRadius: 6,
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 1.5,
  },
};
