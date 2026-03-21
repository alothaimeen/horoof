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

// Upper highlight: top-cap polygon (indices 4, 5, 0) at reduced size
// gives the 3D "light reflection" illusion on the upper portion of the hex
function getTopHighlightPts(cx: number, cy: number, size: number): string {
  return [4, 5, 0].map(i => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + size * 0.62 * Math.cos(angle)},${cy + size * 0.62 * Math.sin(angle) - size * 0.08}`;
  }).join(' ');
}

function getGradientFill(
  owner: TeamColor | null,
  isSelected: boolean,
  isWinPath: boolean,
  answerLocked: boolean
): string {
  if (isWinPath || answerLocked) return 'url(#hexGoldGrad)';
  if (isSelected) return 'url(#hexGoldGrad)';
  if (owner === 'RED') return 'url(#hexRedGrad)';
  if (owner === 'GREEN') return 'url(#hexGreenGrad)';
  return 'url(#hexNeutralGrad)';
}

function getStroke(owner: TeamColor | null, isSelected: boolean, isWinPath: boolean): string {
  if (isWinPath) return '#FFD700';
  if (isSelected) return '#C9A227';
  if (owner === 'RED') return '#FF6666';
  if (owner === 'GREEN') return '#00FF88';
  return '#263550';
}

function getSvgFilter(
  owner: TeamColor | null,
  isWinPath: boolean
): string | undefined {
  if (isWinPath) return 'url(#glowGold)';
  if (owner === 'RED') return 'url(#glowRed)';
  if (owner === 'GREEN') return 'url(#glowGreen)';
  return undefined;
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
  const highlightPts = getTopHighlightPts(cx, cy, size);
  const fill = getGradientFill(cell.owner, isSelected, isWinPath, answerLocked);
  const stroke = getStroke(cell.owner, isSelected, isWinPath);
  const svgFilter = getSvgFilter(cell.owner, isWinPath);
  const fontSize = Math.max(8, size * 0.44);

  return (
    <g
      style={{ cursor: isHoverable ? 'pointer' : 'default' }}
      onClick={onClick}
      filter={svgFilter}
    >
      {/* Main hex polygon with gradient fill */}
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={isSelected || isWinPath ? 2 : cell.owner ? 1.5 : 1}
        opacity={isHoverable && !isSelected ? 1 : cell.owner ? 1 : 0.9}
        style={{ transition: 'fill 0.2s ease, opacity 0.2s ease' }}
      />
      {/* Inner highlight — top cap for 3D light reflection */}
      <polygon
        points={highlightPts}
        fill="white"
        opacity={cell.owner || isWinPath ? 0.18 : 0.08}
        style={{ pointerEvents: 'none' }}
      />
      {/* Hover overlay */}
      {isHoverable && !isSelected && (
        <polygon
          points={points}
          fill="white"
          opacity={0.07}
          style={{ transition: 'opacity 0.15s', pointerEvents: 'none' }}
        />
      )}
      {/* Letter label */}
      <text
        x={cx}
        y={cy + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontFamily="'Cairo', 'Segoe UI', sans-serif"
        fontWeight="700"
        fill={cell.owner || isWinPath ? '#FFFFFF' : '#7A90B8'}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {cell.letter}
      </text>
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
