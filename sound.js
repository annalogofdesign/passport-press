// The thud of a rubber stamp, synthesised: a low drop for the body, a burst of muffled
// noise for the slap. The same sound as the stamps on Anna's portfolio. No audio files.

let audio;

export function thud(delay = 0) {
  audio ??= new AudioContext();
  const now = audio.currentTime + delay;
  const out = audio.createGain();
  out.gain.value = 0.3;
  out.connect(audio.destination);

  const osc = audio.createOscillator();
  const body = audio.createGain();
  osc.frequency.setValueAtTime(96, now);
  osc.frequency.exponentialRampToValueAtTime(42, now + 0.16);
  body.gain.setValueAtTime(1, now);
  body.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  osc.connect(body).connect(out);
  osc.start(now);
  osc.stop(now + 0.2);

  const buffer = audio.createBuffer(1, audio.sampleRate * 0.05, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const slap = audio.createBufferSource();
  const lowpass = audio.createBiquadFilter();
  const slapGain = audio.createGain();
  slap.buffer = buffer;
  lowpass.frequency.value = 1400;
  slapGain.gain.value = 0.5;
  slap.connect(lowpass).connect(slapGain).connect(out);
  slap.start(now);
}
