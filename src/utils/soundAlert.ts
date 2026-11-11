/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Web Audio API sintetizador de alarme para aviso de tempo de mesa
export function playTableAlarmSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Dois bipes agradáveis e chamativos (880Hz e 1174Hz)
    const playBeep = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    playBeep(880, now, 0.25);
    playBeep(1174.66, now + 0.28, 0.35);
  } catch (e) {
    // Silently continue if audio context is blocked by browser policy
    console.warn('Audio alert not permitted by browser autoplay policy:', e);
  }
}
