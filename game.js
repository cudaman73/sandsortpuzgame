/**
 * game.js — Sand Sort Puzzle Game
 * Main game logic, rendering, animation, level generation, persistence.
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

/**
 * Generate a shuffled level by starting from a solved state and randomly
 * distributing grains one at a time (ignoring color rules). This produces
 * well-mixed bottles. The startLevel() caller guards against any result
 * that is already-solved or has no valid moves.
 *
 * Why single-grain random distribution instead of legal-pour scrambling:
 * Legal pours from a fully-solved state can only move complete bottles into
 * empty slots (every bottle starts full, so every run = full capacity).
 * This means the scrambler can never create mixed-color bottles — it just
 * permutes whole bottles and stays "solved". Single-grain distribution breaks
 * this invariant and produces genuinely scrambled boards.
 *
 * Returns: { bottles: number[][], capacity: number, colors: string[] }
 * Each bottle is an array of color indices, index 0 = bottom.
 */
function generateLevel(level) {
  const cfg = getDifficultyConfig(level);
  const { colors: numColors, capacity, extraEmpty } = cfg;

  // Clamp colors to available palette
  const usedColors = SAND_COLORS.slice(0, Math.min(numColors, SAND_COLORS.length));

  // More moves = more scrambled. Keep it well above numColors*capacity so
  // grains are thoroughly redistributed before we check the result.
  const shuffleMoves = numColors * capacity * 8;

  // Retry loop: regenerate from scratch until we land on a board that is
  // neither already solved nor immediately stuck. In practice the first
  // attempt almost always succeeds; the caller adds a second safety net.
  let attempts = 0;
  while (attempts < 30) {
    attempts++;

    // Start: solved state — each color fills exactly one bottle to capacity
    const bottles = [];
    for (let c = 0; c < numColors; c++) {
      const b = [];
      for (let i = 0; i < capacity; i++) b.push(c);
      bottles.push(b);
    }
    // Add empty bottles
    for (let e = 0; e < extraEmpty; e++) bottles.push([]);

    // Scramble by moving one grain at a time to any bottle that has room.
    // Color rules are intentionally ignored here — we're distributing grains,
    // not playing the game. The result is thoroughly mixed.
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
    }

    // Only accept boards that aren't already solved AND have at least one
    // legal move so the player can actually play.
    if (!isSolved(bottles, numColors, capacity) &&
        hasValidMoves(bottles, capacity)) {
      return {
        bottles: bottles.map(b => [...b]),
        capacity,
        colors: usedColors,
        numColors,
      };
    }
  }

  // Last-resort fallback: build a board guaranteed to have valid moves by
  // explicitly interleaving two colors across the first two bottles and
  // leaving the rest of the colors in their own bottles. The empty bottle(s)
  // ensure there is always at least one legal pour.
  const bottles = [];
  // Bottles 0 and 1: interleaved so neither is monochrome, e.g. [0,1,0,1] / [1,0,1,0]
  const b0 = [], b1 = [];
  for (let i = 0; i < capacity; i++) {
    b0.push(i % 2 === 0 ? 0 : 1);
    b1.push(i % 2 === 0 ? 1 : 0);
  }
  bottles.push(b0, b1);
  // Remaining colors get their own solid bottles (not mixed)
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
  };
}

function isSolved(bottles, numColors, capacity) {
  // Count how many bottles are fully filled with a single color
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
  bottles: [],       // current bottle states (arrays of color indices, 0=bottom)
  capacity: 4,
  colors: [],        // SAND_COLORS entries used
  numColors: 0,
  selectedBottle: -1,
  pendingSelect: -1, // bottle clicked while animating; processed when anim ends
  history: [],       // stack of previous bottle states for undo
  initialBottles: [], // for restart
  animating: false,
  animationsEnabled: true,
  lossCount: 0,      // times the player has hit game-over on the current level
};

// ═══════════════════════════════════════════════════════════════════════════
// MOVE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/** Get the top color and count of consecutive same-color layers */
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

/** Can we pour from srcIdx into dstIdx? */
function canPour(bottles, capacity, srcIdx, dstIdx) {
  if (srcIdx === dstIdx) return false;
  const src = bottles[srcIdx];
  const dst = bottles[dstIdx];
  if (src.length === 0) return false;

  const { color: srcColor, count: srcCount } = getTopRun(src);

  // Destination must have room
  if (dst.length + srcCount > capacity) return false;

  // Destination must be empty OR have the same color on top
  if (dst.length > 0) {
    const { color: dstColor } = getTopRun(dst);
    if (dstColor !== srcColor) return false;
  }

  return true;
}

/** Check if any valid moves exist */
function hasValidMoves(bottles, capacity) {
  for (let s = 0; s < bottles.length; s++) {
    for (let d = 0; d < bottles.length; d++) {
      if (canPour(bottles, capacity, s, d)) return true;
    }
  }
  return false;
}

/** Check if all bottles are solved */
function checkWin(bottles, numColors, capacity) {
  let completedCount = 0;
  for (let i = 0; i < bottles.length; i++) {
    const b = bottles[i];
    if (b.length === 0) continue;
    if (b.length === capacity && b.every(v => v === b[0])) completedCount++;
  }
  return completedCount === numColors;
}

/** Find a hint move: returns [srcIdx, dstIdx] or null */
function findHint(bottles, capacity) {
  // Prefer moves that complete a bottle
  for (let s = 0; s < bottles.length; s++) {
    for (let d = 0; d < bottles.length; d++) {
      if (!canPour(bottles, capacity, s, d)) continue;
      const { count: srcCount } = getTopRun(bottles[s]);
      const dst = bottles[d];
      if (dst.length + srcCount === capacity) return [s, d];
    }
  }
  // Otherwise any valid move
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

// Layout constants (computed on resize)
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
  bottlePositions: [], // [{x, y}] center-top of each bottle
};

function computeLayout() {
  const area = document.getElementById('game-area');
  const W = area.clientWidth;
  const H = area.clientHeight;

  canvas.width = W;
  canvas.height = H;

  const n = State.bottles.length;
  if (n === 0) return;

  // Decide rows/cols
  let cols = Math.min(n, Math.ceil(Math.sqrt(n * 1.5)));
  let rows = Math.ceil(n / cols);

  // Bottle sizing — fit within available space
  const maxBW = Math.floor((W - Layout.padding * (cols + 1)) / cols);
  const maxBH = Math.floor((H - Layout.padding * (rows + 1)) / rows);

  // Maintain aspect ratio ~1:3 (w:h)
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

  // Center the grid
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

  // Draw bottle body path
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

    // Base color
    ctx2d.fillStyle = color.hex;
    ctx2d.fillRect(bodyX + 2, ly, bodyW - 4, layerH + 1);

    // Subtle gradient overlay for depth
    const grad = ctx2d.createLinearGradient(bodyX + 2, ly, bodyX + bodyW - 2, ly);
    grad.addColorStop(0, 'rgba(255,255,255,0.12)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.04)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(bodyX + 2, ly, bodyW - 4, layerH + 1);

    // Sand texture — subtle noise dots
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

  // Completed bottle glow
  const b = State.bottles[i];
  if (b.length === capacity && b.every(v => v === b[0])) {
    ctx2d.shadowColor = State.colors[b[0]]?.hex || '#fff';
    ctx2d.shadowBlur = 20;
    ctx2d.beginPath();
    roundRect(ctx2d, bodyX, bodyY, bodyW, bodyH, br);
    ctx2d.strokeStyle = State.colors[b[0]]?.hex || '#fff';
    ctx2d.lineWidth = 2;
    ctx2d.stroke();
  }

  ctx2d.restore();
}

function drawSandTexture(x, y, w, h, color) {
  // Draw a few semi-transparent dots to simulate sand grain texture
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

function render() {
  ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < State.bottles.length; i++) {
    const selected = i === State.selectedBottle;
    const hinted = i === hintBottles[0] || i === hintBottles[1];
    drawBottle(i, selected, hinted);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Animate sand pouring from srcIdx to dstIdx.
 * Uses a canvas-drawn arc stream of particles.
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

  const { bottleW: bW, neckW, neckH } = Layout;

  // Start: top of source bottle neck
  const startX = srcPos.x;
  const startY = srcPos.y;

  // End: top of destination bottle neck
  const endX = dstPos.x;
  const endY = dstPos.y;

  // Arc control point (above both bottles)
  const cpX = (startX + endX) / 2;
  const cpY = Math.min(startY, endY) - 60;

  const DURATION = 420; // ms
  const PARTICLE_COUNT = 18;
  const startTime = performance.now();

  // Particles along the arc
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    t: i / PARTICLE_COUNT, // position along arc [0,1]
    size: 2.5 + Math.random() * 2.5,
    offset: (Math.random() - 0.5) * (neckW * 0.4),
  }));

  function bezier(t, p0, p1, p2) {
    const mt = 1 - t;
    return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
  }

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / DURATION, 1);

    // Re-render bottles
    render();

    // Draw stream
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

      // Only draw the portion that has "flowed" so far
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

      // Grain highlight
      ctx2d.beginPath();
      ctx2d.arc(px - p.size * 0.25, py - p.size * 0.25, p.size * 0.35, 0, Math.PI * 2);
      ctx2d.fillStyle = color.light;
      ctx2d.globalAlpha = 0.5;
      ctx2d.fill();
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

// Lift animation: bottle floats up when selected
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

// ═══════════════════════════════════════════════════════════════════════════
// GAME ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

function selectBottle(idx) {
  // While animating, queue the tap so it fires the moment the pour lands.
  // The most recent tap wins — clicking twice cancels the queue.
  if (State.animating) {
    State.pendingSelect = (State.pendingSelect === idx) ? -1 : idx;
    return;
  }
  Audio.resume();

  if (State.selectedBottle === -1) {
    // Nothing selected — select this bottle (if non-empty)
    if (State.bottles[idx].length === 0) return;
    State.selectedBottle = idx;
    Audio.playSelect();
    clearHint();
    animateLift(idx, true);
    render();
  } else if (State.selectedBottle === idx) {
    // Deselect
    const prev = State.selectedBottle;
    State.selectedBottle = -1;
    Audio.playDeselect();
    animateLift(prev, false);
    render();
  } else {
    // Attempt pour
    const src = State.selectedBottle;
    const dst = idx;

    if (canPour(State.bottles, State.capacity, src, dst)) {
      executePour(src, dst);
    } else {
      // Invalid — shake and deselect
      Audio.playInvalid();
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

  // Lower the selected bottle back
  const prevSelected = State.selectedBottle;
  State.selectedBottle = -1;

  Audio.playSandPour(0.35 + count * 0.05);

  animateLift(prevSelected, false, () => {
    // Perform the pour in state
    for (let i = 0; i < count; i++) {
      State.bottles[dstIdx].push(State.bottles[srcIdx].pop());
    }

    animatePour(srcIdx, dstIdx, colorIdx, count, () => {
      Audio.playSandLand();

      // Check if destination bottle is now complete
      const dst = State.bottles[dstIdx];
      if (dst.length === State.capacity && dst.every(v => v === dst[0])) {
        Audio.playBottleComplete();
      }

      State.animating = false;
      render();
      saveProgress();

      // Check win
      if (checkWin(State.bottles, State.numColors, State.capacity)) {
        State.pendingSelect = -1;
        setTimeout(() => triggerWin(), 600);
        return;
      }

      // Check game over
      if (!hasValidMoves(State.bottles, State.capacity)) {
        State.pendingSelect = -1;
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

  // If a bottle is selected, deselect first
  if (State.selectedBottle !== -1) {
    const prev = State.selectedBottle;
    State.selectedBottle = -1;
    // Reset its position
    computeLayout();
  }

  State.bottles = State.history.pop();
  clearHint();
  render();
  saveProgress();
}

function showHint() {
  if (State.animating) return;
  Audio.playClick();
  const hint = findHint(State.bottles, State.capacity);
  if (!hint) return;
  hintBottles = hint;
  render();
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(clearHint, 2500);
}

function clearHint(skipRender) {
  hintBottles = [-1, -1];
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  // Re-render to remove hint highlight if game is active and not suppressed
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
  State.lossCount = 0;   // fresh level — reset failure counter
  clearHint(true);

  // Keep regenerating until we get a non-solved, non-stuck board.
  // With the legal-pour scrambler this guard almost never fires, but it
  // protects against any edge case that slips through.
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

  document.getElementById('level-label').textContent = `Level ${level}`;
  computeLayout();
  render();
  saveProgress();
}

function restartLevel() {
  State.bottles = State.initialBottles.map(b => [...b]);
  State.history = [];
  State.selectedBottle = -1;
  State.animating = false;
  clearHint();
  computeLayout();
  render();
  saveProgress();
}

function triggerWin() {
  Audio.playWin();
  document.getElementById('win-level-text').textContent = `Level ${State.level} Solved!`;
  showScreen('screen-win');
  saveProgress();
}

function triggerGameOver() {
  Audio.playGameOver();

  State.lossCount++;

  // After two or more failures on the same level, surface the option to
  // regenerate — it's possible the layout is genuinely unsolvable.
  const regenBtn = document.getElementById('btn-regen-level');
  const msg      = document.getElementById('gameover-msg');

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
    State.colors = save.colorIds.map(id => SAND_COLORS.find(c => c.id === id));
    State.initialBottles = save.initialBottles;
    State.history = save.history || [];
    State.selectedBottle = -1;
    State.animating = false;

    State.lossCount = save.lossCount || 0;

    if (save.sfxEnabled !== undefined) Audio.setSfx(save.sfxEnabled);
    if (save.musicEnabled !== undefined) Audio.setMusic(save.musicEnabled);
    if (save.animationsEnabled !== undefined) State.animationsEnabled = save.animationsEnabled;

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
  // Title screen
  document.getElementById('btn-new-game').addEventListener('click', () => {
    Audio.playClick();
    const hasSave = loadSave();
    if (hasSave) {
      showConfirm('Start a new game? Current progress will be lost.', () => {
        clearSave();
        startLevel(1);
        showScreen('screen-game');
      });
    } else {
      startLevel(1);
      showScreen('screen-game');
    }
  });

  document.getElementById('btn-continue').addEventListener('click', () => {
    Audio.playClick();
    if (loadProgress()) {
      document.getElementById('level-label').textContent = `Level ${State.level}`;
      computeLayout();
      render();
      showScreen('screen-game');
      // Check if loaded state is already stuck or won
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

  // HUD
  document.getElementById('btn-menu').addEventListener('click', () => {
    Audio.playClick();
    showScreen('screen-title');
  });

  document.getElementById('btn-undo').addEventListener('click', () => {
    undoMove();
  });

  document.getElementById('btn-hint').addEventListener('click', () => {
    showHint();
  });

  // Win screen
  document.getElementById('btn-next-level').addEventListener('click', () => {
    Audio.playClick();
    startLevel(State.level + 1);
    showScreen('screen-game');
  });

  document.getElementById('btn-win-menu').addEventListener('click', () => {
    Audio.playClick();
    showScreen('screen-title');
  });

  // Game over screen
  document.getElementById('btn-restart').addEventListener('click', () => {
    Audio.playClick();
    restartLevel();
    showScreen('screen-game');
  });

  // Regenerate: same level number, brand-new random layout.
  // Only shown after 2+ losses on the same level.
  document.getElementById('btn-regen-level').addEventListener('click', () => {
    Audio.playClick();
    startLevel(State.level);   // startLevel resets lossCount to 0
    showScreen('screen-game');
  });

  document.getElementById('btn-gameover-new').addEventListener('click', () => {
    Audio.playClick();
    showConfirm('Start a new game from Level 1?', () => {
      clearSave();
      startLevel(1);
      showScreen('screen-game');
    });
  });

  document.getElementById('btn-gameover-menu').addEventListener('click', () => {
    Audio.playClick();
    showScreen('screen-title');
  });

  // Options
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
      updateOptionsUI();
      showScreen('screen-title');
      document.getElementById('btn-continue').style.display = 'none';
    });
  });

  // Toggle buttons
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

  // Confirm dialog
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

  // Check for existing save
  const save = loadSave();
  if (save) {
    document.getElementById('btn-continue').style.display = '';
    // Restore options from save
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
