// Captures web/ad.html frame by frame and muxes the synthesized score.
// Needs Playwright (Chromium), ffmpeg and python3 with numpy + scipy.
//
// usage:
//   node trailer/render-ad.cjs <dist dir | http://dev-server> <main|vertical> <out.mp4> [--fps 60] [--dpr 2] [--workers 3]
//        [--from 0 --to 104] [--crf 16] [--preset medium] [--keep-frames] [--page ad|ad2] [--score score.py|score2.py]   (dpr 2 = 4K / 2160x3840)
//   node trailer/render-ad.cjs <dist|url> <cut> <outdir> --stills 1,8.5,13      (review frames as JPEGs)
//   node trailer/render-ad.cjs <dist|url> <cut> <out.wav> --audio-only
// Env: FFMPEG (path to ffmpeg), PYTHON (python with numpy+scipy), CHROME (optional browser binary).
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const [src, cut, out] = args;
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i < 0 ? d : args[i + 1] === undefined || args[i + 1].startsWith('--') ? true : args[i + 1];
};
const fps = Number(opt('fps', 60));
const dpr = Number(opt('dpr', 2));
const PAGE = opt('page', 'ad');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const PY = process.env.PYTHON || 'python3';
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

function serve() {
  if (/^https?:/.test(src)) return Promise.resolve({ base: src.replace(/\/$/, ''), close() {} });
  const srv = http.createServer((q, res) => {
    let p = path.join(src, decodeURIComponent(q.url.split('?')[0]));
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(src, PAGE + '.html');
    res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream');
    res.end(fs.readFileSync(p));
  });
  return new Promise((r) => srv.listen(0, () => r({ base: `http://localhost:${srv.address().port}`, close: () => srv.close() })));
}

(async () => {
  const { base, close } = await serve();
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy'] });
  const portrait = cut === 'vertical';
  const vw = portrait ? 1080 : 1920;
  const vh = portrait ? 1920 : 1080;
  const stills = opt('stills', null);
  const sdpr = stills ? Number(opt('dpr', 1)) : dpr;
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: sdpr });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
  await page.goto(`${base}/${PAGE}.html?cut=${cut}&capture=1&dpr=${sdpr}`);
  await page.waitForFunction(() => window.__ad, null, { timeout: 120000 });
  const ad = await page.evaluate(() => window.__ad);
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const d = c && c.getExtension('WEBGL_debug_renderer_info');
    return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`cut ${cut}: ${ad.duration}s, ${ad.cues.length} cues, renderer: ${gl}`);
  // warm up shaders for every shot
  for (const s of ad.plan) await page.evaluate((t) => window.__seek(t), s.start + s.dur / 2);
  await page.waitForTimeout(500);

  const base2 = out.replace(/\.(mp4|wav)$/, '');
  const writeScore = (wav) => {
    const plan = base2 + '.plan.json';
    fs.writeFileSync(plan, JSON.stringify({ duration: ad.duration, cues: ad.cues, plan: ad.plan }));
    execFileSync(PY, [path.join(__dirname, opt('score', 'score.py')), plan, wav], { stdio: 'inherit' });
  };

  if (stills) {
    fs.mkdirSync(out, { recursive: true });
    const ts = String(stills).split(',').map(Number);
    for (const t of ts) {
      await page.evaluate((x) => window.__seek(x), t);
      await page.screenshot({ path: path.join(out, `${cut}-${t.toFixed(2).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 85, timeout: 0 });
    }
    console.log('stills in', out);
  } else if (opt('audio-only', false)) {
    writeScore(out);
  } else {
    const from = Number(opt('from', 0));
    const to = Math.min(ad.duration, Number(opt('to', ad.duration)));
    // Frames go to disk first (several pages capture in parallel, and an
    // interrupted run resumes where it stopped), then one encode pass.
    const wav = base2 + '.wav';
    writeScore(wav);
    const frames = base2 + '.frames';
    fs.mkdirSync(frames, { recursive: true });
    const f0 = Math.round(from * fps);
    const f1 = Math.round(to * fps);
    const workers = Number(opt('workers', 3));
    const todo = [];
    for (let i = f0; i < f1; i++) if (!fs.existsSync(path.join(frames, `f${String(i).padStart(6, '0')}.jpg`))) todo.push(i);
    console.log(`${todo.length} of ${f1 - f0} frames to capture with ${workers} pages`);
    const t0 = Date.now();
    let done = 0;
    const chunk = Math.ceil(todo.length / workers);
    const run = async (w) => {
      const pg = w === 0 ? page : await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
      if (w) {
        pg.on('pageerror', (e) => console.error('page error:', e.message));
        await pg.goto(`${base}/${PAGE}.html?cut=${cut}&capture=1&dpr=${dpr}`);
        await pg.waitForFunction(() => window.__ad, null, { timeout: 120000 });
        for (const s of ad.plan) await pg.evaluate((t) => window.__seek(t), s.start + s.dur / 2);
      }
      for (const i of todo.slice(w * chunk, (w + 1) * chunk)) {
        await pg.evaluate((t) => window.__seek(t), i / fps);
        const buf = await pg.screenshot({ type: 'jpeg', quality: 95, timeout: 0 });
        fs.writeFileSync(path.join(frames, `f${String(i).padStart(6, '0')}.jpg`), buf);
        if (++done % 240 === 0) {
          const el = (Date.now() - t0) / 1000;
          console.log(`${cut}: ${done}/${todo.length} frames (${(el / 60).toFixed(1)} min, eta ${(((todo.length - done) * el) / done / 60).toFixed(1)} min)`);
        }
      }
    };
    await Promise.all(Array.from({ length: workers }, (_, w) => run(w)));
    console.log(`captured in ${((Date.now() - t0) / 60000).toFixed(1)} min, encoding`);
    execFileSync(
      FFMPEG,
      ['-y', '-loglevel', 'error', '-stats', '-framerate', String(fps), '-start_number', String(f0), '-i', path.join(frames, 'f%06d.jpg'), '-ss', String(from), '-t', String(to - from), '-i', wav,
        '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', opt('preset', 'medium'), '-crf', String(opt('crf', 16)), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'film',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', '-shortest', out],
      { stdio: 'inherit' },
    );
    if (!opt('keep-frames', false)) fs.rmSync(frames, { recursive: true, force: true });
    console.log('wrote', out);
  }
  await browser.close();
  close();
  process.exit(0);
})();
