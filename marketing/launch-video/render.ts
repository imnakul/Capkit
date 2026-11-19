/**
 * Renders the CapKit launch video frame by frame.
 *
 * The composition in `index.html` is fully deterministic: `window.seek(ms)`
 * paints the exact state for a timestamp, so every frame is captured from a
 * still page and piped into ffmpeg. No CSS animation or wall-clock timing is
 * involved, which keeps the output identical across machines and frame rates.
 *
 * Usage (Node 24+, run from the repository root):
 *   node marketing/launch-video/render.ts --serve          # live preview server
 *   node marketing/launch-video/render.ts                  # 1080p60 MP4
 *   node marketing/launch-video/render.ts --fps=30 --from=14000 --to=22000
 *
 * Requirements, resolved without adding a workspace dependency:
 *   - `playwright-core`: set PLAYWRIGHT_CORE to its folder, otherwise the npx
 *     cache used by the Playwright MCP server is searched.
 *   - A Chromium browser: Microsoft Edge by default, or CHROME_PATH.
 *   - ffmpeg on PATH, or FFMPEG.
 *   - Fonts come from the desktop app's installed Fontsource packages, so run
 *     `pnpm.cmd install` first.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(ROOT, "../..");
const FONT_ROOT = join(REPO, "apps/desktop/node_modules/@fontsource-variable");
const FONT_FILES: Readonly<Record<string, string>> = {
  "caveat.woff2": "caveat/files/caveat-latin-wght-normal.woff2",
  "jakarta.woff2": "plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  "mono.woff2": "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
};
const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
};
const WIDTH = 1920;
const HEIGHT = 1080;

type Options = {
  serve: boolean;
  fps: number;
  from: number;
  to: number | null;
  out: string;
};

function parseOptions(argv: readonly string[]): Options {
  const options: Options = {
    from: 0,
    fps: 60,
    out: join(ROOT, "out", "capkit-launch.mp4"),
    serve: false,
    to: null,
  };
  for (const arg of argv) {
    const [key, value = ""] = arg.replace(/^--/, "").split("=");
    if (key === "serve") options.serve = true;
    else if (key === "fps") options.fps = positiveNumber(key, value);
    else if (key === "from") options.from = positiveNumber(key, value, true);
    else if (key === "to") options.to = positiveNumber(key, value);
    else if (key === "out") options.out = resolve(value);
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function positiveNumber(name: string, raw: string, allowZero = false): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new Error(`--${name} must be a ${allowZero ? "non-negative" : "positive"} number.`);
  }
  return value;
}

function startServer(): Promise<{ server: Server; url: string }> {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
    let filePath: string;
    if (pathname.startsWith("/fonts/")) {
      const font = FONT_FILES[pathname.slice("/fonts/".length)];
      filePath = font === undefined ? "" : join(FONT_ROOT, font);
    } else {
      filePath = resolve(ROOT, `.${pathname === "/" ? "/index.html" : pathname}`);
      // Never serve files outside the composition folder.
      if (!filePath.startsWith(ROOT + sep)) filePath = "";
    }
    if (filePath === "" || !existsSync(filePath)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    response.end(readFileSync(filePath));
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolveServer({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

type PlaywrightModule = {
  chromium: {
    launch: (options: Record<string, unknown>) => Promise<{
      newPage: (options: Record<string, unknown>) => Promise<PlaywrightPage>;
      close: () => Promise<void>;
    }>;
  };
};
type PlaywrightPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(script: string) => Promise<T>;
  screenshot: (options: Record<string, unknown>) => Promise<Buffer>;
};

function findPlaywrightCore(): string {
  const fromEnv = process.env.PLAYWRIGHT_CORE;
  if (fromEnv !== undefined && existsSync(fromEnv)) return fromEnv;
  const npxCache = join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  if (existsSync(npxCache)) {
    for (const entry of readdirSync(npxCache)) {
      const candidate = join(npxCache, entry, "node_modules", "playwright-core");
      if (existsSync(join(candidate, "package.json"))) return candidate;
    }
  }
  throw new Error("playwright-core was not found. Set PLAYWRIGHT_CORE to its folder.");
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  const entry = pathToFileURL(join(findPlaywrightCore(), "index.mjs")).href;
  // The module is loaded from an external path, so its type cannot be
  // inferred; the shape above covers the three calls this script makes.
  return (await import(entry)) as PlaywrightModule;
}

async function render(options: Options, url: string): Promise<void> {
  const { chromium } = await loadPlaywright();
  const executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(
    executablePath === undefined ? { channel: "msedge" } : { executablePath },
  );
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height: HEIGHT, width: WIDTH } });
    await page.goto(`${url}?render`);
    await page.evaluate("document.fonts.ready.then(() => true)");
    const duration = await page.evaluate<number>("window.DURATION");
    const end = Math.min(options.to ?? duration, duration);
    const frameCount = Math.ceil(((end - options.from) / 1000) * options.fps);

    mkdirSync(dirname(options.out), { recursive: true });
    const ffmpeg = spawn(
      process.env.FFMPEG ?? "ffmpeg",
      [
        "-y", "-loglevel", "error",
        "-f", "image2pipe", "-framerate", String(options.fps), "-c:v", "png", "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        "-movflags", "+faststart", options.out,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const finished = new Promise<void>((resolveExit, rejectExit) => {
      ffmpeg.on("error", rejectExit);
      ffmpeg.on("close", (code) => {
        if (code === 0) resolveExit();
        else rejectExit(new Error(`ffmpeg exited with code ${String(code)}`));
      });
    });

    const started = Date.now();
    for (let frame = 0; frame < frameCount; frame += 1) {
      const time = options.from + (frame * 1000) / options.fps;
      await page.evaluate(`window.seek(${time.toFixed(3)})`);
      const png = await page.screenshot({ type: "png" });
      if (!ffmpeg.stdin.write(png)) {
        await new Promise<void>((drain) => ffmpeg.stdin.once("drain", drain));
      }
      if (frame % options.fps === 0) {
        const elapsed = (Date.now() - started) / 1000;
        process.stdout.write(`\rframe ${frame}/${frameCount} · ${elapsed.toFixed(0)}s`);
      }
    }
    ffmpeg.stdin.end();
    await finished;
    process.stdout.write(`\nWrote ${options.out}\n`);
  } finally {
    await browser.close();
  }
}

const options = parseOptions(process.argv.slice(2));
const { server, url } = await startServer();
if (options.serve) {
  process.stdout.write(`Preview: ${url}?play   (append &from=<ms> to start later, or ?t=<ms> for a still)\n`);
} else {
  try {
    await render(options, url);
  } finally {
    server.close();
  }
}
