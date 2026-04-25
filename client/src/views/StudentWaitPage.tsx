import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/services/socket';
import {
  useSessionStore,
  findMyTeam,
  isUnassigned,
  type LightSnapshot,
} from '@/store/useSessionStore';
import type { StudentSlot, Character } from '@shared/types/game';
import CharacterPicker from '@/components/CharacterPicker';

export default function StudentWaitPage() {
  const navigate = useNavigate();
  const { sessionCode, studentId, studentName, snapshot, gameStarted } = useSessionStore();
  const setSnapshot = useSessionStore((s) => s.setSnapshot);
  const markGameStarted = useSessionStore((s) => s.markGameStarted);

  // 세션 정보 없이 들어오면 홈으로
  useEffect(() => {
    if (!sessionCode || !studentId) {
      navigate('/');
    }
  }, [sessionCode, studentId, navigate]);

  // Socket 구독
  useEffect(() => {
    const socket = getSocket();

    const onState = (s: LightSnapshot) => setSnapshot(s);
    const onGameStarted = (data: {
      teamId: string;
      slot: StudentSlot;
      character: Character;
    }) => {
      // 서버가 이미 내 소켓에만 보내므로 바로 저장 + 이동
      markGameStarted(data.teamId, data.slot, data.character);
      navigate('/game');
    };

    socket.on('session:state', onState);
    socket.on('game:started', onGameStarted);

    return () => {
      socket.off('session:state', onState);
      socket.off('game:started', onGameStarted);
    };
  }, [setSnapshot, markGameStarted, navigate, snapshot, studentId]);

  // gameStarted 상태가 바뀌면 게임으로 (혹시 이벤트 놓쳤을 때 안전망)
  useEffect(() => {
    if (gameStarted) navigate('/game');
  }, [gameStarted, navigate]);

  const unassigned = isUnassigned(snapshot, studentId);
  const myTeam = findMyTeam(snapshot, studentId);

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <h1 style={{ color: '#93c5fd' }}>
        ⏳ 대기 중
      </h1>
      <p style={{ color: '#94a3b8' }}>
        <strong>{studentName}</strong> 님, 입장 완료 (코드: <code>{sessionCode}</code>)
      </p>

      {unassigned && (
        <div style={boxStyle}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>
            👀 선생님이 팀을 배정 중이에요
          </p>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            잠시만 기다려주세요.
          </p>
        </div>
      )}

      {myTeam && (
        <div style={{ ...boxStyle, borderColor: '#22c55e' }}>
          <p style={{ fontSize: 20, color: '#22c55e', marginBottom: 8 }}>
            ✅ <strong>{myTeam.name}</strong> 에 배정되었어요!
          </p>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            선생님이 게임을 시작할 때까지 기다려주세요.
          </p>
        </div>
      )}

      <CharacterPicker />

      {snapshot && (
        <div style={{ marginTop: 32, color: '#64748b', fontSize: 12 }}>
          현재 참여자: {snapshot.unassignedStudents.length + snapshot.teams.reduce((n, t) => n + t.students.length, 0)}명
          · 팀 {snapshot.teams.length}개
        </div>
      )}
    </div>
  );
}

const boxStyle: React.CSSProperties = {
  padding: 24,
  border: '1px solid #374151',
  borderRadius: 8,
  background: '#111827',
  minWidth: 320,
};
