/**
 * audio.js — Procedural audio engine using Web Audio API
 * Slot-machine inspired: pitch escalation, jackpot chimes, combo sounds,
 * near-miss teases, and celebration cascades. All synthesized, no files.
 */

const Audio = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let musicOscillators = [];
  let musicPlaying = false;
  let musicInterval = null;

  // Tension system — ambient pulse when close to winning
  let tensionNode = null;
  let tensionGain = null;

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

  /**
   * Sand pouring — pitch-escalating grain drops!
   * Each grain in the count gets a progressively higher pitched "tink",
   * like coins cascading into a tray. The base hiss remains.
   */
  function playSandPour(duration = 0.45, grainCount = 1) {
    if (!ctx || !settings.sfxEnabled) return;
    resume();

    // Base hiss layers (richer than before)
    playNoise(duration, 2200, 0.3);
    playNoise(duration * 0.8, 800, 0.12, 0.05);
    playTone(120, 'sine', 0.12, 0.2);

    // Pitch-escalating grain tinks — the slot machine coin sound
    const baseFreq = 600;
    const freqStep = 80; // each grain goes higher
    for (let i = 0; i < grainCount; i++) {
      const freq = baseFreq + i * freqStep;
      const delay = (i / grainCount) * duration * 0.7;
      playTone(freq, 'sine', 0.12, 0.2, delay);
      playTone(freq * 1.5, 'sine', 0.06, 0.08, delay + 0.02); // harmonic shimmer
    }
  }

  /** Sand landing in bottle — satisfying thud + crystalline settle */
  function playSandLand() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playNoise(0.18, 1200, 0.3);
    playTone(90, 'sine', 0.15, 0.2);
    // Sparkle settle
    playTone(1800, 'sine', 0.08, 0.1, 0.05);
    playTone(2400, 'sine', 0.06, 0.06, 0.08);
  }

  /** Invalid move — crunchy buzz with subtle descending pitch */
  function playInvalid() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(110, 'sawtooth', 0.12, 0.25);
    playTone(90, 'sawtooth', 0.12, 0.18, 0.06);
    playTone(70, 'sawtooth', 0.08, 0.1, 0.1);
  }

  /** Bottle selected — bright two-note chime */
  function playSelect() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(880, 'sine', 0.08, 0.25);
    playTone(1100, 'sine', 0.06, 0.15, 0.04);
  }

  /** Bottle deselected — soft descending note */
  function playDeselect() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(660, 'sine', 0.07, 0.2);
  }

  /**
   * Bottle complete — JACKPOT micro-hit!
   * Cascading coin-shower arpeggio + shimmer burst + ka-ching.
   */
  function playBottleComplete() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();

    // Ascending jackpot arpeggio: C5-E5-G5-C6
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      playTone(f, 'sine', 0.5, 0.3, i * 0.06);
      playTone(f * 2, 'sine', 0.3, 0.12, i * 0.06 + 0.03); // octave shimmer
    });

    // Coin cascade noise burst
    playNoise(0.4, 4000, 0.2, 0.15);
    playNoise(0.3, 6000, 0.12, 0.2);

    // Ka-ching hit
    playTone(2200, 'sine', 0.15, 0.2, 0.25);
    playTone(3300, 'sine', 0.1, 0.1, 0.28);
  }

  /**
   * Level win — FULL JACKPOT CELEBRATION!
   * Multi-layered fanfare + coin waterfall + crowd shimmer.
   */
  function playWin() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();

    // Triumphant brass fanfare: C-E-G-C-E ascending
    const fanfare = [523, 659, 784, 1047, 1319];
    fanfare.forEach((f, i) => {
      playTone(f, 'sine', 0.6, 0.35, i * 0.1);
      playTone(f * 1.5, 'sine', 0.4, 0.12, i * 0.1 + 0.05); // fifth harmony
      playTone(f * 2, 'sine', 0.3, 0.08, i * 0.1 + 0.03);   // octave shimmer
    });

    // Victory chord — sustained
    playTone(523, 'sine', 1.5, 0.15, 0.5);
    playTone(659, 'sine', 1.5, 0.12, 0.5);
    playTone(784, 'sine', 1.5, 0.1, 0.5);

    // Coin waterfall — cascading noise bursts
    for (let i = 0; i < 6; i++) {
      playNoise(0.25, 3000 + i * 500, 0.12, 0.3 + i * 0.1);
    }

    // Crowd shimmer (filtered white noise that sounds like cheering)
    playNoise(1.5, 2500, 0.15, 0.4);
    playNoise(1.2, 5000, 0.08, 0.6);

    // Rising sweep
    if (ctx) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime + 0.3);
      osc.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + 1.5);
      g.gain.setValueAtTime(0.08, ctx.currentTime + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 2.0);
    }
  }

  /** Game over — descending sad tones + hollow thud */
  function playGameOver() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const notes = [392, 330, 294, 220];
    notes.forEach((f, i) => {
      playTone(f, 'triangle', 0.6, 0.3, i * 0.18);
      playTone(f * 0.5, 'triangle', 0.4, 0.1, i * 0.18 + 0.1); // sub bass
    });
    // Hollow reverb thud
    playTone(60, 'sine', 0.8, 0.2, 0.7);
    playNoise(0.5, 200, 0.08, 0.7);
  }

  /** UI button click */
  function playClick() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(440, 'sine', 0.06, 0.3);
  }

  /**
   * Combo sound — rapid-fire escalating dings for consecutive fast pours.
   * comboCount: 2, 3, 4... (higher = more intense)
   */
  function playCombo(comboCount) {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const baseFreq = 800 + comboCount * 150;
    // Quick ascending ding burst
    for (let i = 0; i < Math.min(comboCount, 5); i++) {
      playTone(baseFreq + i * 200, 'sine', 0.1, 0.2, i * 0.04);
    }
    // Sparkle on high combos
    if (comboCount >= 3) {
      playNoise(0.15, 5000, 0.1, 0.1);
      playTone(3000 + comboCount * 200, 'sine', 0.08, 0.12, 0.15);
    }
  }

  /**
   * Near-miss tease — almost completed a bottle! Ascending then falling tone.
   */
  function playNearMiss() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    // Rising hope...
    playTone(600, 'sine', 0.15, 0.15);
    playTone(800, 'sine', 0.12, 0.12, 0.08);
    playTone(1000, 'sine', 0.1, 0.1, 0.14);
    // ...that trails off
    playTone(700, 'sine', 0.2, 0.08, 0.22);
  }

  /**
   * Streak loss — sad womp womp when you break a streak
   */
  function playStreakLoss() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(300, 'triangle', 0.3, 0.2);
    playTone(200, 'triangle', 0.4, 0.18, 0.15);
  }

  /**
   * Score popup sound — quick bright tink
   */
  function playScorePopup() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    playTone(1200, 'sine', 0.06, 0.15);
    playTone(1600, 'sine', 0.04, 0.08, 0.03);
  }

  /**
   * Star reveal — dramatic individual star reveal sound
   * starIndex: 0, 1, 2 (pitch increases with each star)
   */
  function playStarReveal(starIndex) {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const freqs = [523, 784, 1047]; // C5, G5, C6
    const f = freqs[Math.min(starIndex, 2)];
    playTone(f, 'sine', 0.3, 0.3);
    playTone(f * 1.5, 'sine', 0.2, 0.12, 0.05);
    if (starIndex === 2) {
      // Third star gets extra sparkle
      playNoise(0.2, 5000, 0.1, 0.1);
      playTone(f * 2, 'sine', 0.15, 0.1, 0.1);
    }
  }

  /**
   * Session milestone — "You're on fire!" celebration
   */
  function playSessionMilestone() {
    if (!ctx || !settings.sfxEnabled) return;
    resume();
    const notes = [523, 659, 784, 1047, 1319, 1568];
    notes.forEach((f, i) => {
      playTone(f, 'sine', 0.3, 0.25, i * 0.06);
    });
    playNoise(0.5, 4000, 0.1, 0.3);
  }

  // ── Tension system — heartbeat bass when near winning ────────────────────
  function startTension(intensity = 0.5) {
    if (!ctx || !settings.sfxEnabled) return;
    stopTension();
    resume();

    tensionGain = ctx.createGain();
    tensionGain.gain.value = 0.08 * intensity;
    tensionGain.connect(sfxGain);

    // Low pulsing bass
    tensionNode = ctx.createOscillator();
    tensionNode.type = 'sine';
    tensionNode.frequency.value = 55;
    tensionNode.connect(tensionGain);
    tensionNode.start();

    // Pulse the gain for heartbeat effect
    const pulseRate = 1.2 - intensity * 0.4; // faster when more intense
    const now = ctx.currentTime;
    for (let i = 0; i < 60; i++) { // 60 beats max
      const t = now + i * pulseRate;
      tensionGain.gain.setValueAtTime(0.08 * intensity, t);
      tensionGain.gain.exponentialRampToValueAtTime(0.01, t + pulseRate * 0.5);
      tensionGain.gain.setValueAtTime(0.01, t + pulseRate * 0.5);
      tensionGain.gain.linearRampToValueAtTime(0.08 * intensity, t + pulseRate);
    }
  }

  function stopTension() {
    if (tensionNode) {
      try { tensionNode.stop(); } catch (e) {}
      tensionNode = null;
    }
    if (tensionGain) {
      tensionGain.disconnect();
      tensionGain = null;
    }
  }

  // ── Ambient music ──────────────────────────────────────────────────────────
  // Generative ambient using pentatonic scale
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
    if (!enabled) stopTension();
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
    playCombo,
    playNearMiss,
    playStreakLoss,
    playScorePopup,
    playStarReveal,
    playSessionMilestone,
    startTension,
    stopTension,
    startMusic,
    stopMusic,
    setSfx,
    setMusic,
    getSfxEnabled,
    getMusicEnabled,
  };
})();
