// Web Audio API sound engine — no external files needed
export const SoundEngine = {
  context: null as AudioContext | null,
  enabled: true,

  init() {
    if (this.context) return;
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      // Browser doesn't support Web Audio API
    }
    const saved = localStorage.getItem('huroof_sound');
    if (saved !== null) this.enabled = saved === '1';
  },

  setEnabled(on: boolean) {
    this.enabled = on;
    localStorage.setItem('huroof_sound', on ? '1' : '0');
  },

  play(type: 'pop' | 'buzz' | 'correct' | 'wrong' | 'win' | 'golden') {
    if (!this.enabled || !this.context) return;
    try {
      const ctx = this.context;
      const config: Record<string, [number, number, number, OscillatorType]> = {
        pop:     [800,  0.10, 0.08, 'sine'],
        buzz:    [120,  0.30, 0.15, 'sawtooth'],
        correct: [523,  0.20, 0.30, 'sine'],
        wrong:   [200,  0.30, 0.30, 'square'],
        win:     [659,  0.30, 0.50, 'sine'],
        golden:  [880,  0.25, 0.40, 'sine'],
      };
      const [freq, vol, dur, wave] = config[type];

      if (type === 'win') {
        // Play three ascending tones for win
        [659, 784, 988].forEach((f, i) => {
          setTimeout(() => this._tone(ctx, f, vol, 0.4, 'sine'), i * 180);
        });
        return;
      }
      if (type === 'golden') {
        // Two-tone sparkle
        this._tone(ctx, 880, 0.20, 0.25, 'sine');
        setTimeout(() => this._tone(ctx, 1108, 0.20, 0.30, 'sine'), 150);
        return;
      }
      this._tone(ctx, freq, vol, dur, wave);
    } catch {
      // Ignore audio errors
    }
  },

  _tone(ctx: AudioContext, freq: number, vol: number, dur: number, wave: OscillatorType) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.start();
    o.stop(ctx.currentTime + dur);
  },

  vibrate(pattern: number | number[]) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  },
};
