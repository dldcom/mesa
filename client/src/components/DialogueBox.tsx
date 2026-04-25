// 하단 visual-novel 스타일 대사 박스.
// 타이핑 효과 + Space/Enter/탭 으로 다음. 타이핑 중 누르면 즉시 완성.
// 마지막 줄에 choices 가 있으면 타이핑 완료 후 선택지 UI 표시.
// 방향키 ↑/↓ 로 포커스 이동 · Space/Enter 로 확정 · 클릭/탭도 가능.

import { useEffect, useRef, useState } from 'react';
import { useDialogueStore } from '@/store/useDialogueStore';

const TYPING_MS = 22;

export default function DialogueBox() {
  const open = useDialogueStore((s) => s.open);
  const lines = useDialogueStore((s) => s.lines);
  const index = useDialogueStore((s) => s.index);
  const next = useDialogueStore((s) => s.next);
  const choose = useDialogueStore((s) => s.choose);

  const line = lines[index];
  const [typed, setTyped] = useState('');
  const [focused, setFocused] = useState(0);
  const typingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const completeTyping = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    typingRef.current = false;
  };

  // 줄 바뀔 때마다 포커스 초기화 + 타이핑
  useEffect(() => {
    if (!open || !line) return;
    setFocused(0);
    const target = line.text;
    setTyped('');
    typingRef.current = true;
    let i = 0;
    intervalRef.current = setInterval(() => {
      i++;
      setTyped(target.slice(0, i));
      if (i >= target.length) completeTyping();
    }, TYPING_MS);
    return completeTyping;
  }, [open, index, line]);

  const hasChoices = !!line?.choices?.length;
  const typingDone = !!line && typed === line.text;

  // 키보드 입력
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // 타이핑 중 Space/Enter → 즉시 완성
      if (typingRef.current && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        if (line) {
          completeTyping();
          setTyped(line.text);
        }
        return;
      }

      if (!typingDone) return;

      // 선택지가 있는 줄
      if (hasChoices && line?.choices) {
        const n = line.choices.length;
        if (e.code === 'ArrowDown') {
          e.preventDefault();
          setFocused((f) => (f + 1) % n);
          return;
        }
        if (e.code === 'ArrowUp') {
          e.preventDefault();
          setFocused((f) => (f - 1 + n) % n);
          return;
        }
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          choose(line.choices[focused].value);
          return;
        }
        return;
      }

      // 일반 줄 — Space/Enter 로 다음
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, choose, line, hasChoices, typingDone, focused]);

  if (!open || !line) return null;

  const advance = () => {
    if (typingRef.current) {
      completeTyping();
      setTyped(line.text);
    } else if (!hasChoices) {
      next();
    }
  };

  return (
    <div style={styles.overlay} onClick={advance}>
      <div style={styles.box}>
        {line.speaker && <div style={styles.speaker}>{line.speaker}</div>}
        <div style={styles.text}>{typed}</div>

        {hasChoices && typingDone ? (
          <div style={styles.choices} onClick={(e) => e.stopPropagation()}>
            {line.choices!.map((c, i) => {
              const isFocused = i === focused;
              return (
                <button
                  key={c.value}
                  style={{
                    ...styles.choiceBtn,
                    ...(isFocused ? styles.choiceBtnFocused : null),
                  }}
                  onMouseEnter={() => setFocused(i)}
                  onClick={() => choose(c.value)}
                >
                  <span style={styles.marker}>{isFocused ? '▶' : ' '}</span>
                  {c.label}
                </button>
              );
            })}
            <div style={styles.choiceHint}>↑↓ 로 선택 · Space / Enter 로 결정</div>
          </div>
        ) : (
          <div style={styles.indicator}>
            {hasChoices ? '...' : `${index + 1} / ${lines.length} · Space / 탭 으로 다음 ▶`}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    padding: '0 20px 30px',
    cursor: 'pointer',
    zIndex: 600,
    background: 'linear-gradient(180deg, transparent 0%, transparent 55%, rgba(0,0,0,0.35) 100%)',
  },
  box: {
    width: '100%',
    maxWidth: 900,
    background: 'rgba(15, 23, 42, 0.96)',
    border: '2px solid #3b82f6',
    borderRadius: 12,
    padding: '18px 26px 14px',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
    color: '#e2e8f0',
    fontFamily: 'Pretendard, sans-serif',
  },
  speaker: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  text: {
    fontSize: 18,
    lineHeight: 1.6,
    minHeight: '2.8em',
    whiteSpace: 'pre-wrap',
  },
  indicator: {
    color: '#93c5fd',
    fontSize: 11,
    marginTop: 10,
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  choices: {
    marginTop: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  choiceBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    background: 'transparent',
    border: '1.5px solid transparent',
    borderRadius: 6,
    color: '#cbd5e1',
    fontSize: 16,
    fontFamily: 'Pretendard, sans-serif',
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 120ms ease',
  },
  choiceBtnFocused: {
    background: 'rgba(59, 130, 246, 0.18)',
    border: '1.5px solid #3b82f6',
    color: '#fde68a',
    fontWeight: 700,
  },
  marker: {
    display: 'inline-block',
    width: 14,
    color: '#fbbf24',
    fontSize: 14,
  },
  choiceHint: {
    marginTop: 8,
    color: '#64748b',
    fontSize: 11,
    letterSpacing: 0.3,
  },
};
