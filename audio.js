/**
 * audio.js — Procedural audio engine using Web Audio API
 * All sounds are synthesized; no external files needed.
 */

const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let musicOscillators = [];
  let musicPlaying = false;
  let musicInterval = null;

  const settings = {
    sfxEnabled: true,
    musicEnabled: false,
  };

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1.0;
      masterGain.connect(ctx.destination);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(masterGain);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.25;
      musicGain.connect(masterGain);
    } catch (e) {
      console.warn('Web Audio API not available:', e);
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // ── Noise buffer for sand sounds ──────────────────────────────────────────
  let noiseBuffer = null;
  function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const len = ctx.sampleRate * 0.5;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  // ── Generic helpers ────────────────────────────────────────────────────────
  function playTone(freq, type, duration, gainVal, startDelay = 0, destination = sfxGain) {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gainVal, ctx.currentTime + startDelay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);
    osc.connect(g);
    g.connect(destination);
    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration + 0.05);
  }

  function playNoise(duration, filterFreq, gainVal, startDelay = 0) {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.5;

    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, ctx.currentTime + startDelay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);
    src.start(ctx.currentTime + startDelay);
    src.stop(ctx.currentTime + startDelay + duration + 0.05);
  }

  // ── Sound effects ──────────────────────────────────────────────────────────

  /** Sand pouring — a hissy noise burst */
  function playSandPour(duration = 0.45) {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    // Multiple noise layers for richness
    playNoise(duration, 2200, 0.4);
    playNoise(duration * 0.8, 800, 0.15, 0.05);
    // Subtle low thud at start
    playTone(120, 'sine', 0.12, 0.3);
  }

  /** Sand landing in bottle — soft thud + hiss */
  function playSandLand() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playNoise(0.18, 1200, 0.35);
    playTone(90, 'sine', 0.15, 0.25);
  }

  /** Invalid move — low buzz */
  function playInvalid() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(110, 'sawtooth', 0.12, 0.3);
    playTone(100, 'sawtooth', 0.12, 0.2, 0.06);
  }

  /** Bottle selected — soft click */
  function playSelect() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(880, 'sine', 0.08, 0.25);
    playTone(1100, 'sine', 0.06, 0.15, 0.04);
  }

  /** Bottle deselected */
  function playDeselect() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(660, 'sine', 0.07, 0.2);
  }

  /** Bottle complete (all same color) — bright chime */
  function playBottleComplete() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => playTone(f, 'sine', 0.4, 0.35, i * 0.08));
  }

  /** Level win — triumphant arpeggio */
  function playWin() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      playTone(f, 'sine', 0.5, 0.4, i * 0.1);
      playTone(f * 2, 'sine', 0.3, 0.15, i * 0.1 + 0.05);
    });
    // Noise burst for celebration
    playNoise(0.6, 3000, 0.2, 0.3);
  }

  /** Game over — descending sad tones */
  function playGameOver() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const notes = [392, 330, 294, 220];
    notes.forEach((f, i) => playTone(f, 'triangle', 0.5, 0.35, i * 0.15));
  }

  /** UI button click */
  function playClick() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(440, 'sine', 0.06, 0.3);
  }

  // ── Ambient music ──────────────────────────────────────────────────────────
  // Simple generative ambient music using pentatonic scale
  const PENTATONIC = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

  function startMusic() {
    if (!ctx || !settings.musicEnabled || musicPlaying) return;
    resume();
    musicPlaying = true;
    scheduleMusic();
  }

  function stopMusic() {
    musicPlaying = false;
    if (musicInterval) { clearTimeout(musicInterval); musicInterval = null; }
    musicOscillators.forEach(o => { try { o.stop(); } catch(e){} });
    musicOscillators = [];
  }

  function scheduleMusic() {
    if (!musicPlaying) return;
    const freq = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    const octave = Math.random() < 0.3 ? 0.5 : 1;
    const duration = 1.5 + Math.random() * 2;
    const delay = Math.random() * 0.5;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * octave;
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + delay + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.connect(g);
    g.connect(musicGain);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.1);
    musicOscillators.push(osc);

    // Clean up finished oscillators
    musicOscillators = musicOscillators.filter(o => {
      try { return o.playbackState !== 3; } catch(e) { return true; }
    });

    const nextIn = 400 + Math.random() * 800;
    musicInterval = setTimeout(scheduleMusic, nextIn);
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  function setSfx(enabled) {
    settings.sfxEnabled = enabled;
  }

  function setMusic(enabled) {
    settings.musicEnabled = enabled;
    if (enabled) startMusic();
    else stopMusic();
  }

  function getSfxEnabled() { return settings.sfxEnabled; }
  function getMusicEnabled() { return settings.musicEnabled; }

  return {
    init,
    resume,
    playSandPour,
    playSandLand,
    playInvalid,
    playSelect,
    playDeselect,
    playBottleComplete,
    playWin,
    playGameOver,
    playClick,
    startMusic,
    stopMusic,
    setSfx,
    setMusic,
    getSfxEnabled,
    getMusicEnabled,
  };
})();
