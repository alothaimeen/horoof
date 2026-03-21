'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { HexCell as HexCellData, TeamColor } from '../../lib/hexUtils';
import { HexCell } from './HexCell';
import { cellKey, GRID_COLS, GRID_ROWS } from '../../lib/hexUtils';

type GamePhase =
  | 'CELL_SELECTION'
  | 'BUZZER'
  | 'BUZZER_SECOND_CHANCE'
  | 'BUZZER_OPEN'
  | 'ANSWERING'
  | 'ANSWER_REVEAL'
  | 'ROUND_OVER'
  | 'GAME_OVER'
  | 'DAIRAT_AL_DAW';

interface HexGridProps {
  cells: HexCellData[];
  phase: GamePhase;
  currentTeam: TeamColor | null;
  myTeam: TeamColor | null;      // null for host
  isHost: boolean;
  selectedCell?: { col: number; row: number } | null;
  winningPath?: string[] | null;
  answerLocked?: boolean;
  goldenCell?: { col: number; row: number } | null; // announced golden cell
  onCellClick?: (col: number, row: number) => void;
  onHostCellOverride?: (col: number, row: number, owner: TeamColor | null) => void;
}

// Converts (col,row) → pixel center using Odd-Q vertical hex layout with optional offset
function getHexCenter(col: number, row: number, size: number) {
  const x = size * 1.5 * col + size;
  const y = size * Math.sqrt(3) * (row + (col % 2) * 0.5) + size;
  return { x, y };
}

// Safe version that handles negative col (for border cells)
function getHexCenterSafe(col: number, row: number, size: number, xOff: number, yOff: number) {
  const colMod = ((col % 2) + 2) % 2; // positive modulo to handle negative col
  return {
    x: size * 1.5 * col + size + xOff,
    y: size * Math.sqrt(3) * (row + colMod * 0.5) + size + yOff,
  };
}

// Build hex polygon points string from center and radius
function getHexPts(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

// Build a Map for O(1) cell lookup
function buildCellMap(cells: HexCellData[]): Map<string, HexCellData> {
  const m = new Map<string, HexCellData>();
  for (const c of cells) m.set(cellKey(c.col, c.row), c);
  return m;
}

export function HexGrid({
  cells,
  phase,
  currentTeam,
  myTeam,
  isHost,
  selectedCell,
  winningPath,
  answerLocked = false,
  goldenCell,
  onCellClick,
  onHostCellOverride,
}: HexGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hexSize, setHexSize] = useState(30);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hostOverrideCell, setHostOverrideCell] = useState<{ col: number; row: number; letter: string } | null>(null);

  // Compute hex size dynamically based on container width
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      // 5 cols × 1.5 × size + 0.5*size (for right border) + 2*size (xOff) + hexSize = 12*size approx
      const computed = (w - 32) / 12;
      setHexSize(Math.min(40, Math.max(18, computed)));
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const cellMap = buildCellMap(cells);
  const winPathSet = new Set(winningPath ?? []);
  const isMyTurn = !isHost && myTeam === currentTeam && phase === 'CELL_SELECTION';

  const startLongPress = useCallback((col: number, row: number) => {
    longPressTimerRef.current = setTimeout(() => {
      const cell = cellMap.get(cellKey(col, row));
      if (cell) setHostOverrideCell({ col, row, letter: cell.letter });
    }, 600);
  }, [cellMap]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Offset to accommodate border hex cells at col=-1 and row=-1
  const xOff = hexSize * 2;
  const yOff = hexSize * 2;

  // Helper: get center of any cell (including border cells outside grid bounds)
  const getCtr = (col: number, row: number) => getHexCenterSafe(col, row, hexSize, xOff, yOff);

  // SVG dimensions: accommodate right border (col=GRID_COLS, odd) and bottom border (row=GRID_ROWS, odd col)
  const svgW = hexSize * 11.5 + 8;
  const svgH = hexSize * Math.sqrt(3) * (GRID_ROWS + 0.5) + hexSize + yOff + hexSize + 8;

  const handleClick = useCallback((col: number, row: number) => {
    if (!isMyTurn) return;
    const cell = cellMap.get(cellKey(col, row));
    if (!cell || cell.owner !== null) return;
    onCellClick?.(col, row);
  }, [isMyTurn, cellMap, onCellClick]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto"
      style={{ touchAction: 'manipulation', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Team labels */}
      <div className="flex items-center gap-1 mb-1 px-1">
        <span
          className="text-xs font-black"
          style={{ color: '#FF4444', textShadow: '0 0 6px rgba(255,44,44,0.5)' }}
        >
          ← الأحمر: من اليسار إلى اليمين →
        </span>
      </div>

      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ display: 'block' }}
      >
        <defs>
          {/* Gradients for game cells */}
          <radialGradient id="hexNeutralGrad" cx="40%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#2a3f6f" />
            <stop offset="100%" stopColor="#0b1225" />
          </radialGradient>
          <radialGradient id="hexRedGrad" cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ff5555" />
            <stop offset="100%" stopColor="#8b0000" />
          </radialGradient>
          <radialGradient id="hexGreenGrad" cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#00e676" />
            <stop offset="100%" stopColor="#004d20" />
          </radialGradient>
          <radialGradient id="hexGoldGrad" cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#FFE66D" />
            <stop offset="100%" stopColor="#8B6914" />
          </radialGradient>
          {/* Gradients for border cells */}
          <radialGradient id="hexBorderRedGrad" cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ff3333" />
            <stop offset="100%" stopColor="#7a0000" />
          </radialGradient>
          <radialGradient id="hexBorderGreenGrad" cx="35%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#00c853" />
            <stop offset="100%" stopColor="#00401a" />
          </radialGradient>
          {/* Neon glow filters */}
          <filter id="glowRed" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#ff2222" floodOpacity="0.9"/>
          </filter>
          <filter id="glowGreen" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#00ff88" floodOpacity="0.9"/>
          </filter>
          <filter id="glowGold" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#FFD700" floodOpacity="1"/>
          </filter>
        </defs>

        {/* ─── Border hex cells (decorative) ─── */}

        {/* RED border — left column (col=-1) */}
        {Array.from({ length: GRID_ROWS }, (_, row) => {
          const { x, y } = getCtr(-1, row);
          return <polygon key={`rbl-${row}`} points={getHexPts(x, y, hexSize)}
            fill="url(#hexBorderRedGrad)" stroke="#550000" strokeWidth={0.8} opacity={0.85} />;
        })}

        {/* RED border — right column (col=GRID_COLS) */}
        {Array.from({ length: GRID_ROWS }, (_, row) => {
          const { x, y } = getCtr(GRID_COLS, row);
          return <polygon key={`rbr-${row}`} points={getHexPts(x, y, hexSize)}
            fill="url(#hexBorderRedGrad)" stroke="#550000" strokeWidth={0.8} opacity={0.85} />;
        })}

        {/* GREEN border — top row (row=-1) */}
        {Array.from({ length: GRID_COLS }, (_, col) => {
          const { x, y } = getCtr(col, -1);
          return <polygon key={`gbt-${col}`} points={getHexPts(x, y, hexSize)}
            fill="url(#hexBorderGreenGrad)" stroke="#004400" strokeWidth={0.8} opacity={0.85} />;
        })}

        {/* GREEN border — bottom row (row=GRID_ROWS) */}
        {Array.from({ length: GRID_COLS }, (_, col) => {
          const { x, y } = getCtr(col, GRID_ROWS);
          return <polygon key={`gbb-${col}`} points={getHexPts(x, y, hexSize)}
            fill="url(#hexBorderGreenGrad)" stroke="#004400" strokeWidth={0.8} opacity={0.85} />;
        })}

        {/* Corner fill cells (dark neutral) */}
        {([-1, GRID_COLS] as number[]).map(col =>
          ([-1, GRID_ROWS] as number[]).map(row => {
            const { x, y } = getCtr(col, row);
            return <polygon key={`corner-${col}-${row}`} points={getHexPts(x, y, hexSize)}
              fill="#08111f" stroke="#1a2540" strokeWidth={0.8} />;
          })
        )}

        {/* ─── Game cells ─── */}
        {cells.map(cell => {
          const { x, y } = getCtr(cell.col, cell.row);
          const key = cellKey(cell.col, cell.row);
          const isSel = !!(selectedCell && selectedCell.col === cell.col && selectedCell.row === cell.row);
          const isWin = winPathSet.has(key);
          const hoverable = isMyTurn && cell.owner === null && !isSel;
          const isGoldenAnnounced = !!(goldenCell && goldenCell.col === cell.col && goldenCell.row === cell.row);

          return (
            <HexCell
              key={cell.id}
              cell={cell}
              cx={x}
              cy={y}
              size={hexSize}
              isSelected={isSel}
              isWinPath={isWin}
              isHoverable={hoverable}
              answerLocked={answerLocked && isSel}
              isGoldenAnnounced={isGoldenAnnounced}
              onClick={() => handleClick(cell.col, cell.row)}
              onPointerDown={isHost && onHostCellOverride ? () => startLongPress(cell.col, cell.row) : undefined}
              onPointerUp={isHost && onHostCellOverride ? cancelLongPress : undefined}
              onPointerLeave={isHost && onHostCellOverride ? cancelLongPress : undefined}
            />
          );
        })}
      </svg>

      <div className="flex items-center gap-1 mt-1 px-1">
        <span className="text-xs text-green-400 font-bold">↑ الأخضر يصل من الأعلى إلى الأسفل ↓</span>
      </div>

      {/* Host cell override popup */}
      {isHost && hostOverrideCell && onHostCellOverride && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setHostOverrideCell(null)}
        >
          <div
            className="rounded-2xl p-5 max-w-xs w-full mx-4"
            style={{ background: 'rgba(6,10,23,0.99)', border: '1px solid rgba(201,162,39,0.3)', boxShadow: '0 0 30px rgba(0,0,0,0.8)' }}
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            <h3 className="text-center font-black mb-1" style={{ color: '#C9A227' }}>تعيين الخلية</h3>
            <p className="text-center text-4xl font-black mb-4" style={{ color: '#E8E8F0' }}>{hostOverrideCell.letter}</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { onHostCellOverride(hostOverrideCell.col, hostOverrideCell.row, 'RED'); setHostOverrideCell(null); }}
                className="py-3 rounded-xl font-black text-sm"
                style={{ background: 'rgba(255,44,44,0.15)', border: '1px solid rgba(255,44,44,0.4)', color: '#FF4444' }}
              >● أحمر</button>
              <button
                onClick={() => { onHostCellOverride(hostOverrideCell.col, hostOverrideCell.row, 'GREEN'); setHostOverrideCell(null); }}
                className="py-3 rounded-xl font-black text-sm"
                style={{ background: 'rgba(0,200,83,0.1)', border: '1px solid rgba(0,200,83,0.3)', color: '#00FF7F' }}
              >● أخضر</button>
              <button
                onClick={() => { onHostCellOverride(hostOverrideCell.col, hostOverrideCell.row, null); setHostOverrideCell(null); }}
                className="py-3 rounded-xl font-black text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#888' }}
              >محايد</button>
            </div>
            <button
              onClick={() => setHostOverrideCell(null)}
              className="w-full mt-3 text-sm font-bold py-2 rounded-xl"
              style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.03)' }}
            >إلغاء</button>
          </div>
        </div>
      )}
    </div>
  );
}
