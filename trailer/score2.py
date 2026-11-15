#!/usr/bin/env python3
"""Score for ad 2: a bright, acoustic-pop track in C major at 120 BPM.

Plucked guitar (Karplus-Strong), electric piano, round bass, claps, snaps,
shaker, tambourine, a whistled hook and glockenspiel. Everything is
synthesized here; nothing is sampled or licensed. Section names come from the
shot plan web/src/ad2/main.js exports, and its cue list adds the UI sounds,
whooshes and hits on the cut.

usage: score2.py plan.json out.wav
"""
import json
import os
import sys
import wave

import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import SR, ns, mtof, lp, hp, bp, lp_sweep, noise, pan, Mix, reverb_ir, convolve, duck, exp_env  # noqa: E402

BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
S16 = BEAT / 4
R = np.random.default_rng(4242)

# I - V - vi - IV in C, one chord per bar
PROG = ['C', 'G', 'Am', 'F']
CH = {'C': [48, 52, 55, 60, 64, 67], 'G': [43, 50, 55, 59, 62, 67], 'Am': [45, 52, 57, 60, 64, 69], 'F': [41, 48, 53, 57, 60, 65]}
ROOT = {'C': 36, 'G': 43, 'Am': 45, 'F': 41}
PIANO = {'C': [60, 64, 67, 72], 'G': [59, 62, 67, 71], 'Am': [57, 60, 64, 69], 'F': [57, 60, 65, 69]}

# whistled hook, 4 bars (beat, length in beats, midi)
HOOK = [
    [(0, 0.75, 76), (0.75, 0.75, 79), (1.5, 0.5, 76), (2, 0.5, 74), (2.5, 1.25, 72)],
    [(0, 0.75, 74), (0.75, 0.75, 79), (1.5, 0.5, 74), (2, 1, 71), (3, 0.5, 74), (3.5, 0.5, 76)],
    [(0, 0.75, 76), (0.75, 0.75, 81), (1.5, 0.5, 79), (2, 0.5, 76), (2.5, 1.25, 72)],
    [(0, 0.5, 72), (0.5, 0.5, 74), (1, 1, 76), (2, 1, 74), (3, 0.75, 72)],
]
# marimba counter line (16ths), one bar per chord: chord tones up and down
def chord_at(bar):
    return PROG[bar % 4]


# ------------------------------------------------------------ instruments
def addat(x, i, g):
    """x[i:] += g, clipped to whichever is shorter."""
    if i >= len(x):
        return
    m = min(len(x) - i, len(g))
    x[i:i + m] += g[:m]


def ks(freq, dur, bright=0.5, decay=0.996):
    """Karplus-Strong string, block-vectorized."""
    n = ns(dur)
    N = max(2, int(round(SR / freq)))
    y = np.zeros(n + N + 1)
    exc = R.uniform(-1, 1, N)
    exc = lp(exc, 1500 + 7000 * bright)
    y[1:N + 1] = exc
    s = N + 1
    while s < n + N + 1:
        e = min(s + N, n + N + 1)
        L = e - s
        y[s:e] = decay * 0.5 * (y[s - N:s - N + L] + y[s - N - 1:s - N - 1 + L])
        s = e
    out = y[1:n + 1]
    fade = np.minimum(1, (n - np.arange(n)) / ns(0.03))
    return out * fade


def strum(chord, t_dur, down=True, amp=1.0, bright=0.5):
    notes = CH[chord][1:] if down else CH[chord][1:][::-1]
    n = ns(t_dur)
    x = np.zeros(n)
    for k, m in enumerate(notes):
        off = ns(0.011 * k)
        if off >= n:
            break
        s = ks(mtof(m), t_dur, bright, 0.9965) * (0.85 + 0.15 * R.random())
        x[off:] += s[: n - off]
    x = hp(x, 90)
    x = x + bp(x, 180, 420) * 0.6  # body
    return x * amp * 0.22


def epiano(m, dur, vel=1.0):
    n = ns(dur + 0.6)
    f = mtof(m)
    t = np.arange(n) / SR
    env = np.exp(-t / (0.9 + 0.4 * (60 / max(m, 30)))) * np.minimum(1, t / 0.003)
    rel = np.clip((dur + 0.6 - t) / 0.25, 0, 1)
    x = np.sin(2 * np.pi * f * t) * 1.0
    x += np.sin(2 * np.pi * f * 2 * t) * 0.35 * np.exp(-t / 0.4)
    x += np.sin(2 * np.pi * f * 3 * t + 0.3) * 0.12 * np.exp(-t / 0.25)
    x += np.sin(2 * np.pi * f * 7.03 * t) * 0.18 * np.exp(-t / 0.035)  # tine
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.8 * t)
    return x * env * rel * trem * vel * 0.16


def marimba(m, vel=1.0):
    n = ns(0.6)
    f = mtof(m)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.28)
    x += np.sin(2 * np.pi * f * 3.93 * t) * 0.35 * np.exp(-t / 0.05)
    x += np.sin(2 * np.pi * f * 9.2 * t) * 0.12 * np.exp(-t / 0.015)
    return x * np.minimum(1, t / 0.0015) * vel * 0.2


def glock(m, vel=1.0, dur=1.6):
    n = ns(dur)
    f = mtof(m)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9)
    x += np.sin(2 * np.pi * f * 2.76 * t) * 0.4 * np.exp(-t / 0.25)
    x += np.sin(2 * np.pi * f * 5.4 * t) * 0.2 * np.exp(-t / 0.08)
    return x * np.minimum(1, t / 0.001) * vel * 0.12


def whistle(m, dur, vel=1.0, slide_from=None):
    n = ns(dur + 0.12)
    t = np.arange(n) / SR
    f0 = mtof(m)
    f = np.full(n, f0)
    if slide_from is not None:
        k = np.minimum(1, t / 0.06)
        f = mtof(slide_from) * (1 - k) + f0 * k
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.6 * t) * np.minimum(1, t / 0.25)
    ph = np.cumsum(f * vib) / SR
    x = np.sin(2 * np.pi * ph) + 0.04 * np.sin(4 * np.pi * ph)
    breath = bp(noise(n), f0 * 0.9, f0 * 1.4) * 0.05
    env = np.minimum(1, t / 0.035) * np.clip((dur + 0.12 - t) / 0.1, 0, 1)
    return (x + breath) * env * vel * 0.11


def bass(m, dur, vel=1.0):
    n = ns(dur)
    t = np.arange(n) / SR
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.15) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.06)
    x = np.tanh(x * 1.3)
    env = np.minimum(1, t / 0.004) * (0.55 + 0.45 * np.exp(-t / 0.18)) * np.clip((dur - t) / 0.03, 0, 1)
    return x * env * vel * 0.3


def kick(vel=1.0):
    n = ns(0.45)
    t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = hp(noise(n), 2500) * np.exp(-t / 0.004) * 0.25
    return (x + click) * vel * 0.55


def clap(vel=1.0):
    n = ns(0.35)
    t = np.arange(n) / SR
    env = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.022]):
        i = ns(d)
        env[i:] += np.exp(-(t[: n - i]) / 0.006) * (0.8 + 0.1 * k)
    env += np.exp(-t / 0.09) * 0.45 * (t > 0.03)
    x = bp(noise(n), 900, 3200) * env
    return x * vel * 0.32


def snap(vel=1.0):
    n = ns(0.12)
    t = np.arange(n) / SR
    x = bp(noise(n), 1800, 6000) * np.exp(-t / 0.012) + np.sin(2 * np.pi * 2100 * t) * np.exp(-t / 0.006) * 0.4
    return x * vel * 0.3


def shaker(vel=1.0):
    n = ns(0.09)
    t = np.arange(n) / SR
    env = np.minimum(1, t / 0.012) * np.exp(-t / 0.025)
    return hp(noise(n), 5500) * env * vel * 0.07


def tamb(vel=1.0):
    n = ns(0.25)
    t = np.arange(n) / SR
    x = bp(noise(n), 6000, 12000) * np.exp(-t / 0.07)
    x += sum(np.sin(2 * np.pi * f * t) for f in (7130, 8420, 9900)) * np.exp(-t / 0.05) * 0.05
    return x * vel * 0.12


def cym(vel=1.0, dur=2.2):
    n = ns(dur)
    t = np.arange(n) / SR
    return hp(noise(n), 4500) * np.exp(-t / (dur * 0.35)) * vel * 0.09


def riser(dur):
    n = ns(dur)
    t = np.arange(n) / SR
    k = t / dur
    x = lp_sweep(noise(n), 300, 9000, 512) * (k ** 2) * 0.35
    x += np.sin(2 * np.pi * np.cumsum(200 + 900 * k ** 2) / SR) * (k ** 2) * 0.05
    return x


def whoosh(dur=0.6):
    n = ns(dur)
    t = np.arange(n) / SR
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    x = bp(noise(n), 400, 5000) * env
    return np.stack([x * (1 - t / dur), x * (t / dur)], 1) * 0.28


def boom(vel=1.0):
    n = ns(1.4)
    t = np.arange(n) / SR
    f = 38 + 60 * np.exp(-t / 0.08)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    return x * vel * 0.5


def chime():
    n = ns(1.6)
    x = np.zeros(n)
    for k, m in enumerate([84, 88, 91, 96]):
        i = ns(k * 0.06)
        g = glock(m, 0.9, 1.6)
        addat(x, i, g)
    return x


def coins():
    n = ns(1.2)
    x = np.zeros(n)
    for k in range(9):
        i = ns(k * 0.045 + R.uniform(0, 0.02))
        g = glock(int(R.choice([91, 93, 96, 98, 100])), 0.6, 0.6)
        addat(x, i, g)
    return x


def wood():
    n = ns(0.08)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * 1300 * t) * np.exp(-t / 0.012) * 0.2


def type_clicks():
    n = ns(0.9)
    x = np.zeros(n)
    for k in range(12):
        i = ns(k * 0.06 + R.uniform(0, 0.015))
        c = hp(noise(ns(0.02)), 2500) * exp_env(ns(0.02), 0.0005, 0.004) * 0.18
        addat(x, i, c)
    return x


def shutter():
    n = ns(0.2)
    x = np.zeros(n)
    for d in (0, 0.07):
        i = ns(d)
        c = bp(noise(ns(0.04)), 1500, 7000) * exp_env(ns(0.04), 0.0005, 0.01) * 0.3
        addat(x, i, c)
    return x


# ------------------------------------------------------------- arrangement
def drums_bar(mix, tb, style, kicks):
    if style in ('verse', 'chorus', 'outro'):
        for kb in (0, 1.5, 2) if style != 'chorus' else (0, 1.5, 2, 3.5):
            mix.add('kick', tb + kb * BEAT, kick(0.95))
            kicks.append(tb + kb * BEAT)
        for cb in (1, 3):
            mix.add('drums', tb + cb * BEAT, clap(1.0), 1.0, 0.05)
            mix.add('drums', tb + cb * BEAT, snap(0.5), 1.0, -0.3)
        for s in range(16):
            mix.add('drums', tb + s * S16, shaker(1.0 if s % 2 else 0.55), 1.0, 0.35)
        if style in ('chorus', 'outro'):
            for s in (2, 6, 10, 14):
                mix.add('drums', tb + s * S16, tamb(0.9), 1.0, -0.4)
    elif style == 'half':
        mix.add('kick', tb, kick(1.0))
        kicks.append(tb)
        mix.add('kick', tb + 2.5 * BEAT, kick(0.7))
        mix.add('drums', tb + 2 * BEAT, clap(1.1))
        for s in range(8):
            mix.add('drums', tb + s * BEAT / 2, shaker(0.8), 1.0, 0.35)
    elif style == 'break':
        for cb in (1, 3):
            mix.add('drums', tb + cb * BEAT, snap(0.8), 1.0, -0.3)
        for s in range(8):
            mix.add('drums', tb + s * BEAT / 2, shaker(0.7), 1.0, 0.35)
    elif style == 'intro':
        for cb in (1, 3):
            mix.add('drums', tb + cb * BEAT, snap(0.9), 1.0, -0.25)


def bass_bar(mix, tb, ch, style):
    r = ROOT[ch]
    if style == 'half':
        mix.add('bass', tb, bass(r, BAR * 0.95, 0.9))
        return
    pat = [(0, 1.25, r), (1.5, 0.5, r), (2, 1, r + 7), (3, 0.5, r + 12), (3.5, 0.5, r + 7)]
    for b, d, m in pat:
        mix.add('bass', tb + b * BEAT, bass(m, d * BEAT * 0.95, 0.9 if b else 1.0))


def keys_bar(mix, tb, ch, style):
    notes = PIANO[ch]
    if style == 'half':
        for m in notes:
            mix.add('keys', tb, epiano(m, BAR * 0.95, 0.9), 1.0, (m - 64) / 24)
        return
    # bouncy offbeat comp
    for b in (0.5, 1.5, 2.5, 3.0, 3.5) if style != 'verse' else (0.5, 1.5, 2.5, 3.5):
        for m in notes:
            mix.add('keys', tb + b * BEAT, epiano(m, BEAT * 0.4, 0.75), 1.0, (m - 64) / 24)


def guitar_bar(mix, tb, ch, amp=1.0):
    # D . D U . U D U
    pat = [(0, True, 1.0), (1, True, 0.7), (1.5, False, 0.55), (2.5, False, 0.6), (3, True, 0.75), (3.5, False, 0.5)]
    for b, down, a in pat:
        mix.add('gtr', tb + b * BEAT, strum(ch, 0.9, down, a * amp, 0.45 if down else 0.3), 1.0, 0.3 if down else 0.25)


def marimba_bar(mix, tb, ch, amp=1.0):
    tones = PIANO[ch] + [PIANO[ch][1] + 12]
    seq = [0, 2, 1, 3, 4, 3, 1, 2]
    for k, i in enumerate(seq):
        mix.add('mallet', tb + k * BEAT / 2, marimba(tones[i] + 12, amp * (1 if k % 2 == 0 else 0.7)), 1.0, -0.35 + 0.1 * (k % 3))


def hook_bar(mix, tb, bar, amp=1.0, glk=False):
    prev = None
    for b, d, m in HOOK[bar % 4]:
        mix.add('lead', tb + b * BEAT, whistle(m, d * BEAT * 0.92, amp, slide_from=(m - 2 if prev is None else None)))
        if glk:
            mix.add('mallet', tb + b * BEAT, glock(m + 12, 0.7 * amp, 1.0), 1.0, 0.2)
        prev = m


def render(plan, cues, dur):
    mix = Mix(dur)
    kicks = []
    for sec in plan:
        t0 = sec['start']
        bars = int(round(sec['dur'] / BAR))
        bar0 = int(round(t0 / BAR))
        kind = sec['music']
        for b in range(bars):
            tb = t0 + b * BAR
            gb = bar0 + b
            ch = chord_at(gb)
            if kind == 'intro':
                guitar_bar(mix, tb, ch, 0.8)
                drums_bar(mix, tb, 'intro', kicks)
                if b >= 1:
                    hook_bar(mix, tb, gb, 0.6)
                if b == bars - 1:
                    mix.add('fx', tb + BAR - 1.0, riser(1.0) * 0.6)
            elif kind == 'drop':
                if b == 0:
                    guitar_bar(mix, tb, ch, 0.7)
                    for s in range(8):  # clap build
                        mix.add('drums', tb + 2 * BEAT + s * BEAT / 4, clap(0.4 + 0.08 * s))
                else:
                    drums_bar(mix, tb, 'chorus', kicks)
                    bass_bar(mix, tb, ch, 'chorus')
                    keys_bar(mix, tb, ch, 'chorus')
                    guitar_bar(mix, tb, ch)
                    hook_bar(mix, tb, gb, 1.0, glk=True)
                    mix.add('drums', tb, cym(1.0))
            elif kind == 'stops':
                pass  # handled by cues (hits on each slam) + a shaker bed
            elif kind in ('verse', 'verse2'):
                drums_bar(mix, tb, 'verse', kicks)
                bass_bar(mix, tb, ch, 'verse')
                keys_bar(mix, tb, ch, 'verse')
                guitar_bar(mix, tb, ch, 0.8)
                if kind == 'verse2' or b % 2 == 1:
                    marimba_bar(mix, tb, ch, 0.8)
            elif kind == 'chorus':
                drums_bar(mix, tb, 'chorus', kicks)
                bass_bar(mix, tb, ch, 'chorus')
                keys_bar(mix, tb, ch, 'chorus')
                guitar_bar(mix, tb, ch)
                hook_bar(mix, tb, gb, 1.0, glk=True)
                if b == 0:
                    mix.add('drums', tb, cym(0.8))
            elif kind == 'half':
                drums_bar(mix, tb, 'half', kicks)
                bass_bar(mix, tb, ch, 'half')
                keys_bar(mix, tb, ch, 'half')
                hook_bar(mix, tb, gb, 0.55)
            elif kind == 'break':
                drums_bar(mix, tb, 'break', kicks)
                keys_bar(mix, tb, ch, 'half')
                marimba_bar(mix, tb, ch, 0.6)
            elif kind == 'build':
                for s in range(8 if b == 0 else 16):
                    step = BEAT / 2 if b == 0 else BEAT / 4
                    mix.add('drums', tb + s * step, clap(0.45 + 0.04 * s), 1.0, 0.1)
                for s in range(8):
                    mix.add('kick', tb + s * BEAT / 2, kick(0.6))
                    kicks.append(tb + s * BEAT / 2)
                for s in range(8):
                    mix.add('bass', tb + s * BEAT / 2, bass(ROOT[ch] + (12 if s % 2 else 0), BEAT * 0.45, 0.8))
            elif kind == 'outro':
                if b < bars - 1:
                    drums_bar(mix, tb, 'chorus', kicks)
                    bass_bar(mix, tb, ch, 'chorus')
                    keys_bar(mix, tb, ch, 'chorus')
                    guitar_bar(mix, tb, ch)
                    hook_bar(mix, tb, b, 1.0, glk=True)
                    if b == 0:
                        mix.add('drums', tb, cym(1.2, 3.0))
                else:
                    # final chord rings out
                    for m in PIANO['C'] + [76]:
                        mix.add('keys', tb, epiano(m, 2.4, 1.0), 1.0, (m - 64) / 24)
                    mix.add('gtr', tb, strum('C', 2.6, True, 1.2, 0.5))
                    mix.add('bass', tb, bass(36, 2.2, 1.0))
                    mix.add('kick', tb, kick(1.0))
                    for k, m in enumerate([84, 88, 91, 96]):
                        mix.add('mallet', tb + 0.15 + k * 0.08, glock(m, 0.7, 2.0))
        if kind == 'stops':
            for s in range(bars * 8):
                mix.add('drums', t0 + s * BEAT / 2, shaker(0.6), 1.0, 0.35)

    for t, kind in cues:
        gb = int(t // BAR)
        ch = chord_at(gb)
        if kind.startswith('riser:'):
            d = float(kind.split(':')[1])
            mix.add('fx', t - d, riser(d), 0.9)
        elif kind in ('impact', 'drop', 'final'):
            mix.add('kick', t, kick(1.1))
            kicks.append(t)
            mix.add('fx', t, boom(0.8 if kind == 'impact' else 1.0))
            mix.add('drums', t, cym(1.0 if kind != 'impact' else 0.7))
            for m in PIANO[ch]:
                mix.add('keys', t, epiano(m, 0.9, 1.1), 1.0, (m - 64) / 24)
            mix.add('gtr', t, strum(ch, 1.2, True, 1.0, 0.6))
            if kind == 'final':
                mix.add('fx', t + 0.1, chime(), 0.8)
        elif kind in ('stab', 'stab_hi'):
            for m in PIANO[ch]:
                mix.add('keys', t, epiano(m + (12 if kind == 'stab_hi' else 0), 0.35, 1.0), 1.0, (m - 64) / 24)
            mix.add('drums', t, clap(0.9))
            mix.add('kick', t, kick(0.8))
        elif kind in ('impact_soft', 'boom'):
            mix.add('fx', t, boom(0.4))
        elif kind == 'whoosh':
            mix.add('fx', t - 0.3, whoosh(0.6), 0.9)
        elif kind == 'glitch':
            mix.add('fx', t, bp(noise(ns(0.12)), 2000, 8000) * exp_env(ns(0.12), 0.001, 0.03) * 0.2)
        elif kind == 'type':
            mix.add('fx', t, type_clicks(), 0.9)
        elif kind in ('tick', 'click'):
            mix.add('fx', t, wood(), 0.9, 0.2)
        elif kind == 'chime':
            mix.add('fx', t, chime(), 0.7)
        elif kind == 'coins':
            mix.add('fx', t, coins(), 0.8)
        elif kind == 'shimmer':
            for k, m in enumerate([79, 84, 88, 91, 96, 100]):
                mix.add('fx', t + k * 0.05, glock(m, 0.5, 1.2), 0.7)
        elif kind == 'split':
            for k, m in enumerate([72, 76, 79]):
                mix.add('fx', t + k * 0.09, marimba(m + 12, 1.0), 1.0)
        elif kind == 'snapshot':
            mix.add('fx', t, shutter(), 1.0)
        elif kind == 'thud':
            mix.add('fx', t, boom(0.5))
        elif kind == 'blips':
            for k, m in enumerate([84, 88, 91]):
                mix.add('fx', t + k * 0.07, marimba(m, 0.7), 0.8)
    return mix, kicks


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    dur = float(spec['duration'])
    mix, kicks = render(spec['plan'], spec['cues'], dur)
    n = mix.n
    g = duck(n, kicks, depth=0.3, rel=0.12)[:, None]
    # the break sits behind a low-pass
    for sec in spec['plan']:
        if sec['music'] == 'break':
            i, j = ns(sec['start']), ns(sec['start'] + sec['dur'])
            for b in ('keys', 'mallet', 'gtr'):
                if b in mix.bus:
                    mix.bus[b][i:j] = lp_sweep(mix.bus[b][i:j], 900, 6000, 512)
    names = ('kick', 'drums', 'bass', 'keys', 'gtr', 'mallet', 'lead', 'fx')
    B = {k: mix.bus.get(k, np.zeros((n, 2))) for k in names}
    B['kick'] = hp(B['kick'], 30)
    B['bass'] = hp(B['bass'], 32) * g
    B['keys'] = hp(B['keys'], 140) * g
    B['gtr'] = hp(B['gtr'], 110) * g
    B['mallet'] = hp(B['mallet'], 200)
    B['lead'] = hp(B['lead'], 300)
    B['drums'] = hp(B['drums'], 150)
    lvl = {'kick': 0.8, 'drums': 1.9, 'bass': 0.95, 'keys': 0.42, 'gtr': 1.5, 'mallet': 1.25, 'lead': 2.6, 'fx': 0.8}
    dry = sum(B[k] * lvl[k] for k in names)
    room = reverb_ir(1.1, 0.012, 8000)
    hall = reverb_ir(2.2, 0.025, 7000)
    send = B['keys'] * 0.3 + B['gtr'] * 0.2 + B['lead'] * 0.4 + B['mallet'] * 0.35 + B['fx'] * 0.25
    wet = convolve(hp(send, 250), hall) * 0.22 + convolve(hp(B['drums'] * 0.35, 300), room) * 0.25
    master = hp(dry + wet, 25)
    # gentle glue + soft limit
    env = np.abs(master).max(1)
    env = signal.lfilter([1 - np.exp(-1 / (0.03 * SR))], [1, -np.exp(-1 / (0.03 * SR))], env)
    thr = np.percentile(env, 90) * 0.85 + 1e-6
    gr = np.where(env > thr, (thr / np.maximum(env, 1e-9)) ** (1 - 1 / 2.5), 1.0)
    master = master * gr[:, None]
    ref = np.percentile(np.abs(master), 99.7) + 1e-9
    master = np.tanh(master / ref * 0.6 * 1.1) / np.tanh(1.1)
    tail = ns(dur)
    fade = np.ones(n)
    fl = ns(1.2)
    fade[tail - fl:tail] *= np.linspace(1, 0, fl) ** 1.5
    fade[tail:] = 0
    master = (master * fade[:, None])[:tail]
    master = master / (np.max(np.abs(master)) + 1e-9) * 0.79
    pcm = (master * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    rms = np.sqrt(np.mean(master ** 2))
    print(f'score2: {dur:.1f}s, rms {20*np.log10(rms):.1f} dBFS -> {out}')


if __name__ == '__main__':
    main()
