#!/usr/bin/env python3
"""Score for ad 2, v3: a punchy indie-dance / electro-pop ad track.

120 BPM, A minor (Am - F - C - G), built on the shot plan and cue list that
web/src/ad2/main.js exports, so every drop, stop, fill and hit lands on a cut
or a slam. Layered kick, snare + clap, 808-style metallic hats, a pumping
saw bass, French-house chord stabs, a 16th pluck arp, and a formant
"vocal chop" hook. Fills, reverse cymbals and risers lead into every scene.
Everything is synthesized; nothing is sampled or licensed.

usage: score3.py plan.json out.wav
"""
import json
import os
import sys
import wave
from functools import lru_cache

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import SR, ns, mtof, saw, lp, hp, bp, lp_sweep, noise, pan, Mix, reverb_ir, convolve, duck  # noqa: E402

BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
S16 = BEAT / 4
SWING = 0.011  # late offbeat 16ths: makes the hats bounce
R = np.random.default_rng(777)

PROG = ['Am', 'F', 'C', 'G']
STAB = {'Am': [57, 60, 64, 69], 'F': [57, 60, 65, 69], 'C': [55, 60, 64, 67], 'G': [55, 59, 62, 67]}
ROOT = {'Am': 33, 'F': 29, 'C': 36, 'G': 31}
ARP = {'Am': [69, 72, 76, 81], 'F': [65, 69, 72, 77], 'C': [67, 72, 76, 79], 'G': [67, 71, 74, 79]}
# vocal-chop hook: (16th step, length in 16ths, midi, vowel)
HOOK = {
    'Am': [(0, 2, 76, 'a'), (3, 1, 74, 'o'), (6, 2, 72, 'a'), (8, 2, 69, 'e'), (11, 1, 72, 'a'), (14, 2, 74, 'o')],
    'F': [(0, 2, 72, 'a'), (3, 1, 69, 'o'), (6, 2, 72, 'a'), (8, 3, 77, 'e'), (12, 2, 76, 'a'), (14, 2, 74, 'o')],
    'C': [(0, 2, 76, 'a'), (3, 1, 79, 'e'), (6, 2, 76, 'a'), (8, 2, 74, 'o'), (11, 1, 72, 'a'), (14, 2, 74, 'o')],
    'G': [(0, 2, 74, 'o'), (3, 1, 71, 'a'), (6, 2, 74, 'o'), (8, 4, 79, 'e'), (13, 1, 76, 'a'), (14, 2, 74, 'o')],
}
STAB_STEPS = [(0, 2), (3, 2), (6, 2), (10, 2), (12, 3)]


def chord_at(t):
    return PROG[int(t // BAR) % 4]


def env(n, a, d, hold=0.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-5))
    return e * np.where(t < a + hold, 1.0, np.exp(-(t - a - hold) / max(d, 1e-5)))


def fade_tail(x, sec=0.02):
    k = min(len(x), ns(sec))
    x = x.copy()
    x[-k:] *= np.linspace(1, 0, k)[:, None] if x.ndim == 2 else np.linspace(1, 0, k)
    return x


# ------------------------------------------------------------------ drums
@lru_cache(None)
def kick(v=1.0):
    n = ns(0.55)
    t = np.arange(n) / SR
    f = 46 + 170 * np.exp(-t / 0.028) + 40 * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.32, 0.03)
    click = (hp(noise(n), 3000) * np.exp(-t / 0.0025) * 0.5 + np.sin(2 * np.pi * 1100 * t) * np.exp(-t / 0.004) * 0.3)
    return np.tanh((body + click) * 2.4) * 0.62 * v


@lru_cache(None)
def snare(v=1.0):
    n = ns(0.45)
    t = np.arange(n) / SR
    f = 190 + 70 * np.exp(-t / 0.02)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07) * 0.7
    tone += np.sin(2 * np.pi * 330 * t) * np.exp(-t / 0.05) * 0.25
    nz = bp(noise(n), 1400, 10000) * np.exp(-t / 0.17)
    x = np.tanh((tone + nz * 0.9) * 1.6)
    return x * 0.42 * v


@lru_cache(None)
def clap(v=1.0):
    n = ns(0.4)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, d in enumerate((0, 0.009, 0.018, 0.026)):
        i = ns(d)
        e[i:] += np.exp(-t[: n - i] / 0.0045) * (0.7 + 0.1 * k)
    e += np.exp(-t / 0.12) * 0.55 * (t > 0.028)
    return bp(noise(n), 900, 5200) * e * 0.34 * v


@lru_cache(None)
def _metal():
    n = ns(0.9)
    t = np.arange(n) / SR
    base = 420
    x = sum(np.sign(np.sin(2 * np.pi * base * r * t + r)) for r in (1, 1.4471, 1.617, 1.9265, 2.5028, 2.6637))
    return hp(bp(x, 6500, 13000), 6000)


@lru_cache(None)
def hat(open_=False, v=1.0):
    m = _metal()
    n = ns(0.45 if open_ else 0.07)
    e = env(n, 0.0008, 0.16 if open_ else 0.022)
    return m[:n] * e * (0.11 if open_ else 0.09) * v


@lru_cache(None)
def crash(v=1.0, dur=2.6):
    n = ns(dur)
    t = np.arange(n) / SR
    m = np.tile(_metal(), int(np.ceil(n / len(_metal()))))[:n]
    x = (m * 0.5 + hp(noise(n), 5000) * 0.8) * np.exp(-t / (dur * 0.3))
    return x * 0.13 * v


def rev_crash(dur=0.9):
    """reverse cymbal that swells into a cut"""
    return crash(1.0, dur)[::-1] * np.linspace(0.2, 1, ns(dur)) ** 2


@lru_cache(None)
def shaker(v=1.0):
    n = ns(0.08)
    return hp(noise(n), 7000) * env(n, 0.01, 0.02) * 0.05 * v


# ------------------------------------------------------------------- synths
@lru_cache(None)
def bass_note(m, steps, v=1.0):
    n = ns(steps * S16 * 0.92)
    t = np.arange(n) / SR
    f = mtof(m)
    x = saw(f, n) * 0.6 + np.sin(2 * np.pi * f * t) * 0.9 + np.sin(np.pi * f * t) * 0.35
    x = lp_sweep(x, 2400, 380, 256)
    x = np.tanh(x * 1.8)
    return x * env(n, 0.003, 0.5, 0.04) * np.clip((n - np.arange(n)) / ns(0.012), 0, 1) * 0.42 * v


def ssaw(f, n, voices=5, det=0.14, seed=0):
    r = np.random.default_rng(seed)
    L = np.zeros(n)
    Rr = np.zeros(n)
    for v in range(voices):
        d = (v - (voices - 1) / 2) / ((voices - 1) / 2)
        x = saw(f * 2 ** (d * det / 12), n, r.random())
        a = (d * 0.85 + 1) * np.pi / 4
        L += x * np.cos(a)
        Rr += x * np.sin(a)
    return np.stack([L, Rr], 1) / voices


@lru_cache(None)
def stab(ch, steps, bright=1.0):
    n = ns(steps * S16 + 0.12)
    x = sum(ssaw(mtof(m), n, 5, 0.16, seed=m) for m in STAB[ch])
    x = lp_sweep(x, 7000 * bright, 900, 256)
    e = env(n, 0.002, 0.14, steps * S16 * 0.35)[:, None]
    return fade_tail(np.tanh(x * e * 1.4) * 0.3)


@lru_cache(None)
def pad(ch, dur):
    n = ns(dur)
    x = sum(ssaw(mtof(m - 12), n, 7, 0.22, seed=m + 5) for m in STAB[ch])
    x = lp(x, 2200)
    t = np.arange(n) / SR
    e = (np.minimum(1, t / 0.08) * np.clip((dur - t) / 0.2, 0, 1))[:, None]
    return x * e * 0.12


@lru_cache(None)
def pluck(m, v=1.0):
    n = ns(0.3)
    t = np.arange(n) / SR
    f = mtof(m)
    x = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * t)) * 0.3
    x = lp_sweep(x, 6000, 600, 128)
    return x * env(n, 0.001, 0.09) * 0.16 * v


FORM = {'a': [(850, 1.0), (1610, 0.6), (2850, 0.3)], 'o': [(500, 1.0), (900, 0.7), (2700, 0.2)], 'e': [(400, 0.9), (2300, 0.65), (2950, 0.35)]}


@lru_cache(None)
def chop(m, steps, vowel):
    n = ns(steps * S16 * 0.9 + 0.05)
    t = np.arange(n) / SR
    f = mtof(m) * (1 - 0.03 * np.exp(-t / 0.025)) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))
    ph = np.cumsum(f) / SR
    src = 2 * (ph % 1) - 1 + 0.03 * noise(n)
    x = sum(g * bp(src, fc * 0.88, fc * 1.12) for fc, g in FORM[vowel])
    x += 0.15 * lp(src, 400)
    e = np.minimum(1, t / 0.006) * np.clip((n - np.arange(n)) / ns(0.035), 0, 1)
    return np.tanh(x * e * 2.2) * 0.22


# --------------------------------------------------------------------- fx
@lru_cache(None)
def riser(dur):
    n = ns(dur)
    t = np.arange(n) / SR
    k = t / dur
    x = lp_sweep(noise(n), 400, 12000, 256) * k ** 2.2 * 0.32
    x += saw(150 * 2 ** (k * 3), n) * k ** 3 * 0.05
    return x


@lru_cache(None)
def whoosh(dur=0.55):
    n = ns(dur)
    t = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    x = lp_sweep(noise(n), 800, 7000, 256) * e
    return np.stack([x * (1 - t / dur), x * (t / dur)], 1) * 0.3


@lru_cache(None)
def boom(v=1.0):
    n = ns(1.6)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t / 0.09)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    x += lp(noise(n), 300) * np.exp(-t / 0.08) * 0.4
    return np.tanh(x * 1.5) * 0.5 * v


@lru_cache(None)
def subdrop():
    n = ns(1.2)
    t = np.arange(n) / SR
    f = 70 * np.exp(-t / 0.5) + 28
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.7) * 0.5


@lru_cache(None)
def bell(m, v=1.0, dur=1.0):
    n = ns(dur)
    t = np.arange(n) / SR
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t + 1.6 * np.sin(2 * np.pi * f * 3.5 * t) * np.exp(-t / 0.15))
    return x * np.exp(-t / (dur * 0.35)) * 0.1 * v


@lru_cache(None)
def blip(m):
    n = ns(0.09)
    t = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * mtof(m) * t)) * np.exp(-t / 0.025) * 0.06


@lru_cache(None)
def tick():
    n = ns(0.05)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006) + hp(noise(n), 5000) * np.exp(-t / 0.003) * 0.4) * 0.16


@lru_cache(None)
def shutter():
    n = ns(0.18)
    x = np.zeros(n)
    for d in (0, 0.06):
        i = ns(d)
        k = ns(0.035)
        x[i:i + k] += bp(noise(k), 1500, 8000) * np.exp(-np.arange(k) / SR / 0.008) * 0.32
    return x


def typing():
    n = ns(0.9)
    x = np.zeros(n)
    for k in range(12):
        i = ns(k * 0.065 + R.uniform(0, 0.015))
        c = tick() * R.uniform(0.5, 0.9)
        x[i:i + len(c)] += c[: n - i]
    return x


# --------------------------------------------------------------- patterns
def drums_bar(mix, tb, kicks, style='full', last=False, fill=True):
    if style in ('full', 'verse', 'chorus', 'outro'):
        for b in range(4):
            mix.add('kick', tb + b * BEAT, kick(1.0))
            kicks.append(tb + b * BEAT)
        for b in (1, 3):
            mix.add('snare', tb + b * BEAT, snare(1.0))
            mix.add('snare', tb + b * BEAT, clap(0.9), 1.0, 0.08)
        for s in range(16):
            sw = SWING if s % 2 else 0
            if s % 4 == 2:
                mix.add('hats', tb + s * S16 + sw, hat(True, 0.9), 1.0, 0.25)
            else:
                mix.add('hats', tb + s * S16 + sw, hat(False, 1.0 if s % 2 == 0 else 0.6), 1.0, -0.2)
            if style in ('chorus', 'outro'):
                mix.add('hats', tb + s * S16 + sw, shaker(1.0 if s % 2 else 0.6), 1.0, 0.45)
        if style in ('chorus', 'outro'):
            mix.add('snare', tb + 3.75 * BEAT, clap(0.6), 1.0, -0.3)
    elif style == 'half':
        for kb in (0, 0.75, 2.5):
            mix.add('kick', tb + kb * BEAT, kick(1.0))
            kicks.append(tb + kb * BEAT)
        mix.add('snare', tb + 2 * BEAT, snare(1.25))
        mix.add('snare', tb + 2 * BEAT, clap(1.0))
        for s in range(12):  # triplet hats
            mix.add('hats', tb + s * BAR / 12, hat(False, 1.0 if s % 3 == 0 else 0.55), 1.0, -0.2)
    elif style == 'intro':
        for s in range(16):
            sw = SWING if s % 2 else 0
            mix.add('hats', tb + s * S16 + sw, hat(False, 0.8 if s % 2 == 0 else 0.45), 1.0, -0.2)
        for b in (1, 3):
            mix.add('snare', tb + b * BEAT, clap(0.75))
    elif style == 'break':
        for s in range(8):
            mix.add('hats', tb + s * BEAT / 2, hat(False, 0.6), 1.0, -0.2)
        for b in (1, 3):
            mix.add('snare', tb + b * BEAT, clap(0.6))
    if last and fill:
        # snare fill on the last beat into the next cut
        for k, s in enumerate((12, 13, 14, 15)):
            mix.add('snare', tb + s * S16, snare(0.45 + 0.15 * k), 1.0, -0.3 + 0.2 * k)


def bass_bar(mix, tb, ch, style='pump'):
    r = ROOT[ch]
    if style == 'pump':  # off-beat octave bounce
        for s in range(0, 16, 2):
            m = r + 12 if s % 4 == 2 else r
            mix.add('bass', tb + s * S16, bass_note(m, 2, 1.0 if s % 4 == 0 else 0.85))
    elif style == 'drive':  # syncopated
        for s, d, o in ((0, 3, 0), (3, 3, 0), (6, 2, 12), (8, 3, 0), (11, 2, 0), (13, 1, 12), (14, 2, 7)):
            mix.add('bass', tb + s * S16, bass_note(r + o, d, 0.95))
    elif style == 'long':
        mix.add('bass', tb, bass_note(r, 14, 1.0))


def stabs_bar(mix, tb, ch, bright=1.0, v=1.0):
    for s, d in STAB_STEPS:
        mix.add('chords', tb + s * S16, stab(ch, d, bright) * v)


def arp_bar(mix, tb, ch, v=1.0):
    tones = ARP[ch]
    seq = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]
    for s, i in enumerate(seq):
        mix.add('arp', tb + s * S16 + (SWING if s % 2 else 0), pluck(tones[i], v * (1 if s % 4 == 0 else 0.75)), 1.0, -0.5 if s % 2 else 0.5)


def hook_bar(mix, tb, ch, v=1.0):
    for s, d, m, vw in HOOK[ch]:
        mix.add('lead', tb + s * S16, chop(m, d, vw) * v, 1.0, 0.0)
        mix.add('lead', tb + s * S16, chop(m - 12, d, vw) * v * 0.35, 1.0, 0.0)


def render(plan, cues, dur):
    mix = Mix(dur)
    kicks = []
    build_spans = []
    for si, sec in enumerate(plan):
        t0 = sec['start']
        bars = int(round(sec['dur'] / BAR))
        kind = sec['music']
        nxt = plan[si + 1]['music'] if si + 1 < len(plan) else None
        fill_ok = nxt not in ('stops', 'build', None)
        for b in range(bars):
            tb = t0 + b * BAR
            ch = chord_at(tb + 0.01)
            last = b == bars - 1
            if kind == 'intro':
                drums_bar(mix, tb, kicks, 'intro', last, False)
                if b >= 1:
                    for kb in range(4):
                        mix.add('kick', tb + kb * BEAT, kick(0.75))
                        kicks.append(tb + kb * BEAT)
                    bass_bar(mix, tb, ch, 'pump')
                arp_bar(mix, tb, ch, 0.7 + 0.15 * b)
            elif kind == 'drop':
                if b == 0:
                    # WHAT IF / YOU JUST / HELD?: hits on each word, snare roll under
                    mix.add('kick', tb, kick(1.0))
                    kicks.append(tb)
                    mix.add('chords', tb, stab(ch, 2, 1.0))
                    mix.add('snare', tb, clap(1.0))
                    for k in range(8, 16):
                        mix.add('snare', tb + k * S16, snare(0.25 + 0.05 * (k - 8)), 1.0, 0.0)
                else:
                    drums_bar(mix, tb, kicks, 'chorus', last, fill_ok)
                    bass_bar(mix, tb, ch, 'pump')
                    stabs_bar(mix, tb, ch)
                    hook_bar(mix, tb, ch)
                    mix.add('pad', tb, pad(ch, BAR))
            elif kind == 'stops':
                for k in range(bars * 8):
                    mix.add('hats', t0 + k * BEAT / 2, hat(False, 0.5), 1.0, -0.2)
            elif kind in ('verse', 'verse2'):
                drums_bar(mix, tb, kicks, 'verse', last, fill_ok)
                bass_bar(mix, tb, ch, 'pump' if kind == 'verse' else 'drive')
                if kind == 'verse':
                    arp_bar(mix, tb, ch, 0.9)
                    stabs_bar(mix, tb, ch, 0.7, 0.7)
                else:
                    stabs_bar(mix, tb, ch, 0.9, 0.9)
                    arp_bar(mix, tb, ch, 0.6)
                if b == 0:
                    mix.add('hats', tb, crash(0.8))
            elif kind == 'chorus':
                drums_bar(mix, tb, kicks, 'chorus', last, fill_ok)
                bass_bar(mix, tb, ch, 'drive')
                stabs_bar(mix, tb, ch)
                hook_bar(mix, tb, ch)
                mix.add('pad', tb, pad(ch, BAR))
                arp_bar(mix, tb, ch, 0.5)
                if b == 0:
                    mix.add('hats', tb, crash(1.0))
            elif kind == 'half':
                drums_bar(mix, tb, kicks, 'half', last, fill_ok)
                bass_bar(mix, tb, ch, 'long')
                mix.add('pad', tb, pad(ch, BAR) * 1.4)
                for s, d in ((0, 3), (6, 2), (10, 3)):
                    mix.add('chords', tb + s * S16, stab(ch, d, 0.5) * 0.8)
                if b == 0:
                    mix.add('hats', tb, crash(1.0))
            elif kind == 'break':
                drums_bar(mix, tb, kicks, 'break', last, False)
                mix.add('pad', tb, pad(ch, BAR) * 1.8)
                stabs_bar(mix, tb, ch, 0.6, 0.6)
                hook_bar(mix, tb, ch, 0.7)
                arp_bar(mix, tb, ch, 0.6)
            elif kind == 'build':
                build_spans.append((t0, t0 + sec['dur']))
                for k in range(8):  # one hit per slam word
                    tt = tb + k * BEAT  # one per slam word, every 0.5 s
                    if tt >= t0 + sec['dur'] - 0.01:
                        break
                    if b * 8 + k < 8:
                        mix.add('kick', tt, kick(0.95))
                        kicks.append(tt)
                        c2 = PROG[(b * 8 + k) // 2 % 4]
                        mix.add('chords', tt, stab(c2, 2, 1.0))
                        mix.add('snare', tt, clap(0.9))
                        mix.add('bass', tt, bass_note(ROOT[c2] + 12 * (k % 2), 2, 1.0))
                        mix.add('hats', tt, crash(0.5 + 0.08 * k, 0.5))
                        mix.add('fx', tt, boom(0.25 + 0.05 * k))
                for k in range(16 if b == 0 else 32):
                    step = S16 if b == 0 else S16 / 2
                    mix.add('snare', tb + k * step, snare(min(0.5, 0.15 + 0.012 * k)), 1.0, 0.0)
                if b == bars - 1:
                    mix.add('fx', tb + BAR - 1.8, riser(1.8), 1.0)
            elif kind == 'outro':
                if b < bars - 1:
                    drums_bar(mix, tb, kicks, 'outro', b == bars - 2, True)
                    bass_bar(mix, tb, ch, 'drive')
                    stabs_bar(mix, tb, ch)
                    hook_bar(mix, tb, ch)
                    mix.add('pad', tb, pad(ch, BAR))
                    arp_bar(mix, tb, ch, 0.55)
                    if b == 0:
                        mix.add('hats', tb, crash(1.2, 3.2))
                else:
                    # final hit: big Am chord rings out
                    mix.add('kick', tb, kick(1.1))
                    kicks.append(tb)
                    mix.add('chords', tb, stab('Am', 16, 1.0) * 1.2)
                    mix.add('pad', tb, pad('Am', 2.2) * 1.6)
                    mix.add('bass', tb, bass_note(33, 14, 1.0))
                    mix.add('fx', tb, boom(1.0))
                    mix.add('hats', tb, crash(1.3, 3.5))
                    for k, m in enumerate((81, 84, 88, 93)):
                        mix.add('fx', tb + 0.1 + k * 0.07, bell(m, 0.8, 1.6), 1.0, -0.3 + 0.2 * k)
        # pre-section swell into the next scene (lands on the cut)
        end = t0 + sec['dur']
        if nxt and nxt != 'build' and kind != 'build':
            mix.add('hats', end - 0.9, rev_crash(0.9), 0.9)

    def in_build(t):
        return any(a - 0.01 <= t < b for a, b in build_spans)

    for t, kind in cues:
        ch = chord_at(t + 0.01)
        if kind.startswith('riser:'):
            d = float(kind.split(':')[1])
            mix.add('fx', t - d, riser(d), 1.0)
        elif kind in ('impact', 'drop', 'final'):
            mix.add('kick', t, kick(1.15))
            kicks.append(t)
            mix.add('fx', t, boom(1.0 if kind != 'impact' else 0.8))
            mix.add('hats', t, crash(1.2))
            mix.add('chords', t, stab(ch, 6, 1.0) * 1.1)
            mix.add('bass', t, bass_note(ROOT[ch], 6, 1.0))
            mix.add('snare', t, clap(1.0))
            if kind in ('drop', 'final'):
                mix.add('fx', t, subdrop(), 0.9)
        elif kind in ('stab', 'stab_hi'):
            if in_build(t):
                continue
            mix.add('kick', t, kick(1.0))
            kicks.append(t)
            mix.add('chords', t, stab(ch, 2, 1.0))
            mix.add('snare', t, clap(0.9))
        elif kind in ('impact_soft', 'thud'):
            mix.add('fx', t, boom(0.35))
        elif kind == 'whoosh':
            mix.add('fx', t - 0.28, whoosh(0.55), 0.9)
        elif kind == 'glitch':
            n = ns(0.16)
            g = np.repeat(noise(n // 160 + 1), 160)[:n] * np.sign(np.sin(np.arange(n) / SR * 2 * np.pi * 70))
            mix.add('fx', t, bp(g, 800, 9000) * 0.12)
        elif kind == 'type':
            mix.add('fx', t, typing(), 0.9)
        elif kind in ('tick', 'click'):
            mix.add('fx', t, tick(), 1.0, 0.2)
        elif kind == 'chime':
            for k, m in enumerate((88, 93, 96)):
                mix.add('fx', t + k * 0.06, bell(m, 0.8, 1.0), 1.0, 0.3)
        elif kind == 'coins':
            for k in range(8):
                mix.add('fx', t + k * 0.05 + R.uniform(0, 0.02), bell(int(R.choice([93, 96, 98, 100, 103])), 0.6, 0.5), 1.0, float(R.uniform(-0.5, 0.5)))
        elif kind == 'shimmer':
            for k, m in enumerate((81, 84, 88, 93, 96, 100)):
                mix.add('fx', t + k * 0.045, bell(m, 0.55, 1.2), 1.0, -0.5 + 0.2 * k)
        elif kind == 'split':
            for k, m in enumerate((69, 76, 81)):
                mix.add('fx', t + k * 0.1, pluck(m + 12, 1.4), 1.0, -0.4 + 0.4 * k)
        elif kind == 'snapshot':
            mix.add('fx', t, shutter(), 1.0)
        elif kind == 'blips':
            for k, m in enumerate((88, 91, 96)):
                mix.add('fx', t + k * 0.07, blip(m), 1.0, -0.3 + 0.3 * k)
    return mix, kicks


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    dur = float(spec['duration'])
    mix, kicks = render(spec['plan'], spec['cues'], dur)
    n = mix.n
    for sec in spec['plan']:  # the break sits behind a low-pass that opens up
        if sec['music'] == 'break':
            i, j = ns(sec['start']), ns(sec['start'] + sec['dur'])
            for b in ('pad', 'lead', 'arp', 'chords'):
                if b in mix.bus:
                    mix.bus[b][i:j] = lp_sweep(mix.bus[b][i:j], 1200, 7000, 256)
        if sec['music'] == 'intro':  # filter opens through the hook scene
            i, j = ns(sec['start']), ns(sec['start'] + sec['dur'])
            for b in ('arp', 'bass', 'hats'):
                if b in mix.bus:
                    mix.bus[b][i:j] = lp_sweep(mix.bus[b][i:j], 700, 14000, 256)
    names = ('kick', 'snare', 'hats', 'bass', 'chords', 'pad', 'arp', 'lead', 'fx')
    B = {k: mix.bus.get(k, np.zeros((n, 2))) for k in names}
    pump = duck(n, kicks, depth=0.75, rel=0.16)[:, None]
    soft = duck(n, kicks, depth=0.4, rel=0.12)[:, None]
    B['kick'] = hp(B['kick'], 38)
    B['bass'] = hp(B['bass'], 30) * pump
    B['chords'] = hp(B['chords'], 160) * pump
    B['pad'] = hp(B['pad'], 180) * pump
    B['arp'] = hp(B['arp'], 300) * soft
    B['lead'] = hp(B['lead'], 220) * (0.6 + 0.4 * soft)
    B['snare'] = hp(B['snare'], 120)
    B['hats'] = hp(B['hats'], 500)
    lvl = {'kick': 0.42, 'snare': 1.0, 'hats': 1.4, 'bass': 0.95, 'chords': 1.15, 'pad': 1.2, 'arp': 2.8, 'lead': 2.5, 'fx': 0.85}
    dry = sum(B[k] * lvl[k] for k in names)
    plate = reverb_ir(1.6, 0.015, 9000)
    room = reverb_ir(0.6, 0.006, 10000)
    send = B['snare'] * 0.35 + B['lead'] * 0.3 + B['chords'] * 0.18 + B['arp'] * 0.25 + B['fx'] * 0.25
    wet = convolve(hp(send, 300), plate) * 0.3 + convolve(hp(B['snare'] * 0.4 + B['hats'] * 0.2, 400), room) * 0.3
    # parallel drum crush for punch
    drums = B['kick'] + B['snare'] * 0.9
    crush = np.tanh(drums * 4) * 0.12
    master = hp(dry + wet + crush, 25)
    master = master + hp(master, 7000) * 0.25  # air
    # glue + limiter
    e = np.abs(master).max(1)
    e = signal.lfilter([1 - np.exp(-1 / (0.02 * SR))], [1, -np.exp(-1 / (0.02 * SR))], e)
    thr = np.percentile(e, 85) * 0.9 + 1e-6
    gr = np.where(e > thr, (thr / np.maximum(e, 1e-9)) ** (1 - 1 / 3.0), 1.0)
    master = master * gr[:, None]
    ref = np.percentile(np.abs(master), 99.8) + 1e-9
    master = np.tanh(master / ref * 0.85 * 1.2) / np.tanh(1.2)
    tail = ns(dur)
    fade = np.ones(n)
    fl = ns(1.4)
    fade[tail - fl:tail] *= np.linspace(1, 0, fl) ** 1.6
    fade[tail:] = 0
    master = (master * fade[:, None])[:tail]
    master = master / (np.max(np.abs(master)) + 1e-9) * 0.78
    pcm = (master * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'score3: {dur:.1f}s, rms {20*np.log10(np.sqrt(np.mean(master**2))):.1f} dBFS -> {out}')


if __name__ == '__main__':
    main()
