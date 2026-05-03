import {
  SystemAudioRecorder,
  listAudioDevices,
  getDefaultOutputDevice,
} from "native-audio-node";

const SAMPLE_RATE = 48000;
const CHANNELS = 2;
const BIT_DEPTH = 16;

function createWavHeader(dataByteLength: number): Buffer {
  const header = Buffer.alloc(44);
  const blockAlign = CHANNELS * (BIT_DEPTH / 8);
  const byteRate = SAMPLE_RATE * blockAlign;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataByteLength, 4); // file size - 8
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BIT_DEPTH, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataByteLength, 40);

  return header;
}

function float32ToInt16(data: Buffer): Buffer {
  const float32 = new Float32Array(
    data.buffer,
    data.byteOffset,
    data.byteLength / 4,
  );
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, float32[i]! * 32768));
  }
  return Buffer.from(int16.buffer);
}

// Collect chunks first, then write
const chunks: Buffer[] = [];
const recorder = new SystemAudioRecorder({
  sampleRate: SAMPLE_RATE * 2,
  chunkDurationMs: 20,
});

let chunkCount = 0;

recorder.on("data", ({ data }: { data: Buffer }) => {
  if (chunkCount === 0) {
    const float32 = new Float32Array(
      data.buffer,
      data.byteOffset,
      data.byteLength / 4,
    );
    console.log("First chunk:");
    console.log("  raw bytes:", data.byteLength);
    console.log("  float32 samples:", float32.length);
    console.log("  expected samples for 20ms @96000Hz 8ch:", 96000 * 8 * 0.02);
    console.log(
      "  actual duration if stereo @96000:",
      float32.length / (96000 * 2),
      "sec",
    );
    console.log(
      "  actual duration if 8ch @96000:",
      float32.length / (96000 * 8),
      "sec",
    );
    console.log(
      "  actual duration if stereo @48000:",
      float32.length / (48000 * 2),
      "sec",
    );
    console.log(
      "  actual duration if 8ch @48000:",
      float32.length / (48000 * 8),
      "sec",
    );
  }
  chunkCount++;
  chunks.push(float32ToInt16(data));
});

const devices = listAudioDevices();
const defaultOutputId = getDefaultOutputDevice();
const outputDeviceInfo = devices.filter((d) => d.id == defaultOutputId);

console.log(outputDeviceInfo);

await recorder.start();

setTimeout(async () => {
  await recorder.stop();

  const pcmData = Buffer.concat(chunks);
  const header = createWavHeader(pcmData.byteLength);

  await Bun.write("recording.wav", Buffer.concat([header, pcmData]));
  console.log(
    `Saved recording.wav (${(pcmData.byteLength / 1024 / 1024).toFixed(2)} MB)`,
  );
}, 10000);
