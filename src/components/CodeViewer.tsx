import React, { useState } from 'react';
import { Copy, Check, Download, Search, FileCode } from 'lucide-react';

interface CodeViewerProps {
  title: string;
  filename: string;
  code: string;
  language?: string;
  badgeText?: string;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  title,
  filename,
  code,
  language = 'cpp',
  badgeText,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = code.split('\n');
  const lineCount = lines.length;
  const byteCount = new TextEncoder().encode(code).length;

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/60 flex flex-col h-full space-y-3">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <span>{title}</span>
            <span className="text-xs text-slate-500 font-mono font-normal">({filename})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
            <span>{lineCount.toLocaleString()} lines</span>
            <span aria-hidden="true">·</span>
            <span>{byteCount.toLocaleString()} bytes</span>
            {badgeText && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-cyan-400">{badgeText}</span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {filename}</span>
          </button>
        </div>
      </div>

      {/* Code Area with Line Numbers */}
      <div className="flex-1 bg-slate-950 rounded border border-slate-800/80 overflow-hidden flex flex-col min-h-[400px]">
        <div className="flex-1 overflow-auto p-3 font-mono text-xs text-slate-200 leading-relaxed select-text">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, idx) => {
                const lineNum = idx + 1;
                return (
                  <tr key={idx} className="hover:bg-slate-900/50">
                    <td className="w-12 select-none text-right pr-4 text-slate-600 font-mono text-[11px] align-top tabular-nums">
                      {lineNum}
                    </td>
                    <td className="whitespace-pre font-mono text-slate-300">
                      {line || '\n'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
