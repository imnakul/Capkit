import { describe, expect, it } from "vitest";
import { GifEncoder, seekAll } from "./videoExport";

/** A plain object shaped like `ImageData`, since jsdom has no real Canvas. */
function fakeFrame(width: number, height: number, rgb: readonly [number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data[pixel * 4] = rgb[0];
    data[pixel * 4 + 1] = rgb[1];
    data[pixel * 4 + 2] = rgb[2];
    data[pixel * 4 + 3] = 255;
  }
  return { data, width, height, colorSpace: "srgb" };
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe("GifEncoder", () => {
  it("writes a valid GIF89a signature and trailer", async () => {
    const encoder = new GifEncoder(4, 4);
    encoder.addFrame(fakeFrame(4, 4, [255, 0, 0]), 10);
    const blob = encoder.finish();
    expect(blob.type).toBe("image/gif");

    const bytes = await bytesOf(blob);
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    expect(signature).toBe("GIF89a");
    expect(bytes.at(-1)).toBe(0x3b); // trailer
  });

  it("declares the requested canvas size in the logical screen descriptor", async () => {
    const encoder = new GifEncoder(64, 36);
    encoder.addFrame(fakeFrame(64, 36, [0, 0, 0]), 10);
    const bytes = await bytesOf(encoder.finish());
    const width = (bytes[6] ?? 0) | ((bytes[7] ?? 0) << 8);
    const height = (bytes[8] ?? 0) | ((bytes[9] ?? 0) << 8);
    expect(width).toBe(64);
    expect(height).toBe(36);
  });

  it("includes the NETSCAPE2.0 loop extension so the animation repeats", async () => {
    const encoder = new GifEncoder(2, 2);
    encoder.addFrame(fakeFrame(2, 2, [10, 20, 30]), 10);
    const bytes = await bytesOf(encoder.finish());
    const text = String.fromCharCode(...bytes);
    expect(text).toContain("NETSCAPE2.0");
  });

  it("grows as more frames are added", async () => {
    const one = new GifEncoder(8, 8);
    one.addFrame(fakeFrame(8, 8, [1, 2, 3]), 10);
    const oneSize = (await one.finish().arrayBuffer()).byteLength;

    const three = new GifEncoder(8, 8);
    three.addFrame(fakeFrame(8, 8, [1, 2, 3]), 10);
    three.addFrame(fakeFrame(8, 8, [4, 5, 6]), 10);
    three.addFrame(fakeFrame(8, 8, [7, 8, 9]), 10);
    const threeSize = (await three.finish().arrayBuffer()).byteLength;

    expect(threeSize).toBeGreaterThan(oneSize);
  });

  it("produces a decodable local colour table entry count", async () => {
    const encoder = new GifEncoder(4, 4);
    encoder.addFrame(fakeFrame(4, 4, [1, 1, 1]), 10);
    const bytes = await bytesOf(encoder.finish());
    // The packed flags byte sits at offset 9 within the 10-byte image
    // descriptor, which itself follows the 13-byte header, the 19-byte
    // application extension, and the 8-byte graphic control block.
    const descriptorFlags = bytes[13 + 19 + 8 + 9];
    // Local colour table present, sized 2^(N+1) = 256 entries (N = 7).
    expect(descriptorFlags).toBe(0x87);
  });
});

describe("seekAll", () => {
  /** A video element stand-in: setting currentTime fires seeked at once. */
  function fakeSeekable(): {
    currentTime: number;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  } {
    let time = 0;
    const listeners = new Set<() => void>();
    return {
      get currentTime(): number {
        return time;
      },
      set currentTime(next: number) {
        time = next;
        for (const listener of [...listeners]) listener();
      },
      addEventListener: (_type: string, listener: () => void): void => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void): void => {
        listeners.delete(listener);
      },
    };
  }

  it("seeks the camera to the same time as the video", async () => {
    const video = fakeSeekable();
    const camera = fakeSeekable();
    await seekAll(
      { video: video as unknown as HTMLVideoElement, camera: camera as unknown as HTMLVideoElement },
      4.25,
    );
    expect(video.currentTime).toBe(4.25);
    expect(camera.currentTime).toBe(4.25);
  });

  it("skips the camera when there is none", async () => {
    const video = fakeSeekable();
    await seekAll({ video: video as unknown as HTMLVideoElement, camera: null }, 1.5);
    expect(video.currentTime).toBe(1.5);
  });
});
