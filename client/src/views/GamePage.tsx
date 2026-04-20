// 게임 화면: Phaser 씬이 여기 마운트됨

export default function GamePage() {
  return (
    <div className="placeholder-page">
      <h1>🎮 게임 화면</h1>
      <p>여기에 Phaser 씬(프롤로그 → 1~4막 → 엔딩)이 렌더링됩니다.</p>
      <p style={{ marginTop: 24, color: '#64748b', fontSize: 14 }}>
        (구현 예정 — Phaser 게임 인스턴스 + React HUD 오버레이)
      </p>
    </div>
  );
}
