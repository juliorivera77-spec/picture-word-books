import { useEffect, useRef, useState } from 'react';
import { canvasToBlob } from '../lib/images';

const COLORS = ['#000000', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#6d4c41', '#ffffff'];
const SIZE = 400;

/** A simple finger/mouse drawing pad for making your own picture. */
export function DrawPad({ onSave, onCancel }: { onSave: (b: Blob) => void; onCancel: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState('#000000');
  const [width, setWidth] = useState(10);
  const history = useRef<ImageData[]>([]);
  const drawing = useRef(false);

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height] as const;
  };
  const down = (e: React.PointerEvent) => {
    const ctx = ref.current!.getContext('2d')!;
    history.current.push(ctx.getImageData(0, 0, SIZE, SIZE));
    if (history.current.length > 30) history.current.shift();
    drawing.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext('2d')!;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => (drawing.current = false);
  const undo = () => {
    const prev = history.current.pop();
    if (prev) ref.current!.getContext('2d')!.putImageData(prev, 0, 0);
  };
  const clear = () => {
    const ctx = ref.current!.getContext('2d')!;
    history.current.push(ctx.getImageData(0, 0, SIZE, SIZE));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
  };

  return (
    <div className="drawpad">
      <canvas
        ref={ref}
        width={SIZE}
        height={SIZE}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <div className="row wrap">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${c === color ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={c === '#ffffff' ? 'eraser' : `colour ${c}`}
          />
        ))}
      </div>
      <div className="row wrap">
        <label className="row">
          Brush
          <input type="range" min={3} max={40} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        </label>
        <button type="button" className="btn" onClick={undo}>↶ Undo</button>
        <button type="button" className="btn" onClick={clear}>Clear</button>
      </div>
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" onClick={async () => onSave(await canvasToBlob(ref.current!))}>
          Use drawing
        </button>
      </div>
    </div>
  );
}
