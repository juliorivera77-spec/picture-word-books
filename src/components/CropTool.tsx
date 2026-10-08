import { useEffect, useMemo, useRef, useState } from 'react';
import { canvasToBlob } from '../lib/images';
import { Modal } from './SymbolPicker';

/** Part of an image, as fractions (0–1) of its width and height. */
export interface CropArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cut out part of a photo (turned the right way up first). */
export async function cropImage(image: Blob, a: CropArea): Promise<Blob> {
  const bmp = await createImageBitmap(image, { imageOrientation: 'from-image' });
  const sx = Math.round(a.x * bmp.width);
  const sy = Math.round(a.y * bmp.height);
  const sw = Math.max(1, Math.round(a.w * bmp.width));
  const sh = Math.max(1, Math.round(a.h * bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  bmp.close?.();
  return canvasToBlob(canvas, 'image/png');
}

/** Drag a box around the words on a page photo, so pictures and background are ignored. */
export function CropTool({ image, onDone, onCancel }: { image: Blob; onDone: (a: CropArea) => void; onCancel: () => void }) {
  const url = useMemo(() => URL.createObjectURL(image), [image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<[number, number] | null>(null);
  const [area, setArea] = useState<CropArea | null>(null);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const down = (e: React.PointerEvent) => {
    box.current!.setPointerCapture(e.pointerId);
    start.current = at(e);
    setArea(null);
  };
  const move = (e: React.PointerEvent) => {
    if (!start.current) return;
    const [x0, y0] = start.current;
    const [x1, y1] = at(e);
    setArea({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  };
  const up = () => (start.current = null);
  const ok = area && area.w > 0.03 && area.h > 0.02;

  return (
    <Modal title="Select the words" onClose={onCancel}>
      <p className="hint">Drag your finger over the text on the page to draw a box around it. Leave the pictures out.</p>
      <div ref={box} className="crop-box" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img src={url} alt="page" draggable={false} />
        {area && (
          <div
            className="crop-sel"
            style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%` }}
          />
        )}
      </div>
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={!ok} onClick={() => ok && onDone(area)}>Read these words</button>
      </div>
    </Modal>
  );
}
