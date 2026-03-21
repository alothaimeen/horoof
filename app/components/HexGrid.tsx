'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { HexCell as HexCellData, TeamColor } from '../../lib/hexUtils';
import { HexCell } from './HexCell';
import { cellKey, GRID_COLS, GRID_ROWS } from '../../lib/hexUtils';

type GamePhase =
  | 'CELL_SELECTION'
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
  onCellClick?: (col: number, row: number) => void;
}

// Converts (col,row) → pixel center using flat-top hex layout
function getHexCenter(col: number, row: number, size: number) {
  const x = size * 1.5 * col + size;
  const y = size * Math.sqrt(3) * (row + (col % 2) * 0.5) + size;
  return { x, y };
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
  onCellClick,
}: HexGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hexSize, setHexSize] = useState(30);

  // Compute hex size dynamically based on container width
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      // 11 cols × 1.5 × size + size = 17.5 × size + padding (32px)
      const computed = (w - 32) / 17.5;
      setHexSize(Math.min(35, Math.max(14, computed)));
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const cellMap = buildCellMap(cells);
  const winPathSet = new Set(winningPath ?? []);
  const isMyTurn = !isHost && myTeam === currentTeam && phase === 'CELL_SELECTION';

  // Compute SVG dimensions
  const maxX = getHexCenter(GRID_COLS - 1, GRID_ROWS - 1, hexSize).x + hexSize + 4;
  const maxY = getHexCenter(0, GRID_ROWS - 1, hexSize).y + hexSize * 0.9 + 4;

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
      {/* RED edge — left: col=0 stripe */}
      <div className="flex items-center gap-1 mb-1 px-1">
        <span
          className="text-xs font-black"
          style={{ color: '#FF4444', textShadow: '0 0 6px rgba(255,44,44,0.5)' }}
        >
          ← الأحمر: من اليسار إلى اليمين →
        </span>
      </div>

      <svg
        width={maxX}
        height={maxY}
        viewBox={`0 0 ${maxX} ${maxY}`}
        style={{ display: 'block' }}
      >
        {/* GREEN edge markers — top row=0 */}
        {Array.from({ length: GRID_COLS }, (_, col) => {
          const { x, y } = getHexCenter(col, 0, hexSize);
          return (
            <line
              key={`gt-${col}`}
              x1={x - hexSize * 0.5} y1={y - hexSize * 0.85}
              x2={x + hexSize * 0.5} y2={y - hexSize * 0.85}
              stroke="#00C853" strokeWidth={3} opacity={0.7}
            />
          );
        })}
        {/* GREEN edge markers — bottom row=10 */}
        {Array.from({ length: GRID_COLS }, (_, col) => {
          const { x, y } = getHexCenter(col, GRID_ROWS - 1, hexSize);
          return (
            <line
              key={`gb-${col}`}
              x1={x - hexSize * 0.5} y1={y + hexSize * 0.85}
              x2={x + hexSize * 0.5} y2={y + hexSize * 0.85}
              stroke="#00C853" strokeWidth={3} opacity={0.7}
            />
          );
        })}
        {/* RED edge markers — left col=0 */}
        {Array.from({ length: GRID_ROWS }, (_, row) => {
          const { x, y } = getHexCenter(0, row, hexSize);
          return (
            <line
              key={`rl-${row}`}
              x1={x - hexSize} y1={y}
              x2={x - hexSize * 0.75} y2={y}
              stroke="#FF2C2C" strokeWidth={3} opacity={0.7}
            />
          );
        })}
        {/* RED edge markers — right col=10 */}
        {Array.from({ length: GRID_ROWS }, (_, row) => {
          const { x, y } = getHexCenter(GRID_COLS - 1, row, hexSize);
          return (
            <line
              key={`rr-${row}`}
              x1={x + hexSize * 0.75} y1={y}
              x2={x + hexSize} y2={y}
              stroke="#FF2C2C" strokeWidth={3} opacity={0.7}
            />
          );
        })}

        {/* Cells */}
        {cells.map(cell => {
          const { x, y } = getHexCenter(cell.col, cell.row, hexSize);
          const key = cellKey(cell.col, cell.row);
          const isSel = !!(selectedCell && selectedCell.col === cell.col && selectedCell.row === cell.row);
          const isWin = winPathSet.has(key);
          const hoverable = isMyTurn && cell.owner === null && !isSel;

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
              onClick={() => handleClick(cell.col, cell.row)}
            />
          );
        })}
      </svg>

      <div className="flex items-center gap-1 mt-1 px-1">
        <span className="text-xs text-green-400 font-bold">↑ الأخضر يصل من الأعلى إلى الأسفل ↓</span>
      </div>
    </div>
  );
}
