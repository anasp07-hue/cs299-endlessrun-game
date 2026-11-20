// Sound: every effect and the music loop are generated in code with the Web
// Audio API (SPEC §6, §10 Q3 → ADR-0015). Zero audio files, nothing to
// download, works offline. View code (needs window.AudioContext).
//
// Browsers only allow audio after a user gesture, so nothing is created until
// unlock() is called from a click/keydown. Every call before that, or when Web
// Audio is missing, is a silent no-op: the game never depends on sound.
//
// Performance: sound effects create a few short-lived nodes per event (that is
// how Web Audio one-shots work; they are garbage-collected when they stop).
// Nothing here runs per frame. Music notes are scheduled ahead by a small
// timer, never in the render loop.

const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// A minor, dark: bass line (one note per beat, 8 beats) and an arpeggio pool.
const BASS = [45, 45, 48, 45, 43, 45, 40, 43]; // A2 A2 C3 A2 G2 A2 E2 G2
const ARP = [69, 72, 76, 79, 81, 84, 76, 74]; // A4 C5 E5 G5 A5 C6 E5 D5

export function createAudio(cfg) {
  let ctx = null;
  let master = null;
  let sfx = null;
  let music = null;
  let musicFilter = null;
  let echo = null;
  let noise = null;
  let muted = false;
  let intensity = 0; // 0..1, from the run's speed
  let duck = 1; // 1 normal, lower while paused / caught
  let timer = null;
  let nextBeat = 0;
  let beat = 0;
  let lastCrackle = 0;

  function available() {
    return typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(comp);
    sfx = ctx.createGain();
    sfx.gain.value = cfg.SFX_VOLUME;
    sfx.connect(master);

    // Music bus: lowpass (opens with intensity) → gain → master; a feedback echo for the arpeggio.
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 900;
    musicFilter.Q.value = 3;
    music = ctx.createGain();
    music.gain.value = 0;
    musicFilter.connect(music);
    music.connect(master);
    echo = ctx.createDelay(1);
    echo.delayTime.value = (60 / cfg.MUSIC_BPM) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    echo.connect(fb);
    fb.connect(echo);
    echo.connect(wet);
    wet.connect(musicFilter);

    // One second of white noise, reused by every noisy sound.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    startDrone();
  }

  /** Call from a user gesture (click / key). Safe to call often. */
  function unlock() {
    if (!available()) return false;
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
    if (timer === null) {
      nextBeat = ctx.currentTime + 0.1;
      timer = setInterval(schedule, 25);
    }
    return true;
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03);
  }

  /** Suspend everything while the tab is hidden; resume when it's back. */
  function setHidden(hidden) {
    if (!ctx) return;
    if (hidden) ctx.suspend();
    else ctx.resume();
  }

  function setIntensity(v) {
    intensity = v < 0 ? 0 : v > 1 ? 1 : v;
  }

  /** Music level: 1 while playing, lower on pause / game over / menu. */
  function setDuck(v) {
    duck = v;
  }

  // --- Building blocks -----------------------------------------------------------------

  function env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(type, f0, f1, t, dur, peak, dest, attack = 0.005) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, attack, peak, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return g;
  }

  function burst(t, dur, peak, filterType, f0, f1, dest, pan = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = filterType === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    env(g, t, 0.004, peak, dur);
    src.connect(f);
    f.connect(g);
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(dest);
    } else {
      g.connect(dest);
    }
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  function ready() {
    return ctx !== null && ctx.state === 'running';
  }

  // --- Sound effects -------------------------------------------------------------------

  function jump() {
    if (!ready()) return;
    const t = ctx.currentTime;
    tone('square', 260, 560, t, 0.12, 0.12, sfx);
    tone('sine', 520, 1040, t, 0.1, 0.08, sfx);
  }

  function land(strength) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const s = 0.35 + 0.65 * strength;
    tone('sine', 140, 48, t, 0.16, 0.55 * s, sfx);
    burst(t, 0.07, 0.25 * s, 'lowpass', 900, 300, sfx);
  }

  function slide() {
    if (!ready()) return;
    burst(ctx.currentTime, 0.38, 0.32, 'bandpass', 2200, 420, sfx);
  }

  function stumble(dir) {
    if (!ready()) return;
    const t = ctx.currentTime;
    burst(t, 0.2, 0.6, 'highpass', 500, 300, sfx, -dir * 0.5);
    tone('square', 95, 60, t, 0.16, 0.35, sfx);
    tone('triangle', 523, 500, t, 0.32, 0.12, sfx); // metal clang, slightly detuned pair
    tone('triangle', 784, 760, t, 0.28, 0.09, sfx);
  }

  function caught() {
    if (!ready()) return;
    const t = ctx.currentTime;
    tone('sawtooth', 440, 92, t, 0.7, 0.22, sfx);
    tone('sine', 70, 38, t, 0.9, 0.7, sfx);
    burst(t, 0.45, 0.45, 'lowpass', 2400, 200, sfx);
  }

  function nearMiss(lanePan) {
    if (!ready()) return;
    burst(ctx.currentTime, 0.14, 0.35, 'highpass', 2600, 5200, sfx, lanePan);
  }

  /** Data shard pickup: a soft glassy two-note chime that climbs with each shard of a line (`step` 0, 1, 2…). */
  function shard(step) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const f = NOTE(ARP[step % ARP.length] + 12);
    tone('sine', f, f, t, 0.09, 0.16, sfx, 0.003);
    tone('triangle', f * 1.5, f * 1.5, t + 0.045, 0.14, 0.08, sfx, 0.003);
  }
  /** Power-up pickup (Round 4): a quick rising three-note arpeggio, pitched per type (1, 2, 3). */
  function powerup(type) {
    if (!ready()) return;
    const t = ctx.currentTime;
    const base = NOTE(ARP[(type * 2) % ARP.length] + 12);
    for (let i = 0; i < 3; i++) {
      const f = base * (i === 0 ? 1 : i === 1 ? 1.26 : 1.5);
      tone('triangle', f, f, t + i * 0.055, 0.12, 0.14, sfx, 0.003);
    }
    tone('sine', base * 2, base * 2, t + 0.16, 0.25, 0.08, sfx, 0.004);
  }

  /** Bazooka shot (Round 4): a whoosh out, then a low boom and rubble. */
  function bazooka() {
    if (!ready()) return;
    const t = ctx.currentTime;
    burst(t, 0.16, 0.4, 'bandpass', 900, 3200, sfx);
    tone('sawtooth', 180, 60, t + 0.06, 0.4, 0.22, sfx);
    tone('sine', 90, 32, t + 0.07, 0.7, 0.75, sfx);
    burst(t + 0.07, 0.6, 0.55, 'lowpass', 1800, 160, sfx);
  }

  /** Phase running out (Round 4): a short falling glide, so you know obstacles are solid again. */
  function phaseEnd() {
    if (!ready()) return;
    const t = ctx.currentTime;
    tone('sine', 880, 330, t, 0.35, 0.14, sfx);
    tone('triangle', 660, 247, t, 0.35, 0.07, sfx);
  }

  function click() {
    if (!ready()) return;
    tone('sine', 1250, 1250, ctx.currentTime, 0.035, 0.12, sfx, 0.002);
  }

  /** Tiny crackle for sparks, rate-limited so a shower doesn't become a roar. */
  function crackle() {
    if (!ready() || ctx.currentTime - lastCrackle < 0.07) return;
    lastCrackle = ctx.currentTime;
    burst(ctx.currentTime, 0.025, 0.12 + Math.random() * 0.1, 'highpass', 3500, 3500, sfx, Math.random() * 1.2 - 0.6);
  }

  // --- Music -----------------------------------------------------------------------------

  let droneGain = null;

  function startDrone() {
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    droneGain.connect(musicFilter);
    for (const [midi, detune, type] of [[33, -7, 'sawtooth'], [33, 7, 'sawtooth'], [40, 0, 'triangle']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = NOTE(midi);
      o.detune.value = detune;
      o.connect(droneGain);
      o.start();
    }
    // Slow breathing on the drone.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 0.06;
    lfo.connect(depth);
    depth.connect(droneGain.gain);
    lfo.start();
  }

  /** Lookahead scheduler (runs every 25 ms): queue the beats due in the next 120 ms. */
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const spb = 60 / cfg.MUSIC_BPM;
    const now = ctx.currentTime;
    // Music level and filter follow the game smoothly.
    music.gain.setTargetAtTime(cfg.MUSIC_VOLUME * duck, now, 0.3);
    musicFilter.frequency.setTargetAtTime(500 + 2600 * intensity * duck, now, 0.5);
    if (nextBeat < now - 0.5) nextBeat = now + 0.05; // came back from a long suspend: don't catch up
    while (nextBeat < now + 0.12) {
      const t = nextBeat;
      const i = beat % BASS.length;
      // Bass pulse on every beat, a second softer one on the offbeat once things speed up.
      tone('square', NOTE(BASS[i]), NOTE(BASS[i]), t, spb * 0.45, 0.18, musicFilter, 0.01);
      if (intensity > 0.35) tone('square', NOTE(BASS[i]), NOTE(BASS[i]), t + spb / 2, spb * 0.3, 0.09, musicFilter, 0.01);
      // Sparse, echoing arpeggio: denser with intensity.
      if (Math.random() < 0.3 + 0.5 * intensity) {
        const n = ARP[(beat * 3 + (Math.random() < 0.5 ? 0 : 2)) % ARP.length];
        tone('triangle', NOTE(n), NOTE(n), t + (Math.random() < 0.5 ? 0 : spb / 2), spb * 0.6, 0.07, echo, 0.01);
      }
      // Ticks on the offbeats at higher speed.
      if (intensity > 0.6) burst(t + spb / 2, 0.03, 0.08, 'highpass', 7000, 7000, musicFilter);
      nextBeat += spb;
      beat++;
    }
  }

  return { unlock, setMuted, setHidden, setIntensity, setDuck, jump, land, slide, stumble, caught, nearMiss, shard, powerup, bazooka, phaseEnd, click, crackle, isReady: ready };
}
