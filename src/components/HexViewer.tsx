import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react';

interface HexViewerProps {
  data: Uint8Array;
  filename: string;
}

export const HexViewer: React.FC<HexViewerProps> = ({ data, filename }) => {
  const [page, setPage] = useState(0);
  const [searchHex, setSearchHex] = useState('');
  const [hoveredOffset, setHoveredOffset] = useState<number | null>(null);

  const PAGE_SIZE = 512; // 32 rows of 16 bytes
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));

  const currentPageData = useMemo(() => {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, data.length);
    return data.slice(start, end);
  }, [data, page]);

  // Compute Shannon Entropy (0 to 8 bits per byte)
  const entropy = useMemo(() => {
    if (data.length === 0) return 0;
    const freq = new Map<number, number>();
    for (let i = 0; i < data.length; i++) {
      freq.set(data[i], (freq.get(data[i]) || 0) + 1);
    }
    let ent = 0;
    const len = data.length;
    for (const count of freq.values()) {
      const p = count / len;
      ent -= p * Math.log2(p);
    }
    return ent;
  }, [data]);

  // Build rows of 16 bytes
  const rows = useMemo(() => {
    const rowList: {
      offset: number;
      bytes: number[];
      ascii: string[];
    }[] = [];

    const baseOffset = page * PAGE_SIZE;
    for (let r = 0; r < currentPageData.length; r += 16) {
      const chunk = currentPageData.slice(r, r + 16);
      const byteList: number[] = [];
      const asciiList: string[] = [];

      for (let i = 0; i < 16; i++) {
        if (i < chunk.length) {
          const b = chunk[i];
          byteList.push(b);
          // Printable ASCII (32 to 126)
          asciiList.push(b >= 32 && b <= 126 ? String.fromCharCode(b) : '·');
        } else {
          byteList.push(-1);
          asciiList.push(' ');
        }
      }

      rowList.push({
        offset: baseOffset + r,
        bytes: byteList,
        ascii: asciiList,
      });
    }

    return rowList;
  }, [currentPageData, page]);

  const handleJumpToOffset = (offsetHex: string) => {
    const clean = offsetHex.trim().replace(/^0x/i, '');
    const off = parseInt(clean, 16);
    if (!isNaN(off) && off >= 0 && off < data.length) {
      setPage(Math.floor(off / PAGE_SIZE));
    }
  };

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/60 space-y-3">
      {/* Top Header & Metadata */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Binary Hex Inspector</span>
            <span className="text-xs text-slate-500 font-mono font-normal">({filename})</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 font-mono">
            <span>Size: {data.length.toLocaleString()} bytes</span>
            <span aria-hidden="true">·</span>
            <span>Entropy: {entropy.toFixed(3)} / 8.000 bits</span>
            <span aria-hidden="true">·</span>
            <span className="text-cyan-400">
              {entropy > 7.5 ? 'High (Compressed)' : 'Low (Uncompressed / Sparse)'}
            </span>
          </div>
        </div>

        {/* Navigation & Jump */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded px-2 py-1">
            <span className="text-[11px] text-slate-500 font-mono">0x</span>
            <input
              type="text"
              placeholder="Jump Offset"
              className="w-20 bg-transparent text-xs font-mono text-cyan-300 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJumpToOffset((e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>

          <div className="flex items-center gap-1">
            <button
              disabled={page <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="p-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono text-slate-400 px-1">
              {page + 1}/{totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="p-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Hex Grid */}
      <div className="overflow-x-auto bg-slate-950 p-3 rounded border border-slate-800/80 font-mono text-xs select-text">
        {/* Column Header */}
        <div className="flex text-slate-500 pb-1.5 border-b border-slate-800/60 mb-1.5 font-semibold">
          <div className="w-24 shrink-0">OFFSET</div>
          <div className="flex-1 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1 min-w-[380px] text-center">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="text-slate-500">
                {i.toString(16).toUpperCase().padStart(2, '0')}
              </span>
            ))}
          </div>
          <div className="w-40 shrink-0 text-left pl-4">ASCII DECODED</div>
        </div>

        {/* Rows */}
        <div className="space-y-0.5">
          {rows.map((row) => (
            <div
              key={row.offset}
              className="flex items-center hover:bg-slate-900/60 py-0.5 rounded transition-colors"
            >
              {/* Offset Column */}
              <div className="w-24 shrink-0 text-slate-500 font-semibold tabular-nums">
                {row.offset.toString(16).toUpperCase().padStart(8, '0')}
              </div>

              {/* 16 Hex Bytes */}
              <div className="flex-1 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1 min-w-[380px] text-center">
                {row.bytes.map((byte, idx) => {
                  if (byte === -1) {
                    return <span key={idx} className="text-slate-800">..</span>;
                  }
                  const isZero = byte === 0;
                  const isHovered = hoveredOffset === row.offset + idx;

                  let colorClass = 'text-slate-300';
                  if (isZero) colorClass = 'text-slate-600';
                  else if (byte >= 32 && byte <= 126) colorClass = 'text-cyan-300';
                  else if (byte === 0xff) colorClass = 'text-amber-400';

                  return (
                    <span
                      key={idx}
                      onMouseEnter={() => setHoveredOffset(row.offset + idx)}
                      onMouseLeave={() => setHoveredOffset(null)}
                      className={`cursor-pointer px-0.5 rounded ${colorClass} ${
                        isHovered ? 'bg-cyan-500 text-slate-950 font-bold' : ''
                      }`}
                    >
                      {byte.toString(16).toUpperCase().padStart(2, '0')}
                    </span>
                  );
                })}
              </div>

              {/* ASCII text */}
              <div className="w-40 shrink-0 pl-4 tracking-wider flex">
                {row.ascii.map((char, idx) => {
                  const isHovered = hoveredOffset === row.offset + idx;
                  const isDot = char === '·';
                  return (
                    <span
                      key={idx}
                      onMouseEnter={() => setHoveredOffset(row.offset + idx)}
                      onMouseLeave={() => setHoveredOffset(null)}
                      className={`cursor-pointer ${
                        isHovered
                          ? 'bg-cyan-500 text-slate-950 font-bold'
                          : isDot
                          ? 'text-slate-600'
                          : 'text-slate-200'
                      }`}
                    >
                      {char}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {hoveredOffset !== null && hoveredOffset < data.length && (
        <div className="text-xs font-mono text-slate-400 bg-slate-950/60 p-2 rounded border border-slate-800 flex items-center justify-between">
          <div>
            Offset: <span className="text-cyan-300">0x{hoveredOffset.toString(16).toUpperCase().padStart(8, '0')}</span> ({hoveredOffset})
          </div>
          <div>
            Byte: <span className="text-cyan-300">0x{data[hoveredOffset].toString(16).toUpperCase().padStart(2, '0')}</span> ({data[hoveredOffset]})
          </div>
          <div>
            Char:{' '}
            <span className="text-cyan-300 font-bold">
              {data[hoveredOffset] >= 32 && data[hoveredOffset] <= 126
                ? `'${String.fromCharCode(data[hoveredOffset])}'`
                : 'Non-printable'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
