'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Pencil, Eraser, Type, Square, Circle, ArrowRight, Minus,
  Trash2, Download, Pipette
} from 'lucide-react';
import type { Socket } from 'socket.io-client';

interface Point { x: number; y: number; }

interface DrawAction {
  id: string;
  type: 'path' | 'rectangle' | 'circle' | 'line' | 'arrow' | 'text';
  color: string;
  strokeSize: number;
  points?: Point[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
  isEraser?: boolean;
}

type Tool = 'pen' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line' | 'arrow';

const TOOLS: { id: Tool; icon: typeof Pencil; label: string }[] = [
  { id: 'pen', icon: Pencil, label: 'Pen' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'circle', icon: Circle, label: 'Circle' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
];

const STROKE_SIZES = [2, 4, 6, 10, 16];
const COLORS = ['#ffffff', '#e4e4e7', '#a1a1aa', '#71717a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

function drawActionOnCanvas(ctx: CanvasRenderingContext2D, action: DrawAction) {
  ctx.save();

  if (action.isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
  }

  ctx.lineWidth = action.strokeSize;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (action.type) {
    case 'path': {
      if (!action.points || action.points.length < 2) {
        if (action.points && action.points.length === 1) {
          ctx.beginPath();
          ctx.arc(action.points[0].x, action.points[0].y, action.strokeSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      ctx.beginPath();
      ctx.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x, action.points[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'rectangle': {
      if (action.startX === undefined || action.startY === undefined || action.endX === undefined || action.endY === undefined) break;
      const x = Math.min(action.startX, action.endX);
      const y = Math.min(action.startY, action.endY);
      const w = Math.abs(action.endX - action.startX);
      const h = Math.abs(action.endY - action.startY);
      ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'circle': {
      if (action.startX === undefined || action.startY === undefined || action.endX === undefined || action.endY === undefined) break;
      const cx = (action.startX + action.endX) / 2;
      const cy = (action.startY + action.endY) / 2;
      const rx = Math.abs(action.endX - action.startX) / 2;
      const ry = Math.abs(action.endY - action.startY) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line':
    case 'arrow': {
      if (action.startX === undefined || action.startY === undefined || action.endX === undefined || action.endY === undefined) break;
      ctx.beginPath();
      ctx.moveTo(action.startX, action.startY);
      ctx.lineTo(action.endX, action.endY);
      ctx.stroke();

      if (action.type === 'arrow') {
        const angle = Math.atan2(action.endY - action.startY, action.endX - action.startX);
        const headLen = Math.max(10, action.strokeSize * 3);
        ctx.beginPath();
        ctx.moveTo(action.endX, action.endY);
        ctx.lineTo(action.endX - headLen * Math.cos(angle - Math.PI / 6), action.endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(action.endX - headLen * Math.cos(angle + Math.PI / 6), action.endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        if (action.isEraser) {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'rgba(0,0,0,1)';
        }
        ctx.fill();
      }
      break;
    }
    case 'text': {
      if (action.text === undefined || action.startX === undefined || action.startY === undefined) break;
      const fontSize = Math.max(14, action.strokeSize * 4);
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = action.isEraser ? 'rgba(0,0,0,1)' : action.color;
      if (action.isEraser) ctx.globalCompositeOperation = 'destination-out';
      ctx.fillText(action.text, action.startX, action.startY);
      break;
    }
  }

  ctx.restore();
}

interface Props {
  socket: Socket | null;
  roomId: string;
}

export default function Whiteboard({ socket, roomId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ffffff');
  const [strokeSize, setStrokeSize] = useState(3);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);

  const actionsRef = useRef<DrawAction[]>([]);
  const isDrawingRef = useRef(false);
  const startPosRef = useRef<Point | null>(null);
  const currentPathRef = useRef<Point[]>([]);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const textPosRef = useRef<Point | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textInputVisible, setTextInputVisible] = useState(false);

  // Keep actionsRef in sync
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Socket events
  useEffect(() => {
    if (!socket) return;

    const handleDraw = (action: DrawAction) => {
      setActions(prev => [...prev, action]);
    };

    const handleState = (boardActions: DrawAction[]) => {
      setActions(boardActions);
    };

    const handleClear = () => {
      setActions([]);
    };

    socket.on('whiteboard-draw', handleDraw);
    socket.on('whiteboard-state', handleState);
    socket.on('whiteboard-clear', handleClear);

    socket.emit('whiteboard-request-state');

    return () => {
      socket.off('whiteboard-draw', handleDraw);
      socket.off('whiteboard-state', handleState);
      socket.off('whiteboard-clear', handleClear);
    };
  }, [socket]);

  // Canvas resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resize = () => {
      const canvas = canvasRef.current;
      const overlay = overlayRef.current;
      if (!canvas || !overlay) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      overlay.width = rect.width * dpr;
      overlay.height = rect.height * dpr;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      const oCtx = overlay.getContext('2d')!;
      oCtx.scale(dpr, dpr);

      redrawAll();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    return () => ro.disconnect();
  }, []);

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    for (const action of actionsRef.current) {
      drawActionOnCanvas(ctx, action);
    }
    ctx.restore();
  }, []);

  // Redraw when actions change
  useEffect(() => {
    redrawAll();
  }, [actions, redrawAll]);

  // Get canvas coordinates
  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // Draw preview on overlay
  const drawPreview = useCallback((start: Point, current: Point) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.scale(dpr, dpr);

    const previewAction: DrawAction = {
      id: 'preview',
      type: tool === 'eraser' ? 'path' : (tool as DrawAction['type']),
      color,
      strokeSize,
      startX: start.x,
      startY: start.y,
      endX: current.x,
      endY: current.y,
      isEraser: tool === 'eraser',
    };

    if (tool === 'pen' || tool === 'eraser') {
      const path: Point[] = [start, current];
      previewAction.points = path;
      previewAction.type = 'path';
    } else if (tool === 'text') {
      ctx.restore();
      return;
    }

    drawActionOnCanvas(ctx, previewAction);
    ctx.restore();
  }, [tool, color, strokeSize]);

  // Clear overlay
  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.restore();
  }, []);

  const emitAction = useCallback((action: DrawAction) => {
    if (!socket) return;
    socket.emit('whiteboard-draw', action);
  }, [socket]);

  // Mouse/touch handlers
  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;

    if (tool === 'text') {
      textPosRef.current = pos;
      setTextInput('');
      setTextInputVisible(true);
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    isDrawingRef.current = true;
    startPosRef.current = pos;
    currentPathRef.current = [pos];
  }, [tool, getPos]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !startPosRef.current) return;
    const pos = getPos(e);
    if (!pos) return;

    if (tool === 'pen' || tool === 'eraser') {
      currentPathRef.current.push(pos);
      drawPreview(startPosRef.current, pos);
    } else {
      drawPreview(startPosRef.current, pos);
    }
  }, [tool, getPos, drawPreview]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current || !startPosRef.current) return;
    isDrawingRef.current = false;

    const endPos = getPos(e);
    if (!endPos) return;
    const start = startPosRef.current;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let action: DrawAction | null = null;

    switch (tool) {
      case 'pen':
        action = {
          id,
          type: 'path',
          color,
          strokeSize,
          points: currentPathRef.current,
          isEraser: false,
        };
        break;
      case 'eraser':
        action = {
          id,
          type: 'path',
          color: '#000000',
          strokeSize,
          points: currentPathRef.current,
          isEraser: true,
        };
        break;
      case 'rectangle':
        action = { id, type: 'rectangle', color, strokeSize, startX: start.x, startY: start.y, endX: endPos.x, endY: endPos.y };
        break;
      case 'circle':
        action = { id, type: 'circle', color, strokeSize, startX: start.x, startY: start.y, endX: endPos.x, endY: endPos.y };
        break;
      case 'line':
        action = { id, type: 'line', color, strokeSize, startX: start.x, startY: start.y, endX: endPos.x, endY: endPos.y };
        break;
      case 'arrow':
        action = { id, type: 'arrow', color, strokeSize, startX: start.x, startY: start.y, endX: endPos.x, endY: endPos.y };
        break;
    }

    if (action) {
      setActions(prev => [...prev, action!]);
      emitAction(action);
    }

    clearOverlay();
    startPosRef.current = null;
    currentPathRef.current = [];
  }, [tool, color, strokeSize, getPos, clearOverlay, emitAction]);

  // Text input submission
  const submitText = useCallback(() => {
    if (!textInput.trim() || !textPosRef.current) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const action: DrawAction = {
      id,
      type: 'text',
      color,
      strokeSize,
      startX: textPosRef.current.x,
      startY: textPosRef.current.y,
      text: textInput,
    };
    setActions(prev => [...prev, action]);
    emitAction(action);
    setTextInputVisible(false);
    setTextInput('');
    textPosRef.current = null;
  }, [textInput, color, strokeSize, emitAction]);

  const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitText();
    }
    if (e.key === 'Escape') {
      setTextInputVisible(false);
      setTextInput('');
      textPosRef.current = null;
    }
  }, [submitText]);

  const handleClear = useCallback(() => {
    setActions([]);
    if (socket) {
      socket.emit('whiteboard-clear');
    }
  }, [socket]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId.slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [roomId]);

  const currentIcon = TOOLS.find(t => t.id === tool)?.icon || Pencil;

  return (
    <div className="flex flex-col h-full premium-glass-card rounded-[28px] overflow-hidden border-shine">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 sm:gap-2 sm:px-4 py-2 border-b border-white/[0.06] bg-white/[0.02] shrink-0 overflow-x-auto scrollbar-none relative z-[1000]">
        {/* Tools */}
        <div className="flex items-center gap-0.5 sm:gap-1 mr-1 sm:mr-2">
          {TOOLS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => { setTool(t.id); setShowColorPicker(false); setShowStrokePicker(false); }}
                className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${
                  tool === t.id
                    ? 'bg-white/15 text-white border border-white/[0.12] shadow-sm'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.06]'
                }`}
                title={t.label}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-white/[0.08] shrink-0" />

        {/* Color picker */}
        <div className="relative">
          <button
            onClick={() => { setShowColorPicker(!showColorPicker); setShowStrokePicker(false); }}
            className="p-1.5 sm:p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-200"
            title="Color"
          >
            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border border-white/20" style={{ backgroundColor: color }} />
          </button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-[9999] p-2 premium-glass-dropdown rounded-xl shadow-xl min-w-[160px]">
              <div className="grid grid-cols-6 gap-1 mb-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setShowColorPicker(false); }}
                    className={`w-6 h-6 rounded-full border transition-all ${
                      c === color ? 'border-white scale-110' : 'border-white/20 hover:border-white/40'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Pipette className="w-3 h-3 text-white/40 shrink-0" />
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  className="w-full h-6 rounded cursor-pointer bg-transparent border-0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Stroke size */}
        <div className="relative">
          <button
            onClick={() => { setShowStrokePicker(!showStrokePicker); setShowColorPicker(false); }}
            className="p-1.5 sm:p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-200 text-[10px] sm:text-xs font-mono min-w-[24px]"
            title="Stroke size"
          >
            {strokeSize}px
          </button>
          {showStrokePicker && (
            <div className="absolute top-full left-0 mt-1 z-[9999] p-2 premium-glass-dropdown rounded-xl shadow-xl min-w-[120px]">
              {STROKE_SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => { setStrokeSize(s); setShowStrokePicker(false); }}
                  className={`flex items-center gap-3 w-full px-2 py-1.5 rounded-lg text-xs transition-all ${
                    s === strokeSize ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/[0.06] hover:text-white/70'
                  }`}
                >
                  <div className="w-6 flex items-center justify-center">
                    <div className="rounded-full bg-current" style={{ width: Math.min(s, 12), height: Math.min(s, 12) }} />
                  </div>
                  <span className="font-mono">{s}px</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-white/[0.08] shrink-0" />

        {/* Clear */}
        <button
          onClick={handleClear}
          className="p-1.5 sm:p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          title="Clear board"
        >
          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Download */}
        <button
          onClick={handleDownload}
          className="p-1.5 sm:p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-200"
          title="Download PNG"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        {/* Tool indicator */}
        <div className="ml-auto hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[9px] text-white/30 font-mono">
          <Pencil className="w-2 h-2" />
          <span className="capitalize">{tool}</span>
        </div>
      </div>

      {/* Canvas area */}
      <div ref={containerRef} className="flex-1 relative bg-[#0a0a0e] overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />
        <canvas
          ref={overlayRef}
          className="absolute inset-0 pointer-events-none touch-none"
        />

        {/* Text input overlay */}
        {textInputVisible && textPosRef.current && (
          <div
            className="absolute z-[9999]"
            style={{ left: textPosRef.current.x, top: textPosRef.current.y }}
          >
            <textarea
              ref={textInputRef}
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={handleTextKeyDown}
              onBlur={submitText}
              placeholder="Type here..."
              className="bg-black/80 border border-white/20 rounded-lg px-2 py-1 text-white text-sm outline-none min-w-[120px] max-w-[250px] resize-none"
              rows={1}
              autoFocus
            />
          </div>
        )}

        {/* Bottom-left tool indicator */}
        <div className="absolute bottom-2 left-2 flex items-center gap-2 pointer-events-none">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 text-[9px] text-white/30 font-mono">
            <Pencil className="w-2.5 h-2.5" />
            <span className="capitalize">{tool}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 text-[9px] text-white/30">
            <div className="w-2 h-2 rounded-full border border-white/20" style={{ backgroundColor: color }} />
            <span className="font-mono">{strokeSize}px</span>
          </div>
        </div>
      </div>
    </div>
  );
}
