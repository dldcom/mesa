import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/services/socket';
import {
  useSessionStore,
  saveStudentSession,
  loadStudentSession,
  clearStudentSession,
} from '@/store/useSessionStore';
import type { SessionPhase } from '@shared/types/game';

type Mode = 'form' | 'reconnecting';

export default function StudentEntryPage() {
  const [mode, setMode] = useState<Mode>('form');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const setStudentIdentity = useSessionStore((s) => s.setStudentIdentity);
  const markGameStarted = useSessionStore((s) => s.markGameStarted);

  // 마운트 시 저장된 세션이 있으면 자동 재접속 시도
  useEffect(() => {
    const saved = loadStudentSession();
    if (!saved) return;

    setMode('reconnecting');
    const socket = getSocket();
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      socket.off('session:joined', onJoined);
      socket.off('error', onError);
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const onJoined = (data: {
      sessionCode: string;
      studentId: string;
      phase: SessionPhase;
    }) => {
      cleanup();
      setStudentIdentity(data.sessionCode, data.studentId, saved.name);
      saveStudentSession({
        sessionCode: data.sessionCode,
        studentId: data.studentId,
        name: saved.name,
      });
      if (data.phase === 'playing') {
        markGameStarted('');
        navigate('/game');
      } else {
        navigate('/wait');
      }
    };

    const onError = (payload: { code: string; message: string }) => {
      cleanup();
      console.warn('[Reconnect] Failed:', payload.message);
      clearStudentSession();
      setError(`이전 세션 복구 실패: ${payload.message}`);
      setMode('form');
    };

    socket.on('session:joined', onJoined);
    socket.on('error', onError);

    socket.emit('student:enter', {
      sessionCode: saved.sessionCode,
      name: saved.name,
      reconnectId: saved.studentId,
    });

    timerId = setTimeout(() => {
      cleanup();
      clearStudentSession();
      setError('재접속 시도 중 응답이 없어요. 직접 다시 입력해주세요.');
      setMode('form');
    }, 5000);

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError('참여 코드와 이름을 모두 입력해주세요.');
      return;
    }
    setSubmitting(true);
    const socket = getSocket();

    const cleanup = () => {
      socket.off('session:joined', onJoined);
      socket.off('error', onError);
    };

    const onJoined = (data: {
      sessionCode: string;
      studentId: string;
      phase: SessionPhase;
    }) => {
      cleanup();
      const trimmedName = name.trim();
      setStudentIdentity(data.sessionCode, data.studentId, trimmedName);
      saveStudentSession({
        sessionCode: data.sessionCode,
        studentId: data.studentId,
        name: trimmedName,
      });
      if (data.phase === 'playing') {
        markGameStarted('');
        navigate('/game');
      } else {
        navigate('/wait');
      }
    };

    const onError = (payload: { code: string; message: string }) => {
      cleanup();
      setSubmitting(false);
      setError(payload.message || '입장에 실패했습니다.');
    };

    socket.on('session:joined', onJoined);
    socket.on('error', onError);
    socket.emit('student:enter', {
      sessionCode: code.trim().toUpperCase(),
      name: name.trim(),
    });
  };

  if (mode === 'reconnecting') {
    return (
      <div className="placeholder-page">
        <h1>🔄 이전 게임에 다시 연결 중…</h1>
        <p style={{ marginTop: 16, color: '#94a3b8' }}>잠시만 기다려주세요.</p>
      </div>
    );
  }

  return (
    <div className="placeholder-page">
      <h1>🎮 프로젝트 M.E.S.A</h1>
      <p style={{ marginBottom: 24 }}>
        선생님이 알려주신 <strong>참여 코드</strong>와 자기 <strong>이름</strong>을 입력해주세요.
      </p>

      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          placeholder="참여 코드 (예: A7BK)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          autoCapitalize="characters"
          required
          style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: 4, fontSize: 20 }}
        />
        <input
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          required
          style={inputStyle}
        />

        {error && <div style={errorStyle}>{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          style={{ ...submitStyle, opacity: submitting ? 0.5 : 1 }}
        >
          {submitting ? '입장 중…' : '입장하기'}
        </button>
      </form>
    </div>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  width: 320,
};

const inputStyle: React.CSSProperties = {
  padding: 14,
  fontSize: 16,
  background: '#1f2937',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 6,
};

const errorStyle: React.CSSProperties = {
  color: '#f87171',
  fontSize: 14,
  textAlign: 'left',
};

const submitStyle: React.CSSProperties = {
  padding: 14,
  fontSize: 16,
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 6,
};
