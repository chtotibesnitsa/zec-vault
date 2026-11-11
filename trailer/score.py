#!/usr/bin/env python3
"""Original score + sound design for the Zatoshi ad.

Everything is synthesized here (no samples, nothing licensed), from the shot
plan and cue list that web/src/ad/main.js exports. 120 BPM, D minor; each
shot names a music section ('intro', 'reveal', 'groove', 'stops', ...), and
the cue list places hits, risers, whooshes and UI sounds on the cut.

usage: score.py plan.json out.wav
needs: numpy, scipy
"""
import json
import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
S16 = BEAT / 4
rng = np.random.default_rng(1729)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def ns(sec):
    return max(1, int(round(sec * SR)))


# ---------------------------------------------------------------- oscillators
def phase_of(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return (ph0 + np.cumsum(f) / SR) % 1.0, f / SR


def saw(freq, n, ph0=0.0):
    ph, dt = phase_of(freq, n, ph0)
    y = 2 * ph - 1
    dt = np.maximum(dt, 1e-9)
    m = ph < dt
    t = ph[m] / dt[m]
    y[m] -= t + t - t * t - 1
    m = ph > 1 - dt
    t = (ph[m] - 1) / dt[m]
    y[m] -= t * t + t + t + 1
    return y


def square(freq, n, ph0=0.0):
    return 0.5 * (saw(freq, n, ph0) - saw(freq, n, (ph0 + 0.5) % 1))


def sine(freq, n, ph0=0.0):
    ph, _ = phase_of(freq, n, ph0)
    return np.sin(2 * np.pi * ph)


def noise(n):
    return rng.standard_normal(n)


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1):
    t = np.arange(n) / SR
    dur = n / SR
    e = np.where(t < a, t / max(a, 1e-5), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-5)))
    rel = np.clip((dur - t) / max(r, 1e-5), 0, 1)
    return e * rel


def exp_env(n, a=0.001, decay=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-5)) * np.exp(-t / max(decay, 1e-5))


# -------------------------------------------------------------------- filters
def sos_lp(f, order=2):
    return signal.butter(order, min(f, SR * 0.45), 'low', fs=SR, output='sos')


def lp(x, f, order=2):
    return signal.sosfilt(sos_lp(f, order), x, axis=0)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x, axis=0)


def lp_sweep(x, f0, f1, block=256, curve='exp'):
    """Time-varying low-pass (state carried across blocks)."""
    n = len(x)
    y = np.empty_like(x)
    nb = (n + block - 1) // block
    fs = np.geomspace(max(f0, 20), max(f1, 20), nb) if curve == 'exp' else np.linspace(f0, f1, nb)
    zi = None
    for b in range(nb):
        s = slice(b * block, min(n, (b + 1) * block))
        sos = sos_lp(fs[b])
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
            if x.ndim == 2:
                zi = np.repeat(zi[:, :, None], x.shape[1], axis=2)
        y[s], zi = signal.sosfilt(sos, x[s], axis=0, zi=zi)
    return y


def pan(x, p=0.0):
    """mono -> stereo, equal power. p in [-1, 1]."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1)


# ------------------------------------------------------------------- the mix
class Mix:
    def __init__(self, dur):
        self.n = ns(dur + 4)
        self.bus = {}

    def get(self, name):
        if name not in self.bus:
            self.bus[name] = np.zeros((self.n, 2))
        return self.bus[name]

    def add(self, name, t, x, gain=1.0, p=0.0):
        if x.ndim == 1:
            x = pan(x, p)
        i = ns(t) if t > 0 else 0
        off = 0 if t >= 0 else ns(-t)
        x = x[off:]
        j = min(self.n, i + len(x))
        if j > i:
            self.get(name)[i:j] += x[: j - i] * gain


# ------------------------------------------------------------ instruments
def supersaw(f, n, voices=7, detune=0.16, bright=1.0, ph_seed=0):
    r = np.random.default_rng(ph_seed)
    L = np.zeros(n)
    R = np.zeros(n)
    for v in range(voices):
        d = (v - (voices - 1) / 2) / ((voices - 1) / 2) if voices > 1 else 0
        fv = f * 2 ** (d * detune / 12)
        x = saw(fv, n, r.random())
        w = 1 - abs(d) * 0.35
        p = d * 0.8
        a = (p + 1) * np.pi / 4
        L += x * w * np.cos(a)
        R += x * w * np.sin(a)
    return np.stack([L, R], 1) / voices * 2.2


def pad_chord(midis, dur, cutoff=1400, attack=0.6, release=0.8, seed=0):
    n = ns(dur + release)
    x = np.zeros((n, 2))
    for k, m in enumerate(midis):
        x += supersaw(mtof(m), n, 5, 0.22, ph_seed=seed + k)
    env = adsr(n, attack, 0.6, 0.85, release)
    x = lp(x, cutoff) * env[:, None]
    return x * 0.22


def pluck(m, dur=0.22, cutoff=3800, decay=0.12):
    n = ns(dur)
    f = mtof(m)
    x = 0.6 * saw(f, n) + 0.4 * square(f * 2, n)
    env = exp_env(n, 0.002, decay)
    fenv = cutoff * (0.25 + 0.75 * exp_env(n, 0.001, decay * 0.7))
    # cheap per-note filter: blend of two fixed low-passes by the envelope
    y = lp(x, cutoff) * exp_env(n, 0.001, decay * 0.7) + lp(x, cutoff * 0.25) * (1 - exp_env(n, 0.001, decay * 0.7))
    del fenv
    return y * env * 0.5


def bass_note(m, dur, drive=1.6, cutoff=650):
    n = ns(dur)
    f = mtof(m)
    x = 0.7 * saw(f, n) + 0.7 * sine(f / 2, n) + 0.3 * square(f, n)
    x = lp(x, cutoff, 2)
    x = np.tanh(x * drive) / np.tanh(drive)
    return x * adsr(n, 0.004, 0.18, 0.75, 0.03) * 0.5


def sub808(m, dur, glide_from=None):
    n = ns(dur)
    f1 = mtof(m)
    t = np.arange(n) / SR
    f0 = mtof(glide_from) if glide_from else f1 * 1.9
    f = f1 + (f0 - f1) * np.exp(-t / 0.05)
    x = sine(f, n) + 0.25 * sine(f * 2, n)
    x = np.tanh(x * 2.2) * adsr(n, 0.002, 0.5, 0.6, 0.15)
    return x * 0.62


def lead_note(m, dur):
    n = ns(dur + 0.3)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) / 0.2, 0, 1)
    x = supersaw(mtof(m) * vib, n, 7, 0.14, ph_seed=m)
    x += 0.5 * pan(square(mtof(m) * 2 * vib, n), 0)
    x = lp(x, 5200)
    return x * adsr(n, 0.01, 0.25, 0.7, 0.25)[:, None] * 0.3


def kick(n_sec=0.5, punch=1.0):
    n = ns(n_sec)
    t = np.arange(n) / SR
    f = 46 + 150 * np.exp(-t / 0.035) + 40 * np.exp(-t / 0.005)
    body = sine(f, n) * np.exp(-t / 0.28)
    click = hp(noise(n), 2500) * np.exp(-t / 0.004) * 0.25
    x = np.tanh((body + click) * 1.8 * punch) / np.tanh(1.8)
    return x * 0.95


def clap():
    n = ns(0.45)
    x = bp(noise(n), 900, 6000)
    e = np.zeros(n)
    for k, o in enumerate([0, 0.009, 0.018, 0.027]):
        i = ns(o)
        e[i:] += exp_env(n - i, 0.0005, 0.008 if k < 3 else 0.14)
    body = sine(185, n) * exp_env(n, 0.001, 0.05) * 0.4
    return (x * e * 0.55 + body)


def snare(amp=1.0, tail=0.16):
    n = ns(0.4)
    x = bp(noise(n), 1200, 9000) * exp_env(n, 0.0005, tail)
    body = sine(200 * (1 + 0.5 * np.exp(-np.arange(n) / SR / 0.01)), n) * exp_env(n, 0.001, 0.06)
    return (0.6 * x + 0.5 * body) * amp


def hat(open_=False, amp=1.0):
    n = ns(0.5 if open_ else 0.08)
    x = hp(noise(n), 7500, 4)
    metal = sum(square(f, n) for f in (3200, 4510, 5870, 7100)) * 0.08
    x = hp(x + metal, 6500)
    return x * exp_env(n, 0.0005, 0.16 if open_ else 0.022) * 0.32 * amp


def crash(amp=1.0, dur=2.6):
    n = ns(dur)
    x = hp(noise(n), 4000, 2)
    metal = hp(sum(square(f, n) for f in (2300, 3170, 4410, 5330, 6200, 7970)), 3000) * 0.12
    return (x * 0.5 + metal) * exp_env(n, 0.002, dur * 0.32) * 0.5 * amp


def impact(big=1.0):
    n = ns(4.5)
    t = np.arange(n) / SR
    f = 30 + 70 * np.exp(-t / 0.12)
    boom = np.tanh(sine(f, n) * 2.5) * np.exp(-t / (0.9 * big))
    crack = hp(noise(n), 1500) * np.exp(-t / 0.05) * 0.6
    body = lp(noise(n), 400) * np.exp(-t / 0.35) * 1.6
    x = boom * 0.95 + crack + body
    return x * 0.9


def riser(dur):
    n = ns(dur)
    t = np.arange(n) / SR
    k = t / dur
    x = noise(n)
    # band-limited noise sweeping up
    y = lp_sweep(x, 300, 12000, 512)
    y = hp(y, 200)
    tone = sum(saw(np.geomspace(110 * m, 880 * m, n), n) for m in (1, 1.5, 2.0)) / 3
    tone = lp_sweep(tone, 400, 6000, 512)
    env = k ** 2.2
    trem = 1 + 0.25 * np.sin(2 * np.pi * np.geomspace(4, 22, n) * t)
    s = 0.45 * y * env + 0.18 * tone * env * trem
    L = s
    R = np.roll(s, 90)
    return np.stack([L, R], 1)


def whoosh(dur=0.7):
    n = ns(dur)
    x = noise(n)
    half = n // 2
    cut = np.concatenate([np.geomspace(400, 9000, half), np.geomspace(9000, 600, n - half)])
    y = np.zeros(n)
    blk = 256
    zi = None
    for b in range(0, n, blk):
        sos = signal.butter(2, [max(80, cut[b] * 0.4), min(cut[b] * 1.6, SR * 0.45)], 'band', fs=SR, output='sos')
        if zi is None:
            zi = signal.sosfilt_zi(sos) * 0
        y[b:b + blk], zi = signal.sosfilt(sos, x[b:b + blk], zi=zi)
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    p = np.linspace(-0.9, 0.9, n)
    a = (p + 1) * np.pi / 4
    s = y * env * 0.9
    return np.stack([s * np.cos(a), s * np.sin(a)], 1)


def glitch():
    n = ns(0.22)
    t = np.arange(n) / SR
    f = 120 + 2600 * ((np.floor(t * 70) * 7) % 5) / 5
    x = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR))
    x = np.round(x * 3) / 3
    gate = (np.floor(t * 90) % 3 != 1).astype(float)
    return 0.22 * x * gate * exp_env(n, 0.001, 0.09) + 0.15 * hp(noise(n), 3000) * exp_env(n, 0.001, 0.03)


def type_click():
    n = ns(0.03)
    return hp(noise(n), 3000) * exp_env(n, 0.0003, 0.004) * 0.25 + sine(2400, n) * exp_env(n, 0.0003, 0.003) * 0.1


def tick():
    n = ns(0.08)
    return 0.3 * sine(1760, n) * exp_env(n, 0.0005, 0.012) + 0.12 * sine(3520, n) * exp_env(n, 0.0005, 0.006)


def bell(f, dur=1.6, idx=2.0, ratio=3.5, amp=0.2):
    n = ns(dur)
    t = np.arange(n) / SR
    mod = idx * np.exp(-t / 0.4) * np.sin(2 * np.pi * f * ratio * t)
    return amp * np.sin(2 * np.pi * f * t + mod) * exp_env(n, 0.001, dur * 0.35)


def chime():
    n = ns(2.2)
    x = np.zeros((n, 2))
    for k, (m, p) in enumerate([(86, -0.4), (93, 0.3), (98, 0.0), (105, 0.5)]):
        b = bell(mtof(m), 2.2 - k * 0.1, 1.5, 3.01, 0.14 / (1 + k * 0.4))
        x[ns(k * 0.045): ns(k * 0.045) + len(b)] += pan(b, p)[: n - ns(k * 0.045)]
    return x


def coins(count=14, span=2.6):
    n = ns(span + 1)
    x = np.zeros((n, 2))
    r = np.random.default_rng(3)
    for k in range(count):
        t0 = (k / count) ** 1.3 * span
        m = r.choice([86, 89, 93, 98, 101])
        b = bell(mtof(m), 0.5, 1.2, 4.1, 0.08 * (1 - 0.4 * k / count))
        i = ns(t0)
        j = min(n, i + len(b))
        x[i:j] += pan(b, r.uniform(-0.8, 0.8))[: j - i]
    return x


def shimmer():
    n = ns(1.6)
    x = np.zeros((n, 2))
    for k, m in enumerate([74, 77, 81, 86, 89, 93]):
        b = bell(mtof(m), 1.0, 0.8, 2.0, 0.07)
        i = ns(k * 0.06)
        j = min(n, i + len(b))
        x[i:j] += pan(b, -0.6 + k * 0.24)[: j - i]
    return x


def split_fx():
    n = ns(1.6)
    shard = hp(noise(n), 5000) * exp_env(n, 0.0005, 0.06) * 0.35
    x = pan(shard, 0) + chime()[:n] * 0.8
    w = whoosh(0.5)
    x[: len(w)] += w * 0.5
    return x


def snapshot():
    n = ns(0.9)
    t = np.arange(n) / SR
    f = np.geomspace(300, 2400, n)
    x = sine(f, n) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 24 * t))) * np.sin(np.linspace(0, np.pi, n))
    return pan(x * 0.14, 0)


def thud():
    n = ns(0.8)
    t = np.arange(n) / SR
    f = 55 + 60 * np.exp(-t / 0.04)
    return np.tanh(sine(f, n) * 2) * np.exp(-t / 0.3) * 0.8 + lp(noise(n), 800) * np.exp(-t / 0.05) * 0.3


def blips():
    n = ns(1.0)
    x = np.zeros((n, 2))
    r = np.random.default_rng(int(rng.integers(1e6)))
    for k in range(7):
        m = r.choice([88, 91, 95, 100, 103])
        d = ns(0.035)
        b = square(mtof(m), d) * exp_env(d, 0.0005, 0.02) * 0.05
        i = ns(k * 0.125 + r.uniform(0, 0.02))
        x[i:i + d] += pan(b, r.uniform(-0.7, 0.7))
    return x


def click():
    n = ns(0.1)
    return 0.4 * sine(900, n) * exp_env(n, 0.0005, 0.01) + 0.2 * noise(n) * exp_env(n, 0.0003, 0.004)


def tape_stop():
    n = ns(0.45)
    f = np.geomspace(330, 30, n)
    x = (saw(f, n) + saw(f * 1.5, n) * 0.5) * np.linspace(1, 0, n) ** 0.5
    return lp(x, 1800) * 0.18


def swoosh():
    return whoosh(0.5)[::-1] * 0.8


# ---------------------------------------------------------- harmony
CH = {
    'Dm': [62, 65, 69], 'Bb': [62, 65, 70], 'F': [60, 65, 69], 'C': [60, 64, 67],
    'Gm': [62, 67, 70], 'A': [61, 64, 69], 'Asus': [62, 64, 69],
}
ROOT = {'Dm': 38, 'Bb': 34, 'F': 41, 'C': 36, 'Gm': 31, 'A': 33, 'Asus': 33}
PROG = {
    'default': ['Dm', 'Bb', 'F', 'C'],
    'dark': ['Dm', 'Bb', 'Gm', 'A'],
    'build': ['Bb', 'C', 'Gm', 'Asus'],
}
LEAD = [  # (bar, beat, beats, midi): 4-bar hook for the finale
    (0, 0, 1.5, 69), (0, 1.5, 0.5, 74), (0, 2, 1, 77), (0, 3, 1, 76),
    (1, 0, 1, 74), (1, 1, 0.5, 72), (1, 1.5, 0.5, 74), (1, 2, 2, 77),
    (2, 0, 1.5, 81), (2, 1.5, 0.5, 79), (2, 2, 1, 77), (2, 3, 1, 76),
    (3, 0, 1, 76), (3, 1, 1, 79), (3, 2, 2, 76),
]


def chord_at(prog_name, bar):
    p = PROG[prog_name]
    return p[bar % len(p)]


# ----------------------------------------------------- section renderers
def drums(mix, t0, bars, *, kick_on=True, clap_on=True, hats=1.0, open_hats=True, kicks=None):
    for b in range(bars):
        tb = t0 + b * BAR
        for beat in range(4):
            tt = tb + beat * BEAT
            if kick_on:
                mix.add('kick', tt, kick(), 1.0)
                kicks.append(tt)
            if clap_on and beat in (1, 3):
                mix.add('drums', tt, clap(), 0.9, 0.05)
                mix.add('drums', tt, snare(0.6), 0.6, -0.05)
            if open_hats:
                mix.add('drums', tt + BEAT / 2, hat(True, 0.9), 0.8, 0.25)
            for s in range(4):
                acc = 1.0 if s == 2 else 0.55
                mix.add('drums', tt + s * S16, hat(False, acc * hats), 0.7, -0.3 + 0.15 * s)


def bassline(mix, t0, bars, bar0, prog='default', pattern='8ths', gain=1.0):
    for b in range(bars):
        ch = chord_at(prog, bar0 + b)
        r = ROOT[ch]
        tb = t0 + b * BAR
        if pattern == '8ths':
            for k in range(8):
                m = r + (12 if k in (3, 7) else 0)
                mix.add('bass', tb + k * BEAT / 2, bass_note(m, BEAT / 2 * 0.92), 0.9 * gain)
        elif pattern == 'held':
            mix.add('bass', tb, bass_note(r, BAR * 0.98, 1.2, 380), 0.8 * gain)


def pads(mix, t0, bars, bar0, prog='default', cutoff=1600, gain=1.0, attack=0.5):
    for b in range(bars):
        ch = chord_at(prog, bar0 + b)
        x = pad_chord(CH[ch], BAR, cutoff, attack, 0.9, seed=b)
        mix.add('pad', t0 + b * BAR, x, gain)
        mix.add('pad', t0 + b * BAR, pad_chord([m - 12 for m in CH[ch][:1]], BAR, cutoff * 0.6, attack, 0.9, seed=b + 9), gain * 0.7)


def arps(mix, t0, bars, bar0, prog='default', gain=1.0, cutoff=4000, sweep=None):
    pat = [0, 2, 4, 1, 3, 5, 4, 2, 0, 2, 4, 1, 5, 3, 4, 2]
    for b in range(bars):
        ch = chord_at(prog, bar0 + b)
        tones = CH[ch] + [m + 12 for m in CH[ch]]
        for s in range(16):
            tt = t0 + b * BAR + s * S16
            c = cutoff
            if sweep:
                k = (b * 16 + s) / (bars * 16)
                c = sweep[0] * (sweep[1] / sweep[0]) ** k
            mix.add('arp', tt, pluck(tones[pat[s]] + 12, 0.24, c, 0.1), gain * (1.0 if s % 4 == 0 else 0.7), 0.35 if s % 2 else -0.35)


def snare_roll(mix, t0, dur, start_div=8, end_div=32, gain=1.0):
    t = 0.0
    while t < dur - 1e-6:
        k = t / dur
        div = start_div * (end_div / start_div) ** k
        step = BAR / div
        mix.add('drums', t0 + t, snare(0.25 + 0.75 * k ** 1.5, 0.08), gain, 0)
        t += step


def render(plan, cues, dur):
    mix = Mix(dur)
    kicks = []
    for sec in plan:
        t0 = sec['start']
        d = sec['dur']
        bars = int(round(d / BAR))
        bar0 = int(round(t0 / BAR))
        kind = sec['music']
        if kind == 'intro':
            # low drone, heartbeat, ticking clock
            n = ns(d)
            tt = np.arange(n) / SR
            dr = sum(a * saw(mtof(m), n) for m, a in [(26, 0.35), (33, 0.2), (38, 0.18)])
            dr = hp(lp_sweep(dr, 160, 900, 1024), 45) * np.minimum(1, tt / 2.0)[:]
            mix.add('pad', t0, np.stack([dr, np.roll(dr, 240)], 1) * 0.8)
            mix.add('pad', t0 + BAR, pad_chord(CH['Dm'], d - BAR * 1.0, 700, 2.0, 1.0), 0.55)
            for b in range(bars):
                for beat in (0, 2.5) if b >= 1 else (0,):
                    tt2 = t0 + b * BAR + beat * BEAT
                    mix.add('kick', tt2, kick(0.6, 0.7), 0.55)
                for s in range(8):
                    mix.add('drums', t0 + b * BAR + s * BEAT / 2, tick(), 0.15 + 0.1 * b, 0.4 if s % 2 else -0.4)
        elif kind == 'reveal':
            half = bars // 2
            pads(mix, t0, half, bar0, 'default', 2400, 0.9, 0.3)
            arps(mix, t0, half, bar0, 'default', 0.8, sweep=(500, 6000))
            snare_roll(mix, t0 + BAR, BAR, 8, 32, 0.8)
            n = ns(half * BAR)
            mix.add('bass', t0, bass_note(ROOT['Dm'], half * BAR * 0.98, 1.0, 300), 0.7)
            t1 = t0 + half * BAR
            drums(mix, t1, bars - half, kicks=kicks)
            bassline(mix, t1, bars - half, bar0 + half)
            pads(mix, t1, bars - half, bar0 + half, 'default', 3000, 1.0, 0.05)
            arps(mix, t1, bars - half, bar0 + half, 'default', 0.9)
            mix.add('fx', t1, crash(1.2), 0.9)
            for m in (62, 65, 69, 74):
                mix.add('lead', t1, lead_note(m, 1.2), 0.55)
        elif kind in ('groove', 'groove2', 'filtered'):
            drums(mix, t0, bars, kicks=kicks, hats=1.0 if kind != 'filtered' else 0.7)
            bassline(mix, t0, bars, bar0)
            pads(mix, t0, bars, bar0, 'default', 3200 if kind != 'groove' else 2600, 0.85, 0.08)
            arps(mix, t0, bars, bar0, 'default', 0.7 if kind == 'groove' else 0.9)
            if kind == 'groove2':
                for b in range(bars):
                    for k in range(8):
                        mix.add('drums', t0 + b * BAR + k * BEAT / 2, bell(mtof(98), 0.3, 0.6, 3.5, 0.03), 1.0, 0.5)
            mix.add('fx', t0, crash(0.6, 1.8), 0.6)
        elif kind == 'stops':
            for beat in range(bars * 4):
                tt = t0 + beat * BEAT * 2 if False else t0 + beat * (d / 4)
                if beat >= 4:
                    break
                mix.add('kick', tt, kick(0.6, 1.1), 1.0)
                kicks.append(tt)
                mix.add('fx', tt, crash(0.4, 1.0), 0.6)
            mix.add('pad', t0, pad_chord(CH['Bb'], d, 900, 0.05, 0.5), 0.5)
        elif kind == 'halftime':
            for b in range(bars):
                tb = t0 + b * BAR
                ch = chord_at('dark', bar0 + b)
                for kb in (0, 1.5, 2.75):
                    mix.add('kick', tb + kb * BEAT, kick(0.6, 1.1), 1.0)
                    kicks.append(tb + kb * BEAT)
                mix.add('drums', tb + 2 * BEAT, snare(1.2, 0.3), 1.0)
                mix.add('drums', tb + 2 * BEAT, clap(), 0.8)
                for s in range(16):
                    if s % 6 == 5:
                        for r3 in range(3):
                            mix.add('drums', tb + s * S16 + r3 * S16 / 3, hat(False, 0.7), 0.6, 0.3)
                    else:
                        mix.add('drums', tb + s * S16, hat(False, 0.9 if s % 4 == 2 else 0.5), 0.6, -0.2)
                mix.add('bass', tb, sub808(ROOT[ch] + 12, BEAT * 1.4), 1.0)
                mix.add('bass', tb + 1.5 * BEAT, sub808(ROOT[ch] + 12, BEAT * 1.2), 0.9)
                mix.add('bass', tb + 2.75 * BEAT, sub808(ROOT[ch] + 12, BEAT * 1.25, ROOT[ch] + 19), 0.9)
                mix.add('pad', tb, pad_chord([m - 12 for m in CH[ch]], BAR, 900, 0.3, 0.8, seed=b), 0.9)
            # low rumble of the furnace
            n = ns(d)
            rum = lp(noise(n), 120) * 2.0
            crackle = hp(noise(n), 3000) * (rng.random(n) > 0.9994) * 3.0
            mix.add('fx', t0, np.stack([rum + crackle, rum + np.roll(crackle, 777)], 1) * 0.25)
        elif kind == 'build':
            half = bars // 2
            drums(mix, t0, half, kicks=kicks)
            bassline(mix, t0, half, 0, 'build')
            pads(mix, t0, bars, 0, 'build', 1800, 0.9, 0.1)
            arps(mix, t0, bars, 0, 'build', 0.9, sweep=(900, 9000))
            t1 = t0 + half * BAR
            for b in range(bars - half):
                for beat in range(4):
                    mix.add('kick', t1 + b * BAR + beat * BEAT, kick(0.4, 0.9), 0.75)
                    kicks.append(t1 + b * BAR + beat * BEAT)
            snare_roll(mix, t1, (bars - half) * BAR - 0.25, 4, 32, 0.9)
            bassline(mix, t1, bars - half, 2, 'build', '8ths', 0.8)
        elif kind == 'finale':
            hook = min(bars, 4)
            drums(mix, t0, hook, kicks=kicks)
            bassline(mix, t0, hook, 0, 'default')
            pads(mix, t0, hook, 0, 'default', 3800, 1.15, 0.03)
            arps(mix, t0, hook, 0, 'default', 0.8)
            for (b, beat, beats, m) in LEAD:
                if b < hook:
                    mix.add('lead', t0 + b * BAR + beat * BEAT, lead_note(m, beats * BEAT * 0.95), 1.0)
                    mix.add('lead', t0 + b * BAR + beat * BEAT, lead_note(m - 12, beats * BEAT * 0.95), 0.4)
            mix.add('fx', t0, crash(1.4, 3.5), 1.0)
            t1 = t0 + hook * BAR
            rest = d - hook * BAR
            mix.add('pad', t1, pad_chord(CH['Dm'] + [74], rest, 2600, 0.02, 2.5), 1.3)
            mix.add('bass', t1, bass_note(ROOT['Dm'], 2.5, 1.2, 300), 0.9)
            for m in (62, 69, 74, 77):
                mix.add('lead', t1, lead_note(m, 2.4), 0.5)

    # ----- cue sound design -----
    for t, kind in cues:
        if kind.startswith('riser:'):
            d = float(kind.split(':')[1])
            mix.add('fx', t - d, riser(d), 0.9)
        elif kind == 'impact':
            mix.add('fx', t, impact(1.0), 1.0)
            mix.add('fx', t, crash(1.0), 0.6)
        elif kind == 'drop':
            mix.add('fx', t, impact(1.5), 1.0)
            mix.add('kick', t, kick(0.8, 1.3), 0.8)
        elif kind == 'impact_soft':
            mix.add('fx', t, impact(0.5), 0.45)
        elif kind == 'boom':
            mix.add('fx', t, impact(1.2), 0.75)
        elif kind == 'final':
            mix.add('fx', t, impact(1.6), 1.0)
            mix.add('fx', t, crash(1.3, 4.0), 0.9)
            mix.add('fx', t, chime(), 0.8)
        elif kind == 'whoosh':
            mix.add('fx', t - 0.35, whoosh(0.7), 0.8)
        elif kind == 'swoosh':
            mix.add('fx', t - 0.5, swoosh(), 0.7)
        elif kind == 'glitch':
            mix.add('fx', t, glitch(), 1.0, float(rng.uniform(-0.5, 0.5)))
        elif kind == 'type':
            for k in range(14):
                mix.add('fx', t + k * 0.055 + float(rng.uniform(0, 0.02)), type_click(), 0.8, float(rng.uniform(-0.4, 0.4)))
        elif kind == 'tick':
            mix.add('fx', t, tick(), 0.8)
        elif kind == 'chime':
            mix.add('fx', t, chime(), 0.9)
        elif kind == 'coins':
            mix.add('fx', t, coins(), 1.0)
        elif kind == 'shimmer':
            mix.add('fx', t, shimmer(), 0.9)
        elif kind == 'split':
            mix.add('fx', t, split_fx(), 1.0)
        elif kind == 'snapshot':
            mix.add('fx', t, snapshot(), 1.0)
        elif kind == 'thud':
            mix.add('fx', t, thud(), 0.9)
        elif kind == 'blips':
            mix.add('fx', t, blips(), 1.0)
        elif kind == 'click':
            mix.add('fx', t, click(), 0.9)
        elif kind == 'tape':
            mix.add('fx', t, tape_stop(), 1.0)
        elif kind in ('stab', 'stab_hi'):
            ch = [62, 65, 69] if kind == 'stab' else [65, 69, 74]
            n = ns(0.5)
            x = sum(supersaw(mtof(m), n, 7, 0.2, ph_seed=m) for m in ch + [ch[0] - 12])
            x = lp(x, 4200) * exp_env(n, 0.002, 0.16)[:, None] * 0.3
            mix.add('lead', t, x, 1.0)
            mix.add('fx', t, impact(0.35), 0.4)
    return mix, kicks


def reverb_ir(rt60=2.6, pre=0.02, bright=6000):
    n = ns(rt60 * 1.2)
    t = np.arange(n) / SR
    env = np.exp(-6.91 * t / rt60)
    L = lp(noise(n), bright) * env
    R = lp(noise(n), bright) * env
    # darker tail
    tail = np.exp(-t / (rt60 * 0.25))
    L = L * tail + lp(L, 2000) * (1 - tail)
    R = R * tail + lp(R, 2000) * (1 - tail)
    ir = np.stack([L, R], 1)
    ir = np.concatenate([np.zeros((ns(pre), 2)), ir])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve(x, ir):
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)


def duck(n, kicks, depth=0.6, rel=0.18):
    g = np.ones(n)
    for t in kicks:
        i = ns(t)
        if i >= n:
            continue
        m = min(n, i + ns(rel * 2.5))
        tt = np.arange(m - i) / SR
        shape = 1 - depth * np.exp(-tt / rel) * np.minimum(1, tt / 0.004 + 0.4)
        g[i:m] = np.minimum(g[i:m], shape)
    return g


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    dur = float(spec['duration'])
    mix, kicks = render(spec['plan'], spec['cues'], dur)
    n = mix.n
    g = duck(n, kicks)[:, None]

    # filtered sections: low-pass the music buses during them
    for sec in spec['plan']:
        if sec['music'] == 'filtered':
            i, j = ns(sec['start']), ns(sec['start'] + sec['dur'])
            for b in ('drums', 'bass', 'pad', 'arp', 'kick'):
                if b in mix.bus:
                    seg = mix.bus[b][i:j]
                    mix.bus[b][i:j] = lp_sweep(seg, 700, 5000, 512)

    B = {k: mix.bus.get(k, np.zeros((n, 2))) for k in ('kick', 'drums', 'bass', 'pad', 'arp', 'lead', 'fx')}
    B['kick'] = hp(B['kick'], 28)
    B['bass'] = hp(B['bass'], 30) * g
    B['pad'] = hp(B['pad'], 120) * g
    B['arp'] = hp(B['arp'], 200) * g
    B['lead'] = hp(B['lead'], 150) * (0.4 + 0.6 * g)
    B['drums'] = hp(B['drums'], 120)

    lvl = {'kick': 0.62, 'drums': 0.95, 'bass': 0.42, 'pad': 1.25, 'arp': 0.8, 'lead': 1.0, 'fx': 0.95}
    dry = sum(B[k] * lvl[k] for k in B)
    hall = reverb_ir(3.2, 0.03, 7000)
    room = reverb_ir(0.9, 0.01, 9000)
    send = B['pad'] * 0.35 + B['arp'] * 0.5 + B['lead'] * 0.45 + B['fx'] * 0.35 + B['drums'] * 0.08
    wet = convolve(hp(send, 250), hall) * 0.28 + convolve(hp(B['drums'] * 0.3 + B['arp'] * 0.2, 300), room) * 0.2
    master = dry + wet
    master = hp(master, 22)
    # a little air on top
    master = master + hp(master, 5500) * 0.35
    # section dynamics: features sit under the reveal and the finale drop
    SG = {'intro': 1.0, 'reveal': 0.95, 'groove': 0.78, 'groove2': 0.84, 'filtered': 0.8, 'stops': 0.9, 'halftime': 0.86, 'build': 0.88, 'finale': 1.05}
    gcurve = np.ones(n)
    for sec in spec['plan']:
        i, j = ns(sec['start']), min(n, ns(sec['start'] + sec['dur']))
        gcurve[i:j] = SG.get(sec['music'], 1.0)
        if sec['music'] == 'reveal':
            h = ns(sec['start'] + sec['dur'] / 2)
            gcurve[i:h] = 1.0
    gcurve = signal.lfilter([1 - np.exp(-1 / (0.02 * SR))], [1, -np.exp(-1 / (0.02 * SR))], gcurve)
    master = master * gcurve[:, None]

    # glue compression (soft knee, program dependent)
    env = np.abs(master).max(1)
    env = signal.lfilter([1 - np.exp(-1 / (0.03 * SR))], [1, -np.exp(-1 / (0.03 * SR))], env)
    thr = np.percentile(env, 92) * 0.8 + 1e-6
    gr = np.where(env > thr, (thr / np.maximum(env, 1e-9)) ** (1 - 1 / 3.0), 1.0)
    master = master * gr[:, None]
    # limiter-ish soft clip
    # limiter: scale by the loud-but-not-transient level, then a soft clip
    # that rounds off only the biggest hits (impacts, drops)
    ref = np.percentile(np.abs(master), 99.7) + 1e-9
    master = master / ref * 0.55
    master = np.tanh(master * 1.1) / np.tanh(1.1)
    # fade the tail
    tail = ns(dur)
    fade = np.ones(n)
    fade[tail - ns(0.05):] = 0
    fl = ns(1.5)
    fade[tail - fl:tail] *= np.linspace(1, 0, fl) ** 1.5
    master = master * fade[:, None]
    master = master[:tail]
    master = master / (np.max(np.abs(master)) + 1e-9) * 0.79  # ~-1 dBTP after resampling/AAC
    pcm = (master * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    rms = np.sqrt(np.mean(master ** 2))
    print(f'score: {dur:.1f}s, rms {20*np.log10(rms):.1f} dBFS, {len(kicks)} kicks -> {out}')


if __name__ == '__main__':
    main()
