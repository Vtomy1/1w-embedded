/**
 * Image processing & conversion utilities for Windows executable embedding
 * Supports PNG, JPEG, WebP, Windows DIB (.bmp 24/32-bit), Windows Icon (.ico), and raw framebuffer bytes.
 */

export interface ConvertedAsset {
  filename: string;
  originalFormat: string;
  targetFormat: 'original' | 'bmp24' | 'bmp32' | 'ico' | 'raw_rgba' | 'raw_bgra';
  width: number;
  height: number;
  data: Uint8Array;
  dataUri: string;
  colorDepth: string;
  byteSize: number;
  formatCode: number; // 1=PNG, 2=JPEG, 3=BMP, 4=ICO, 5=WEBP, 6=RAW_RGBA
}

export interface PresetImage {
  id: string;
  name: string;
  category: string;
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

/**
 * Encodes an RGBA ImageData into a standard Windows BMP file (DIB format)
 * Supports 24-bit (BGR) and 32-bit (BGRA) formats.
 */
export function encodeToWindowsBmp(imageData: ImageData, bpp: 24 | 32 = 32): Uint8Array {
  const { width, height, data } = imageData;
  const bytesPerPixel = bpp / 8;
  const rowSize = Math.floor((bpp * width + 31) / 32) * 4; // Row padding to 4-byte boundary
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;

  const buffer = new Uint8Array(fileSize);
  const view = new DataView(buffer.buffer);

  // --- BITMAPFILEHEADER (14 bytes) ---
  buffer[0] = 0x42; // 'B'
  buffer[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true); // bfSize
  view.setUint16(6, 0, true); // bfReserved1
  view.setUint16(8, 0, true); // bfReserved2
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true); // bfOffBits

  // --- BITMAPINFOHEADER (40 bytes) ---
  view.setUint32(14, infoHeaderSize, true); // biSize
  view.setInt32(18, width, true); // biWidth
  view.setInt32(22, height, true); // biHeight (positive = bottom-to-top)
  view.setUint16(26, 1, true); // biPlanes
  view.setUint16(28, bpp, true); // biBitCount (24 or 32)
  view.setUint32(30, 0, true); // biCompression (0 = BI_RGB uncompressed)
  view.setUint32(34, pixelArraySize, true); // biSizeImage
  view.setInt32(38, 2835, true); // biXPelsPerMeter (~72 DPI)
  view.setInt32(42, 2835, true); // biYPelsPerMeter (~72 DPI)
  view.setUint32(46, 0, true); // biClrUsed
  view.setUint32(50, 0, true); // biClrImportant

  // --- Pixel Array (Bottom-up, BGR or BGRA) ---
  let writeOffset = fileHeaderSize + infoHeaderSize;

  for (let y = height - 1; y >= 0; y--) {
    const rowStart = writeOffset;
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = data[srcIdx];
      const g = data[srcIdx + 1];
      const b = data[srcIdx + 2];
      const a = data[srcIdx + 3];

      buffer[writeOffset++] = b; // Blue
      buffer[writeOffset++] = g; // Green
      buffer[writeOffset++] = r; // Red
      if (bpp === 32) {
        buffer[writeOffset++] = a; // Alpha
      }
    }
    // Pad row to 4-byte multiple
    while ((writeOffset - rowStart) < rowSize) {
      buffer[writeOffset++] = 0;
    }
  }

  return buffer;
}

/**
 * Encodes an image into a Windows .ICO file
 * Supports modern PNG-in-ICO format (Windows Vista/7/10/11 native standard)
 */
export async function encodeToWindowsIco(canvas: HTMLCanvasElement, sizes: number[] = [32, 48, 64]): Promise<Uint8Array> {
  const images: { size: number; pngData: Uint8Array }[] = [];

  for (const s of sizes) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = s;
    tempCanvas.height = s;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, s, s);

    const blob = await new Promise<Blob>((resolve) =>
      tempCanvas.toBlob((b) => resolve(b!), 'image/png')
    );
    const arrayBuf = await blob.arrayBuffer();
    images.push({ size: s, pngData: new Uint8Array(arrayBuf) });
  }

  // Calculate ICO file size
  // ICONDIR = 6 bytes
  // ICONDIRENTRY = 16 bytes per image
  const headerSize = 6 + images.length * 16;
  const totalSize = images.reduce((acc, img) => acc + img.pngData.length, headerSize);

  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // idReserved
  view.setUint16(2, 1, true); // idType (1 = icon)
  view.setUint16(4, images.length, true); // idCount

  let dataOffset = headerSize;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const entryOffset = 6 + i * 16;

    // ICONDIRENTRY
    buffer[entryOffset + 0] = img.size >= 256 ? 0 : img.size; // bWidth (0 means 256)
    buffer[entryOffset + 1] = img.size >= 256 ? 0 : img.size; // bHeight
    buffer[entryOffset + 2] = 0; // bColorCount (0 if >= 8bpp)
    buffer[entryOffset + 3] = 0; // bReserved
    view.setUint16(entryOffset + 4, 1, true); // wPlanes
    view.setUint16(entryOffset + 6, 32, true); // wBitCount
    view.setUint32(entryOffset + 8, img.pngData.length, true); // dwBytesInRes
    view.setUint32(entryOffset + 12, dataOffset, true); // dwImageOffset

    buffer.set(img.pngData, dataOffset);
    dataOffset += img.pngData.length;
  }

  return buffer;
}

/**
 * Extracts Raw RGBA / BGRA byte array from canvas
 */
export function extractRawPixels(imageData: ImageData, format: 'rgba' | 'bgra'): Uint8Array {
  const { width, height, data } = imageData;
  const total = width * height * 4;
  const out = new Uint8Array(total);

  if (format === 'rgba') {
    out.set(data);
  } else {
    for (let i = 0; i < total; i += 4) {
      out[i] = data[i + 2];     // B
      out[i + 1] = data[i + 1]; // G
      out[i + 2] = data[i];     // R
      out[i + 3] = data[i + 3]; // A
    }
  }
  return out;
}

/**
 * Built-in Preset Generators for Developer Prototyping
 */
export const PRESETS: PresetImage[] = [
  {
    id: 'app_emblem',
    name: 'Cyber Emblem (Icon)',
    category: 'Application Icon',
    width: 64,
    height: 64,
    draw: (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // Background rounded diamond
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(1, '#3b82f6');

      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 12);
      ctx.fill();

      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner geometric core
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(w / 2, 14);
      ctx.lineTo(w - 14, h / 2);
      ctx.lineTo(w / 2, h - 14);
      ctx.lineTo(14, h / 2);
      ctx.closePath();
      ctx.fill();

      // Center cross / chip
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.rect(w / 2 - 6, h / 2 - 6, 12, 12);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'game_sword',
    name: 'Pixel Relic (Sprite)',
    category: 'Game Sprite',
    width: 32,
    height: 32,
    draw: (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // Pixelated 32x32 sword
      const pixels: [number, number, string][] = [
        // Blade
        [22, 6, '#38bdf8'], [23, 7, '#38bdf8'], [24, 8, '#38bdf8'],
        [20, 8, '#0284c7'], [21, 9, '#38bdf8'], [22, 10, '#e0f2fe'],
        [18, 10, '#0284c7'], [19, 11, '#38bdf8'], [20, 12, '#e0f2fe'],
        [16, 12, '#0284c7'], [17, 13, '#38bdf8'], [18, 14, '#e0f2fe'],
        [14, 14, '#0284c7'], [15, 15, '#38bdf8'], [16, 16, '#e0f2fe'],
        // Crossguard
        [13, 17, '#f59e0b'], [14, 18, '#fbbf24'], [15, 19, '#f59e0b'],
        [11, 15, '#d97706'], [12, 16, '#f59e0b'], [16, 20, '#d97706'],
        // Grip & Pommel
        [11, 19, '#78350f'], [10, 20, '#92400e'], [9, 21, '#78350f'],
        [7, 23, '#f59e0b'], [8, 24, '#fbbf24'], [6, 24, '#d97706'],
      ];

      for (const [px, py, col] of pixels) {
        ctx.fillStyle = col;
        ctx.fillRect(px, py, 1, 1);
      }
    },
  },
  {
    id: 'splash_banner',
    name: 'Engine Splash Banner',
    category: 'Splash Screen',
    width: 480,
    height: 270,
    draw: (ctx, w, h) => {
      // Dark space gradient
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#030712');
      bg.addColorStop(0.5, '#0b1329');
      bg.addColorStop(1, '#020617');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Subtle cyber grid
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Glowing badge
      const glow = ctx.createRadialGradient(w / 2, h / 2 - 20, 10, w / 2, h / 2 - 20, 140);
      glow.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
      glow.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // Title typography
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WIN32 RUNTIME SUBSYSTEM', w / 2, h / 2 - 10);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      ctx.fillText('NATIVE PE ASSET CONTAINER', w / 2, h / 2 + 16);

      // Framing lines
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 100, h / 2 + 35);
      ctx.lineTo(w / 2 + 100, h / 2 + 35);
      ctx.stroke();
    },
  },
  {
    id: 'hud_dial',
    name: 'Telemetry Dial (HUD)',
    category: 'UI Sprite',
    width: 96,
    height: 96,
    draw: (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const r = 38;

      // Outer ring
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Active arc
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#10b981');
      grad.addColorStop(1, '#06b6d4');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI * 0.75, Math.PI * 0.35);
      ctx.stroke();

      // Center value
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 15px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('84%', cx, cy);
    },
  },
];
