/**
 * game.js — Sand Sort Puzzle Game
 * Main game logic, rendering, animation, level generation, persistence.
 * Enhanced with slot-machine-style gamification, scoring, and juicy animations.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS & CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const SAND_COLORS = [
  { id: 'red',      hex: '#e74c3c', dark: '#c0392b', light: '#ff6b6b' },
  { id: 'orange',   hex: '#e67e22', dark: '#ca6f1e', light: '#f39c12' },
  { id: 'yellow',   hex: '#f1c40f', dark: '#d4ac0d', light: '#f9e44a' },
  { id: 'green',    hex: '#2ecc71', dark: '#27ae60', light: '#58d68d' },
  { id: 'teal',     hex: '#1abc9c', dark: '#17a589', light: '#48c9b0' },
  { id: 'blue',     hex: '#3498db', dark: '#2980b9', light: '#5dade2' },
  { id: 'indigo',   hex: '#5c6bc0', dark: '#3949ab', light: '#7986cb' },
  { id: 'purple',   hex: '#9b59b6', dark: '#8e44ad', light: '#bb8fce' },
  { id: 'pink',     hex: '#e91e8c', dark: '#c2185b', light: '#f06292' },
  { id: 'rose',     hex: '#ff6b9d', dark: '#e91e63', light: '#ffb3c6' },
  { id: 'lime',     hex: '#8bc34a', dark: '#689f38', light: '#aed581' },
  { id: 'amber',    hex: '#ff8f00', dark: '#e65100', light: '#ffb300' },
];

// Difficulty scaling table: [minLevel, maxLevel] → config
const DIFFICULTY_TABLE = [
  { minLevel: 1,  maxLevel: 3,  colors: 3,  capacity: 4, extraEmpty: 1 },
  { minLevel: 4,  maxLevel: 7,  colors: 4,  capacity: 4, extraEmpty: 1 },
  { minLevel: 8,  maxLevel: 12, colors: 5,  capacity: 4, extraEmpty: 1 },
  { minLevel: 13, maxLevel: 18, colors: 6,  capacity: 5, extraEmpty: 1 },
  { minLevel: 19, maxLevel: 25, colors: 7,  capacity: 5, extraEmpty: 2 },
  { minLevel: 26, maxLevel: 33, colors: 8,  capacity: 5, extraEmpty: 2 },
  { minLevel: 34, maxLevel: 42, colors: 9,  capacity: 6, extraEmpty: 2 },
  { minLevel: 43, maxLevel: 52, colors: 10, capacity: 6, extraEmpty: 2 },
  { minLevel: 53, maxLevel: 63, colors: 11, capacity: 6, extraEmpty: 2 },
  { minLevel: 64, maxLevel: 999, colors: 12, capacity: 6, extraEmpty: 2 },
];

// Scoring constants
const SCORE = {
  POUR_BASE: 10,           // points per pour
  BOTTLE_COMPLETE: 200,    // bonus for completing a bottle
  LEVEL_COMPLETE_BASE: 500, // base for clearing a level
  EFFICIENCY_BONUS: 50,    // bonus per move under par
  COMBO_MULTIPLIER: 0.5,   // extra multiplier per combo level
  STREAK_BONUS: 100,       // bonus per level streak
};

function getDifficultyConfig(level) {
  for (const d of DIFFICULTY_TABLE) {
    if (level >= d.minLevel && level <= d.maxLevel) return { ...d };
  }
  return { ...DIFFICULTY_TABLE[DIFFICULTY_TABLE.length - 1] };
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════

const SAVE_KEY = 'sandsort_save';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) {}
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL GENERATION
// ═══════════════════════════════════════════════════════════════════════════

function generateLevel(level) {
  const cfg = getDifficultyConfig(level);
  const { colors: numColors, capacity, extraEmpty } = cfg;
  const usedColors = SAND_COLORS.slice(0, Math.min(numColors, SAND_COLORS.length));
  const shuffleMoves = numColors * capacity * 8;

  let attempts = 0;
  while (attempts < 30) {
    attempts++;
    const bottles = [];
    for (let c = 0; c < numColors; c++) {
      const b = [];
      for (let i = 0; i < capacity; i++) b.push(c);
      bottles.push(b);
    }
    for (let e = 0; e < extraEmpty; e++) bottles.push([]);

    const scrambleMoves = [];
    for (let m = 0; m < shuffleMoves; m++) {
      const nonEmpty = bottles.map((_, i) => i).filter(i => bottles[i].length > 0);
      if (nonEmpty.length === 0) break;
      const srcIdx = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
      const hasRoom = bottles.map((_, i) => i).filter(
        i => i !== srcIdx && bottles[i].length < capacity
      );
      if (hasRoom.length === 0) continue;
      const dstIdx = hasRoom[Math.floor(Math.random() * hasRoom.length)];
      bottles[dstIdx].push(bottles[srcIdx].pop());
      scrambleMoves.push([srcIdx, dstIdx]);
    }

    if (isSolved(bottles, numColors, capacity)) continue;
    if (!hasValidMoves(bottles, capacity)) continue;
    const solution = findSolution(bottles, numColors, capacity);
    if (solution === false) continue;

    return {
      bottles: bottles.map(b => [...b]),
      capacity,
      colors: usedColors,
      numColors,
      scrambleMoves,
      solutionPath: solution,
    };
  }

  // Last-resort fallback
  const bottles = [];
  const b0 = [], b1 = [];
  for (let i = 0; i < capacity; i++) {
    b0.push(i % 2 === 0 ? 0 : 1);
    b1.push(i % 2 === 0 ? 1 : 0);
  }
  bottles.push(b0, b1);
  for (let c = 2; c < numColors; c++) {
    const b = [];
    for (let i = 0; i < capacity; i++) b.push(c);
    bottles.push(b);
  }
  for (let e = 0; e < extraEmpty; e++) bottles.push([]);

  return {
    bottles: bottles.map(b => [...b]),
    capacity,
    colors: usedColors,
    numColors,
    scrambleMoves: [],
    solutionPath: null,
  };
}

function isSolved(bottles, numColors, capacity) {
  let complete = 0;
  for (let i = 0; i < bottles.length; i++) {
    const b = bottles[i];
    if (b.length === 0) continue;
    if (b.length === capacity && b.every(v => v === b[0])) complete++;
  }
  return complete === numColors;
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════

const State = {
  level: 1,
  bottles: [],
  capacity: 4,
  colors: [],
  numColors: 0,
  selectedBottle: -1,
  pendingSelect: -1,
  history: [],
  initialBottles: [],
  animating: false,
  animationsEnabled: true,
  lossCount: 0,
  // Scoring & gamification
  score: 0,           // total score across all levels
  levelScore: 0,      // score earned this level
  moveCount: 0,       // moves this level
  parMoves: 0,        // optimal/par move count
  completedBottles: 0, // how many bottles done this level
  // Combos & streaks
  lastPourTime: 0,     // timestamp of last pour (for combo detection)
  comboCount: 0,       // current combo chain
  levelStreak: 0,      // consecutive levels cleared without game-over
  sessionLevels: 0,    // levels cleared this session
  // Hints
  hintsRemaining: 3,
  // Debug mode
  debugMode: false,
  debugScramble: [],
  debugSolution: undefined,
};

// ═══════════════════════════════════════════════════════════════════════════
// MOVE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

function getTopRun(bottle) {
  if (bottle.length === 0) return { color: -1, count: 0 };
  const topColor = bottle[bottle.length - 1];
  let count = 0;
  for (let i = bottle.length - 1; i >= 0; i--) {
    if (bottle[i] === topColor) count++;
    else break;
  }
  return { color: topColor, count };
}

function canPour(bottles, capacity, srcIdx, dstIdx) {
  if (srcIdx === dstIdx) return false;
  const src = bottles[srcIdx];
  const dst = bottles[dstIdx];
  if (src.length === 0) return false;
  const { color: srcColor, count: srcCount } = getTopRun(src);
  if (dst.length + srcCount > capacity) return false;
  if (dst.length > 0) {
    const { color: dstColor } = getTopRun(dst);
    if (dstColor !== srcColor) return false;
  }
  return true;
}

function hasValidMoves(bottles, capacity) {
  for (let s = 0; s < bottles.length; s++) {
    for (let d = 0; d < bottles.length; d++) {
      if (canPour(bottles, capacity, s, d)) return true;
    }
  }
  return false;
}

function findSolution(startBottles, numColors, capacity, maxStates = 50000) {
  if (isSolved(startBottles, numColors, capacity)) return [];
  const stateKey = (btls) => btls.map(b => b.join(',')).join('|');
  const visited = new Map();
  const startKey = stateKey(startBottles);
  visited.set(startKey, { parentKey: null, move: null });
  const queue = [{ key: startKey, bottles: startBottles.map(b => [...b]) }];
  let head = 0;

  while (head < queue.length) {
    const { key: currentKey, bottles } = queue[head++];
    for (let s = 0; s < bottles.length; s++) {
      for (let d = 0; d < bottles.length; d++) {
        if (!canPour(bottles, capacity, s, d)) continue;
        const next = bottles.map(b => [...b]);
        const { count } = getTopRun(next[s]);
        for (let i = 0; i < count; i++) next[d].push(next[s].pop());
        const key = stateKey(next);
        if (visited.has(key)) continue;
        visited.set(key, { parentKey: currentKey, move: [s, d] });
        if (isSolved(next, numColors, capacity)) {
          const path = [];
          let k = key;
          while (visited.get(k).move !== null) {
            path.unshift(visited.get(k).move);
            k = visited.get(k).parentKey;
          }
          return path;
        }
        if (visited.size >= maxStates) return null;
        queue.push({ key, bottles: next });
      }
    }
  }
  return false;
}

function checkWin(bottles, numColors, capacity) {
  let completedCount = 0;
  for (let i = 0; i < bottles.length; i++) {
    const b = bottles[i];
    if (b.length === 0) continue;
    if (b.length === capacity && b.every(v => v === b[0])) completedCount++;
  }
  return completedCount === numColors;
}

function countCompletedBottles(bottles, capacity) {
  let count = 0;
  for (const b of bottles) {
    if (b.length === capacity && b.every(v => v === b[0])) count++;
  }
  return count;
}

function findHint(bottles, capacity) {
  for (let s = 0; s < bottles.length; s++) {
    for (let d = 0; d < bottles.length; d++) {
      if (!canPour(bottles, capacity, s, d)) continue;
      const { count: srcCount } = getTopRun(bottles[s]);
      const dst = bottles[d];
      if (dst.length + srcCount === capacity) return [s, d];
    }
  }
  for (let s = 0; s < bottles.length; s++) {
    for (let d = 0; d < bottles.length; d++) {
      if (canPour(bottles, capacity, s, d)) return [s, d];
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CANVAS RENDERER
// ═══════════════════════════════════════════════════════════════════════════

const canvas = document.getElementById('game-canvas');
const ctx2d = canvas.getContext('2d');

const Layout = {
  bottleW: 60,
  bottleH: 180,
  bottleRadius: 12,
  neckW: 36,
  neckH: 20,
  padding: 16,
  cols: 5,
  rows: 1,
  startX: 0,
  startY: 0,
  bottlePositions: [],
};

function computeLayout() {
  const area = document.getElementById('game-area');
  const W = area.clientWidth;
  const H = area.clientHeight;
  canvas.width = W;
  canvas.height = H;

  const n = State.bottles.length;
  if (n === 0) return;

  let cols = Math.min(n, Math.ceil(Math.sqrt(n * 1.5)));
  let rows = Math.ceil(n / cols);
  const maxBW = Math.floor((W - Layout.padding * (cols + 1)) / cols);
  const maxBH = Math.floor((H - Layout.padding * (rows + 1)) / rows);
  let bW = Math.min(maxBW, 80);
  let bH = Math.min(maxBH, bW * 3.2);
  bW = Math.min(bW, bH / 3.2);
  bW = Math.max(bW, 36);
  bH = Math.max(bH, 100);

  Layout.bottleW = bW;
  Layout.bottleH = bH;
  Layout.bottleRadius = bW * 0.18;
  Layout.neckW = bW * 0.6;
  Layout.neckH = bH * 0.1;
  Layout.cols = cols;
  Layout.rows = rows;

  const gridW = cols * bW + (cols - 1) * Layout.padding;
  const gridH = rows * (bH + Layout.neckH) + (rows - 1) * Layout.padding;
  Layout.startX = (W - gridW) / 2;
  Layout.startY = (H - gridH) / 2;

  Layout.bottlePositions = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = Layout.startX + col * (bW + Layout.padding) + bW / 2;
    const y = Layout.startY + row * (bH + Layout.neckH + Layout.padding);
    Layout.bottlePositions.push({ x, y });
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────

// Active visual effects
let bottleEffects = {}; // { bottleIndex: { type, startTime, color } }

function drawBottle(i, selected, hinted) {
  const pos = Layout.bottlePositions[i];
  if (!pos) return;
  const { x, y } = pos;
  const { bottleW: bW, bottleH: bH, bottleRadius: br, neckW, neckH } = Layout;
  const capacity = State.capacity;

  ctx2d.save();

  // Glow for selected
  if (selected) {
    ctx2d.shadowColor = 'rgba(255,255,255,0.6)';
    ctx2d.shadowBlur = 18;
  } else if (hinted) {
    ctx2d.shadowColor = 'rgba(245,166,35,0.7)';
    ctx2d.shadowBlur = 16;
  }

  const bodyX = x - bW / 2;
  const bodyY = y + neckH;
  const bodyW = bW;
  const bodyH = bH;

  // Clip to bottle interior for sand
  ctx2d.beginPath();
  roundRect(ctx2d, bodyX + 2, bodyY + 2, bodyW - 4, bodyH - 4, br - 1);
  ctx2d.clip();

  // Draw sand layers (bottom to top)
  const bottle = State.bottles[i];
  const layerH = (bodyH - 4) / capacity;

  for (let l = 0; l < bottle.length; l++) {
    const colorIdx = bottle[l];
    const color = State.colors[colorIdx];
    if (!color) continue;
    const ly = bodyY + 2 + (capacity - 1 - l) * layerH;
    ctx2d.fillStyle = color.hex;
    ctx2d.fillRect(bodyX + 2, ly, bodyW - 4, layerH + 1);

    const grad = ctx2d.createLinearGradient(bodyX + 2, ly, bodyX + bodyW - 2, ly);
    grad.addColorStop(0, 'rgba(255,255,255,0.12)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(bodyX + 2, ly, bodyW - 4, layerH + 1);

    drawSandTexture(bodyX + 2, ly, bodyW - 4, layerH, color);
  }

  ctx2d.restore();
  ctx2d.save();

  if (selected) {
    ctx2d.shadowColor = 'rgba(255,255,255,0.6)';
    ctx2d.shadowBlur = 18;
  } else if (hinted) {
    ctx2d.shadowColor = 'rgba(245,166,35,0.7)';
    ctx2d.shadowBlur = 16;
  }

  // Bottle glass outline
  ctx2d.strokeStyle = selected
    ? 'rgba(255,255,255,0.85)'
    : hinted
    ? 'rgba(245,166,35,0.85)'
    : 'rgba(180,220,255,0.35)';
  ctx2d.lineWidth = selected ? 2.5 : 1.8;

  // Neck
  const neckX = x - neckW / 2;
  ctx2d.beginPath();
  ctx2d.moveTo(neckX, y);
  ctx2d.lineTo(neckX, y + neckH);
  ctx2d.lineTo(bodyX, y + neckH);
  ctx2d.stroke();

  ctx2d.beginPath();
  ctx2d.moveTo(neckX + neckW, y);
  ctx2d.lineTo(neckX + neckW, y + neckH);
  ctx2d.lineTo(bodyX + bodyW, y + neckH);
  ctx2d.stroke();

  // Body outline
  ctx2d.beginPath();
  roundRect(ctx2d, bodyX, bodyY, bodyW, bodyH, br);
  ctx2d.stroke();

  // Glass shine
  ctx2d.beginPath();
  ctx2d.moveTo(bodyX + bW * 0.15, bodyY + bH * 0.08);
  ctx2d.lineTo(bodyX + bW * 0.15, bodyY + bH * 0.35);
  ctx2d.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx2d.lineWidth = bW * 0.06;
  ctx2d.lineCap = 'round';
  ctx2d.stroke();

  // Completed bottle glow — enhanced golden shimmer
  const b = State.bottles[i];
  if (b.length === capacity && b.every(v => v === b[0])) {
    const glowColor = State.colors[b[0]]?.hex || '#fff';
    ctx2d.shadowColor = glowColor;
    ctx2d.shadowBlur = 24;
    ctx2d.beginPath();
    roundRect(ctx2d, bodyX, bodyY, bodyW, bodyH, br);
    ctx2d.strokeStyle = glowColor;
    ctx2d.lineWidth = 2.5;
    ctx2d.stroke();

    // Floating sparkle particles for completed bottles
    if (State.animationsEnabled) {
      const now = performance.now();
      const sparkleCount = 3;
      for (let s = 0; s < sparkleCount; s++) {
        const phase = (now / 1500 + s * 2.09) % 1;
        const sx = bodyX + bW * 0.2 + Math.sin(now / 800 + s * 1.5) * bW * 0.3;
        const sy = bodyY + bodyH * (1 - phase);
        const alpha = Math.sin(phase * Math.PI) * 0.6;
        const size = 1.5 + Math.sin(now / 400 + s) * 0.8;
        ctx2d.save();
        ctx2d.globalAlpha = alpha;
        ctx2d.fillStyle = '#fff';
        ctx2d.shadowColor = glowColor;
        ctx2d.shadowBlur = 6;
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, size, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.restore();
      }
    }
  }

  ctx2d.restore();

  // Draw shockwave effect if active
  const effect = bottleEffects[i];
  if (effect && effect.type === 'shockwave') {
    const elapsed = performance.now() - effect.startTime;
    const duration = 600;
    if (elapsed < duration) {
      const progress = elapsed / duration;
      const radius = bW * 0.5 + progress * bW * 1.5;
      const alpha = (1 - progress) * 0.5;
      ctx2d.save();
      ctx2d.globalAlpha = alpha;
      ctx2d.strokeStyle = effect.color || '#ffd700';
      ctx2d.lineWidth = 3 * (1 - progress);
      ctx2d.beginPath();
      ctx2d.arc(x, bodyY + bodyH / 2, radius, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.restore();
    } else {
      delete bottleEffects[i];
    }
  }

  // Debug overlay
  if (State.debugMode) {
    ctx2d.save();
    const numSize = Math.max(11, Math.min(16, neckW * 0.55));
    ctx2d.font = `bold ${numSize}px monospace`;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'bottom';
    const label = String(i + 1);
    ctx2d.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx2d.lineWidth = 3;
    ctx2d.strokeText(label, x, y - 3);
    ctx2d.fillStyle = '#f5a623';
    ctx2d.fillText(label, x, y - 3);
    ctx2d.restore();
  }
}

function drawSandTexture(x, y, w, h, color) {
  const count = Math.floor(w * h / 80);
  ctx2d.save();
  for (let i = 0; i < count; i++) {
    const tx = x + Math.random() * w;
    const ty = y + Math.random() * h;
    const r = 0.8 + Math.random() * 1.2;
    ctx2d.beginPath();
    ctx2d.arc(tx, ty, r, 0, Math.PI * 2);
    ctx2d.fillStyle = Math.random() < 0.5
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(0,0,0,0.12)';
    ctx2d.fill();
  }
  ctx2d.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

let hintBottles = [-1, -1];
let hintTimer = null;
let needsAnimationFrame = false; // for sparkle particles

function render() {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  let hasAnimatingEffects = false;

  for (let i = 0; i < State.bottles.length; i++) {
    const selected = i === State.selectedBottle;
    const hinted = i === hintBottles[0] || i === hintBottles[1];
    drawBottle(i, selected, hinted);

    // Check if any bottle has active effects or sparkles
    const b = State.bottles[i];
    if (b.length === State.capacity && b.every(v => v === b[0]) && State.animationsEnabled) {
      hasAnimatingEffects = true;
    }
    if (bottleEffects[i]) hasAnimatingEffects = true;
  }

  // Keep rendering for sparkle particles on completed bottles
  if (hasAnimatingEffects && !State.animating) {
    if (!needsAnimationFrame) {
      needsAnimationFrame = true;
      requestAnimationFrame(() => {
        needsAnimationFrame = false;
        if (!State.animating) render();
      });
    }
  }
}

function updateDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  if (!State.debugMode) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const scrambleEl = document.getElementById('debug-scramble');
  if (scrambleEl) {
    const moves = State.debugScramble;
    if (!moves || moves.length === 0) {
      scrambleEl.textContent = 'Scramble: (fallback layout — no grain history)';
    } else {
      const MAX = 40;
      const shown = moves.slice(0, MAX).map(([s, d]) => `${s + 1}\u2192${d + 1}`).join(' ');
      const extra = moves.length > MAX ? `  \u2026+${moves.length - MAX} more` : '';
      scrambleEl.textContent = `Scramble (${moves.length} grain mvs): ${shown}${extra}`;
    }
  }

  if (State.debugSolution === undefined && State.initialBottles && State.initialBottles.length > 0) {
    State.debugSolution = findSolution(State.initialBottles, State.numColors, State.capacity);
  }

  const solEl = document.getElementById('debug-solution');
  if (solEl) {
    const sol = State.debugSolution;
    if (sol === false) {
      solEl.textContent = 'Solution: \u26a0 UNSOLVABLE';
      solEl.style.color = '#e74c3c';
    } else if (sol === null) {
      solEl.textContent = 'Solution: (budget exceeded \u2014 assumed solvable)';
      solEl.style.color = '#f5a623';
    } else if (!Array.isArray(sol) || sol.length === 0) {
      solEl.textContent = 'Solution: (already solved at gen)';
      solEl.style.color = '#e74c3c';
    } else {
      const formatted = sol.map(([s, d]) => `${s + 1}\u2192${d + 1}`).join(', ');
      solEl.textContent = `Solution (${sol.length} pours): ${formatted}`;
      solEl.style.color = '#2ecc71';
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UI UPDATE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function updateHUD() {
  document.getElementById('hud-score').textContent = State.score.toLocaleString();
  document.getElementById('move-counter').textContent = `Moves: ${State.moveCount}`;

  const parEl = document.getElementById('par-display');
  if (State.parMoves > 0) {
    parEl.textContent = `Par: ${State.parMoves}`;
  } else {
    parEl.textContent = '';
  }

  const streakEl = document.getElementById('streak-display');
  if (State.levelStreak >= 2) {
    streakEl.style.display = '';
    streakEl.textContent = `\ud83d\udd25 ${State.levelStreak} streak`;
  } else {
    streakEl.style.display = 'none';
  }

  // Hint count
  const hintCountEl = document.getElementById('hint-count');
  if (hintCountEl) {
    hintCountEl.textContent = `(${State.hintsRemaining})`;
  }

  updateProgressBar();
}

function updateProgressBar() {
  const fill = document.getElementById('progress-bar-fill');
  if (!fill) return;
  const total = State.numColors;
  const done = countCompletedBottles(State.bottles, State.capacity);
  const pct = total > 0 ? (done / total) * 100 : 0;
  fill.style.width = pct + '%';
}

function showScorePopup(points, x, y) {
  const layer = document.getElementById('popup-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = `+${points}`;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1300);
  Audio.playScorePopup();
}

function showComboToast(combo) {
  const toast = document.getElementById('combo-toast');
  if (!toast) return;
  const messages = ['', '', 'x2 COMBO!', 'x3 COMBO!', 'x4 SUPER COMBO!', 'x5 MEGA COMBO!'];
  toast.textContent = messages[Math.min(combo, 5)] || `x${combo} INSANE!`;
  toast.classList.remove('hidden', 'show');
  // Force reflow
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hidden'); }, 1600);
}

function showMilestoneToast(text) {
  const toast = document.getElementById('milestone-toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove('hidden', 'show');
  void toast.offsetWidth;
  toast.classList.add('show');
  Audio.playSessionMilestone();
  setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hidden'); }, 2500);
}

function triggerScreenShake() {
  const gameScreen = document.getElementById('screen-game');
  gameScreen.classList.remove('screen-shake');
  void gameScreen.offsetWidth;
  gameScreen.classList.add('screen-shake');
  setTimeout(() => gameScreen.classList.remove('screen-shake'), 400);
}

function triggerBgFlash(type = 'normal') {
  const gameScreen = document.getElementById('screen-game');
  const cls = type === 'win' ? 'bg-flash-win' : 'bg-flash';
  gameScreen.classList.remove(cls);
  void gameScreen.offsetWidth;
  gameScreen.classList.add(cls);
  setTimeout(() => gameScreen.classList.remove(cls), type === 'win' ? 1100 : 700);
}

function triggerDesaturate() {
  const gameScreen = document.getElementById('screen-game');
  gameScreen.classList.remove('desaturate');
  void gameScreen.offsetWidth;
  gameScreen.classList.add('desaturate');
  setTimeout(() => gameScreen.classList.remove('desaturate'), 450);
}

// ═══════════════════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════════════════

function calculateStarRating(moveCount, parMoves) {
  if (parMoves <= 0) return 3; // no par = free 3 stars
  if (moveCount <= parMoves) return 3;
  if (moveCount <= parMoves + 3) return 2;
  return 1;
}

function calculateLevelScore(moveCount, parMoves, level) {
  const cfg = getDifficultyConfig(level);
  let points = SCORE.LEVEL_COMPLETE_BASE;
  // Difficulty multiplier
  points += cfg.colors * 30;
  // Efficiency bonus
  if (parMoves > 0 && moveCount <= parMoves) {
    points += (parMoves - moveCount + 1) * SCORE.EFFICIENCY_BONUS;
  }
  // Streak bonus
  points += State.levelStreak * SCORE.STREAK_BONUS;
  return points;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

let confettiParticles = [];
let confettiAnimFrame = null;

function startConfetti() {
  const cvs = document.getElementById('confetti-canvas');
  if (!cvs) return;
  const ctxC = cvs.getContext('2d');
  cvs.width = window.innerWidth;
  cvs.height = window.innerHeight;

  confettiParticles = [];
  const colors = State.colors.map(c => c.hex);
  // Add gold and white
  colors.push('#ffd700', '#ffffff', '#ff6b6b');

  for (let i = 0; i < 80; i++) {
    confettiParticles.push({
      x: Math.random() * cvs.width,
      y: -20 - Math.random() * cvs.height * 0.5,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.2,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity: 0.06 + Math.random() * 0.04,
      drag: 0.98 + Math.random() * 0.015,
    });
  }

  function frame() {
    ctxC.clearRect(0, 0, cvs.width, cvs.height);
    let alive = false;

    for (const p of confettiParticles) {
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotV;

      if (p.y < cvs.height + 50) {
        alive = true;
        ctxC.save();
        ctxC.translate(p.x, p.y);
        ctxC.rotate(p.rot);
        ctxC.fillStyle = p.color;
        ctxC.globalAlpha = Math.max(0, 1 - p.y / cvs.height);
        ctxC.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctxC.restore();
      }
    }

    if (alive) {
      confettiAnimFrame = requestAnimationFrame(frame);
    } else {
      ctxC.clearRect(0, 0, cvs.width, cvs.height);
      confettiAnimFrame = null;
    }
  }

  if (confettiAnimFrame) cancelAnimationFrame(confettiAnimFrame);
  confettiAnimFrame = requestAnimationFrame(frame);
}

function stopConfetti() {
  if (confettiAnimFrame) {
    cancelAnimationFrame(confettiAnimFrame);
    confettiAnimFrame = null;
  }
  const cvs = document.getElementById('confetti-canvas');
  if (cvs) {
    const ctxC = cvs.getContext('2d');
    ctxC.clearRect(0, 0, cvs.width, cvs.height);
  }
  confettiParticles = [];
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Animate sand pouring with sparkle trail particles.
 */
function animatePour(srcIdx, dstIdx, colorIdx, count, onComplete) {
  if (!State.animationsEnabled) {
    onComplete();
    return;
  }

  const srcPos = Layout.bottlePositions[srcIdx];
  const dstPos = Layout.bottlePositions[dstIdx];
  if (!srcPos || !dstPos) { onComplete(); return; }

  const color = State.colors[colorIdx];
  if (!color) { onComplete(); return; }

  const { neckW } = Layout;
  const startX = srcPos.x;
  const startY = srcPos.y;
  const endX = dstPos.x;
  const endY = dstPos.y;
  const cpX = (startX + endX) / 2;
  const cpY = Math.min(startY, endY) - 60;

  const DURATION = 420;
  const PARTICLE_COUNT = 18;
  const SPARKLE_COUNT = 8;
  const startTime = performance.now();

  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    t: i / PARTICLE_COUNT,
    size: 2.5 + Math.random() * 2.5,
    offset: (Math.random() - 0.5) * (neckW * 0.4),
  }));

  // Sparkle trail particles
  const sparkles = Array.from({ length: SPARKLE_COUNT }, () => ({
    t: Math.random(),
    size: 1 + Math.random() * 2,
    offset: (Math.random() - 0.5) * (neckW * 0.8),
    yOff: (Math.random() - 0.5) * 10,
    phase: Math.random() * Math.PI * 2,
  }));

  function bezier(t, p0, p1, p2) {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
  }

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / DURATION, 1);

    render();
    ctx2d.save();

    // Draw arc path as a thick colored line (the stream)
    const streamSteps = 30;
    for (let s = 0; s < streamSteps - 1; s++) {
      const t0 = s / streamSteps;
      const t1 = (s + 1) / streamSteps;
      const x0 = bezier(t0, startX, cpX, endX);
      const y0 = bezier(t0, startY, cpY, endY);
      const x1 = bezier(t1, startX, cpX, endX);
      const y1 = bezier(t1, startY, cpY, endY);
      if (t0 > progress) break;

      const alpha = 0.7 - t0 * 0.3;
      const width = neckW * 0.35 * (1 - t0 * 0.5);
      ctx2d.beginPath();
      ctx2d.moveTo(x0, y0);
      ctx2d.lineTo(x1, y1);
      ctx2d.strokeStyle = color.hex;
      ctx2d.lineWidth = width;
      ctx2d.lineCap = 'round';
      ctx2d.globalAlpha = alpha;
      ctx2d.stroke();
    }

    // Draw particles
    particles.forEach(p => {
      const pt = (p.t + progress * 1.2) % 1;
      if (pt > progress + 0.1) return;
      const px = bezier(pt, startX, cpX, endX) + p.offset * (1 - pt);
      const py = bezier(pt, startY, cpY, endY);
      ctx2d.beginPath();
      ctx2d.arc(px, py, p.size, 0, Math.PI * 2);
      ctx2d.fillStyle = color.hex;
      ctx2d.globalAlpha = 0.85;
      ctx2d.fill();

      ctx2d.beginPath();
      ctx2d.arc(px - p.size * 0.25, py - p.size * 0.25, p.size * 0.35, 0, Math.PI * 2);
      ctx2d.fillStyle = color.light;
      ctx2d.globalAlpha = 0.5;
      ctx2d.fill();
    });

    // Draw sparkle trail particles — glowing white dots with bloom
    sparkles.forEach(sp => {
      const spT = (sp.t + progress * 1.1) % 1;
      if (spT > progress + 0.05) return;
      const spx = bezier(spT, startX, cpX, endX) + sp.offset;
      const spy = bezier(spT, startY, cpY, endY) + sp.yOff;
      const twinkle = 0.3 + Math.sin(now / 100 + sp.phase) * 0.3;

      ctx2d.save();
      ctx2d.globalAlpha = twinkle;
      ctx2d.shadowColor = '#fff';
      ctx2d.shadowBlur = 6;
      ctx2d.fillStyle = '#fff';
      ctx2d.beginPath();
      ctx2d.arc(spx, spy, sp.size, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
    });

    ctx2d.globalAlpha = 1;
    ctx2d.restore();

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      render();
      onComplete();
    }
  }

  requestAnimationFrame(frame);
}

function animateLift(bottleIdx, up, onComplete) {
  if (!State.animationsEnabled) { onComplete && onComplete(); return; }
  const pos = Layout.bottlePositions[bottleIdx];
  if (!pos) { onComplete && onComplete(); return; }

  const LIFT = 18;
  const DURATION = 150;
  const startTime = performance.now();
  const startY = pos.y;
  const targetY = up ? startY - LIFT : startY + LIFT;

  function frame(now) {
    const t = Math.min((now - startTime) / DURATION, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    Layout.bottlePositions[bottleIdx].y = startY + (targetY - startY) * ease;
    render();
    if (t < 1) requestAnimationFrame(frame);
    else {
      Layout.bottlePositions[bottleIdx].y = targetY;
      onComplete && onComplete();
    }
  }
  requestAnimationFrame(frame);
}

/** Trigger bottle completion shockwave + snap animation */
function triggerBottleCompleteEffect(bottleIdx) {
  const color = State.colors[State.bottles[bottleIdx][0]];
  bottleEffects[bottleIdx] = {
    type: 'shockwave',
    startTime: performance.now(),
    color: color ? color.light : '#ffd700',
  };

  // Snap animation — scale bottle briefly
  if (State.animationsEnabled) {
    const pos = Layout.bottlePositions[bottleIdx];
    const origY = pos.y;
    pos.y = origY - 4; // quick lift
    setTimeout(() => {
      pos.y = origY + 2;
      render();
      setTimeout(() => {
        pos.y = origY;
        render();
      }, 60);
    }, 80);
  }

  triggerBgFlash('normal');
}

// ═══════════════════════════════════════════════════════════════════════════
// TENSION SYSTEM — ambient pulse near winning
// ═══════════════════════════════════════════════════════════════════════════

function updateTension() {
  const completed = countCompletedBottles(State.bottles, State.capacity);
  const remaining = State.numColors - completed;

  if (remaining <= 2 && remaining > 0) {
    const intensity = remaining === 1 ? 0.8 : 0.4;
    Audio.startTension(intensity);
  } else {
    Audio.stopTension();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

function selectBottle(idx) {
  if (State.animating) {
    State.pendingSelect = (State.pendingSelect === idx) ? -1 : idx;
    return;
  }
  Audio.resume();

  if (State.selectedBottle === -1) {
    if (State.bottles[idx].length === 0) return;
    State.selectedBottle = idx;
    Audio.playSelect();
    clearHint();
    animateLift(idx, true);
    render();
  } else if (State.selectedBottle === idx) {
    const prev = State.selectedBottle;
    State.selectedBottle = -1;
    Audio.playDeselect();
    animateLift(prev, false);
    render();
  } else {
    const src = State.selectedBottle;
    const dst = idx;

    if (canPour(State.bottles, State.capacity, src, dst)) {
      executePour(src, dst);
    } else {
      Audio.playInvalid();
      triggerScreenShake();
      const prev = State.selectedBottle;
      State.selectedBottle = -1;
      animateLift(prev, false, () => render());
      render();
    }
  }
}

function executePour(srcIdx, dstIdx) {
  State.animating = true;
  clearHint();

  // Save history
  State.history.push(State.bottles.map(b => [...b]));

  const { color: colorIdx, count } = getTopRun(State.bottles[srcIdx]);

  // Track combo — fast pours in succession
  const now = performance.now();
  if (now - State.lastPourTime < 2000 && State.lastPourTime > 0) {
    State.comboCount++;
    if (State.comboCount >= 2) {
      Audio.playCombo(State.comboCount);
      showComboToast(State.comboCount);
    }
  } else {
    State.comboCount = 1;
  }
  State.lastPourTime = now;

  // Increment move counter
  State.moveCount++;

  const prevSelected = State.selectedBottle;
  State.selectedBottle = -1;

  Audio.playSandPour(0.35 + count * 0.05, count);

  animateLift(prevSelected, false, () => {
    // Perform the pour in state
    for (let i = 0; i < count; i++) {
      State.bottles[dstIdx].push(State.bottles[srcIdx].pop());
    }

    animatePour(srcIdx, dstIdx, colorIdx, count, () => {
      Audio.playSandLand();

      // Score for the pour itself
      const pourPoints = SCORE.POUR_BASE + (State.comboCount > 1 ? Math.floor(SCORE.POUR_BASE * State.comboCount * SCORE.COMBO_MULTIPLIER) : 0);
      State.score += pourPoints;
      State.levelScore += pourPoints;

      // Check if destination bottle is now complete
      const dst = State.bottles[dstIdx];
      const isNowComplete = dst.length === State.capacity && dst.every(v => v === dst[0]);

      if (isNowComplete) {
        Audio.playBottleComplete();
        triggerBottleCompleteEffect(dstIdx);

        // Big score bonus
        const bottlePoints = SCORE.BOTTLE_COMPLETE;
        State.score += bottlePoints;
        State.levelScore += bottlePoints;

        // Show score popup at bottle position
        const pos = Layout.bottlePositions[dstIdx];
        if (pos) {
          showScorePopup(bottlePoints, pos.x - 20, pos.y - 10);
        }

        State.completedBottles = countCompletedBottles(State.bottles, State.capacity);
      } else {
        // Check near-miss: one grain away from complete
        const dstRun = getTopRun(dst);
        if (dst.length === State.capacity - 1 && dst.every(v => v === dst[0])) {
          // Actually the bottle is capacity-1 grains of one color - not a near miss per se
          // A near miss is when the bottle is full but NOT all the same color
        } else if (dst.length === State.capacity && !dst.every(v => v === dst[0])) {
          // Bottle is full but mixed - not really near miss
        }
        // Real near-miss: all same color but not full yet, and close to capacity
        if (dstRun.count === dst.length && dst.length === State.capacity - 1) {
          Audio.playNearMiss();
        }
      }

      // Update tension
      updateTension();

      State.animating = false;
      updateHUD();
      render();
      saveProgress();

      // Check win
      if (checkWin(State.bottles, State.numColors, State.capacity)) {
        State.pendingSelect = -1;
        Audio.stopTension();
        setTimeout(() => triggerWin(), 500);
        return;
      }

      // Check game over
      if (!hasValidMoves(State.bottles, State.capacity)) {
        State.pendingSelect = -1;
        Audio.stopTension();
        setTimeout(() => triggerGameOver(), 400);
        return;
      }

      // Fire any tap that was queued during the animation
      const pending = State.pendingSelect;
      State.pendingSelect = -1;
      if (pending !== -1) selectBottle(pending);
    });
  });
}

function undoMove() {
  if (State.animating) return;
  if (State.history.length === 0) return;
  Audio.playClick();

  if (State.selectedBottle !== -1) {
    State.selectedBottle = -1;
    computeLayout();
  }

  State.bottles = State.history.pop();
  State.moveCount = Math.max(0, State.moveCount - 1);
  State.comboCount = 0; // undo breaks combo
  clearHint();
  updateHUD();
  updateTension();
  render();
  saveProgress();
}

function showHint() {
  if (State.animating) return;
  if (State.hintsRemaining <= 0) {
    Audio.playInvalid();
    return;
  }
  Audio.playClick();
  const hint = findHint(State.bottles, State.capacity);
  if (!hint) return;

  State.hintsRemaining--;
  hintBottles = hint;
  updateHUD();
  render();
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(clearHint, 2500);
}

function clearHint(skipRender) {
  hintBottles = [-1, -1];
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  if (!skipRender && State.bottles.length > 0 && canvas.width > 0) render();
}

// ═══════════════════════════════════════════════════════════════════════════
// LEVEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function startLevel(level) {
  State.level = level;
  State.history = [];
  State.selectedBottle = -1;
  State.animating = false;
  State.lossCount = 0;
  State.moveCount = 0;
  State.levelScore = 0;
  State.comboCount = 0;
  State.lastPourTime = 0;
  State.completedBottles = 0;
  State.hintsRemaining = 3;
  bottleEffects = {};
  clearHint(true);

  let levelData;
  let safetyCount = 0;
  do {
    levelData = generateLevel(level);
    safetyCount++;
  } while (
    safetyCount < 15 &&
    (
      checkWin(levelData.bottles, levelData.numColors, levelData.capacity) ||
      !hasValidMoves(levelData.bottles, levelData.capacity)
    )
  );

  State.bottles = levelData.bottles;
  State.capacity = levelData.capacity;
  State.colors = levelData.colors;
  State.numColors = levelData.numColors;
  State.initialBottles = levelData.bottles.map(b => [...b]);

  // Par is the optimal solution length, or 0 if unknown
  State.parMoves = (levelData.solutionPath && Array.isArray(levelData.solutionPath))
    ? levelData.solutionPath.length
    : 0;

  State.debugScramble = levelData.scrambleMoves || [];
  State.debugSolution = State.debugMode
    ? findSolution(State.initialBottles, State.numColors, State.capacity)
    : undefined;

  document.getElementById('level-label').textContent = `Level ${level}`;
  computeLayout();
  updateHUD();
  render();
  updateDebugPanel();
  saveProgress();
}

function restartLevel() {
  State.bottles = State.initialBottles.map(b => [...b]);
  State.history = [];
  State.selectedBottle = -1;
  State.animating = false;
  State.moveCount = 0;
  State.levelScore = 0;
  State.comboCount = 0;
  State.lastPourTime = 0;
  State.completedBottles = 0;
  State.hintsRemaining = 3;
  bottleEffects = {};
  clearHint();
  computeLayout();
  updateHUD();
  render();
  updateDebugPanel();
  saveProgress();
}

function triggerWin() {
  triggerBgFlash('win');

  // Calculate final level score
  const levelBonus = calculateLevelScore(State.moveCount, State.parMoves, State.level);
  State.score += levelBonus;
  State.levelScore += levelBonus;
  State.levelStreak++;
  State.sessionLevels++;

  const stars = calculateStarRating(State.moveCount, State.parMoves);

  // Populate win screen
  document.getElementById('win-level-text').textContent = `Level ${State.level} Solved!`;
  document.getElementById('win-moves').textContent = State.moveCount;
  document.getElementById('win-score').textContent = `+${State.levelScore.toLocaleString()}`;
  document.getElementById('win-total-score').textContent = State.score.toLocaleString();

  // Reset stars
  const starEls = [
    document.getElementById('star-1'),
    document.getElementById('star-2'),
    document.getElementById('star-3'),
  ];
  starEls.forEach(el => {
    el.classList.remove('revealed', 'earned', 'unearned');
    el.style.opacity = '0';
  });

  showScreen('screen-win');

  // Dramatic star reveal sequence
  starEls.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add('revealed');
      if (i < stars) {
        el.classList.add('earned');
      } else {
        el.classList.add('unearned');
      }
      Audio.playStarReveal(i);
    }, 400 + i * 400);
  });

  // Play win sound after a beat
  setTimeout(() => Audio.playWin(), 200);

  // Start confetti after stars
  setTimeout(() => startConfetti(), 600);

  // Session milestones
  if (State.sessionLevels === 5) {
    setTimeout(() => showMilestoneToast('\ud83d\udd25 5 Level Streak!'), 2000);
  } else if (State.sessionLevels === 10) {
    setTimeout(() => showMilestoneToast('\ud83d\udca5 UNSTOPPABLE! 10 Levels!'), 2000);
  } else if (State.sessionLevels === 25) {
    setTimeout(() => showMilestoneToast('\ud83c\udf1f LEGENDARY! 25 Levels!'), 2000);
  }

  saveProgress();
}

function triggerGameOver() {
  Audio.playGameOver();
  Audio.stopTension();

  // Streak loss
  if (State.levelStreak > 2) {
    Audio.playStreakLoss();
    triggerDesaturate();
  }
  State.levelStreak = 0;
  State.lossCount++;

  const regenBtn = document.getElementById('btn-regen-level');
  const msg = document.getElementById('gameover-msg');

  if (State.lossCount >= 2) {
    regenBtn.style.display = '';
    msg.textContent = 'Stuck again? This layout might be unsolvable.';
  } else {
    regenBtn.style.display = 'none';
    msg.textContent = 'No valid moves remain.';
  }

  saveProgress();
  showScreen('screen-gameover');
}

// ═══════════════════════════════════════════════════════════════════════════
// SAVE / LOAD
// ═══════════════════════════════════════════════════════════════════════════

function saveProgress() {
  writeSave({
    level: State.level,
    bottles: State.bottles,
    capacity: State.capacity,
    numColors: State.numColors,
    colorIds: State.colors.map(c => c.id),
    initialBottles: State.initialBottles,
    history: State.history,
    lossCount: State.lossCount,
    sfxEnabled: Audio.getSfxEnabled(),
    musicEnabled: Audio.getMusicEnabled(),
    animationsEnabled: State.animationsEnabled,
    debugMode: State.debugMode,
    debugScramble: State.debugScramble,
    debugSolution: State.debugSolution,
    // New fields
    score: State.score,
    levelScore: State.levelScore,
    moveCount: State.moveCount,
    parMoves: State.parMoves,
    levelStreak: State.levelStreak,
    hintsRemaining: State.hintsRemaining,
  });
}

function loadProgress() {
  const save = loadSave();
  if (!save) return false;

  try {
    State.level = save.level || 1;
    State.bottles = save.bottles;
    State.capacity = save.capacity;
    State.numColors = save.numColors;
    State.colors = save.colorIds.map(id => SAND_COLORS.find(c => c.id === id) || SAND_COLORS[0]);
    State.initialBottles = save.initialBottles;
    State.history = save.history || [];
    State.selectedBottle = -1;
    State.animating = false;
    State.lossCount = save.lossCount || 0;

    if (save.sfxEnabled !== undefined) Audio.setSfx(save.sfxEnabled);
    if (save.musicEnabled !== undefined) Audio.setMusic(save.musicEnabled);
    if (save.animationsEnabled !== undefined) State.animationsEnabled = save.animationsEnabled;

    State.debugMode = save.debugMode || false;
    State.debugScramble = save.debugScramble || [];
    State.debugSolution = save.debugSolution !== undefined ? save.debugSolution : undefined;

    // Load new fields with defaults
    State.score = save.score || 0;
    State.levelScore = save.levelScore || 0;
    State.moveCount = save.moveCount || 0;
    State.parMoves = save.parMoves || 0;
    State.levelStreak = save.levelStreak || 0;
    State.hintsRemaining = save.hintsRemaining !== undefined ? save.hintsRemaining : 3;
    State.comboCount = 0;
    State.lastPourTime = 0;
    State.sessionLevels = 0;
    State.completedBottles = countCompletedBottles(State.bottles, State.capacity);

    return true;
  } catch (e) {
    console.warn('Failed to load save:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function showScreen(id) {
  // Stop confetti when leaving win screen
  if (id !== 'screen-win') stopConfetti();

  // Show/hide Continue button on title screen
  if (id === 'screen-title') {
    const hasSave = loadSave();
    document.getElementById('btn-continue').style.display = hasSave ? '' : 'none';
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT HANDLING
// ═══════════════════════════════════════════════════════════════════════════

function getBottleAtPoint(px, py) {
  const { bottleW: bW, bottleH: bH, neckH } = Layout;
  for (let i = 0; i < Layout.bottlePositions.length; i++) {
    const { x, y } = Layout.bottlePositions[i];
    const left = x - bW / 2;
    const top = y;
    const right = x + bW / 2;
    const bottom = y + neckH + bH;
    if (px >= left && px <= right && py >= top && py <= bottom) return i;
  }
  return -1;
}

function handlePointerDown(e) {
  if (!document.getElementById('screen-game').classList.contains('active')) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const idx = getBottleAtPoint(px, py);
  if (idx !== -1) selectBottle(idx);
}

canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('touchstart', handlePointerDown, { passive: false });

// ═══════════════════════════════════════════════════════════════════════════
// UI BUTTON WIRING
// ═══════════════════════════════════════════════════════════════════════════

function wireButtons() {
  document.getElementById('btn-new-game').addEventListener('click', () => {
    Audio.playClick();
    const hasSave = loadSave();
    if (hasSave) {
      showConfirm('Start a new game? Current progress will be lost.', () => {
        clearSave();
        State.score = 0;
        State.levelStreak = 0;
        State.sessionLevels = 0;
        startLevel(1);
        showScreen('screen-game');
      });
    } else {
      State.score = 0;
      State.levelStreak = 0;
      State.sessionLevels = 0;
      startLevel(1);
      showScreen('screen-game');
    }
  });

  document.getElementById('btn-continue').addEventListener('click', () => {
    Audio.playClick();
    if (loadProgress()) {
      document.getElementById('level-label').textContent = `Level ${State.level}`;
      computeLayout();
      updateHUD();
      render();
      updateDebugPanel();
      showScreen('screen-game');
      setTimeout(() => {
        if (checkWin(State.bottles, State.numColors, State.capacity)) {
          triggerWin();
        } else if (!hasValidMoves(State.bottles, State.capacity)) {
          triggerGameOver();
        }
      }, 300);
    }
  });

  document.getElementById('btn-options-title').addEventListener('click', () => {
    Audio.playClick();
    openOptions('screen-title');
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    Audio.playClick();
    Audio.stopTension();
    showScreen('screen-title');
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    undoMove();
  });

  document.getElementById('btn-hint').addEventListener('click', () => {
    showHint();
  });

  document.getElementById('btn-next-level').addEventListener('click', () => {
    Audio.playClick();
    stopConfetti();
    startLevel(State.level + 1);
    showScreen('screen-game');
  });

  document.getElementById('btn-win-menu').addEventListener('click', () => {
    Audio.playClick();
    stopConfetti();
    showScreen('screen-title');
  });

  document.getElementById('btn-restart').addEventListener('click', () => {
    Audio.playClick();
    restartLevel();
    showScreen('screen-game');
  });

  document.getElementById('btn-regen-level').addEventListener('click', () => {
    Audio.playClick();
    startLevel(State.level);
    showScreen('screen-game');
  });

  document.getElementById('btn-gameover-new').addEventListener('click', () => {
    Audio.playClick();
    showConfirm('Start a new game from Level 1?', () => {
      clearSave();
      State.score = 0;
      State.levelStreak = 0;
      State.sessionLevels = 0;
      startLevel(1);
      showScreen('screen-game');
    });
  });

  document.getElementById('btn-gameover-menu').addEventListener('click', () => {
    Audio.playClick();
    showScreen('screen-title');
  });

  document.getElementById('btn-options-back').addEventListener('click', () => {
    Audio.playClick();
    saveProgress();
    showScreen(optionsReturnScreen);
  });

  document.getElementById('btn-reset-progress').addEventListener('click', () => {
    Audio.playClick();
    showConfirm('Reset ALL progress? This cannot be undone.', () => {
      clearSave();
      State.level = 1;
      State.score = 0;
      State.levelStreak = 0;
      State.sessionLevels = 0;
      updateOptionsUI();
      showScreen('screen-title');
      document.getElementById('btn-continue').style.display = 'none';
    });
  });

  document.getElementById('toggle-sound').addEventListener('click', () => {
    const enabled = !Audio.getSfxEnabled();
    Audio.setSfx(enabled);
    updateToggle('toggle-sound', enabled);
    if (enabled) Audio.playClick();
    saveProgress();
  });

  document.getElementById('toggle-music').addEventListener('click', () => {
    Audio.resume();
    const enabled = !Audio.getMusicEnabled();
    Audio.setMusic(enabled);
    updateToggle('toggle-music', enabled);
    saveProgress();
  });

  document.getElementById('toggle-anim').addEventListener('click', () => {
    State.animationsEnabled = !State.animationsEnabled;
    updateToggle('toggle-anim', State.animationsEnabled);
    Audio.playClick();
    saveProgress();
  });

  document.getElementById('toggle-debug').addEventListener('click', () => {
    State.debugMode = !State.debugMode;
    if (State.debugMode && State.debugSolution === undefined && State.initialBottles && State.initialBottles.length > 0) {
      State.debugSolution = findSolution(State.initialBottles, State.numColors, State.capacity);
    }
    updateToggle('toggle-debug', State.debugMode);
    Audio.playClick();
    updateDebugPanel();
    render();
    saveProgress();
  });

  document.getElementById('confirm-no').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.add('hidden');
  });
}

let optionsReturnScreen = 'screen-title';
function openOptions(returnScreen) {
  optionsReturnScreen = returnScreen;
  updateOptionsUI();
  showScreen('screen-options');
}

function updateOptionsUI() {
  updateToggle('toggle-sound', Audio.getSfxEnabled());
  updateToggle('toggle-music', Audio.getMusicEnabled());
  updateToggle('toggle-anim', State.animationsEnabled);
  updateToggle('toggle-debug', State.debugMode);
}

function updateToggle(id, active) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = active ? btn.dataset.on : btn.dataset.off;
  btn.classList.toggle('active', active);
}

let confirmCallback = null;
function showConfirm(text, onYes) {
  document.getElementById('confirm-text').textContent = text;
  confirmCallback = onYes;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

document.getElementById('confirm-yes').addEventListener('click', () => {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (confirmCallback) { confirmCallback(); confirmCallback = null; }
});

// ═══════════════════════════════════════════════════════════════════════════
// RESIZE HANDLING
// ═══════════════════════════════════════════════════════════════════════════

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (State.bottles.length > 0) {
      computeLayout();
      render();
    }
  }, 100);
});

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════

function init() {
  Audio.init();
  wireButtons();

  const save = loadSave();
  if (save) {
    document.getElementById('btn-continue').style.display = '';
    if (save.sfxEnabled !== undefined) Audio.setSfx(save.sfxEnabled);
    if (save.musicEnabled !== undefined) {
      if (save.musicEnabled) Audio.setMusic(true);
    }
    if (save.animationsEnabled !== undefined) State.animationsEnabled = save.animationsEnabled;
  }

  updateOptionsUI();
  showScreen('screen-title');
}

init();
