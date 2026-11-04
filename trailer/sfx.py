#!/usr/bin/env python3
"""Synthesizes the trailer soundtrack from the cue list the trailer page
exports. Everything is generated here (no samples, nothing licensed).

usage: sfx.py cues.json duration out.wav [accent: xmr|zec]
"""
import json
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, a=0.002, r=0.1):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(r, 1e-4))
    return e


def lowpass(x, cutoff):
    """One-pole low-pass. Scalar cutoff runs in the frequency domain (fast);
    a per-sample cutoff (short sweeps only) runs sample by sample."""
    if np.isscalar(cutoff):
        X = np.fft.rfft(x)
        f = np.fft.rfftfreq(len(x), 1 / SR)
        return np.fft.irfft(X / (1 + 1j * f / cutoff), len(x))
    c = np.asarray(cutoff, dtype=float)
    a = np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def sine(f, n, phase=0):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t + phase)


def tone_sweep(f0, f1, n):
    f = np.geomspace(f0, f1, n)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def s_type(n=int(0.03 * SR)):
    x = rng.standard_normal(n) * env(n, 0.0005, 0.006)
    x = x - lowpass(x, 2500)
    return 0.35 * x + 0.12 * sine(2600, n) * env(n, 0.0005, 0.004)


def s_tick():
    n = int(0.06 * SR)
    return 0.32 * sine(1760, n) * env(n, 0.0005, 0.012) + 0.12 * sine(3520, n) * env(n, 0.0005, 0.006)


def s_click():
    n = int(0.08 * SR)
    return 0.4 * sine(900, n) * env(n, 0.0005, 0.01) + 0.2 * rng.standard_normal(n) * env(n, 0.0003, 0.004)


def s_glitch():
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = 180 + 2400 * (np.floor(t * 60) % 5) / 5
    sq = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    crush = np.round(sq * 4) / 4
    return 0.18 * crush * env(n, 0.001, 0.07)


def s_whoosh():
    n = int(0.55 * SR)
    x = rng.standard_normal(n)
    cut = np.geomspace(300, 7000, n)
    y = lowpass(x, cut)
    shape = np.sin(np.linspace(0, np.pi, n)) ** 2
    return 0.5 * y * shape


def s_riser():
    n = int(0.5 * SR)
    x = lowpass(rng.standard_normal(n), np.geomspace(400, 9000, n))
    shape = np.linspace(0, 1, n) ** 2
    return 0.35 * x * shape + 0.12 * tone_sweep(220, 880, n) * shape


def s_hit():
    n = int(1.6 * SR)
    kick = tone_sweep(120, 34, n) * env(n, 0.001, 0.32)
    crack = rng.standard_normal(n) * env(n, 0.0005, 0.03)
    tail = lowpass(rng.standard_normal(n), 900) * env(n, 0.01, 0.6)
    return 0.95 * kick + 0.35 * crack + 0.5 * tail


def s_chime(base):
    n = int(1.8 * SR)
    return sum(0.16 / (k + 1) * sine(base * m, n) * env(n, 0.002, 0.7 / (k + 1)) for k, m in enumerate([1, 1.5, 2, 3]))


def s_wipe():
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    steps = np.floor(t * 40)
    f = 400 + (steps % 8) * 180
    sq = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    return 0.07 * sq * np.sin(np.linspace(0, np.pi, n)) + 0.25 * s_whoosh()[:n] * 0.5


def drone(n, root):
    t = np.arange(n) / SR
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t)
    x = np.zeros(n)
    for f, a in [(root, 0.22), (root * 1.5, 0.12), (root * 2.005, 0.08), (root / 2, 0.25)]:
        saw = 2 * ((f * t) % 1) - 1
        x += a * saw
    x = lowpass(x, 520) * (0.65 + 0.35 * lfo)
    fade = np.minimum(1, t / 1.5) * np.minimum(1, (t[-1] - t) / 1.2)
    return 0.55 * x * fade


def main():
    cues = json.load(open(sys.argv[1]))
    dur = float(sys.argv[2])
    out = sys.argv[3]
    vault = sys.argv[4] if len(sys.argv) > 4 else 'xmr'
    root = 55.0 if vault == 'xmr' else 61.74  # A1 vs B1
    chime_base = 880.0 if vault == 'xmr' else 987.77
    n = int((dur + 0.6) * SR)
    mix = np.zeros(n)
    mix += drone(n, root)
    gen = {
        'type': s_type, 'tick': s_tick, 'click': s_click, 'glitch': s_glitch, 'whoosh': s_whoosh,
        'riser': s_riser, 'hit': s_hit, 'chime': lambda: s_chime(chime_base), 'wipe': s_wipe,
    }
    cache = {}
    for t, kind in cues:
        if kind == 'drone':
            continue
        if kind not in cache:
            cache[kind] = gen[kind]()
        s = cache[kind] if kind not in ('type', 'glitch') else gen[kind]()
        i = int(t * SR)
        if kind == 'riser':
            i -= len(s)  # risers end on the cue
        i = max(0, i)
        j = min(n, i + len(s))
        mix[i:j] += s[: j - i]
    # gentle stereo: tiny delay on one side
    d = int(0.011 * SR)
    left = mix
    right = np.concatenate([np.zeros(d), mix[:-d]]) * 0.9 + mix * 0.1
    st = np.stack([left, right], 1)
    st = np.tanh(st * 1.4) / np.tanh(1.4)  # soft limit
    st = st / max(1e-6, np.max(np.abs(st))) * 0.89
    pcm = (st * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    main()
