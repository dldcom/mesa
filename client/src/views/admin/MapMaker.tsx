// 관리자 전용: 맵 메이커
// 원본: safegame/client/src/views/MapMaker.jsx → TS 포팅
// 저장: DB → 파일 (mesa/assets/maps/<mapId>.json + <mapId>.png)
//
// 기능:
//   - 배경 이미지 업로드 + 64x64 격자 위에 충돌 벽 그리기
//   - 벽 자동 감지 (어두운색 / 지정색)
//   - 오브젝트(플레이어 스폰, NPC, 아이템) 배치
//   - Tiled 포맷 호환 JSON 출력
//   - 서버에 저장 / 불러오기

import {
  useState,
  useEffect,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  uploadAsset,
  listAssets,
  getAsset,
  type AssetMetadata,
} from '@/services/adminApi';
import './MapMaker.css';

const TILE_SIZE = 32;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 64;

type ObjectType = 'playerspawn' | 'npc' | 'item';
type EditMode = 'wall' | 'eraser' | 'object' | 'ceiling';
type DrawTool = 'brush' | 'area';
type DetectMode = 'dark' | 'color';

const OBJECT_TYPES: {
  value: ObjectType;
  label: string;
  color: string;
  prefix: string;
}[] = [
  { value: 'playerspawn', label: '👤 시작 지점 (Player)', color: '#4a90e2', prefix: '' },
  { value: 'npc', label: '🧑 NPC 캐릭터', color: '#ff9f43', prefix: 'npc_' },
  { value: 'item', label: '📦 아이템/물건', color: '#2e86de', prefix: 'item_' },
];

type Spawn = {
  id: number;
  name: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

type MapData = {
  collision: number[];
  overlay: number[]; // 캐릭터보다 위에 렌더되는 천장 타일 (지나갈 수 있음)
  spawns: Spawn[];
};

type RgbColor = { r: number; g: number; b: number };

declare global {
  interface Window {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
  }
}

export default function MapMaker() {
  const navigate = useNavigate();

  const [mapImage, setMapImage] = useState<string | null>(null);
  const [mapImageBlob, setMapImageBlob] = useState<Blob | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('wall');
  const [showGrid, setShowGrid] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [history, setHistory] = useState<MapData[]>([]);
  const [mapId, setMapId] = useState('act1_power_grid');
  const [mapTitle, setMapTitle] = useState('1막 — 전력망 동기화');
  const [actNumber, setActNumber] = useState(1);
  const [drawTool, setDrawTool] = useState<DrawTool>('brush');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selectedObjectType, setSelectedObjectType] =
    useState<ObjectType>('playerspawn');
  const [objectSuffix, setObjectSuffix] = useState('');
  const [mapList, setMapList] = useState<AssetMetadata[]>([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [wallThreshold, setWallThreshold] = useState(40);
  const [wallColor, setWallColor] = useState<RgbColor>({ r: 0, g: 0, b: 0 });
  const [detectMode, setDetectMode] = useState<DetectMode>('dark');
  const [mapData, setMapData] = useState<MapData>({
    collision: Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
    overlay: Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
    spawns: [{ id: Date.now(), name: 'playerspawn', x: 200, y: 200 }],
  });

  const pushToHistory = () => {
    setHistory((prev) => {
      const next = [...prev, JSON.parse(JSON.stringify(mapData)) as MapData];
      if (next.length > 30) next.shift();
      return next;
    });
  };

  const handleUndo = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = next.pop();
      if (last) setMapData(last);
      return next;
    });
  };

  const handleCellAction = (index: number) => {
    setMapData((prev) => {
      if (editMode === 'object') {
        const x = (index % MAP_WIDTH) * TILE_SIZE;
        const y = Math.floor(index / MAP_WIDTH) * TILE_SIZE;
        const def = OBJECT_TYPES.find((t) => t.value === selectedObjectType)!;
        const fullName =
          selectedObjectType === 'playerspawn'
            ? 'playerspawn'
            : def.prefix + (objectSuffix || 'unnamed');

        // 같은 위치에 있으면 제거
        const exists = prev.spawns.find((s) => s.x === x && s.y === y);
        if (exists) {
          return {
            ...prev,
            spawns: prev.spawns.filter((s) => s.id !== exists.id),
          };
        }

        // playerspawn 은 하나만
        let filtered = prev.spawns;
        if (selectedObjectType === 'playerspawn') {
          filtered = prev.spawns.filter((s) => s.name !== 'playerspawn');
        }

        return {
          ...prev,
          spawns: [
            ...filtered,
            {
              id: Date.now(),
              name: fullName,
              x,
              y,
              width: TILE_SIZE,
              height: TILE_SIZE,
            },
          ],
        };
      }

      // 천장(ceiling) 모드: overlay 추가 + 같은 타일의 벽은 지움 (배타적)
      if (editMode === 'ceiling') {
        const alreadyCeiling = prev.overlay[index] === 1;
        const hasWall = prev.collision[index] === 1;
        if (alreadyCeiling && !hasWall) return prev;
        const newOverlay = alreadyCeiling ? prev.overlay : [...prev.overlay];
        const newCollision = hasWall ? [...prev.collision] : prev.collision;
        if (!alreadyCeiling) newOverlay[index] = 1;
        if (hasWall) newCollision[index] = 0;
        return { ...prev, overlay: newOverlay, collision: newCollision };
      }

      // 지우개: 해당 타일의 벽과 천장을 모두 제거
      if (editMode === 'eraser') {
        if (prev.collision[index] === 0 && prev.overlay[index] === 0) return prev;
        const newCollision = [...prev.collision];
        const newOverlay = [...prev.overlay];
        newCollision[index] = 0;
        newOverlay[index] = 0;
        return { ...prev, collision: newCollision, overlay: newOverlay };
      }

      // 벽(wall) 모드: 천장이 있는 타일은 보호(덮어쓰기 불가)
      if (prev.overlay[index] === 1) return prev;
      if (prev.collision[index] === 1) return prev;
      const newCollision = [...prev.collision];
      newCollision[index] = 1;
      return { ...prev, collision: newCollision };
    });
  };

  const handleAreaAction = (startIndex: number, endIndex: number) => {
    const sX = startIndex % MAP_WIDTH;
    const sY = Math.floor(startIndex / MAP_WIDTH);
    const eX = endIndex % MAP_WIDTH;
    const eY = Math.floor(endIndex / MAP_WIDTH);
    const xMin = Math.min(sX, eX);
    const xMax = Math.max(sX, eX);
    const yMin = Math.min(sY, eY);
    const yMax = Math.max(sY, eY);

    setMapData((prev) => {
      // 어느 레이어에 작용할지 결정
      const isCeiling = editMode === 'ceiling';
      const isEraser = editMode === 'eraser';

      if (isEraser) {
        // 벽·천장 둘 다 지움
        const newCollision = [...prev.collision];
        const newOverlay = [...prev.overlay];
        let changed = false;
        for (let y = yMin; y <= yMax; y++) {
          for (let x = xMin; x <= xMax; x++) {
            const idx = y * MAP_WIDTH + x;
            if (newCollision[idx] !== 0 || newOverlay[idx] !== 0) {
              newCollision[idx] = 0;
              newOverlay[idx] = 0;
              changed = true;
            }
          }
        }
        return changed
          ? { ...prev, collision: newCollision, overlay: newOverlay }
          : prev;
      }

      if (isCeiling) {
        // 천장 영역 채우기: overlay=1 설정 + 같은 타일 collision=0 으로 지움
        const newOverlay = [...prev.overlay];
        const newCollision = [...prev.collision];
        let changed = false;
        for (let y = yMin; y <= yMax; y++) {
          for (let x = xMin; x <= xMax; x++) {
            const idx = y * MAP_WIDTH + x;
            if (newOverlay[idx] !== 1) {
              newOverlay[idx] = 1;
              changed = true;
            }
            if (newCollision[idx] !== 0) {
              newCollision[idx] = 0;
              changed = true;
            }
          }
        }
        return changed
          ? { ...prev, overlay: newOverlay, collision: newCollision }
          : prev;
      }

      // 벽 영역 채우기: 천장 타일은 건너뜀 (보호)
      const newCollision = [...prev.collision];
      let changed = false;
      for (let y = yMin; y <= yMax; y++) {
        for (let x = xMin; x <= xMax; x++) {
          const idx = y * MAP_WIDTH + x;
          if (prev.overlay[idx] === 1) continue; // 천장 보호
          if (newCollision[idx] !== 1) {
            newCollision[idx] = 1;
            changed = true;
          }
        }
      }
      return changed ? { ...prev, collision: newCollision } : prev;
    });
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMapImageBlob(file);
    const reader = new FileReader();
    reader.onload = (ev) => setMapImage((ev.target?.result as string) ?? null);
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (index: number) => {
    pushToHistory();
    setIsDrawing(true);
    if (drawTool === 'brush' || editMode === 'object') {
      handleCellAction(index);
    } else {
      setDragStart(index);
      setDragEnd(index);
    }
  };

  const handleMouseEnter = (index: number) => {
    if (!isDrawing) return;
    if (editMode === 'object') return;
    if (drawTool === 'brush') handleCellAction(index);
    else setDragEnd(index);
  };

  useEffect(() => {
    const handleMouseUp = () => {
      if (
        isDrawing &&
        drawTool === 'area' &&
        dragStart !== null &&
        dragEnd !== null
      ) {
        handleAreaAction(dragStart, dragEnd);
      }
      setIsDrawing(false);
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawing, drawTool, dragStart, dragEnd, editMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Z (Windows/Linux) 또는 Cmd+Z (Mac), Shift 제외 (Shift+Ctrl+Z 는 redo 관례)
      const isUndo =
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        (e.key === 'z' || e.key === 'Z');
      if (!isUndo) return;
      // 입력 필드에서 타이핑 중이면 브라우저의 입력 undo 우선
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      e.preventDefault();
      setHistory((prev) => {
        if (prev.length === 0) return prev;
        const next = prev.slice();
        const last = next.pop();
        if (last) setMapData(last);
        return next;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const generateTiledJson = () => ({
    compressionlevel: -1,
    height: MAP_HEIGHT,
    infinite: false,
    layers: [
      {
        data: mapData.collision,
        height: MAP_HEIGHT,
        id: 1,
        name: 'collision',
        opacity: 0.5,
        type: 'tilelayer',
        visible: true,
        width: MAP_WIDTH,
        x: 0,
        y: 0,
      },
      {
        data: mapData.overlay,
        height: MAP_HEIGHT,
        id: 2,
        name: 'overlay',
        opacity: 0.5,
        type: 'tilelayer',
        visible: true,
        width: MAP_WIDTH,
        x: 0,
        y: 0,
      },
      {
        draworder: 'topdown',
        id: 3,
        name: 'spawn',
        objects: mapData.spawns.map((s) => ({
          id: s.id,
          name: s.name,
          point: false,
          rotation: 0,
          type: '',
          visible: true,
          x: s.x,
          y: s.y,
          width: s.width || 32,
          height: s.height || 32,
        })),
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 4,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.1',
    tileheight: 32,
    tilewidth: 32,
    type: 'map',
    version: '1.10',
    tilesets: [
      {
        firstgid: 1,
        name: 'CollisionTile',
        tilewidth: 32,
        tileheight: 32,
        tilecount: 1,
        columns: 1,
        margin: 0,
        spacing: 0,
        image: 'Wall',
        imagewidth: 32,
        imageheight: 32,
      },
    ],
    width: MAP_WIDTH,
  });

  const exportToJson = () => {
    const tiledJson = generateTiledJson();
    const blob = new Blob([JSON.stringify(tiledJson, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapId}.json`;
    a.click();
  };

  const fetchMapList = async () => {
    try {
      const data = await listAssets('maps');
      setMapList(data);
      setShowLoadModal(true);
    } catch (e) {
      console.error(e);
      setStatusMessage('목록을 불러오지 못했습니다.');
    }
  };

  const loadSelectedMap = async (id: string) => {
    if (!window.confirm('현재 작업 중인 내용이 사라집니다. 불러오시겠습니까?'))
      return;
    setStatusMessage('로딩 중…');
    try {
      const asset = await getAsset('maps', id);
      setMapId(asset.id);
      setMapTitle(asset.name);
      if (typeof asset.actNumber === 'number') setActNumber(asset.actNumber);
      if (asset.imagePath) setMapImage(asset.imagePath as string);

      const content = (asset.content ?? {}) as {
        layers?: Array<{
          name: string;
          data?: number[];
          objects?: Array<{ id?: number; name: string; x: number; y: number; width?: number; height?: number }>;
        }>;
      };
      const collisionLayer = content.layers?.find((l) => l.name === 'collision');
      const overlayLayer = content.layers?.find((l) => l.name === 'overlay');
      const spawnLayer = content.layers?.find((l) => l.name === 'spawn');

      setMapData({
        collision:
          collisionLayer?.data ?? Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
        overlay:
          overlayLayer?.data ?? Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
        spawns:
          spawnLayer?.objects?.map((o) => ({
            id: o.id ?? Date.now() + Math.random(),
            name: o.name,
            x: o.x,
            y: o.y,
            width: o.width ?? TILE_SIZE,
            height: o.height ?? TILE_SIZE,
          })) ?? [],
      });

      setShowLoadModal(false);
      setStatusMessage('불러오기 완료!');
      setTimeout(() => setStatusMessage(''), 2000);
    } catch (e) {
      console.error(e);
      setStatusMessage('불러오기 중 오류 발생.');
    }
  };

  // mapImage 가 data URL (업로드 직후) 이면 blob 변환, 아니면 그대로 없음
  const imageToBlob = async (): Promise<Blob | null> => {
    if (mapImageBlob) return mapImageBlob;
    if (mapImage && mapImage.startsWith('data:')) {
      const res = await fetch(mapImage);
      return res.blob();
    }
    return null;
  };

  const saveToServer = async () => {
    if (!mapId.trim()) {
      setStatusMessage('맵 ID 를 입력해주세요.');
      return;
    }
    setStatusMessage('저장 중…');
    try {
      const content = generateTiledJson();
      const blob = await imageToBlob();

      await uploadAsset(
        'maps',
        {
          id: mapId,
          name: mapTitle,
          actNumber,
          content,
        },
        blob ?? undefined,
        blob ? `${mapId}.png` : undefined
      );

      setStatusMessage('저장 완료!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (e) {
      console.error(e);
      setStatusMessage('저장 중 오류 발생.');
    }
  };

  const autoDetectWalls = () => {
    if (!mapImage) {
      alert('먼저 맵 이미지를 업로드하세요.');
      return;
    }
    pushToHistory();
    setStatusMessage('벽 자동 감지 중…');

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = MAP_WIDTH;
      canvas.height = MAP_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      const imageData = ctx.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
      const newCollision = [...mapData.collision];

      for (let i = 0; i < MAP_WIDTH * MAP_HEIGHT; i++) {
        // 천장 타일은 자동감지에서 제외 (보호)
        if (mapData.overlay[i] === 1) continue;

        const pi = i * 4;
        const r = imageData.data[pi];
        const g = imageData.data[pi + 1];
        const b = imageData.data[pi + 2];
        const a = imageData.data[pi + 3];
        let isWall = false;
        if (detectMode === 'dark') {
          const brightness = (r + g + b) / 3;
          isWall = brightness < wallThreshold * 2.55;
        } else {
          const dist = Math.sqrt(
            (r - wallColor.r) ** 2 +
              (g - wallColor.g) ** 2 +
              (b - wallColor.b) ** 2
          );
          isWall = dist < wallThreshold * 1.5;
        }
        if (a < 50) isWall = false;
        if (isWall) newCollision[i] = 1;
      }
      setMapData((prev) => ({ ...prev, collision: newCollision }));
      setStatusMessage('벽 자동 감지 완료!');
      setTimeout(() => setStatusMessage(''), 2000);
    };
    img.src = mapImage;
  };

  const pickWallColor = async () => {
    if (!window.EyeDropper) {
      alert('이 브라우저는 EyeDropper 를 지원하지 않아요.');
      return;
    }
    const dropper = new window.EyeDropper();
    try {
      const result = await dropper.open();
      const hex = result.sRGBHex;
      setWallColor({
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      });
      setDetectMode('color');
    } catch {
      /* canceled */
    }
  };

  const handleClearMap = () => {
    if (window.confirm('맵의 모든 벽과 천장을 지우시겠습니까?')) {
      pushToHistory();
      setMapData((prev) => ({
        ...prev,
        collision: Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
        overlay: Array(MAP_WIDTH * MAP_HEIGHT).fill(0),
      }));
    }
  };

  return (
    <div className="map-maker-root">
      <aside className="mm-sidebar">
        <div className="mm-logo-area">
          <h2 onClick={() => navigate('/teacher')} className="ed-logo clickable">
            M.E.S.A
          </h2>
          <span className="ed-logo-sub">Map Designer</span>
        </div>

        <div className="mm-db-actions" style={{ marginBottom: 20 }}>
          <button
            className="mm-export-btn secondary"
            style={{ width: '100%' }}
            onClick={fetchMapList}
          >
            📁 저장된 맵 불러오기
          </button>
        </div>

        <div className="mm-layer-section">
          <label className="mm-label">맵 이미지 파일 (.png / .jpg)</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="mm-file-input"
            id="map-upload"
          />
          <label htmlFor="map-upload" className="mm-upload-btn">
            🖼️ 맵 이미지 불러오기
          </label>

          <div className="mm-auto-detect">
            <label
              className="mm-label"
              style={{ color: '#00BFA5', marginBottom: 10 }}
            >
              벽 자동 감지
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                className="mm-tool-btn"
                style={{
                  flex: 1,
                  fontSize: 11,
                  background: detectMode === 'dark' ? '#1a1a1a' : '#fff',
                  color: detectMode === 'dark' ? '#fff' : '#1a1a1a',
                }}
                onClick={() => setDetectMode('dark')}
              >
                어두운색 = 벽
              </button>
              <button
                className="mm-tool-btn"
                style={{
                  flex: 1,
                  fontSize: 11,
                  background: detectMode === 'color' ? '#1a1a1a' : '#fff',
                  color: detectMode === 'color' ? '#fff' : '#1a1a1a',
                }}
                onClick={() => setDetectMode('color')}
              >
                지정색 = 벽
              </button>
            </div>
            {detectMode === 'color' && (
              <button
                className="mm-tool-btn"
                onClick={pickWallColor}
                style={{
                  width: '100%',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '1px solid #ccc',
                    background: `rgb(${wallColor.r},${wallColor.g},${wallColor.b})`,
                  }}
                ></div>
                벽 색상 추출
              </button>
            )}
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#888',
                  marginBottom: 4,
                }}
              >
                <span>감지 감도</span>
                <span>{wallThreshold}</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                value={wallThreshold}
                onChange={(e) => setWallThreshold(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <button
              className="mm-tool-btn"
              onClick={autoDetectWalls}
              style={{
                width: '100%',
                background: '#00BFA5',
                color: '#fff',
                border: 'none',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              🔍 벽 자동 감지 실행
            </button>
          </div>

          <label className="mm-label" style={{ marginTop: 30 }}>
            편집 모드
          </label>
          <div className="mm-tool-grid" style={{ marginBottom: 10 }}>
            <button
              className={`mm-tool-btn ${drawTool === 'brush' ? 'active-tool' : ''}`}
              onClick={() => setDrawTool('brush')}
            >
              🖌️ 브러시
            </button>
            <button
              className={`mm-tool-btn ${drawTool === 'area' ? 'active-tool' : ''}`}
              onClick={() => setDrawTool('area')}
            >
              ⬛ 영역 채우기
            </button>
          </div>

          <label className="mm-label">타일 종류</label>
          <div
            className="mm-tool-grid"
            style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
          >
            <button
              className={`mm-tool-btn ${editMode === 'wall' ? 'active-wall' : ''}`}
              onClick={() => setEditMode('wall')}
              title="캐릭터가 통과할 수 없는 벽"
            >
              🧱 벽
            </button>
            <button
              className={`mm-tool-btn ${editMode === 'ceiling' ? 'active-ceiling' : ''}`}
              onClick={() => setEditMode('ceiling')}
              title="통과 가능하지만 캐릭터보다 위에 렌더 (상인방·파이프·나무 등)"
            >
              🏠 천장
            </button>
            <button
              className={`mm-tool-btn ${editMode === 'eraser' ? 'active-eraser' : ''}`}
              onClick={() => setEditMode('eraser')}
              title="벽·천장 모두 지움"
            >
              🧹 지우개
            </button>
          </div>

          <label className="mm-label" style={{ marginTop: 20 }}>
            오브젝트 배치
          </label>
          <div className="mm-object-selector">
            <select
              className="mm-select"
              value={selectedObjectType}
              onChange={(e) => {
                setSelectedObjectType(e.target.value as ObjectType);
                setEditMode('object');
                setDrawTool('brush');
              }}
            >
              {OBJECT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {selectedObjectType !== 'playerspawn' && (
              <div style={{ marginTop: 10 }}>
                <label
                  className="mm-label"
                  style={{ fontSize: 10, marginBottom: 5 }}
                >
                  {selectedObjectType === 'npc'
                    ? 'NPC ID (npc_...)'
                    : '아이템 ID (item_...)'}
                </label>
                <input
                  type="text"
                  className="mm-text-input"
                  value={objectSuffix}
                  onChange={(e) =>
                    setObjectSuffix(e.target.value.replace(/[^a-z0-9_]/gi, ''))
                  }
                  placeholder="예: researcher, blue_core"
                />
              </div>
            )}
            <button
              className={`mm-tool-btn ${editMode === 'object' ? 'active-object' : ''}`}
              onClick={() => {
                setEditMode('object');
                setDrawTool('brush');
              }}
              style={{ marginTop: 10, width: '100%' }}
            >
              📍 오브젝트 배치 모드
            </button>
          </div>

          <label className="mm-label" style={{ marginTop: 20 }}>
            배치된 오브젝트 ({mapData.spawns.length})
          </label>
          <div className="mm-object-list">
            {mapData.spawns.map((s) => (
              <div key={s.id} className="mm-obj-item">
                <div style={{ flex: 1 }}>
                  {s.name === 'playerspawn' ? (
                    <span style={{ fontWeight: 800, color: '#4a90e2' }}>
                      START_POINT
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={s.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setMapData((prev) => ({
                          ...prev,
                          spawns: prev.spawns.map((p) =>
                            p.id === s.id ? { ...p, name: newName } : p
                          ),
                        }));
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#1a1a1a',
                        padding: '2px 0',
                      }}
                    />
                  )}
                  <div style={{ fontSize: 8, opacity: 0.5 }}>
                    POS: {s.x / TILE_SIZE}, {s.y / TILE_SIZE}
                  </div>
                </div>
                <button
                  onClick={() =>
                    setMapData((prev) => ({
                      ...prev,
                      spawns: prev.spawns.filter((p) => p.id !== s.id),
                    }))
                  }
                >
                  ❌
                </button>
              </div>
            ))}
          </div>

          <button
            className="mm-tool-btn"
            onClick={handleClearMap}
            style={{
              marginTop: 10,
              width: '100%',
              background: '#ff475711',
              color: '#ff4757',
              border: '1px solid #ff475722',
            }}
          >
            🗑️ 맵 초기화
          </button>
        </div>

        <div className="mm-tool-box" style={{ marginTop: 30 }}>
          <div style={{ marginBottom: 20 }}>
            <label className="mm-label">맵 ID (파일명)</label>
            <p
              style={{
                fontSize: 11,
                color: '#666',
                marginBottom: 5,
              }}
            >
              * 영문 아이디, 예: act1_power_grid
            </p>
            <input
              type="text"
              className="mm-text-input"
              value={mapId}
              onChange={(e) => setMapId(e.target.value)}
              placeholder="act1_power_grid"
              style={{
                border: '2px solid #000',
                fontFamily: 'monospace',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="mm-label">맵 제목</label>
            <input
              type="text"
              className="mm-text-input"
              value={mapTitle}
              onChange={(e) => setMapTitle(e.target.value)}
              placeholder="1막 — 전력망 동기화"
              style={{ border: '2px solid #000' }}
            />
          </div>

          <div>
            <label className="mm-label">사용 막</label>
            <select
              className="mm-select"
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

        <div className="mm-tool-box">
          <div className="mm-save-actions" style={{ marginTop: 20 }}>
            <button
              className="mm-export-btn secondary"
              onClick={exportToJson}
            >
              JSON 다운
            </button>
            <button className="mm-export-btn" onClick={saveToServer}>
              서버에 저장
            </button>
          </div>
          {statusMessage && <p className="mm-status">{statusMessage}</p>}
        </div>
      </aside>

      <main className="mm-canvas-area">
        <header
          className="mm-canvas-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: 30,
          }}
        >
          <div className="title-group">
            <h1 className="serif-title">{mapTitle}</h1>
            <p>타일을 선택하여 맵을 완성하세요. (드래그 가능, Ctrl+Z 로 실행 취소)</p>
          </div>
          <div className="canvas-settings">
            <label>
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />{' '}
              격자 표시
            </label>
          </div>
        </header>

        <div className="editor-view">
          <div className="canvas-frame">
            <div
              className="canvas-container"
              style={{ position: 'relative' }}
            >
              {mapImage && (
                <img
                  src={mapImage}
                  alt="Map Background"
                  className="map-base-layer"
                  style={{
                    width: MAP_WIDTH * TILE_SIZE,
                    height: MAP_HEIGHT * TILE_SIZE,
                    display: 'block',
                  }}
                />
              )}

              <div
                className="map-grid"
                onDragStart={(e: ReactMouseEvent<HTMLDivElement>) =>
                  e.preventDefault()
                }
                style={{
                  gridTemplateColumns: `repeat(${MAP_WIDTH}, 32px)`,
                  position: 'absolute',
                  inset: 0,
                  background: mapImage ? 'transparent' : '#eee',
                  userSelect: 'none',
                }}
              >
                {mapData.collision.map((isWall, i) => {
                  const isCeiling = mapData.overlay[i] === 1;
                  let isHighlighted = false;
                  if (
                    isDrawing &&
                    drawTool === 'area' &&
                    dragStart !== null &&
                    dragEnd !== null
                  ) {
                    const sX = dragStart % MAP_WIDTH;
                    const sY = Math.floor(dragStart / MAP_WIDTH);
                    const eX = dragEnd % MAP_WIDTH;
                    const eY = Math.floor(dragEnd / MAP_WIDTH);
                    const cX = i % MAP_WIDTH;
                    const cY = Math.floor(i / MAP_WIDTH);
                    isHighlighted =
                      cX >= Math.min(sX, eX) &&
                      cX <= Math.max(sX, eX) &&
                      cY >= Math.min(sY, eY) &&
                      cY <= Math.max(sY, eY);
                  }

                  return (
                    <div
                      key={i}
                      className={`map-cell ${showGrid ? 'grid' : ''} ${isWall ? 'is-wall' : ''} ${isCeiling ? 'is-ceiling' : ''} ${isHighlighted ? 'is-highlight' : ''}`}
                      onMouseDown={() => handleMouseDown(i)}
                      onMouseEnter={() => handleMouseEnter(i)}
                    >
                      {isWall === 1 && <div className="wall-overlay" />}
                      {isCeiling && <div className="ceiling-overlay" />}
                      {isHighlighted && (
                        <div className="area-highlight-overlay" />
                      )}
                    </div>
                  );
                })}

                {mapData.spawns.map((spawn) => (
                  <div
                    key={spawn.id}
                    className={`spawn-marker-overlay ${spawn.name}`}
                    style={{
                      position: 'absolute',
                      left: spawn.x,
                      top: spawn.y,
                      width: TILE_SIZE,
                      height: TILE_SIZE,
                      zIndex: 200,
                      pointerEvents: 'none',
                    }}
                  >
                    <div className="marker-core" />
                    <span className="marker-label">{spawn.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {showLoadModal && (
        <LoadMapModal
          maps={mapList}
          onSelect={loadSelectedMap}
          onClose={() => setShowLoadModal(false)}
        />
      )}
    </div>
  );
}

// ===== 불러오기 모달 =====
type LoadMapModalProps = {
  maps: AssetMetadata[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

function LoadMapModal({ maps, onSelect, onClose }: LoadMapModalProps) {
  return (
    <div className="mm-modal-overlay">
      <div className="mm-modal-content">
        <header className="mm-modal-header">
          <h3>저장된 맵 불러오기</h3>
          <button onClick={onClose}>&times;</button>
        </header>
        <div className="mm-map-grid-list">
          {maps.length === 0 ? (
            <p style={{ textAlign: 'center', padding: 40 }}>
              저장된 맵이 없습니다.
            </p>
          ) : (
            maps.map((m) => (
              <div
                key={m.id}
                className="mm-map-card"
                onClick={() => onSelect(m.id)}
              >
                <div className="card-info">
                  <h4>{m.name}</h4>
                  <p>ID: {m.id}</p>
                  {typeof m.actNumber === 'number' && <p>Act: {m.actNumber}막</p>}
                  <small>{new Date(m.createdAt).toLocaleDateString()}</small>
                </div>
                <div className="card-btn">불러오기</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
