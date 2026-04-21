// 관리자 전용: 아이템 스프라이트 메이커
// 원본: safegame/client/src/views/ItemMaker.jsx (JSX) → TS 포팅
// 저장 방식: DB → 파일 (mesa/assets/items/*.png + .json)

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
} from 'react';
import {
  ArrowLeft,
  Upload,
  Save,
  Trash2,
  Package,
  Eye,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  uploadAsset,
  listAssets,
  deleteAsset,
  type AssetMetadata,
} from '@/services/adminApi';
import './ItemMaker.css';

const SPRITE_SIZE = 32;
const CANVAS_DISPLAY = 512;

type UploadedImage = {
  src: string;
  img: HTMLImageElement;
  name: string;
};

type ProcessedData = {
  canvas: HTMLCanvasElement;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  hasContent: boolean;
};

type RgbColor = { r: number; g: number; b: number };

// MESA 아이템 카테고리
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'core', label: '코어 (core)' },
  { value: 'clue', label: '단서 (clue)' },
  { value: 'disk', label: '원판 (disk)' },
  { value: 'lever', label: '레버 (lever)' },
  { value: 'prop', label: '소품 (prop)' },
  { value: 'etc', label: '기타 (etc)' },
];

export default function ItemMaker() {
  const navigate = useNavigate();

  // 이미지 목록 (일괄 업로드)
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);

  // 편집기 상태 — 흰색 배경 고정
  const bgColor: RgbColor = { r: 255, g: 255, b: 255 };
  const [threshold, setThreshold] = useState(30);
  const [processedData, setProcessedData] = useState<ProcessedData | null>(null);

  // 아이템 메타데이터
  const [itemId, setItemId] = useState('');
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState('prop');
  const [actNumber, setActNumber] = useState(1);

  // 저장된 아이템 목록
  const [savedItems, setSavedItems] = useState<AssetMetadata[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 저장된 아이템 불러오기
  useEffect(() => {
    void fetchSavedItems();
  }, []);

  const fetchSavedItems = async () => {
    try {
      const items = await listAssets('items');
      setSavedItems(items);
    } catch (e) {
      console.error('[ItemMaker] 목록 조회 실패:', e);
    }
  };

  // 여러 파일 업로드
  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const src = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setImages((prev) => [
            ...prev,
            { src, img, name: file.name.replace(/\.[^.]+$/, '') },
          ]);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    if (selectedIdx === idx) {
      setSelectedIdx(-1);
      setProcessedData(null);
    } else if (selectedIdx > idx) {
      setSelectedIdx((prev) => prev - 1);
    }
  };

  // 이미지 처리: 배경 제거 + 노이즈 제거 + 바운딩박스
  const processImage = useCallback(
    (
      img: HTMLImageElement,
      bg: RgbColor,
      thresh: number
    ): ProcessedData => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;

      // 배경 제거: 색 거리 기준
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const dist = Math.sqrt(
          (bg.r - r) ** 2 + (bg.g - g) ** 2 + (bg.b - b) ** 2
        );
        if (dist < thresh * 4.4) {
          data[i + 3] = 0; // 투명 처리
        }
      }

      // 노이즈 제거: 이웃 픽셀이 거의 없는 고립 픽셀 제거
      const w = img.width;
      const h = img.height;
      const cleaned = new Uint8ClampedArray(data);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (data[i + 3] > 0) {
            let neighbors = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const ni = (ny * w + nx) * 4;
                  if (data[ni + 3] > 0) neighbors++;
                }
              }
            }
            if (neighbors <= 1) cleaned[i + 3] = 0;
          }
        }
      }

      // 컨텐츠 바운딩박스
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (cleaned[i + 3] > 0) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }

      imageData.data.set(cleaned);
      ctx.putImageData(imageData, 0, 0);

      return {
        canvas,
        bounds: { minX, maxX, minY, maxY },
        hasContent: maxX >= minX,
      };
    },
    []
  );

  // 선택/파라미터 변경 시 재처리
  useEffect(() => {
    if (selectedIdx < 0 || !images[selectedIdx]) {
      setProcessedData(null);
      return;
    }
    const { img } = images[selectedIdx];
    const result = processImage(img, bgColor, threshold);
    setProcessedData(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, images, threshold, processImage]);

  // 메인 캔버스 렌더 (512×512 확대 미리보기)
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_DISPLAY, CANVAS_DISPLAY);

    if (!processedData || !processedData.hasContent) return;

    const { canvas: srcCanvas, bounds } = processedData;
    const bw = bounds.maxX - bounds.minX + 1;
    const bh = bounds.maxY - bounds.minY + 1;
    const scale = Math.min(
      (CANVAS_DISPLAY * 0.85) / bw,
      (CANVAS_DISPLAY * 0.85) / bh
    );
    const dw = bw * scale;
    const dh = bh * scale;
    const dx = (CANVAS_DISPLAY - dw) / 2;
    const dy = (CANVAS_DISPLAY - dh) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, bounds.minX, bounds.minY, bw, bh, dx, dy, dw, dh);
  }, [processedData]);

  // 32×32 최종 미리보기 렌더
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

    if (!processedData || !processedData.hasContent) return;

    const { canvas: srcCanvas, bounds } = processedData;
    const bw = bounds.maxX - bounds.minX + 1;
    const bh = bounds.maxY - bounds.minY + 1;
    const scale = Math.min(SPRITE_SIZE / bw, SPRITE_SIZE / bh);
    const dw = bw * scale;
    const dh = bh * scale;
    const dx = (SPRITE_SIZE - dw) / 2;
    const dy = (SPRITE_SIZE - dh) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, bounds.minX, bounds.minY, bw, bh, dx, dy, dw, dh);
  }, [processedData]);

  // 서버에 저장
  const saveItem = async () => {
    if (!processedData || !processedData.hasContent || !itemId || !itemName) {
      alert('이미지와 아이템 정보를 모두 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      // 최종 32×32 스프라이트 생성
      const spriteCanvas = document.createElement('canvas');
      spriteCanvas.width = SPRITE_SIZE;
      spriteCanvas.height = SPRITE_SIZE;
      const ctx = spriteCanvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      const { canvas: srcCanvas, bounds } = processedData;
      const bw = bounds.maxX - bounds.minX + 1;
      const bh = bounds.maxY - bounds.minY + 1;
      const scale = Math.min(SPRITE_SIZE / bw, SPRITE_SIZE / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = (SPRITE_SIZE - dw) / 2;
      const dy = (SPRITE_SIZE - dh) / 2;
      ctx.drawImage(
        srcCanvas,
        bounds.minX,
        bounds.minY,
        bw,
        bh,
        dx,
        dy,
        dw,
        dh
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        spriteCanvas.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('스프라이트 생성 실패');

      await uploadAsset(
        'items',
        {
          id: itemId, // 파일명으로 사용 (예: "blue_core.json / .png")
          name: itemName,
          itemId, // 게임 내 식별자 (동일값, 메타 가독성용)
          category,
          actNumber,
        },
        blob,
        `${itemId}.png`
      );

      alert(`"${itemName}" 저장 완료!`);
      setItemId('');
      setItemName('');
      await fetchSavedItems();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패';
      alert('저장 실패: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm('정말 삭제할까요?')) return;
    try {
      await deleteAsset('items', id);
      await fetchSavedItems();
    } catch {
      alert('삭제 실패');
    }
  };

  const selectedImage = selectedIdx >= 0 ? images[selectedIdx] : null;
  const canSave = Boolean(
    processedData?.hasContent && itemId && itemName && !isSaving
  );

  return (
    <div className="item-maker-container">
      <div className="im-wrapper">
        <header className="im-header">
          <div>
            <button onClick={() => navigate('/teacher')} className="im-back-btn">
              <ArrowLeft size={16} /> 대시보드로
            </button>
            <h1 className="im-title">아이템 스프라이트 메이커</h1>
          </div>
        </header>

        <main className="im-main">
          {/* 왼쪽: 이미지 목록 */}
          <div className="im-panel">
            <div className="im-panel-title">
              <Upload size={14} /> 이미지 목록
            </div>
            <button
              className="im-upload-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} /> 이미지 추가
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            <div className="im-thumb-list">
              {images.map((item, idx) => (
                <div
                  key={idx}
                  className={`im-thumb-item ${selectedIdx === idx ? 'active' : ''}`}
                  onClick={() => setSelectedIdx(idx)}
                >
                  <img src={item.src} className="im-thumb-img" alt="" />
                  <span className="im-thumb-name">{item.name}</span>
                  <button
                    className="im-thumb-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(idx);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 가운데: 캔버스 편집기 */}
          <div className="im-editor">
            {selectedImage ? (
              <>
                <div className="im-canvas-area">
                  <canvas
                    ref={mainCanvasRef}
                    width={CANVAS_DISPLAY}
                    height={CANVAS_DISPLAY}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>

                <div className="im-controls-row">
                  <div className="im-slider-group">
                    <div className="im-slider-label">
                      <span>배경 제거 감도</span>
                      <span>{threshold}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={threshold}
                      onChange={(e) => setThreshold(parseInt(e.target.value))}
                    />
                  </div>
                </div>

                <div className="im-preview-section">
                  <div className="im-preview-box">
                    <canvas
                      ref={previewCanvasRef}
                      width={SPRITE_SIZE}
                      height={SPRITE_SIZE}
                      style={{ width: '96px', height: '96px' }}
                    />
                  </div>
                  <div className="im-preview-info">
                    <Eye
                      size={12}
                      style={{
                        display: 'inline',
                        verticalAlign: 'middle',
                        marginRight: 4,
                      }}
                    />
                    <strong>32×32 미리보기</strong>
                    <br />
                    실제 게임에서 보이는 크기입니다.
                    <br />
                    배경이 깔끔하게 제거되었는지 확인하세요.
                  </div>
                </div>
              </>
            ) : (
              <div className="im-empty">
                <Package size={48} />
                <p style={{ fontSize: '0.85rem' }}>
                  왼쪽에서 이미지를 선택하세요
                </p>
              </div>
            )}
          </div>

          {/* 오른쪽: 아이템 정보 + 저장 */}
          <div className="im-panel">
            <div className="im-panel-title">
              <Save size={14} /> 아이템 정보
            </div>
            <div className="im-info-group">
              <div>
                <div className="im-info-label">아이템 ID (게임 내 식별자)</div>
                <input
                  className="im-info-input"
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  placeholder="blue_core"
                />
              </div>
              <div>
                <div className="im-info-label">아이템 이름</div>
                <input
                  className="im-info-input"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="파란 코어"
                />
              </div>
              <div>
                <div className="im-info-label">카테고리</div>
                <select
                  className="im-info-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="im-info-label">사용 막</div>
                <select
                  className="im-info-select"
                  value={actNumber}
                  onChange={(e) => setActNumber(parseInt(e.target.value))}
                >
                  <option value={1}>1막</option>
                  <option value={2}>2막</option>
                  <option value={3}>3막</option>
                  <option value={4}>4막</option>
                </select>
              </div>
            </div>
            <button
              className="im-save-btn"
              disabled={!canSave}
              onClick={saveItem}
            >
              <Save size={16} /> {isSaving ? '저장 중…' : '서버에 저장'}
            </button>

            {/* 저장된 아이템 */}
            <div
              style={{
                marginTop: '1.5rem',
                borderTop: '1px solid #eee',
                paddingTop: '1rem',
              }}
            >
              <div className="im-panel-title">
                <Package size={14} /> 저장된 아이템 ({savedItems.length})
              </div>
              <div className="im-saved-list">
                {savedItems.map((item) => (
                  <div key={item.id} className="im-saved-item">
                    {item.imagePath && (
                      <img
                        src={item.imagePath as string}
                        alt={item.name}
                      />
                    )}
                    <div className="im-saved-item-info">
                      <div className="im-saved-item-name">{item.name}</div>
                      <div className="im-saved-item-meta">
                        {String(item.itemId ?? '-')} / {String(item.category ?? '')} / {String(item.actNumber ?? '')}막
                      </div>
                    </div>
                    <button
                      className="im-thumb-remove"
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {savedItems.length === 0 && (
                  <p
                    style={{
                      fontSize: '0.7rem',
                      color: '#9ca3af',
                      textAlign: 'center',
                      padding: '1rem',
                    }}
                  >
                    아직 저장된 아이템이 없습니다
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
