import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Upload, Eraser, Play, Pause } from 'lucide-react';

interface StrokePoint {
  x: number;
  y: number;
  t: number; // video timestamp when drawn
}

interface Stroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff', '#000000'];

export function ReplayPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState(COLORS[0]);
  const [drawWidth, setDrawWidth] = useState(3);
  const currentStrokeRef = useRef<StrokePoint[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setStrokes([]);
      setCurrentStroke([]);
    }
  };

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoSrc, handleTimeUpdate, handleLoadedMetadata]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent | MouseEvent): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    }
    if (currentStroke.length >= 2) {
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = drawWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke, drawColor, drawWidth]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!videoRef.current || !canvasRef.current) return;
      e.preventDefault();
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const t = videoRef.current.currentTime;
      const start = [{ ...coords, t }];
      currentStrokeRef.current = start;
      setCurrentStroke(start);
      setIsDrawing(true);
    },
    [getCanvasCoords]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !videoRef.current) return;
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const t = videoRef.current.currentTime;
      const next = [...currentStrokeRef.current, { ...coords, t }];
      currentStrokeRef.current = next;
      setCurrentStroke(next);
    },
    [isDrawing, getCanvasCoords]
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawing) return;
    const points = currentStrokeRef.current;
    setIsDrawing(false);
    currentStrokeRef.current = [];
    setCurrentStroke([]);
    if (points.length >= 2) {
      setStrokes((prev) => [
        ...prev,
        { points, color: drawColor, width: drawWidth },
      ]);
    }
  }, [isDrawing, drawColor, drawWidth]);

  useEffect(() => {
    if (!isDrawing) return;
    const onMove = (e: MouseEvent) => {
      if (!videoRef.current || !canvasRef.current) return;
      const coords = getCanvasCoords(e);
      if (!coords) return;
      const t = videoRef.current.currentTime;
      const next = [...currentStrokeRef.current, { ...coords, t }];
      currentStrokeRef.current = next;
      setCurrentStroke(next);
    };
    const onUp = () => {
      if (!isDrawing) return;
      const points = currentStrokeRef.current;
      setIsDrawing(false);
      currentStrokeRef.current = [];
      setCurrentStroke([]);
      if (points.length >= 2) {
        setStrokes((prev) => [
          ...prev,
          { points, color: drawColor, width: drawWidth },
        ]);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDrawing, getCanvasCoords, drawColor, drawWidth]);

  // Resize canvas to match video
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container || !videoSrc) return;

    const updateSize = () => {
      const w = video.videoWidth || video.clientWidth;
      const h = video.videoHeight || video.clientHeight;
      if (w && h) {
        canvas.width = w;
        canvas.height = h;
        redraw();
      }
    };

    video.addEventListener('loadeddata', updateSize);
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    return () => {
      video.removeEventListener('loadeddata', updateSize);
      observer.disconnect();
    };
  }, [videoSrc, redraw]);

  const clearOverlay = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  if (!videoSrc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 rounded-xl glass-card p-8">
        <Upload className="w-12 h-12 text-gray-400" />
        <p className="text-gray-600 dark:text-gray-400 text-center">
          Import video footage to draw and annotate over playback.
        </p>
        <label className="px-4 py-2 rounded-lg bg-navy text-white dark:bg-rose-500 cursor-pointer hover:opacity-90 transition-opacity">
          Choose video file
          <input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-2">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setDrawColor(c)}
              className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Size:</span>
          <input
            type="range"
            min={1}
            max={12}
            value={drawWidth}
            onChange={(e) => setDrawWidth(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <button
          onClick={clearOverlay}
          className="flex items-center gap-1 px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm"
        >
          <Eraser className="w-4 h-4" />
          Clear overlay
        </button>
        <label className="flex items-center gap-1 px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm cursor-pointer">
          <Upload className="w-4 h-4" />
          New video
          <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      {/* Video + overlay */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex rounded-xl overflow-hidden glass-card bg-black relative"
      >
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full h-full object-contain"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain cursor-crosshair"
          style={{ pointerEvents: 'auto' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Playback controls */}
      <div className="flex-shrink-0 flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={seek}
          className="flex-1"
        />
        <span className="text-sm text-gray-500 tabular-nums">
          {Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')} /{' '}
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
        </span>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
        Draw over the video during playback. Annotations are stored with the current timestamp for reference.
      </p>
    </div>
  );
}
