// 가상 조이스틱 상태. React 컴포넌트가 set, Phaser 씬이 매 프레임 read.
// 값은 정규화된 -1..1 (joyX 양수 = 오른쪽, joyY 양수 = 아래).

import { create } from 'zustand';

type TouchControlsStore = {
  joyX: number;
  joyY: number;
  setJoy: (x: number, y: number) => void;
};

export const useTouchControlsStore = create<TouchControlsStore>((set) => ({
  joyX: 0,
  joyY: 0,
  setJoy: (x, y) => set({ joyX: x, joyY: y }),
}));
