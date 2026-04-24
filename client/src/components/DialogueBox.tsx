// 하단 visual-novel 스타일 대사 박스.
// 타이핑 효과 + Space/Enter/탭 으로 다음. 타이핑 중 누르면 즉시 완성.

import { useEffect, useRef, useState } from 'react';
import { useDialogueStore } from '@/store/useDialogueStore';

const TYPING_MS = 22;

export default function DialogueBox() {
  const open = useDialogueStore((s) => s.open);
  const lines = useDialogueStore((s) => s.lines);
  const index = useDialogueStore((s) => s.index);
  const next = useDialogueStore((s) => s.next);

  const line = lines[index];
  const [typed, setTyped] = useState('');
  const typingRef = useRef(false);

  // 타이핑 효과
  useEffect(() => {
    if (!open || !line) return;
    const target = line.text;
    setTyped('');
    typingRef.current = true;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setTyped(target.slice(0, i));
      if (i >= target.length) {
        clearInterval(interval);
        typingRef.current = false;
      }
    }, TYPING_MS);
    return () => {
      clearInterval(interval);
      typingRef.current = false;
    };
  }, [open, index, line]);

  // 키보드: Space / Enter 로 다음 (타이핑 중이면 즉시 완성)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      if (typingRef.current && line) {
        setTyped(line.text);
        typingRef.current = false;
      } else {
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, next, line]);

  if (!open || !line) return null;

  const advance = () => {
    if (typingRef.current) {
      setTyped(line.text);
      typingRef.current = false;
    } else {
      next();
    }
  };

  return (
    <div style={styles.overlay} onClick={advance}>
      <div style={styles.box}>
        <div style={styles.speaker}>{line.speaker}</div>
        <div style={styles.text}>{typed}</div>
        <div style={styles.indicator}>
          {index + 1} / {lines.length} · Space / 탭 으로 다음 ▶
        </div>
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
};
