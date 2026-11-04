// Renders web/dist/trailer.html frame by frame at 60fps and muxes the
// synthesized soundtrack. Needs Playwright (Chromium), ffmpeg and python3+numpy.
//
// usage: node render.cjs <built dist dir> <teaser|explainer> <out.mp4> <xmr|zec> [fps]
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const [dir, cut, out, vault, fpsArg] = process.argv.slice(2);
const fps = Number(fpsArg || 60);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };

const srv = http.createServer((q, res) => {
  let p = path.join(dir, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(dir, 'index.html');
  res.setHeader('content-type', types[path.extname(p)] || 'application/octet-stream');
  res.end(fs.readFileSync(p));
});

srv.listen(0, async () => {
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://localhost:${port}/trailer.html?cut=${cut}&capture=1`);
  await page.waitForFunction(() => window.__trailer);
  await page.evaluate(() => document.fonts.ready);
  const { duration, cues } = await page.evaluate(() => window.__trailer);
  // let the 3D scene load before frame 0
  await page.evaluate(() => window.__seek(5));
  await page.waitForTimeout(2500);

  const base = out.replace(/\.mp4$/, '');
  const silent = base + '.video.mp4';
  const wav = base + '.wav';
  fs.writeFileSync(base + '.cues.json', JSON.stringify(cues));
  execFileSync('python3', [path.join(__dirname, 'sfx.py'), base + '.cues.json', String(duration), wav, vault], { stdio: 'inherit' });

  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = Math.round(duration * fps);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.__seek(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 120 === 0) console.log(`${cut} ${vault}: frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out]);
  fs.unlinkSync(silent);
  console.log('wrote', out);
  await browser.close();
  srv.close();
  process.exit(0);
});
