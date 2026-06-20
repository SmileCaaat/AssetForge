// Edge-connected background matting.
//
// Naive "any near-white pixel = background" wrongly erases white elements ON the
// character (e.g. a white blouse). Instead we flood-fill near-white pixels that
// are CONNECTED to the image border: the background touches the border, while an
// interior white garment is enclosed by the (non-white) body and never reached.

export interface MatteOptions {
  /** A pixel counts as near-white background when every channel >= threshold (0..1). */
  whiteThreshold: number;
  /** Erode the foreground by this many pixels to kill the anti-aliased white fringe. */
  edgeShrink: number;
  /** Crop the result to the character's bounding box so it fills the texture (alignment). */
  cropToContent: boolean;
}

export const DEFAULT_MATTE: MatteOptions = { whiteThreshold: 0.85, edgeShrink: 2, cropToContent: true };

/** Returns an RGBA canvas where border-connected near-white pixels are transparent. */
export function floodFillMatte(img: HTMLImageElement, opts: MatteOptions): HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const n = w * h;
  const thr = Math.round(opts.whiteThreshold * 255);

  const isWhite = (i: number) => px[i] >= thr && px[i + 1] >= thr && px[i + 2] >= thr;

  // BFS flood fill from every border pixel that is near-white.
  const bg = new Uint8Array(n); // 1 = background
  const stack: number[] = [];
  const pushIfWhite = (x: number, y: number) => {
    const idx = y * w + x;
    if (bg[idx]) return;
    if (isWhite(idx * 4)) { bg[idx] = 1; stack.push(idx); }
  };
  for (let x = 0; x < w; x++) { pushIfWhite(x, 0); pushIfWhite(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfWhite(0, y); pushIfWhite(w - 1, y); }

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) pushIfWhite(x - 1, y);
    if (x < w - 1) pushIfWhite(x + 1, y);
    if (y > 0) pushIfWhite(x, y - 1);
    if (y < h - 1) pushIfWhite(x, y + 1);
  }

  // Erode the foreground edge inward to remove the white halo from anti-aliasing.
  let mask = bg;
  for (let s = 0; s < Math.max(0, opts.edgeShrink); s++) {
    const next = mask.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx]) continue; // already background
        // foreground pixel adjacent to background -> erode
        if (
          (x > 0 && mask[idx - 1]) ||
          (x < w - 1 && mask[idx + 1]) ||
          (y > 0 && mask[idx - w]) ||
          (y < h - 1 && mask[idx + w])
        ) next[idx] = 1;
      }
    }
    mask = next;
  }

  for (let i = 0; i < n; i++) if (mask[i]) px[i * 4 + 3] = 0;
  ctx.putImageData(data, 0, 0);

  // Crop to the foreground bounding box so the character fills the texture.
  // The reference views frame the character with different scale/padding; the
  // bake cameras frame the mesh bbox tightly, so normalising each image to its
  // content box is what makes the projection line up across views.
  if (!opts.cropToContent) return canvas;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) { // foreground
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return canvas; // nothing detected
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = bw;
  out.height = bh;
  out.getContext("2d")!.drawImage(canvas, minX, minY, bw, bh, 0, 0, bw, bh);
  return out;
}
