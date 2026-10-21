import React from 'react';
import { Settings2, ShieldCheck, Cpu } from 'lucide-react';
import { HeaderConfig } from '../utils/codeGenerators';

interface HeaderSettingsPanelProps {
  config: HeaderConfig;
  onChange: (config: HeaderConfig) => void;
}

export const HeaderSettingsPanel: React.FC<HeaderSettingsPanelProps> = ({ config, onChange }) => {
  const handleTextChange = (field: keyof HeaderConfig, val: string | number) => {
    onChange({ ...config, [field]: val });
  };

  const handleCheckboxChange = (field: keyof HeaderConfig, checked: boolean) => {
    onChange({ ...config, [field]: checked });
  };

  return (
    <div className="space-y-4">
      {/* C/C++ Header Standards */}
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
        <div className="flex items-center gap-1.5 mb-2.5 text-xs font-semibold text-slate-300">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>C/C++ Header Standard</span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Variable Identifier
            </label>
            <input
              type="text"
              value={config.variableName}
              onChange={(e) => handleTextChange('variableName', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Language Standard & Memory Alignment
            </label>
            <select
              value={config.languageStandard}
              onChange={(e) => handleTextChange('languageStandard', e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="cpp20">C++20 (inline constexpr std::array)</option>
              <option value="c99">C99 (static const uint8_t array)</option>
              <option value="msvc_align">MSVC __declspec(align(16))</option>
              <option value="pragma_section">MSVC #pragma section(".imgdata", read)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Encoding Style
              </label>
              <select
                value={config.arrayFormat}
                onChange={(e) => handleTextChange('arrayFormat', e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="hex_array">Hex Array (0x89, 0x50...)</option>
                <option value="escaped_string">Compact String ("\x89\x50...")</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Bytes Per Row
              </label>
              <select
                value={config.bytesPerLine}
                onChange={(e) => handleTextChange('bytesPerLine', parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value={8}>8 bytes</option>
                <option value={12}>12 bytes</option>
                <option value={16}>16 bytes (Standard)</option>
                <option value={24}>24 bytes</option>
                <option value={32}>32 bytes</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Win32 Inline Memory Loaders */}
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
        <div className="flex items-center gap-1.5 mb-2.5 text-xs font-semibold text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Inline Win32 Memory Loaders</span>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={config.includeGdiplusLoader}
              onChange={(e) => handleCheckboxChange('includeGdiplusLoader', e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0"
            />
            <span>GDI+ Bitmap Loader (CreateStreamOnHGlobal)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={config.includeGdiBitmapLoader}
              onChange={(e) => handleCheckboxChange('includeGdiBitmapLoader', e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0"
            />
            <span>Win32 HBITMAP Creator (GDI Controls)</span>
          </label>
        </div>
      </div>

      {/* Resource Script Identifiers */}
      <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/60">
        <div className="flex items-center gap-1.5 mb-2.5 text-xs font-semibold text-slate-300">
          <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Win32 .RC Resource Attributes</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Resource ID Symbol
            </label>
            <input
              type="text"
              value={config.resourceName}
              onChange={(e) => handleTextChange('resourceName', e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Resource ID Number
            </label>
            <input
              type="number"
              value={config.resourceId}
              onChange={(e) => handleTextChange('resourceId', parseInt(e.target.value) || 101)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
