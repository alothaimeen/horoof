export const GRID_COLS = 5;
export const GRID_ROWS = 5;
export const TOTAL_CELLS = GRID_COLS * GRID_ROWS; // 25

export type TeamColor = 'RED' | 'GREEN';

export interface HexCell {
  id: number;         // 0-120 (col * GRID_ROWS + row) — useful as React key
  col: number;
  row: number;
  letter: string;     // Arabic letter assigned to this cell
  owner: TeamColor | null;
  isGolden?: boolean; // revealed only after the cell is correctly claimed
}

// ⚠️ JSON note: JSON.stringify(new Map()) === "{}"
// Server keeps Map for O(1) lookup.
// Send to client via: [...grid.values()] → HexCell[]
// Client stores HexCell[], not Map.

// Positive modulo helper (handles negative col values)
function posMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function cellKey(col: number, row: number): string {
  return `${col}-${row}`;
}

// Odd-Q vertical offset neighbors:
// RED wins: col=0 → col=4 (left-to-right)
// GREEN wins: row=0 → row=4 (top-to-bottom)
// Odd columns (1, 3) are shifted DOWN by half a cell.

// Permanent cache — computed once per (col,row) position, never changes
const NEIGHBORS_CACHE = new Map<string, Array<[number, number]>>();

export function getNeighborCoords(col: number, row: number): Array<[number, number]> {
  const key = cellKey(col, row);
  const cached = NEIGHBORS_CACHE.get(key);
  if (cached) return cached;

  // Odd-Q offset: odd columns are shifted down, even columns are not
  const dirs: Array<[number, number]> = col % 2 === 0
    ? [[ 0,-1],[ 0, 1],[-1,-1],[-1, 0],[ 1,-1],[ 1, 0]]
    : [[ 0,-1],[ 0, 1],[-1, 0],[-1, 1],[ 1, 0],[ 1, 1]];

  const neighbors = dirs
    .map(([dc, dr]) => [col + dc, row + dr] as [number, number])
    .filter(([nc, nr]) => nc >= 0 && nc < GRID_COLS && nr >= 0 && nr < GRID_ROWS);

  NEIGHBORS_CACHE.set(key, neighbors);
  return neighbors;
}

export function getNeighbors(col: number, row: number, grid: Map<string, HexCell>): HexCell[] {
  return getNeighborCoords(col, row)
    .map(([nc, nr]) => grid.get(cellKey(nc, nr)))
    .filter((cell): cell is HexCell => cell !== undefined);
}

/**
 * Distribute `letters` evenly across 25 cells.
 * baseCount = floor(25 / numLetters), first `remainder` letters get +1.
 * Returns a new grid with all cells unowned.
 */
export function initGrid(letters: string[]): Map<string, HexCell> {
  const numLetters = letters.length;
  const baseCount = Math.floor(TOTAL_CELLS / numLetters);
  const remainder = TOTAL_CELLS % numLetters;

  // Build assignment array: letter repeated by its count
  const assignment: string[] = [];
  for (let i = 0; i < numLetters; i++) {
    const count = i < remainder ? baseCount + 1 : baseCount;
    for (let j = 0; j < count; j++) {
      assignment.push(letters[i]);
    }
  }

  // Fisher-Yates shuffle for random distribution across the board
  for (let i = assignment.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignment[i], assignment[j]] = [assignment[j], assignment[i]];
  }

  const grid = new Map<string, HexCell>();
  let idx = 0;
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const key = cellKey(col, row);
      grid.set(key, {
        id: col * GRID_ROWS + row,
        col,
        row,
        letter: assignment[idx++],
        owner: null,
      });
    }
  }

  return grid;
}

/**
 * BFS win detection.
 * RED: must connect col=0 edge → col=4 edge
 * GREEN: must connect row=0 edge → row=4 edge
 * Uses pointer (head++) instead of shift() to keep BFS at O(n) not O(n²).
 */
export function checkWin(grid: Map<string, HexCell>, team: TeamColor): boolean {
  const startCells = [...grid.values()].filter(
    c => c.owner === team && (team === 'RED' ? c.col === 0 : c.row === 0)
  );
  if (startCells.length === 0) return false;

  const isTarget = (c: HexCell) =>
    team === 'RED' ? c.col === GRID_COLS - 1 : c.row === GRID_ROWS - 1;

  const visited = new Set<string>();
  const queue: HexCell[] = [];
  let head = 0;

  for (const cell of startCells) {
    const key = cellKey(cell.col, cell.row);
    if (!visited.has(key)) {
      visited.add(key);
      queue.push(cell);
    }
  }

  while (head < queue.length) {
    const current = queue[head++];
    if (isTarget(current)) return true;

    for (const neighbor of getNeighbors(current.col, current.row, grid)) {
      const nKey = cellKey(neighbor.col, neighbor.row);
      if (neighbor.owner === team && !visited.has(nKey)) {
        visited.add(nKey);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

/**
 * Returns the winning path as array of "col-row" keys — used for highlighting.
 * Returns [] if no winning path exists.
 */
export function getWinningPath(grid: Map<string, HexCell>, team: TeamColor): string[] {
  const startCells = [...grid.values()].filter(
    c => c.owner === team && (team === 'RED' ? c.col === 0 : c.row === 0)
  );
  if (startCells.length === 0) return [];

  const isTarget = (c: HexCell) =>
    team === 'RED' ? c.col === GRID_COLS - 1 : c.row === GRID_ROWS - 1;

  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: HexCell[] = [];
  let head = 0;
  let targetKey: string | null = null;

  for (const cell of startCells) {
    const key = cellKey(cell.col, cell.row);
    if (!visited.has(key)) {
      visited.add(key);
      parent.set(key, null);
      queue.push(cell);
    }
  }

  while (head < queue.length) {
    const current = queue[head++];
    const key = cellKey(current.col, current.row);

    if (isTarget(current)) {
      targetKey = key;
      break;
    }

    for (const neighbor of getNeighbors(current.col, current.row, grid)) {
      const nKey = cellKey(neighbor.col, neighbor.row);
      if (neighbor.owner === team && !visited.has(nKey)) {
        visited.add(nKey);
        parent.set(nKey, key);
        queue.push(neighbor);
      }
    }
  }

  if (!targetKey) return [];

  // Reconstruct path by walking parents back to start
  const path: string[] = [];
  let cur: string | null = targetKey;
  while (cur !== null) {
    path.unshift(cur);
    cur = parent.get(cur) ?? null;
  }
  return path;
}

/**
 * Pre-warms the neighbors cache for all 25 cells.
 * Call once at server startup (inside gameEngine init) for zero-latency first game.
 */
export function preWarmNeighborsCache(): void {
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      getNeighborCoords(col, row);
    }
  }
}
