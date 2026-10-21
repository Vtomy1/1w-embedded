/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { TopBar } from './components/TopBar';
import { ImageImporter } from './components/ImageImporter';
import { HeaderSettingsPanel } from './components/HeaderSettingsPanel';
import { CodeViewer } from './components/CodeViewer';
import { PePatcherPanel } from './components/PePatcherPanel';
import { HexViewer } from './components/HexViewer';
import { ConvertedAsset } from './utils/imageConverter';
import {
  HeaderConfig,
  DEFAULT_HEADER_CONFIG,
  generateCppHeader,
  generateResourceScript,
  generateWin32ResourceExtractionCode,
  generateAssemblyCode,
  generateRustCode,
} from './utils/codeGenerators';
import { exportDeveloperZip } from './utils/projectExporter';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('header');
  const [currentAsset, setCurrentAsset] = useState<ConvertedAsset | null>(null);
  const [config, setConfig] = useState<HeaderConfig>(DEFAULT_HEADER_CONFIG);
  const [patchedExeBuffer, setPatchedExeBuffer] = useState<Uint8Array | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Generated code contents
  const cppHeaderCode = useMemo(() => {
    if (!currentAsset) return '// Loading asset...';
    return generateCppHeader(currentAsset, config);
  }, [currentAsset, config]);

  const { rcCode, resourceHeaderCode } = useMemo(() => {
    if (!currentAsset) return { rcCode: '', resourceHeaderCode: '' };
    const res = generateResourceScript(currentAsset, config);
    return { rcCode: res.rc, resourceHeaderCode: res.h };
  }, [currentAsset, config]);

  const win32ExtractionCode = useMemo(() => {
    return generateWin32ResourceExtractionCode(config);
  }, [config]);

  const assemblyCode = useMemo(() => {
    if (!currentAsset) return '';
    return generateAssemblyCode(currentAsset, config);
  }, [currentAsset, config]);

  const rustCode = useMemo(() => {
    if (!currentAsset) return '';
    return generateRustCode(currentAsset, config);
  }, [currentAsset, config]);

  const handleExportBundle = async () => {
    if (!currentAsset) return;
    setIsExporting(true);
    try {
      const zipBlob = await exportDeveloperZip(
        currentAsset,
        config,
        patchedExeBuffer || undefined
      );
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WinEmbed_${config.variableName}_Bundle.zip`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Developer Bundle (.zip) exported successfully!');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to export bundle.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract (3 Zones) */}
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onExportBundle={handleExportBundle}
        isExporting={isExporting}
      />

      {/* Main Workspace (Sidebar + Viewport) */}
      <div className="flex-1 max-w-[1540px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Image Asset & Header Settings */}
        <aside className="lg:col-span-4 space-y-4">
          <ImageImporter
            currentAsset={currentAsset}
            onAssetChange={(newAsset) => setCurrentAsset(newAsset)}
          />

          <HeaderSettingsPanel
            config={config}
            onChange={(newConfig) => setConfig(newConfig)}
          />
        </aside>

        {/* Right Column: Viewport Tabs */}
        <main className="lg:col-span-8 min-w-0">
          {/* TAB 1: C/C++ Header */}
          {activeTab === 'header' && (
            <CodeViewer
              title="C/C++ Native Header"
              filename={`${config.variableName}.h`}
              code={cppHeaderCode}
              language="cpp"
              badgeText={`${config.languageStandard.toUpperCase()} · ${config.arrayFormat}`}
            />
          )}

          {/* TAB 2: PE Executable Patcher & PE Inspector */}
          {activeTab === 'pe_patcher' && currentAsset && (
            <PePatcherPanel
              currentAsset={currentAsset}
              onPatchedExeGenerated={(buf) => setPatchedExeBuffer(buf)}
            />
          )}

          {/* TAB 3: Win32 Resource Script (.rc) */}
          {activeTab === 'resource_script' && (
            <div className="space-y-4">
              <CodeViewer
                title="Windows Resource Script"
                filename="app.rc"
                code={rcCode}
                language="rc"
                badgeText="Standard Win32 Resource"
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CodeViewer
                  title="Resource Header"
                  filename="resource.h"
                  code={resourceHeaderCode}
                  language="c"
                  badgeText={`ID: ${config.resourceId}`}
                />
                <CodeViewer
                  title="Win32 Memory Extraction"
                  filename="resource_loader.h"
                  code={win32ExtractionCode}
                  language="cpp"
                  badgeText="Zero Allocation"
                />
              </div>
            </div>
          )}

          {/* TAB 4: Binary Hex Inspector */}
          {activeTab === 'hex_inspector' && currentAsset && (
            <HexViewer
              data={currentAsset.data}
              filename={currentAsset.filename}
            />
          )}

          {/* TAB 5: Assembly & Rust */}
          {activeTab === 'assembly_rust' && (
            <div className="space-y-4">
              <CodeViewer
                title="Rust Module"
                filename="asset.rs"
                code={rustCode}
                language="rust"
                badgeText="Rust Native &[u8]"
              />
              <CodeViewer
                title="Assembly Include"
                filename="asset.inc"
                code={assemblyCode}
                language="asm"
                badgeText="NASM / MASM .rdata"
              />
            </div>
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-cyan-500/50 text-white text-xs px-4 py-2.5 rounded shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
