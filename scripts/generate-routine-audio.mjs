import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 8000;
const ROUTINE_SECONDS = 35 * 60;
const TAIL_SECONDS = 6;
const OUTPUT_SECONDS = ROUTINE_SECONDS + TAIL_SECONDS;
const outputPath = fileURLToPath(new URL("../routine-guidance.wav", import.meta.url));
const require = createRequire(import.meta.url);
const text2wav = require("text2wav");

const prompts = new Map([
  ["warmup", "Start five minute warmup"],
  ["brisk", "Walk briskly"],
  ["casual", "Walk casually"],
  ["cooldown", "Start cooldown. Routine complete"],
]);

function wavSamples(wav) {
  const dataIndex = wav.indexOf(Buffer.from("data"));
  if (dataIndex < 0) throw new Error("No audio data found in generated prompt");
  const byteLength = wav.readUInt32LE(dataIndex + 4);
  const start = dataIndex + 8;
  const sourceRate = wav.readUInt32LE(wav.indexOf(Buffer.from("fmt ")) + 12);
  const source = new Int16Array(wav.buffer, wav.byteOffset + start, byteLength / 2);
  const outputLength = Math.floor(source.length * SAMPLE_RATE / sourceRate);
  const output = new Int16Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    output[index] = source[Math.floor(index * sourceRate / SAMPLE_RATE)];
  }
  return output;
}

function addSamples(track, samples, startSecond, gain = 1) {
  const start = Math.round(startSecond * SAMPLE_RATE);
  for (let index = 0; index < samples.length && start + index < track.length; index += 1) {
    const mixed = track[start + index] + samples[index] * gain;
    track[start + index] = Math.max(-32768, Math.min(32767, mixed));
  }
}

function addTone(track, startSecond, frequency, duration = 0.14, volume = 0.22) {
  const start = Math.round(startSecond * SAMPLE_RATE);
  const length = Math.round(duration * SAMPLE_RATE);
  for (let index = 0; index < length && start + index < track.length; index += 1) {
    const edge = Math.min(1, index / 80, (length - index) / 120);
    const sample = Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
    track[start + index] += Math.round(sample * 32767 * volume * edge);
  }
}

function writeWav(path, samples) {
  const dataBytes = samples.length;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    wav[44 + index] = Math.max(0, Math.min(255, Math.round(samples[index] / 256 + 128)));
  }
  writeFileSync(path, wav);
}

const clips = new Map();
for (const [name, text] of prompts) {
  const wav = Buffer.from(await text2wav(text, {
    voice: "en-us",
    speed: 165,
    pitch: 45,
    noFinalPause: true,
  }));
  clips.set(name, wavSamples(wav));
}

const track = new Int16Array(OUTPUT_SECONDS * SAMPLE_RATE);
const phaseStarts = [
  [0, "warmup"],
  [300, "brisk"],
  [480, "casual"],
  [660, "brisk"],
  [840, "casual"],
  [1020, "brisk"],
  [1200, "casual"],
  [1380, "brisk"],
  [1560, "casual"],
  [1740, "brisk"],
  [1920, "casual"],
  [2100, "cooldown"],
];

for (const [second, prompt] of phaseStarts) {
  addSamples(track, clips.get(prompt), second);
}

for (const [boundary] of phaseStarts.slice(1)) {
  for (let remaining = 5; remaining >= 1; remaining -= 1) {
    addTone(track, boundary - remaining, remaining === 1 ? 1046 : 784);
  }
}

writeWav(outputPath, track);
console.log(`Created ${outputPath}`);
