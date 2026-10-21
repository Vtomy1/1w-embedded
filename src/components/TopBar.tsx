import React from 'react';
import { Download, Layers } from 'lucide-react';

interface TopBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onExportBundle: () => void;
  isExporting?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
  onExportBundle,
  isExporting = false,
}) => {
  const tabs = [
    { id: 'header', label: 'C/C++ Header' },
    { id: 'pe_patcher', label: 'PE Executable Patcher' },
    { id: 'resource_script', label: 'Resource Script (.rc)' },
    { id: 'hex_inspector', label: 'Binary Hex Inspector' },
    { id: 'assembly_rust', label: 'Assembly & Rust' },
  ];

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-sm shadow-cyan-500/20">
          <Layers className="w-5 h-5 stroke-[2.2]" />
        </div>
        <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
          WinEmbed
        </span>
      </div>

      {/* Zone 2: 4–5 clean single-line text navigation links */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`whitespace-nowrap shrink-0 transition-colors py-1 cursor-pointer ${
                isActive
                  ? 'text-cyan-400 border-b-2 border-cyan-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onExportBundle}
          disabled={isExporting}
          className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 transition-all rounded shadow-sm shadow-cyan-500/20 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? 'Generating...' : 'Export Developer Bundle .zip'}</span>
        </button>
      </div>
    </header>
  );
};
