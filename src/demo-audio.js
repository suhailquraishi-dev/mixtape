export const demoSets = [
  { title: 'Soft Arrival', artist: 'AutoMix Demo · 92 BPM', bpm: 92, roots: [48, 55, 52, 57], wave: 'soft', duration: 34 },
  { title: 'City Lights', artist: 'AutoMix Demo · 108 BPM', bpm: 108, roots: [50, 57, 53, 60], wave: 'bright', duration: 36 },
  { title: 'After Hours', artist: 'AutoMix Demo · 118 BPM', bpm: 118, roots: [45, 52, 48, 55], wave: 'warm', duration: 38 },
  { title: 'One More Song', artist: 'AutoMix Demo · 102 BPM', bpm: 102, roots: [53, 60, 57, 64], wave: 'round', duration: 35 },
];

const frequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const fract = (value) => value - Math.floor(value);

export function makeDemoWav(spec) {
  const sampleRate = 22050;
  const count = Math.floor(spec.duration * sampleRate);
  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const str = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, count * 2, true);
  const beatLength = 60 / spec.bpm;
  const chordLength = beatLength * 8;
  const harmonics = spec.wave === 'bright' ? [1, .35, .18] : spec.wave === 'soft' ? [1, .13, .04] : [1, .25, .08];
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const root = spec.roots[Math.floor(t / chordLength) % spec.roots.length];
    const beat = t / beatLength;
    const beatPhase = fract(beat);
    const beatIndex = Math.floor(beat) % 4;
    const barFade = Math.min(1, t / 1.2, (spec.duration - t) / 1.1);
    const chordNotes = [root, root + 7, root + 12];
    let chord = 0;
    for (const note of chordNotes) {
      const p = 2 * Math.PI * frequency(note) * t;
      chord += (Math.sin(p) * harmonics[0] + Math.sin(2 * p) * harmonics[1] + Math.sin(3 * p) * harmonics[2]) / 3;
    }
    const arpeggioIndex = Math.floor(beat * 2) % 8;
    const arpNote = root + [12, 19, 24, 19, 12, 16, 19, 16][arpeggioIndex];
    const arpPhase = fract(beat * 2);
    const arp = Math.sin(2 * Math.PI * frequency(arpNote) * t) * Math.exp(-arpPhase * 4.5) * .12;
    const bass = Math.sin(2 * Math.PI * frequency(root - 12) * t) * Math.exp(-beatPhase * 3) * .18;
    const kick = Math.sin(2 * Math.PI * (58 * beatPhase * beatLength + 28 * (1 - Math.exp(-beatPhase * 28)))) * Math.exp(-beatPhase * 18) * .35;
    const noise = fract(Math.sin(i * 12.9898 + spec.bpm * 78.233) * 43758.5453) * 2 - 1;
    const snare = beatIndex === 1 || beatIndex === 3 ? noise * Math.exp(-beatPhase * 25) * .13 : 0;
    const hat = noise * Math.exp(-fract(beat * 2) * 38) * .035;
    const value = Math.max(-1, Math.min(1, (chord * .25 + arp + bass + kick + snare + hat) * Math.max(0, barFade)));
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
