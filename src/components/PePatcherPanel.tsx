import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Upload,
  Download,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
} from 'lucide-react';
import { ConvertedAsset } from '../utils/imageConverter';
import {
  PeInfo,
  parsePe,
  embedAsOverlay,
  injectNewPeSection,
  createMinimalWindowsExecutable,
} from '../utils/peParser';
import { generatePeOverlayExtractionCode } from '../utils/codeGenerators';

interface PePatcherPanelProps {
  currentAsset: ConvertedAsset;
  onPatchedExeGenerated?: (buffer: Uint8Array) => void;
}

export const PePatcherPanel: React.FC<PePatcherPanelProps> = ({
  currentAsset,
  onPatchedExeGenerated,
}) => {
  const [targetExeBuffer, setTargetExeBuffer] = useState<Uint8Array | null>(null);
  const [exeFileName, setExeFileName] = useState<string>('minimal_x64_stub.exe');
  const [peInfo, setPeInfo] = useState<PeInfo | null>(null);
  const [injectionMethod, setInjectionMethod] = useState<'overlay' | 'section'>('overlay');
  const [sectionName, setSectionName] = useState<string>('.imgres');
  const [patchedBuffer, setPatchedBuffer] = useState<Uint8Array | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'inspector' | 'code'>('inspector');

  // Load built-in minimal 64-bit PE stub by default
  const loadDefaultPeStub = () => {
    try {
      const stub = createMinimalWindowsExecutable();
      setTargetExeBuffer(stub);
      setExeFileName('minimal_win64_app.exe');
      const parsed = parsePe(stub);
      setPeInfo(parsed);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to initialize PE stub');
    }
  };

  useEffect(() => {
    if (!targetExeBuffer) {
      loadDefaultPeStub();
    }
  }, []);

  // Whenever target EXE or asset or method changes, perform the live injection
  useEffect(() => {
    if (!targetExeBuffer || !currentAsset) return;

    try {
      if (injectionMethod === 'overlay') {
        const patched = embedAsOverlay(targetExeBuffer, currentAsset.data, {
          assetId: 1001,
          width: currentAsset.width,
          height: currentAsset.height,
          formatCode: currentAsset.formatCode,
        });
        setPatchedBuffer(patched);
        onPatchedExeGenerated?.(patched);
        setErrorMessage(null);
      } else {
        const res = injectNewPeSection(targetExeBuffer, sectionName, currentAsset.data);
        if (res.success && res.buffer) {
          setPatchedBuffer(res.buffer);
          onPatchedExeGenerated?.(res.buffer);
          setErrorMessage(null);
        } else {
          setErrorMessage(res.error || 'Failed to inject PE section.');
          setPatchedBuffer(null);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error injecting asset into PE');
      setPatchedBuffer(null);
    }
  }, [targetExeBuffer, currentAsset, injectionMethod, sectionName]);

  const handleCustomExeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuf = reader.result as ArrayBuffer;
      const buf = new Uint8Array(arrayBuf);
      const parsed = parsePe(buf);

      if (!parsed) {
        setErrorMessage('File is not a valid Windows Portable Executable (missing MZ / PE signature).');
        return;
      }

      setTargetExeBuffer(buf);
      setExeFileName(file.name);
      setPeInfo(parsed);
      setErrorMessage(null);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadPatchedExe = () => {
    if (!patchedBuffer) return;
    const blob = new Blob([patchedBuffer as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = exeFileName.replace(/\.exe$/i, '');
    a.download = `${base}_embedded.exe`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const extractionSnippet = generatePeOverlayExtractionCode();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(extractionSnippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* PE Source Selector & Overview */}
      <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-3">
          <div>
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>Target Windows Executable (PE Binary)</span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              Current Target: <span className="font-mono text-cyan-300">{exeFileName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadDefaultPeStub}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
            >
              Reset to Minimal x64 Stub
            </button>
            <label className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Custom .exe</span>
              <input
                type="file"
                accept=".exe,.dll"
                className="hidden"
                onChange={handleCustomExeUpload}
              />
            </label>
          </div>
        </div>

        {/* Injection Strategy Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div
            onClick={() => setInjectionMethod('overlay')}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              injectionMethod === 'overlay'
                ? 'bg-cyan-950/30 border-cyan-500/60'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-white">PE Overlay Injection (Recommended)</span>
              {injectionMethod === 'overlay' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Appends the image payload at the physical end of the PE with a structured 32-byte <code className="text-cyan-300">IMGxWIN1</code> trailer. Safest method, works with all executables, digital signature compatible.
            </p>
          </div>

          <div
            onClick={() => setInjectionMethod('section')}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              injectionMethod === 'section'
                ? 'bg-cyan-950/30 border-cyan-500/60'
                : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-white">PE Section Injector (.imgres)</span>
              {injectionMethod === 'section' && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Adds a brand new entry into the PE Section Table with aligned RVA, increments NumberOfSections, and updates SizeOfImage.
            </p>
            {injectionMethod === 'section' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Section Name:</span>
                <input
                  type="text"
                  maxLength={8}
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs font-mono text-cyan-300 w-24"
                />
              </div>
            )}
          </div>
        </div>

        {/* Patch Outcome Banner */}
        {patchedBuffer && (
          <div className="flex items-center justify-between p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-lg">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div>
                <span className="text-xs font-semibold text-emerald-200">
                  Ready to Download: Patched PE Executable
                </span>
                <div className="text-[11px] text-slate-400 font-mono">
                  Original: {targetExeBuffer?.length.toLocaleString()} bytes · Patched: {patchedBuffer.length.toLocaleString()} bytes (+{currentAsset.byteSize.toLocaleString()} bytes payload)
                </div>
              </div>
            </div>

            <button
              onClick={handleDownloadPatchedExe}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Patched .exe</span>
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-lg text-xs text-rose-300 flex items-center gap-2 mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Sub tabs: PE Header Inspector vs Self-Extraction C++ Code */}
      <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/60">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveSubTab('inspector')}
              className={`text-xs font-semibold transition-colors pb-1 cursor-pointer ${
                activeSubTab === 'inspector'
                  ? 'text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              PE Binary Header Inspector
            </button>
            <button
              onClick={() => setActiveSubTab('code')}
              className={`text-xs font-semibold transition-colors pb-1 cursor-pointer ${
                activeSubTab === 'code'
                  ? 'text-cyan-400 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              C++ Self-Extraction Code (Win32 API)
            </button>
          </div>

          {activeSubTab === 'code' && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
            </button>
          )}
        </div>

        {activeSubTab === 'inspector' && peInfo && (
          <div className="space-y-4">
            {/* Headers Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">Architecture</span>
                <span className="text-white font-semibold">{peInfo.machineName}</span>
              </div>
              <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">Subsystem</span>
                <span className="text-white font-semibold">{peInfo.subsystemName}</span>
              </div>
              <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">Entry Point RVA</span>
                <span className="text-cyan-400 font-semibold">0x{peInfo.entryPointRva.toString(16)}</span>
              </div>
              <div className="p-2.5 bg-slate-950/60 border border-slate-800/60 rounded">
                <span className="text-[10px] text-slate-500 uppercase block">Sections Count</span>
                <span className="text-white font-semibold">{peInfo.numberOfSections} sections</span>
              </div>
            </div>

            {/* Sections Table */}
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-2">
                PE Section Table (IMAGE_SECTION_HEADER)
              </div>
              <div className="overflow-x-auto border border-slate-800 rounded">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Virtual Size</th>
                      <th className="py-2 px-3">Virtual Address (RVA)</th>
                      <th className="py-2 px-3">Raw Data Size</th>
                      <th className="py-2 px-3">Pointer to Raw</th>
                      <th className="py-2 px-3">Characteristics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {peInfo.sections.map((sec, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-semibold text-cyan-300">{sec.name}</td>
                        <td className="py-2 px-3 text-slate-300 tabular-nums">0x{sec.virtualSize.toString(16)} ({sec.virtualSize} B)</td>
                        <td className="py-2 px-3 text-slate-400 tabular-nums">0x{sec.virtualAddress.toString(16)}</td>
                        <td className="py-2 px-3 text-slate-300 tabular-nums">0x{sec.sizeOfRawData.toString(16)} ({sec.sizeOfRawData} B)</td>
                        <td className="py-2 px-3 text-slate-400 tabular-nums">0x{sec.pointerToRawData.toString(16)}</td>
                        <td className="py-2 px-3 text-slate-500 tabular-nums">0x{sec.characteristics.toString(16).padStart(8, '0')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'code' && (
          <div className="relative">
            <pre className="p-3 bg-slate-950 rounded border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto max-h-96 leading-relaxed">
              <code>{extractionSnippet}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
