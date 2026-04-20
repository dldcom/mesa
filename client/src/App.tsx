import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

// 학생 플로우 (로그인 없음)
import StudentEntryPage from './views/StudentEntryPage';
import StudentWaitPage from './views/StudentWaitPage';

// 교사/관리자 인증
import LoginPage from './views/LoginPage';
import TeacherDashboard from './views/TeacherDashboard';

// 게임
import GamePage from './views/GamePage';

// 관리자 전용 에셋 제작 도구
import CharacterMaker from './views/admin/CharacterMaker';
import ItemMaker from './views/admin/ItemMaker';
import MapMaker from './views/admin/MapMaker';

function App() {
  return (
    <Routes>
      {/* 학생 (공개) */}
      <Route path="/" element={<StudentEntryPage />} />
      <Route path="/wait" element={<StudentWaitPage />} />

      {/* 게임 (학생·교사 모두 진입 가능 — 학생은 세션코드로, 교사는 관찰용) */}
      <Route path="/game" element={<GamePage />} />

      {/* 로그인 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 교사/관리자 공용 — 로그인 필수 */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute>
            <TeacherDashboard />
          </ProtectedRoute>
        }
      />

      {/* 관리자 전용 */}
      <Route
        path="/admin/character-maker"
        element={
          <ProtectedRoute requireRole="ADMIN">
            <CharacterMaker />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/item-maker"
        element={
          <ProtectedRoute requireRole="ADMIN">
            <ItemMaker />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/map-maker"
        element={
          <ProtectedRoute requireRole="ADMIN">
            <MapMaker />
          </ProtectedRoute>
        }
      />

      {/* 그 외 경로 → 홈 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
