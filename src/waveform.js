const MAX_PREVIEW_BYTES = 24 * 1024 * 1024;
const PEAK_COUNT = 192;

export function extractPeaks(buffer, count = PEAK_COUNT) {
  const peaks = new Float32Array(count);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  if (!channels.length || !buffer.length) return peaks;
  const block = Math.max(1, Math.floor(buffer.length / count));
  const sampleStep = Math.max(1, Math.floor(block / 96));
  for (let index = 0; index < count; index++) {
    const start = index * block;
    const end = Math.min(buffer.length, index === count - 1 ? buffer.length : start + block);
    let peak = 0;
    for (let sample = start; sample < end; sample += sampleStep) {
      for (const channel of channels) peak = Math.max(peak, Math.abs(channel[sample] || 0));
    }
    peaks[index] = peak;
  }
  return peaks;
}

export class WaveformView {
  constructor(canvas, status) {
    this.canvas = canvas;
    this.status = status;
    this.cache = new Map();
    this.trackId = null;
    this.token = 0;
    this.peaks = null;
    this.progress = 0;
    this.error = false;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
  }

  async setTrack(track) {
    if (track?.id === this.trackId) return;
    this.trackId = track?.id || null;
    this.peaks = null;
    this.progress = 0;
    this.error = false;
    const token = ++this.token;
    if (!track) { this.status.textContent = 'No audio selected'; this.draw(); return; }
    if (this.cache.has(track.id)) {
      this.peaks = this.cache.get(track.id);
      this.status.textContent = 'From this audio file';
      this.draw();
      return;
    }
    if (track.size > MAX_PREVIEW_BYTES) {
      this.error = true;
      this.status.textContent = 'Preview unavailable for large files';
      this.draw();
      return;
    }
    this.status.textContent = 'Reading audio…';
    this.draw();
    try {
      const response = await fetch(track.url);
      if (!response.ok) throw new Error('Could not read audio');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_PREVIEW_BYTES) throw new Error('File is too large for preview');
      const decoder = new OfflineAudioContext(1, 1, 44100);
      const decoded = await decoder.decodeAudioData(bytes);
      const peaks = extractPeaks(decoded);
      if (token !== this.token) return;
      this.cache.set(track.id, peaks);
      this.peaks = peaks;
      this.status.textContent = 'From this audio file';
    } catch {
      if (token !== this.token) return;
      this.error = true;
      this.status.textContent = 'Waveform unavailable';
    }
    this.draw();
  }

  setProgress(elapsed, duration) {
    const next = duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 0;
    if (Math.abs(next - this.progress) < .002) return;
    this.progress = next;
    this.draw();
  }

  draw() {
    const { canvas } = this;
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    if (!this.peaks) {
      context.fillStyle = '#344146';
      context.fillRect(0, Math.floor(height / 2), width, 1);
      return;
    }
    const gap = 2;
    const bar = Math.max(1, width / this.peaks.length - gap);
    const maxPeak = Math.max(.08, ...this.peaks);
    for (let index = 0; index < this.peaks.length; index++) {
      const x = index / this.peaks.length * width;
      const amplitude = Math.max(.08, Math.min(1, this.peaks[index] / maxPeak));
      const barHeight = Math.max(3, amplitude * (height - 8));
      context.fillStyle = x / width <= this.progress ? '#d9fa65' : '#69848a';
      context.fillRect(x, (height - barHeight) / 2, bar, barHeight);
    }
    context.fillStyle = '#f5ffc9';
    context.fillRect(Math.min(width - 1, this.progress * width), 0, 1, height);
  }

  dispose() { this.observer.disconnect(); this.token++; }
}
