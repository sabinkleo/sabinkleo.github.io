"""Generate the original 120 BPM audio bed for the Canva reel."""
import math
import random
import struct
import sys
import wave

SAMPLE_RATE = 48000
DURATION = 12
CUTS = (0, 1.5, 2.5, 4.5, 6.5, 7.5, 10)


def make_track(output):
    track = [0.0] * (DURATION * SAMPLE_RATE)
    noise = random.Random(34)

    def add(at, duration, sound):
        start = round(at * SAMPLE_RATE)
        for i in range(min(round(duration * SAMPLE_RATE), len(track) - start)):
            track[start + i] += sound(i / SAMPLE_RATE)

    for beat in range(DURATION * 2):
        at = beat / 2
        strong = at in CUTS
        add(at, .24, lambda t: (.61 if strong else .38) * math.exp(-19*t) *
            math.sin(2*math.pi*(52*t + 1.8*(1-math.exp(-38*t)))))
        add(at + .035, .27, lambda t: .14*math.exp(-8*t)*min(1, t*140) *
            math.sin(2*math.pi*(55 if beat % 8 < 6 else 65.4)*t))
        if beat % 2:
            add(at, .115, lambda t: .15*math.exp(-43*t)*noise.uniform(-1, 1))
        add(at + .25, .047, lambda t: .09*math.exp(-95*t)*noise.uniform(-1, 1))
    for at in CUTS[1:]:
        add(at, .12, lambda t: .17*math.exp(-34*t) *
            math.sin(2*math.pi*(590*t-800*t*t)))
    audio = bytearray()
    for i, value in enumerate(track):
        fade = min(1, (len(track)-1-i) / (.065*SAMPLE_RATE))
        audio.extend(struct.pack('<h', round(30000*math.tanh(value)*fade)))
    with wave.open(output, 'wb') as wav:
        wav.setparams((1, 2, SAMPLE_RATE, 0, 'NONE', 'not compressed'))
        wav.writeframes(audio)


if __name__ == '__main__':
    if len(sys.argv) > 2:
        DURATION = int(sys.argv[2])
        CUTS = tuple(map(float, sys.argv[3:]))
    make_track(sys.argv[1])
