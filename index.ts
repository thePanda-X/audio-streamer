import { SystemAudioRecorder } from "native-audio-node";
import type { ServerWebSocket } from "bun";
import { networkInterfaces } from "os";
import qrcode from "qrcode-terminal";

const SAMPLE_RATE = 48000 as const;
const CHANNELS = 2 as const;
const BIT_DEPTH = 16 as const;
const PORT = 6767 as const;

type StreamClient = {
    enqueue: (chunk: Buffer) => void;
    close: () => void;
};

function getLocalIp(): string {
    const interfaces = networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]!) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "127.0.0.1";
}

function float32ToInt16(data: Buffer): Buffer {
    const float32 = new Float32Array(
        data.buffer,
        data.byteOffset,
        data.byteLength / 4
    );
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i]! * 32768));
    }
    return Buffer.from(int16.buffer);
}

function createWavHeader(): Buffer {
    const blockAlign = (CHANNELS * BIT_DEPTH) / 8;
    const byteRate = SAMPLE_RATE * blockAlign;
    const maxDataSize = 0xffffffff - 36;
    const header = Buffer.alloc(44);

    header.write("RIFF", 0);
    header.writeUInt32LE(36 + maxDataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(CHANNELS, 22);
    header.writeUInt32LE(SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(BIT_DEPTH, 34);
    header.write("data", 36);
    header.writeUInt32LE(maxDataSize, 40);

    return header;
}

const recorder = new SystemAudioRecorder({
    sampleRate: SAMPLE_RATE * 2,
    chunkDurationMs: 20,
});

const clients = new Set<ServerWebSocket<unknown>>();
const streamClients = new Set<StreamClient>();

recorder.on("data", ({ data }: { data: Buffer }) => {
    if (clients.size === 0 && streamClients.size === 0) return;
    const pcm16 = float32ToInt16(data);
    for (const ws of clients) {
        ws.sendBinary(pcm16);
    }
    for (const client of streamClients) {
        try {
            client.enqueue(pcm16);
        } catch {
            client.close();
            streamClients.delete(client);
        }
    }
});

await recorder.start();
console.log("Recording started");

Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/stream") {
            if (server.upgrade(req)) return;
            return new Response("WebSocket upgrade failed", { status: 400 });
        }

        if (url.pathname === "/listen.wav") {
            let streamClient: StreamClient | undefined;
            let closed = false;

            const cleanup = () => {
                if (closed) return;
                closed = true;
                if (streamClient) {
                    streamClients.delete(streamClient);
                }
            };

            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(createWavHeader());

                    streamClient = {
                        enqueue(chunk) {
                            if (!closed) {
                                controller.enqueue(chunk);
                            }
                        },
                        close() {
                            cleanup();
                            try {
                                controller.close();
                            } catch {
                                // Stream already closed.
                            }
                        },
                    };

                    streamClients.add(streamClient);
                    req.signal?.addEventListener("abort", streamClient.close, {
                        once: true,
                    });
                },
                cancel() {
                    cleanup();
                },
            });

            return new Response(stream, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store, no-transform",
                    "Content-Type": "audio/wav",
                },
            });
        }

        if (url.pathname === "/" || url.pathname === "/index.html") {
            return new Response(Bun.file("index.html"), {
                headers: { "Content-Type": "text/html" },
            });
        }

        return new Response("Not found", { status: 404 });
    },

    websocket: {
        open(ws) {
            clients.add(ws);
            ws.send(JSON.stringify({
                type: "format",
                sampleRate: SAMPLE_RATE,
                channels: CHANNELS,
                bitDepth: BIT_DEPTH,
            }));
            console.log("Client connected, total:", clients.size);
        },
        close(ws) {
            clients.delete(ws);
            console.log("Client disconnected, total:", clients.size);
        },
        message() { },
    },
});

console.log(`Server running at http://localhost:${PORT}`);
const ip = getLocalIp();
qrcode.generate(`http://${ip}:${PORT}`, { small: true });
