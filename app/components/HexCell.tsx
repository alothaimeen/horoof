import React, { memo } from 'react';
import type { HexCell as HexCellData, TeamColor } from '../../lib/hexUtils';

interface HexCellProps {
  cell: HexCellData;
  cx: number;
  cy: number;
  size: number;
  isSelected: boolean;
  isWinPath: boolean;
  isHoverable: boolean;   // true when it's this player's team's turn and cell is neutral
  answerLocked: boolean;  // brief visual state when a correct answer was just given
  onClick: () => void;
}

function getHexPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

function getFill(
  owner: TeamColor | null,
  isSelected: boolean,
  isWinPath: boolean,
  answerLocked: boolean
): string {
  if (isWinPath) return '#C9A227';        // ذهبي — مسار الفوز
  if (isSelected) return '#8B6914';       // ذهبي داكن — خلية محددة
  if (answerLocked) return '#FFD700';     // ذهبي ساطع — لحظة الإجابة
  if (owner === 'RED') return '#CC2020';  // أحمر نيون
  if (owner === 'GREEN') return '#008A3C';// أخضر نيون
  return '#0E1526';                        // كحلي داكن — محايد
}

function getStroke(owner: TeamColor | null, isSelected: boolean, isWinPath: boolean): string {
  if (isWinPath) return '#FFD700';
  if (isSelected) return '#C9A227';
  if (owner === 'RED') return '#FF4444';
  if (owner === 'GREEN') return '#00FF7F';
  return '#1E2A40';
}

// React.memo with custom comparison — only re-render when visible state changes
export const HexCell = memo(function HexCell({
  cell,
  cx,
  cy,
  size,
  isSelected,
  isWinPath,
  isHoverable,
  answerLocked,
  onClick,
}: HexCellProps) {
  const points = getHexPoints(cx, cy, size);
  const fill = getFill(cell.owner, isSelected, isWinPath, answerLocked);
  const stroke = getStroke(cell.owner, isSelected, isWinPath);
  const fontSize = Math.max(8, size * 0.44);

  // نيون جلو للخلايا المملوكة
  const glowFilter = cell.owner === 'RED'
    ? 'drop-shadow(0 0 3px rgba(255,44,44,0.6))'
    : cell.owner === 'GREEN'
    ? 'drop-shadow(0 0 3px rgba(0,255,127,0.6))'
    : isWinPath
    ? 'drop-shadow(0 0 4px rgba(201,162,39,0.8))'
    : undefined;

  return (
    <g
      style={{ cursor: isHoverable ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected || isWinPath ? 2 : cell.owner ? 1.5 : 1}
        opacity={isHoverable && !isSelected ? 1 : cell.owner ? 1 : 0.88}
        style={{
          transition: 'fill 0.2s ease, opacity 0.2s ease',
          filter: glowFilter,
        }}
      />
      <text
        x={cx}
        y={cy + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontFamily="'Cairo', 'Segoe UI', sans-serif"
        fontWeight="700"
        fill={cell.owner ? '#FFFFFF' : '#8A9CC0'}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {cell.letter}
      </text>
      {isHoverable && !isSelected && (
        <polygon
          points={points}
          fill="white"
          opacity={0.06}
          style={{ transition: 'opacity 0.15s' }}
        />
      )}
    </g>
  );
}, (prev, next) =>
  prev.cell.owner === next.cell.owner &&
  prev.cell.letter === next.cell.letter &&
  prev.isSelected === next.isSelected &&
  prev.isWinPath === next.isWinPath &&
  prev.isHoverable === next.isHoverable &&
  prev.answerLocked === next.answerLocked &&
  prev.cx === next.cx &&
  prev.cy === next.cy &&
  prev.size === next.size
);
