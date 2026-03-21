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
  isGoldenAnnounced: boolean; // true when this cell was just announced as golden (before question)
  onClick: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
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
  answerLocked: boolean,
  isGolden: boolean | undefined
): string {
  if (isGolden) return 'url(#hexGoldGrad)';
  if (isWinPath || answerLocked) return 'url(#hexGoldGrad)';
  if (isSelected) return 'url(#hexGoldGrad)';
  if (owner === 'RED') return 'url(#hexRedGrad)';
  if (owner === 'GREEN') return 'url(#hexGreenGrad)';
  return 'url(#hexNeutralGrad)';
}

function getStroke(owner: TeamColor | null, isSelected: boolean, isWinPath: boolean): string {
  if (isWinPath) return '#FFD700';
  if (isSelected) return '#C9A227';
  if (owner === 'RED') return '#CC2222';
  if (owner === 'GREEN') return '#117733';
  return '#B0994A';
}

function getSvgFilter(
  owner: TeamColor | null,
  isWinPath: boolean,
  isGolden: boolean | undefined
): string | undefined {
  if (isGolden) return 'url(#glowGold)';
  if (isWinPath) return 'url(#glowGold)';
  if (owner === 'RED') return 'url(#glowRed)';
  if (owner === 'GREEN') return 'url(#glowGreen)';
  return undefined;
}

export const HexCell = memo(function HexCell({
  cell,
  cx,
  cy,
  size,
  isSelected,
  isWinPath,
  isHoverable,
  answerLocked,
  isGoldenAnnounced,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
}: HexCellProps) {
  const isGolden = cell.isGolden;
  const points = getHexPoints(cx, cy, size);
  const highlightPts = getTopHighlightPts(cx, cy, size);
  const fill = getGradientFill(cell.owner, isSelected, isWinPath, answerLocked, isGolden);
  const stroke = isGolden ? '#FFD700'
    : getStroke(cell.owner, isSelected, isWinPath);
  const svgFilter = getSvgFilter(cell.owner, isWinPath, isGolden);
  const fontSize = Math.max(8, size * 0.44);
  const strokeWidth = isGolden ? 2.5 : (isSelected || isWinPath ? 2 : cell.owner ? 1.5 : 1);

  return (
    <g
      style={{ cursor: isHoverable ? 'pointer' : 'default' }}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      filter={svgFilter}
    >
      {/* Golden pulsing ring behind the cell */}
      {(isGolden || isGoldenAnnounced) && (
        <polygon
          points={getHexPoints(cx, cy, size * 1.18)}
          fill="none"
          stroke="#FFD700"
          strokeWidth={1.5}
          opacity={0.55}
          style={{
            pointerEvents: 'none',
            animation: 'goldPulse 1.2s ease-in-out infinite',
          }}
        />
      )}
      {/* Outer sparkle ring for just-announced golden cells */}
      {isGoldenAnnounced && (
        <polygon
          points={getHexPoints(cx, cy, size * 1.35)}
          fill="none"
          stroke="#FFD700"
          strokeWidth={1}
          opacity={0.25}
          style={{
            pointerEvents: 'none',
            animation: 'goldPulse 1.2s ease-in-out infinite 0.3s',
          }}
        />
      )}
      {/* Main hex polygon */}
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={isHoverable && !isSelected ? 1 : cell.owner ? 1 : 0.9}
        style={{ transition: 'fill 0.2s ease, opacity 0.2s ease' }}
      />
      {/* Team color border ring for claimed golden cells */}
      {isGolden && cell.owner && (
        <polygon
          points={getHexPoints(cx, cy, size * 1.1)}
          fill="none"
          stroke={cell.owner === 'RED' ? '#FF4444' : '#00FF7F'}
          strokeWidth={2.5}
          opacity={0.9}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {/* Inner highlight */}
      <polygon
        points={highlightPts}
        fill="white"
        opacity={cell.owner || isWinPath || isGolden ? 0.22 : 0.30}
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
        fill={cell.owner || isWinPath || isGolden ? '#FFFFFF' : '#3D2400'}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {cell.letter}
      </text>
      {/* Golden star badge */}
      {isGolden && (
        <text
          x={cx + size * 0.55}
          y={cy - size * 0.45}
          textAnchor="middle"
          fontSize={fontSize * 0.7}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          ✨
        </text>
      )}
    </g>
  );
}, (prev, next) =>
  prev.cell.owner === next.cell.owner &&
  prev.cell.letter === next.cell.letter &&
  prev.cell.isGolden === next.cell.isGolden &&
  prev.isSelected === next.isSelected &&
  prev.isWinPath === next.isWinPath &&
  prev.isHoverable === next.isHoverable &&
  prev.answerLocked === next.answerLocked &&
  prev.isGoldenAnnounced === next.isGoldenAnnounced &&
  prev.cx === next.cx &&
  prev.cy === next.cy &&
  prev.size === next.size
);
