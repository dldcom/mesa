// 관리자 전용: 캐릭터(+NPC) 스프라이트 시트 메이커
// 원본: safegame/client/src/views/CharacterMaker.jsx → TS 포팅
// 저장: DB → 파일 (mesa/assets/characters/ 또는 npcs/ 에 PNG + JSON)
//
// 동작:
//   입력: 3분할 정면/측면/후면 소스 이미지
//   처리: 배경 제거 + 바운딩박스 정렬 + 노이즈/외곽 필터
//   출력: 6프레임 × 4방향 아틀라스 (48×64 × 6 × 4 = 288×256 PNG)

import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  Camera,
  Image as ImageIcon,
  Sparkles,
  FileJson,
  ArrowLeft,
  LayoutGrid,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { uploadAsset } from '@/services/adminApi';
import './CharacterMaker.css';
import './CropModal.css';

// 프레임 크기 상수
const W = 48;
const H = 64;

type RgbColor = { r: number; g: number; b: number };
type Pixel = { r: number; g: number; b: number; a: number };
type PixelData = {
  front: Pixel[][];
  side: Pixel[][];
  back: Pixel[][];
};
type Direction = 'down' | 'up' | 'left' | 'right';

// EyeDropper API 가 TS 기본 lib 에 없어 전역 확장
declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

export default function CharacterMaker() {
  const navigate = useNavigate();

  const [image, setImage] = useState<string | null>(null);
  const [pixelData, setPixelData] = useState<PixelData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [direction, setDirection] = useState<Direction>('down');
  const [showGrid, setShowGrid] = useState(false);
  const [bgThreshold, setBgThreshold] = useState(10);
  const [cropRange, setCropRange] = useState<[number, number]>([20, 80]);
  const [autoAlign, setAutoAlign] = useState(true);
  const [removeNoise, setRemoveNoise] = useState(true);
  const [useErosion, setUseErosion] = useState(false);
  const [targetBgColor, setTargetBgColor] = useState<RgbColor>({
    r: 255,
    g: 255,
    b: 255,
  });
  const [headLimit, setHeadLimit] = useState(24);
  const [legLimit, setLegLimit] = useState(44);

  // MESA 용 식별자
  const [charId, setCharId] = useState(''); // 파일명 (예: "researcher")
  const [charName, setCharName] = useState(''); // 표시 이름 (예: "연구원")

  const [showCropModal, setShowCropModal] = useState(false);
  const [tempSrc, setTempSrc] = useState<string | null>(null);
  const [rawImage, setRawImage] = useState<HTMLImageElement | null>(null);
  const [dragPos, setDragPos] = useState({ top: 20, bottom: 80 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setTempSrc(src);
      setDragPos({ top: 20, bottom: 80 });
      setShowCropModal(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const confirmCrop = () => {
    if (!tempSrc) return;
    setCropRange([dragPos.top, dragPos.bottom]);
    setImage(tempSrc);
    processImage(tempSrc);
    setShowCropModal(false);
  };

  const processImage = (src: string) => {
    const img = new Image();
    img.onload = () => {
      setRawImage(img);
      runFilters(img);
    };
    img.src = src;
  };

  const pickColor = async () => {
    if (!window.EyeDropper) {
      alert('이 브라우저는 EyeDropper 를 지원하지 않아요. Chrome/Edge 최신 버전을 사용해주세요.');
      return;
    }
    const dropper = new window.EyeDropper();
    try {
      const result = await dropper.open();
      const color = result.sRGBHex;
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      setTargetBgColor({ r, g, b });
    } catch {
      // 사용자가 취소
    }
  };

  const runFilters = (img: HTMLImageElement) => {
    setIsProcessing(true);
    const data: Partial<PixelData> = {};

    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = img.width;
    analysisCanvas.height = img.height;
    const analysisCtx = analysisCanvas.getContext('2d')!;
    analysisCtx.drawImage(img, 0, 0);
    const fullImageData = analysisCtx.getImageData(0, 0, img.width, img.height);

    const startY = Math.floor(img.height * (cropRange[0] / 100));
    const endY = Math.floor(img.height * (cropRange[1] / 100));
    const cropHeight = endY - startY;
    const sw = Math.floor(img.width / 3);

    // 1. 모든 뷰의 바운딩박스 먼저 계산
    type Bounds = {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      hasContent: boolean;
    };
    const bounds: Record<'front' | 'side' | 'back', Bounds> = {} as never;
    (['front', 'side', 'back'] as const).forEach((view, index) => {
      const sx = index * sw;
      let minX = sw;
      let maxX = 0;
      let minY = cropHeight;
      let maxY = 0;
      let hasContent = false;
      for (let y = startY; y < endY; y++) {
        for (let x = 0; x < sw; x++) {
          const i = Math.floor((y * img.width + (sx + x)) * 4);
          const r = fullImageData.data[i];
          const g = fullImageData.data[i + 1];
          const b = fullImageData.data[i + 2];
          const a = fullImageData.data[i + 3];
          const dist = Math.sqrt(
            (targetBgColor.r - r) ** 2 +
              (targetBgColor.g - g) ** 2 +
              (targetBgColor.b - b) ** 2
          );
          if (a > 50 && dist > bgThreshold * 4.4) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y - startY);
            maxY = Math.max(maxY, y - startY);
            hasContent = true;
          }
        }
      }
      bounds[view] = { minX, maxX, minY, maxY, hasContent };
    });

    // 2. 통일 스케일
    let maxCw = 0;
    let maxCh = 0;
    Object.values(bounds).forEach((b) => {
      if (b.hasContent) {
        maxCw = Math.max(maxCw, b.maxX - b.minX + 1);
        maxCh = Math.max(maxCh, b.maxY - b.minY + 1);
      }
    });
    const unifiedScale = Math.min((W * 0.85) / maxCw, (H * 0.85) / maxCh);

    (['front', 'side', 'back'] as const).forEach((view, index) => {
      const sx = index * sw;
      const { minX, maxX, minY, maxY } = bounds[view];

      const targetCanvas = document.createElement('canvas');
      targetCanvas.width = W;
      targetCanvas.height = H;
      const targetCtx = targetCanvas.getContext('2d')!;
      targetCtx.imageSmoothingEnabled = false;

      if (autoAlign) {
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const dw = cw * unifiedScale;
        const dh = ch * unifiedScale;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        targetCtx.drawImage(
          img,
          Math.floor(sx + minX),
          Math.floor(startY + minY),
          Math.floor(cw),
          Math.floor(ch),
          dx,
          dy,
          dw,
          dh
        );
      } else {
        const cw = sw;
        const ch = cropHeight;
        const scale = Math.min(W / cw, H / ch);
        const dw = cw * scale;
        const dh = ch * scale;
        const dx = (W - dw) / 2;
        const dy = (H - dh) / 2;
        targetCtx.drawImage(img, sx, startY, cw, ch, dx, dy, dw, dh);
      }

      // 3. 픽셀 필터링
      const imageData = targetCtx.getImageData(0, 0, W, H);
      let pixels: Pixel[][] = [];
      for (let y = 0; y < H; y++) {
        const row: Pixel[] = [];
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          let r = imageData.data[i];
          let g = imageData.data[i + 1];
          let b = imageData.data[i + 2];
          let a = imageData.data[i + 3];
          const distCheck = Math.sqrt(
            (targetBgColor.r - r) ** 2 +
              (targetBgColor.g - g) ** 2 +
              (targetBgColor.b - b) ** 2
          );
          if (distCheck < bgThreshold * 4.4 || a < 50) a = 0;
          row.push({ r, g, b, a });
        }
        pixels.push(row);
      }

      // 노이즈 제거
      if (removeNoise) {
        const cleaned = pixels.map((r) => r.map((p) => ({ ...p })));
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (pixels[y][x].a > 0) {
              let neighbors = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const ny = y + dy;
                  const nx = x + dx;
                  if (
                    ny >= 0 &&
                    ny < H &&
                    nx >= 0 &&
                    nx < W &&
                    pixels[ny][nx].a > 0
                  )
                    neighbors++;
                }
              }
              if (neighbors === 0) cleaned[y][x].a = 0;
            }
          }
        }
        pixels = cleaned;
      }

      // 외곽 깎기
      if (useErosion) {
        const eroded = pixels.map((r) => r.map((p) => ({ ...p })));
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (pixels[y][x].a > 0) {
              let isEdge = false;
              for (const [dy, dx] of [
                [0, 1],
                [0, -1],
                [1, 0],
                [-1, 0],
              ] as const) {
                const ny = y + dy;
                const nx = x + dx;
                if (
                  ny < 0 ||
                  ny >= H ||
                  nx < 0 ||
                  nx >= W ||
                  pixels[ny][nx].a === 0
                )
                  isEdge = true;
              }
              if (isEdge) eroded[y][x].a = 0;
            }
          }
        }
        pixels = eroded;
      }

      data[view] = pixels;
    });

    setPixelData(data as PixelData);
    setIsProcessing(false);
  };

  useEffect(() => {
    if (rawImage) runFilters(rawImage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgThreshold, autoAlign, removeNoise, useErosion, targetBgColor, cropRange, rawImage]);

  useEffect(() => {
    if (!isPlaying || !pixelData) return;
    const interval = setInterval(() => setFrame((f) => (f + 1) % 4), 150);
    return () => clearInterval(interval);
  }, [isPlaying, pixelData]);

  const drawToContext = (
    ctx: CanvasRenderingContext2D,
    data: PixelData,
    currentFrame: number,
    currentDirection: Direction,
    offX = 0,
    offY = 0
  ) => {
    const f = currentFrame % 4;
    const pixels =
      currentDirection === 'down'
        ? data.front
        : currentDirection === 'up'
          ? data.back
          : data.side;
    if (!pixels) return;

    pixels.forEach((row, y) => {
      row.forEach((p, x) => {
        if (p.a > 10) {
          let dx = currentDirection === 'right' ? W - 1 - x : x;
          let dy = y;
          const isL = y >= legLimit;
          const isH = y < headLimit;

          if (currentDirection === 'down' || currentDirection === 'up') {
            if (f === 1 || f === 3) {
              dy += 1;
              if (isH) {
                dy += 1;
                dx += f === 1 ? 1 : -1;
              }
              if (isL) {
                const isRightSide = x >= W / 2;
                if (f === 1 && isRightSide) dy -= 2;
                else if (f === 3 && !isRightSide) dy -= 2;
              }
            }
          } else {
            if (f === 1 || f === 3) {
              if (isL) {
                const isF = x < W / 2;
                dx += isF ? (f === 1 ? -2 : 2) : f === 1 ? 2 : -2;
                if ((f === 1 && isF) || (f === 3 && !isF)) dy -= 1;
                else dy += 1;
              } else {
                dy += 1;
                if (isH) dy += 1;
              }
            }
          }
          ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${p.a / 255})`;
          ctx.fillRect(dx + offX, dy + offY, 1, 1);
        }
      });
    });
  };

  const drawCharacter = (
    ctx: CanvasRenderingContext2D,
    data: PixelData,
    f: number
  ) => {
    ctx.clearRect(0, 0, W, H);
    drawToContext(ctx, data, f, direction);
    if (showGrid) {
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 0.1;
      for (let i = 0; i <= W; i += 8) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, H);
        ctx.stroke();
      }
      for (let i = 0; i <= H; i += 8) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(W, i);
        ctx.stroke();
      }
    }
    // 다리 라인 (파랑)
    ctx.setLineDash([4, 2]);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#2563eb';
    ctx.beginPath();
    ctx.moveTo(0, legLimit);
    ctx.lineTo(W, legLimit);
    ctx.stroke();
    // 머리 라인 (빨강)
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, headLimit);
    ctx.lineTo(W, headLimit);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const buildAtlasCanvas = (): HTMLCanvasElement | null => {
    if (!pixelData) return null;
    const canvas = document.createElement('canvas');
    canvas.width = W * 6;
    canvas.height = H * 4;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    const dirs: Direction[] = ['down', 'up', 'right', 'left'];
    dirs.forEach((dir, r) => {
      for (let c = 0; c < 6; c++) {
        drawToContext(ctx, pixelData, c, dir, c * W, r * H);
      }
    });
    return canvas;
  };

  const buildAtlasData = () => {
    const atlas = {
      meta: {
        headLimit,
        legLimit,
        size: { w: W * 6, h: H * 4 },
      },
      frames: {} as Record<string, { frame: { x: number; y: number; w: number; h: number } }>,
    };
    const dirs: Direction[] = ['down', 'up', 'right', 'left'];
    dirs.forEach((dir, r) => {
      for (let c = 0; c < 6; c++) {
        atlas.frames[`${dir}_${c}`] = {
          frame: { x: c * W, y: r * H, w: W, h: H },
        };
      }
    });
    return atlas;
  };

  const downloadFullSheet = (type: 'png' | 'json') => {
    const canvas = buildAtlasCanvas();
    if (!canvas) return;

    const fileName = charId || 'character';
    if (type === 'png') {
      const a = document.createElement('a');
      a.download = `${fileName}.png`;
      a.href = canvas.toDataURL();
      a.click();
    } else {
      const atlas = {
        ...buildAtlasData(),
        meta: {
          ...buildAtlasData().meta,
          app: 'MESA Character Maker',
          version: '1.0',
          image: `${fileName}.png`,
        },
      };
      const blob = new Blob([JSON.stringify(atlas, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.download = `${fileName}.json`;
      a.href = URL.createObjectURL(blob);
      a.click();
    }
  };

  const saveToServer = async (type: 'characters' | 'npcs') => {
    if (!pixelData || !charId || !charName) {
      alert('캐릭터 ID 와 이름을 모두 입력해주세요!');
      return;
    }
    setIsProcessing(true);
    try {
      const canvas = buildAtlasCanvas();
      if (!canvas) throw new Error('캔버스 생성 실패');
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('PNG 생성 실패');

      const atlasData = buildAtlasData();

      await uploadAsset(
        type,
        {
          id: charId,
          name: charName,
          charId,
          atlasData,
        },
        blob,
        `${charId}.png`
      );

      alert(
        `${type === 'characters' ? '캐릭터' : 'NPC'} "${charName}" 저장 완료!`
      );
    } catch (e) {
      console.error(e);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (pixelData && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        drawCharacter(ctx, pixelData, frame);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelData, frame, direction, showGrid, headLimit, legLimit]);

  const handlePreviewMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = Math.max(
      0,
      Math.min(64, Math.round(((e.clientY - rect.top) / rect.height) * 64))
    );
    const distToHead = Math.abs(y - headLimit);
    const distToLeg = Math.abs(y - legLimit);
    if (distToHead < distToLeg) {
      setHeadLimit(Math.min(y, legLimit - 5));
    } else {
      setLegLimit(Math.max(y, headLimit + 5));
    }
  };

  const handleCropMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.height === 0) return;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (Math.abs(y - dragPos.top) < Math.abs(y - dragPos.bottom)) {
      setDragPos((prev) => ({
        ...prev,
        top: Math.max(0, Math.min(y, prev.bottom - 5)),
      }));
    } else {
      setDragPos((prev) => ({
        ...prev,
        bottom: Math.min(100, Math.max(y, prev.top + 5)),
      }));
    }
  };

  const canSave = Boolean(pixelData && charId && charName && !isProcessing);

  return (
    <div className="character-maker-container">
      <div className="cm-max-w-6xl cm-w-full cm-space-y-6">
        <header className="cm-flex cm-justify-between cm-items-end cm-border-b cm-pb-4 cm-border-gray-100 animate-fade-in-up">
          <div className="cm-space-y-1">
            <button
              onClick={() => navigate('/teacher')}
              className="cm-flex cm-items-center cm-gap-2 cm-text-gray-500 cm-hover-text-black cm-mb-4 cm-transition-colors"
            >
              <ArrowLeft size={16} /> 대시보드로
            </button>
            <h1 className="cm-text-4xl heading-serif cm-font-black">
              캐릭터 만들기
            </h1>
          </div>
        </header>

        <main className="cm-grid grid-cols-1 cm-lg-grid-cols-custom cm-gap-12 cm-items-start">
          {/* Left: 업로드 + 설정 */}
          <div className="cm-space-y-8">
            <section className="glass-card cm-p-10 cm-flex cm-flex-col cm-items-center cm-justify-center cm-border-dashed cm-border animate-fade-in-up delay-100">
              {!image ? (
                <div className="cm-flex cm-flex-col cm-items-center cm-gap-4">
                  <ImageIcon size={48} className="cm-text-gray-300" />
                  <label className="file-input-label">
                    캐릭터 이미지 업로드
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleUpload}
                      accept="image/*"
                      className="cm-hidden"
                    />
                  </label>
                  <p className="cm-text-xs cm-text-gray-400">
                    정면/측면/후면이 가로로 3분할된 시트를 권장합니다
                  </p>
                </div>
              ) : (
                <div className="cm-flex cm-flex-col cm-items-center cm-space-y-6 cm-w-full">
                  <div className="cm-relative cm-border cm-p-2 cm-bg-gray-50 cm-transition-transform cm-hover-scale-105 cm-duration-500">
                    <img
                      src={image}
                      style={{ maxHeight: '180px', width: 'auto' }}
                      className="pixel-grid"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setImage(null);
                      setRawImage(null);
                    }}
                    className="toggle-btn cm-flex cm-items-center cm-gap-2"
                  >
                    <RefreshCw size={14} /> 소스 교체
                  </button>
                </div>
              )}
            </section>

            <section className="glass-card cm-p-8 cm-space-y-8 animate-fade-in-up delay-200">
              <div className="cm-space-y-4">
                <h2 className="cm-text-sm cm-font-black cm-uppercase cm-tracking-tighter cm-flex cm-items-center cm-justify-center cm-gap-2">
                  <Camera size={16} /> 설정값
                </h2>
                <div className="cm-flex cm-justify-center">
                  <button
                    onClick={pickColor}
                    className="toggle-btn cm-flex cm-items-center cm-gap-2"
                  >
                    <div
                      className="cm-w-3 cm-h-3 cm-rounded-full cm-border cm-border-gray-300"
                      style={{
                        backgroundColor: `rgb(${targetBgColor.r},${targetBgColor.g},${targetBgColor.b})`,
                      }}
                    ></div>
                    배경색 추출
                  </button>
                </div>
              </div>

              <div className="cm-space-y-6">
                <div className="cm-space-y-3">
                  <div className="cm-flex cm-justify-between cm-text-xs cm-font-bold cm-text-gray-400 cm-uppercase">
                    <span>배경 제거 감도</span>
                    <span>{bgThreshold}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={bgThreshold}
                    onChange={(e) => setBgThreshold(parseInt(e.target.value))}
                  />
                </div>
                <div className="cm-grid grid-cols-3 cm-gap-2">
                  <button
                    onClick={() => setAutoAlign(!autoAlign)}
                    className={`toggle-btn ${autoAlign ? 'active-blue' : ''}`}
                  >
                    자동 정렬
                  </button>
                  <button
                    onClick={() => setRemoveNoise(!removeNoise)}
                    className={`toggle-btn ${removeNoise ? 'active-emerald' : ''}`}
                  >
                    노이즈 제거
                  </button>
                  <button
                    onClick={() => setUseErosion(!useErosion)}
                    className={`toggle-btn ${useErosion ? 'active-amber' : ''}`}
                  >
                    외곽 깎기
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* Right: 미리보기 + 저장 */}
          <section className="glass-card cm-p-10 cm-flex cm-flex-col cm-items-center animate-fade-in-up delay-300 cm-sticky-top">
            <div className="cm-w-full cm-space-y-10">
              <h2 className="cm-text-sm cm-font-black cm-uppercase cm-tracking-tighter cm-flex cm-items-center cm-justify-center cm-gap-2">
                <Sparkles size={16} /> preview
              </h2>

              <div
                className="checkerboard cm-p-12 cm-flex cm-justify-center cm-items-center cm-bg-white cm-group cm-relative"
                style={{ cursor: 'ns-resize' }}
                onMouseMove={handlePreviewMouseMove}
              >
                <div
                  className="cm-relative"
                  style={{ width: '240px', height: '320px', zIndex: 10 }}
                >
                  <canvas
                    ref={canvasRef}
                    width={W}
                    height={H}
                    style={{
                      width: '240px',
                      height: '320px',
                      pointerEvents: 'none',
                    }}
                    className="pixel-grid cm-transition-transform cm-duration-700 cm-group-hover-scale-110"
                  />
                  <div
                    className="head-tooltip"
                    style={{ top: `${(headLimit / 64) * 100}%` }}
                  >
                    머리 흔들림 경계 (RED)
                  </div>
                  <div
                    className="leg-tooltip"
                    style={{ top: `${(legLimit / 64) * 100}%` }}
                  >
                    골반/다리 움직임 경계 (BLUE)
                  </div>
                </div>
              </div>

              <div className="cm-space-y-8">
                <div className="cm-flex cm-justify-center border-b border-gray-100 pb-2">
                  {(['down', 'up', 'left', 'right'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`dir-btn ${direction === d ? 'dir-btn-active' : ''}`}
                    >
                      {d === 'down'
                        ? '앞면'
                        : d === 'up'
                          ? '뒷면'
                          : d === 'left'
                            ? '왼쪽'
                            : '오른쪽'}
                    </button>
                  ))}
                </div>
                <div className="cm-flex cm-justify-center cm-gap-6">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="btn-secondary"
                    disabled={!pixelData}
                  >
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`btn-secondary ${showGrid ? 'cm-text-black cm-border-black' : ''}`}
                    disabled={!pixelData}
                  >
                    <LayoutGrid size={18} />
                  </button>
                </div>
              </div>

              <div className="cm-flex cm-flex-col cm-gap-3 cm-pt-6 cm-border-t cm-border-gray-100">
                <div className="cm-space-y-2 cm-mb-2">
                  <label className="cm-text-xs cm-font-bold cm-text-gray-400 cm-uppercase">
                    캐릭터 ID (파일명, 예: researcher)
                  </label>
                  <input
                    type="text"
                    value={charId}
                    onChange={(e) => setCharId(e.target.value)}
                    placeholder="researcher"
                    className="cm-w-full cm-p-2 cm-border cm-rounded cm-text-sm"
                  />
                </div>
                <div className="cm-space-y-2 cm-mb-2">
                  <label className="cm-text-xs cm-font-bold cm-text-gray-400 cm-uppercase">
                    캐릭터 이름 (표시용, 한글 OK)
                  </label>
                  <input
                    type="text"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                    placeholder="연구원"
                    className="cm-w-full cm-p-2 cm-border cm-rounded cm-text-sm"
                  />
                </div>
                <button
                  className="btn-luxury-indigo"
                  disabled={!canSave}
                  onClick={() => saveToServer('characters')}
                >
                  <Sparkles size={18} /> 캐릭터로 저장
                </button>
                <button
                  className="btn-luxury-emerald"
                  disabled={!canSave}
                  onClick={() => saveToServer('npcs')}
                >
                  <Sparkles size={18} /> NPC 로 저장
                </button>
                <div className="cm-grid grid-cols-2 cm-gap-2">
                  <button
                    className="btn-secondary cm-text-xs"
                    disabled={!pixelData}
                    onClick={() => downloadFullSheet('png')}
                  >
                    <ImageIcon size={14} /> PNG 다운
                  </button>
                  <button
                    className="btn-secondary cm-text-xs"
                    disabled={!pixelData}
                    onClick={() => downloadFullSheet('json')}
                  >
                    <FileJson size={14} /> JSON 다운
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* 크롭 선택 모달 */}
      {showCropModal && tempSrc && (
        <div className="crop-modal-overlay">
          <div className="crop-modal-content glass-card animate-fade-in-up">
            <div className="crop-modal-header">
              <h3>영역 선택</h3>
              <p>캐릭터가 포함된 세로 범위를 마우스로 드래그하여 선택하세요</p>
            </div>

            <div className="crop-area-container" onMouseMove={handleCropMouseMove}>
              <img
                src={tempSrc}
                alt="Crop preview"
                className="crop-image-preview"
                onDragStart={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
              />
              <div
                className="crop-guide-dim"
                style={{ height: `${dragPos.top}%`, top: 0 }}
              ></div>
              <div
                className="crop-guide-dim"
                style={{
                  height: `${100 - dragPos.bottom}%`,
                  top: `${dragPos.bottom}%`,
                }}
              ></div>
              <div
                className="crop-guide-line top"
                style={{ top: `${dragPos.top}%` }}
              >
                <span className="crop-handle">TOP {Math.round(dragPos.top)}%</span>
              </div>
              <div
                className="crop-guide-line bottom"
                style={{ top: `${dragPos.bottom}%` }}
              >
                <span className="crop-handle">
                  BOTTOM {Math.round(dragPos.bottom)}%
                </span>
              </div>
            </div>

            <div className="cm-flex cm-gap-4 cm-justify-center cm-mt-8">
              <button
                onClick={() => setShowCropModal(false)}
                className="btn-secondary"
              >
                취소
              </button>
              <button
                onClick={confirmCrop}
                className="btn-primary"
                style={{
                  backgroundColor: 'black',
                  color: 'white',
                  padding: '0.75rem 2rem',
                }}
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
