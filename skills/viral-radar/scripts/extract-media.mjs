import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function frameTimecodes(durationSec, n = 4) {
  // percentages across the clip: ~5/35/65/92% for n=4
  const pcts = n === 4 ? [0.05, 0.35, 0.65, 0.92] : Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  return pcts.map((p) => Math.max(1, +(p * durationSec).toFixed(2)));
}

// Literal first-seconds for hook study (0s/1s/2s), clamped to the clip length.
// Always includes 0; later seconds only if they fall inside the clip.
export function hookFrameTimecodes(durationSec, secs = [0, 1, 2]) {
  return secs.filter((t) => t === 0 || t < durationSec);
}

// yt-dlp cookie args for authenticated Instagram downloads. IG now requires a logged-in session to
// fetch reel media (anonymous requests get "rate-limit reached or login required"). Pass a browser to
// read cookies from (e.g. "chrome", or "chrome:/path/to/profile") via opts.cookiesFromBrowser or the
// VR_YTDLP_COOKIES_FROM_BROWSER env var, or a Netscape cookies.txt via opts.cookiesFile / VR_YTDLP_COOKIES_FILE.
export function cookieArgs({ cookiesFromBrowser, cookiesFile } = {}) {
  if (cookiesFile) return ["--cookies", cookiesFile];
  if (cookiesFromBrowser) return ["--cookies-from-browser", cookiesFromBrowser];
  return [];
}

// Download a reel and extract storyboard frames + 0/1/2s hook frames + audio.
// Returns { videoPath, audioPath, frames: [paths], hookFrames: [paths], durationSec }.
export function extractMedia(reelUrl, outDir, n = 4, opts = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const video = path.join(outDir, "reel.mp4");
  const cookies = cookieArgs({
    cookiesFromBrowser: opts.cookiesFromBrowser ?? process.env.VR_YTDLP_COOKIES_FROM_BROWSER,
    cookiesFile: opts.cookiesFile ?? process.env.VR_YTDLP_COOKIES_FILE,
  });
  execFileSync("yt-dlp", ["--no-warnings", ...cookies, "-o", video, reelUrl], { stdio: "inherit" });
  const dur = parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).toString().trim()
  );
  const grab = (t, f) =>
    execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=600:-1", "-q:v", "3", f, "-y"]);
  const frames = [];
  frameTimecodes(dur, n).forEach((t, i) => {
    const f = path.join(outDir, `${i + 1}.jpg`);
    grab(t, f);
    frames.push(f);
  });
  // First 0/1/2 seconds — the literal hook, for sharper hook study.
  const hookFrames = [];
  hookFrameTimecodes(dur).forEach((t) => {
    const f = path.join(outDir, `hook-${t}.jpg`);
    grab(t, f);
    hookFrames.push(f);
  });
  const audio = path.join(outDir, "audio.m4a");
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vn", "-acodec", "copy", audio, "-y"]);
  return { videoPath: video, audioPath: audio, frames, hookFrames, durationSec: dur };
}

// CLI: node extract-media.mjs <reelUrl> <outDir>
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [url, dir] = process.argv.slice(2);
  console.log(JSON.stringify(extractMedia(url, dir), null, 2));
}
