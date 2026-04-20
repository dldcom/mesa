import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/services/api';
import { getSocket } from '@/services/socket';
import type { SessionState, TeamId, StudentId } from '@shared/types/game';

export default function TeacherDashboard() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionState | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // 새 세션 생성
  const createSession = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await api<{ sessionCode: string }>('/api/session', { method: 'POST' });
      setSessionCode(res.sessionCode);
      const socket = getSocket();
      socket.emit('teacher:joinSession', { sessionCode: res.sessionCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 생성 실패');
    } finally {
      setCreating(false);
    }
  };

  // Socket 구독
  useEffect(() => {
    if (!sessionCode) return;
    const socket = getSocket();
    const onState = (s: SessionState) => setSnapshot(s);
    const onError = (payload: { code: string; message: string }) => setError(payload.message);

    socket.on('teacher:sessionState', onState);
    socket.on('error', onError);
    return () => {
      socket.off('teacher:sessionState', onState);
      socket.off('error', onError);
    };
  }, [sessionCode]);

  // 액션 헬퍼
  const emit = (event: string, payload?: unknown) => {
    const socket = getSocket();
    // @ts-expect-error dynamic event emit
    socket.emit(event, payload);
  };

  const createTeam = () => {
    emit('teacher:createTeam', { teamName: newTeamName });
    setNewTeamName('');
  };
  const removeTeam = (teamId: TeamId) => emit('teacher:removeTeam', { teamId });
  const assignStudent = (studentId: StudentId, teamId: TeamId) =>
    emit('teacher:assignToTeam', { studentId, teamId });
  const unassign = (studentId: StudentId) =>
    emit('teacher:unassignStudent', { studentId });
  const autoAssign = () => emit('teacher:autoAssign');
  const startGame = () => emit('teacher:startGame');

  const totalStudents = snapshot
    ? snapshot.unassignedStudents.length +
      snapshot.teams.reduce((n, t) => n + t.students.length, 0)
    : 0;

  const canStartGame =
    snapshot &&
    snapshot.phase === 'waiting' &&
    snapshot.teams.length > 0 &&
    snapshot.unassignedStudents.length === 0 &&
    snapshot.teams.every((t) => t.students.length === 4);

  return (
    <div style={{ minHeight: '100vh', padding: 24 }}>
      {/* 헤더 */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ color: '#93c5fd', margin: 0 }}>👩‍🏫 교사 대시보드</h1>
          <p style={{ color: '#94a3b8', marginTop: 4, fontSize: 14 }}>
            <strong>{user?.username}</strong> 님 (역할: {user?.role})
          </p>
        </div>
        <button onClick={handleLogout} style={logoutBtn}>로그아웃</button>
      </div>

      {/* 관리자 전용 에셋 메뉴 */}
      {user?.role === 'ADMIN' && (
        <section style={sectionBox}>
          <h3 style={{ marginBottom: 12, color: '#fbbf24' }}>🛠 에셋 제작 도구 (관리자 전용)</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/admin/character-maker" style={linkCard}>🎨 캐릭터 메이커</Link>
            <Link to="/admin/item-maker" style={linkCard}>📦 아이템 메이커</Link>
            <Link to="/admin/map-maker" style={linkCard}>🗺 맵 메이커</Link>
          </div>
        </section>
      )}

      {/* 세션 관리 */}
      <section style={sectionBox}>
        <h3 style={{ marginBottom: 12 }}>🎮 게임 세션</h3>

        {error && (
          <div style={{ color: '#f87171', marginBottom: 12, padding: 12, background: '#7f1d1d22', borderRadius: 6 }}>
            ⚠ {error}
          </div>
        )}

        {!sessionCode && (
          <button onClick={createSession} disabled={creating} style={primaryBtn}>
            {creating ? '생성 중…' : '+ 새 세션 만들기'}
          </button>
        )}

        {sessionCode && snapshot && (
          <>
            {/* 코드 + 요약 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>참여 코드</div>
                <div style={{ fontSize: 48, fontWeight: 'bold', letterSpacing: 6, color: '#fbbf24' }}>
                  {sessionCode}
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#94a3b8' }}>
                <div>상태: <strong>{snapshot.phase === 'waiting' ? '대기 중' : snapshot.phase === 'playing' ? '게임 진행 중' : '종료'}</strong></div>
                <div>참여자: {totalStudents}명</div>
                <div>팀: {snapshot.teams.length}개</div>
              </div>
            </div>

            {snapshot.phase === 'waiting' && (
              <>
                {/* 미배정 학생 */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ marginBottom: 8 }}>
                    🙋 미배정 학생 ({snapshot.unassignedStudents.length}명)
                  </h4>
                  {snapshot.unassignedStudents.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 14 }}>모두 팀에 배정됨 ✓</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {snapshot.unassignedStudents.map((s) => (
                        <div key={s.id} style={{ ...studentCard, opacity: s.connected ? 1 : 0.5 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
                            {s.connected ? '🟢' : '🔴'} {s.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                            {s.connected ? '배정할 팀 선택:' : '연결 끊김 (재접속 대기)'}
                          </div>
                          {snapshot.teams.length === 0 ? (
                            <span style={{ fontSize: 11, color: '#64748b' }}>팀을 먼저 만드세요</span>
                          ) : (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {snapshot.teams.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => assignStudent(s.id, t.id)}
                                  disabled={t.students.length >= 4}
                                  style={miniBtn(t.students.length >= 4)}
                                >
                                  {t.name} ({t.students.length}/4)
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 팀 목록 */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>👥 팀</h4>
                    <input
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="팀 이름 (비워두면 자동)"
                      style={{ ...inputStyle, padding: '6px 10px', fontSize: 13, width: 200 }}
                    />
                    <button onClick={createTeam} style={smallBtn}>+ 새 팀</button>
                  </div>

                  {snapshot.teams.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: 14 }}>아직 팀이 없습니다.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {snapshot.teams.map((t) => (
                        <div key={t.id} style={teamBox(t.students.length === 4)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <strong>{t.name} ({t.students.length}/4)</strong>
                            <button onClick={() => removeTeam(t.id)} style={miniRemoveBtn} title="팀 삭제">✕</button>
                          </div>
                          {t.students.length === 0 && (
                            <div style={{ fontSize: 12, color: '#64748b' }}>비어있음</div>
                          )}
                          {t.students.map((s) => (
                            <div key={s.id} style={{ ...teamStudentRow, opacity: s.connected ? 1 : 0.5 }}>
                              <span>
                                {s.connected ? '🟢' : '🔴'} {s.name}
                              </span>
                              <button onClick={() => unassign(s.id)} style={miniRemoveBtn} title="미배정으로 되돌리기">↩</button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 하단 컨트롤 */}
                <div style={{ display: 'flex', gap: 12, borderTop: '1px solid #374151', paddingTop: 16 }}>
                  <button
                    onClick={autoAssign}
                    disabled={snapshot.unassignedStudents.length === 0}
                    style={snapshot.unassignedStudents.length === 0 ? disabledBtn : secondaryBtn}
                  >
                    🎲 자동 배정
                  </button>
                  <button
                    onClick={startGame}
                    disabled={!canStartGame}
                    style={canStartGame ? successBtn : disabledBtn}
                  >
                    ▶ 게임 시작
                  </button>
                  {!canStartGame && snapshot.teams.length > 0 && (
                    <span style={{ alignSelf: 'center', fontSize: 12, color: '#94a3b8' }}>
                      모든 팀이 4명 꽉 차야 시작할 수 있어요.
                    </span>
                  )}
                </div>
              </>
            )}

            {snapshot.phase === 'playing' && (
              <div style={{ padding: 16, border: '1px solid #22c55e44', borderRadius: 8, background: '#14532d22' }}>
                <p style={{ fontSize: 16, color: '#22c55e' }}>▶ 게임 진행 중</p>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                  (팀별 진행 관찰 뷰는 추후 구현)
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ===== Styles =====
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 24,
};

const sectionBox: React.CSSProperties = {
  padding: 20,
  border: '1px solid #374151',
  borderRadius: 8,
  background: '#111827',
  marginBottom: 16,
};

const logoutBtn: React.CSSProperties = {
  padding: '8px 16px',
  background: '#ef4444',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
};

const linkCard: React.CSSProperties = {
  padding: '10px 14px',
  background: '#1f2937',
  color: '#e5e7eb',
  textDecoration: 'none',
  borderRadius: 6,
  border: '1px solid #374151',
  fontSize: 14,
};

const primaryBtn: React.CSSProperties = {
  padding: '14px 24px',
  fontSize: 16,
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 6,
};

const successBtn: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 14,
  background: '#22c55e',
  color: 'white',
  border: 'none',
  borderRadius: 6,
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 14,
  background: '#4b5563',
  color: 'white',
  border: 'none',
  borderRadius: 6,
};

const disabledBtn: React.CSSProperties = {
  ...secondaryBtn,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const smallBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 13,
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 4,
};

const miniBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '4px 8px',
  fontSize: 11,
  background: disabled ? '#374151' : '#2563eb',
  color: disabled ? '#64748b' : 'white',
  border: 'none',
  borderRadius: 3,
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const miniRemoveBtn: React.CSSProperties = {
  padding: '2px 6px',
  fontSize: 11,
  background: '#374151',
  color: '#e5e7eb',
  border: 'none',
  borderRadius: 3,
};

const studentCard: React.CSSProperties = {
  padding: 10,
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  minWidth: 160,
};

const teamBox = (full: boolean): React.CSSProperties => ({
  padding: 12,
  background: '#1f2937',
  border: `1px solid ${full ? '#22c55e' : '#374151'}`,
  borderRadius: 6,
});

const teamStudentRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
  fontSize: 14,
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  fontSize: 14,
  background: '#1f2937',
  color: '#e5e7eb',
  border: '1px solid #374151',
  borderRadius: 4,
};
