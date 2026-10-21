import React, { useRef, useState } from 'react';
import { Upload, Sparkles, Image as ImageIcon, Check } from 'lucide-react';
import { ConvertedAsset, PRESETS, encodeToWindowsBmp, encodeToWindowsIco, extractRawPixels } from '../utils/imageConverter';

interface ImageImporterProps {
  currentAsset: ConvertedAsset | null;
  onAssetChange: (asset: ConvertedAsset) => void;
}

export const ImageImporter: React.FC<ImageImporterProps> = ({ currentAsset, onAssetChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFormat, setSelectedFormat] = useState<'original' | 'bmp32' | 'bmp24' | 'ico' | 'raw_rgba'>('original');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string>('app_emblem');

  // Cache base image representation
  const [baseImage, setBaseImage] = useState<{
    canvas: HTMLCanvasElement;
    rawOriginalBytes: Uint8Array;
    originalFormat: string;
    filename: string;
  } | null>(null);

  // Convert canvas to requested target format
  const convertCanvasToAsset = async (
    canvas: HTMLCanvasElement,
    rawOriginal: Uint8Array,
    originalFmt: string,
    filename: string,
    targetFmt: 'original' | 'bmp32' | 'bmp24' | 'ico' | 'raw_rgba'
  ) => {
    setIsProcessing(true);
    try {
      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      let targetBytes: Uint8Array;
      let finalFilename = filename;
      let depth = '32-bit RGBA';
      let formatCode = 1; // PNG

      const nameBase = filename.substring(0, filename.lastIndexOf('.')) || filename;

      if (targetFmt === 'original') {
        targetBytes = rawOriginal;
        finalFilename = filename;
        if (originalFmt.includes('jpeg') || originalFmt.includes('jpg')) {
          formatCode = 2;
          depth = '24-bit RGB';
        } else if (originalFmt.includes('bmp')) {
          formatCode = 3;
          depth = '24/32-bit DIB';
        } else if (originalFmt.includes('ico')) {
          formatCode = 4;
          depth = 'Icon Resource';
        } else if (originalFmt.includes('webp')) {
          formatCode = 5;
          depth = '32-bit WebP';
        } else {
          formatCode = 1;
          depth = '32-bit PNG';
        }
      } else if (targetFmt === 'bmp32') {
        targetBytes = encodeToWindowsBmp(imgData, 32);
        finalFilename = `${nameBase}.bmp`;
        formatCode = 3;
        depth = '32-bit BGRA DIB';
      } else if (targetFmt === 'bmp24') {
        targetBytes = encodeToWindowsBmp(imgData, 24);
        finalFilename = `${nameBase}_24bpp.bmp`;
        formatCode = 3;
        depth = '24-bit BGR DIB';
      } else if (targetFmt === 'ico') {
        targetBytes = await encodeToWindowsIco(canvas, [32, 48, 64]);
        finalFilename = `${nameBase}.ico`;
        formatCode = 4;
        depth = 'Multi-res ICO (32, 48, 64)';
      } else {
        // raw_rgba
        targetBytes = extractRawPixels(imgData, 'rgba');
        finalFilename = `${nameBase}_rgba.raw`;
        formatCode = 6;
        depth = 'Raw RGBA8888 (Uncompressed)';
      }

      const dataUri = canvas.toDataURL('image/png');

      const converted: ConvertedAsset = {
        filename: finalFilename,
        originalFormat: originalFmt,
        targetFormat: targetFmt,
        width: w,
        height: h,
        data: targetBytes,
        dataUri,
        colorDepth: depth,
        byteSize: targetBytes.length,
        formatCode,
      };

      onAssetChange(converted);
    } catch (err) {
      console.error('Error converting image:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFormatChange = (newFmt: 'original' | 'bmp32' | 'bmp24' | 'ico' | 'raw_rgba') => {
    setSelectedFormat(newFmt);
    if (baseImage) {
      convertCanvasToAsset(
        baseImage.canvas,
        baseImage.rawOriginalBytes,
        baseImage.originalFormat,
        baseImage.filename,
        newFmt
      );
    }
  };

  const loadPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);

    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const ctx = canvas.getContext('2d')!;
    preset.draw(ctx, preset.width, preset.height);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const arrayBuf = await blob.arrayBuffer();
      const rawBytes = new Uint8Array(arrayBuf);
      const filename = `${preset.id}.png`;

      setBaseImage({
        canvas,
        rawOriginalBytes: rawBytes,
        originalFormat: 'PNG',
        filename,
      });

      convertCanvasToAsset(canvas, rawBytes, 'PNG', filename, selectedFormat);
    }, 'image/png');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setActivePresetId('');
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuf = reader.result as ArrayBuffer;
      const rawBytes = new Uint8Array(arrayBuf);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        setBaseImage({
          canvas,
          rawOriginalBytes: rawBytes,
          originalFormat: file.type.replace('image/', '').toUpperCase() || 'RAW',
          filename: file.name,
        });

        convertCanvasToAsset(
          canvas,
          rawBytes,
          file.type.replace('image/', '').toUpperCase() || 'RAW',
          file.name,
          selectedFormat
        );
      };
      img.src = URL.createObjectURL(file);
    };
    reader.readAsArrayBuffer(file);
  };

  // Initial load preset on mount if not loaded
  React.useEffect(() => {
    if (!currentAsset) {
      loadPreset('app_emblem');
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Upload Zone */}
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-semibold text-slate-300">Input Image Asset</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/bmp,image/x-icon,image/svg+xml"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Preview & Key Stats */}
        {currentAsset && (
          <div className="flex items-center gap-4 bg-slate-950/80 border border-slate-800/80 rounded p-2.5">
            <div className="w-16 h-16 shrink-0 rounded bg-slate-900/80 border border-slate-800 flex items-center justify-center p-1 relative overflow-hidden pattern-grid">
              <img
                src={currentAsset.dataUri}
                alt={currentAsset.filename}
                className="max-w-full max-h-full object-contain image-rendering-pixelated"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate">
                  {currentAsset.filename}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {currentAsset.width}×{currentAsset.height}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
                <span>{currentAsset.colorDepth}</span>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-400 font-semibold tabular-nums">
                  {currentAsset.byteSize.toLocaleString()} bytes
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Target Windows Format Conversion */}
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
        <label className="block text-xs font-semibold text-slate-300 mb-2">
          Target Native Storage Format
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => handleFormatChange('original')}
            className={`text-left p-2 rounded text-xs transition-colors border cursor-pointer ${
              selectedFormat === 'original'
                ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-white">Original Bytes</div>
            <div className="text-[11px] text-slate-400">PNG / JPG raw compressed</div>
          </button>

          <button
            type="button"
            onClick={() => handleFormatChange('bmp32')}
            className={`text-left p-2 rounded text-xs transition-colors border cursor-pointer ${
              selectedFormat === 'bmp32'
                ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-white">Windows BMP (32bpp)</div>
            <div className="text-[11px] text-slate-400">BGRA DIB, zero-decoder GDI</div>
          </button>

          <button
            type="button"
            onClick={() => handleFormatChange('ico')}
            className={`text-left p-2 rounded text-xs transition-colors border cursor-pointer ${
              selectedFormat === 'ico'
                ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-white">Windows Icon (.ico)</div>
            <div className="text-[11px] text-slate-400">Multi-size ICONDIR format</div>
          </button>

          <button
            type="button"
            onClick={() => handleFormatChange('raw_rgba')}
            className={`text-left p-2 rounded text-xs transition-colors border cursor-pointer ${
              selectedFormat === 'raw_rgba'
                ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="font-semibold text-white">Raw RGBA8 Framebuffer</div>
            <div className="text-[11px] text-slate-400">DirectX / Vulkan texels</div>
          </button>
        </div>
      </div>

      {/* Developer Presets */}
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Quick Prototyping Presets</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadPreset(preset.id)}
                className={`flex items-center gap-2 p-2 rounded text-xs transition-colors border cursor-pointer text-left ${
                  isSelected
                    ? 'bg-slate-800 border-cyan-500/60 text-white'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-200 truncate">{preset.name}</div>
                  <div className="text-[10px] text-slate-500">{preset.category} · {preset.width}x{preset.height}</div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
