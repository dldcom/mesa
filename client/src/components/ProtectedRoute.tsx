import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import type { Role } from '@shared/types/api';

type Props = {
  children: ReactNode;
  requireRole?: Role; // 지정하면 해당 역할만 접근 가능
};

/**
 * 인증이 필요한 라우트 감쌈.
 * - 미인증 → /login
 * - 인증됐지만 역할 불일치 → /teacher (접근 권한 없음 안내는 추후)
 */
export default function ProtectedRoute({ children, requireRole }: Props) {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const loadMe = useAuthStore((s) => s.loadMe);

  useEffect(() => {
    if (!initialized) loadMe();
  }, [initialized, loadMe]);

  if (!initialized) {
    return (
      <div className="placeholder-page">
        <p>확인 중…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole && user.role !== requireRole) {
    return <Navigate to="/teacher" replace />;
  }

  return <>{children}</>;
}
