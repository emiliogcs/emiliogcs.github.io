#!/usr/bin/env python3
"""Trace two birds from a line drawing into SVG for the home page.

    python3 scripts/birds.py path/to/RossMcCampbell65.png

numpy + Pillow only. The drawing is traced along the centre of each line
(threshold, Zhang-Suen thinning, follow the skeleton, smooth, simplify) and
every stroke is assigned to a bird by its nearest anchor points. Only the
upper and the middle bird are kept (the small shape at the top and the
bottom bird are dropped). Each bird is a <g> with one path, inside one
<svg class="flock">, written between <!-- birds --> and <!-- /birds --> in
index.html (site.js flies them, and copies of the middle one) and in
scripts/og.html, the template for the social image.

The source PNG is not part of the site. Run this once and commit the page.
"""
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TARGETS = ["index.html", "scripts/og.html"]

TOP = [(246, 12), (284, 86), (349, 83), (389, 46), (482, 80), (116, 47), (203, 92), (311, 133), (396, 145), (439, 96)]
UPPER_WINGS = [(923, 124), (809, 137), (710, 161), (621, 195), (580, 258), (559, 362), (926, 167), (866, 207), (920, 207), (614, 337), (688, 263), (791, 218), (511, 353), (461, 274), (370, 257), (283, 270), (107, 338), (61, 368), (150, 341), (409, 356), (301, 385), (223, 427), (200, 396), (99, 414), (130, 361)]
UPPER_BODY = [(486, 452), (428, 463), (345, 524), (384, 520), (449, 527), (525, 500), (601, 451), (665, 356)]
MIDDLE_BODY = [(51, 559), (36, 480), (112, 506), (223, 587), (337, 642), (287, 717), (286, 761), (67, 605), (99, 629), (155, 646), (221, 721), (247, 760), (342, 847), (398, 903), (484, 967), (429, 983), (360, 973), (302, 888), (217, 843), (163, 750), (152, 705), (313, 722), (364, 800)]
MIDDLE_WING = [(451, 688), (575, 676), (699, 677), (834, 652), (852, 677), (806, 717), (734, 751), (688, 783), (520, 789), (440, 813)]
LOWER_WINGS = [(225, 962), (300, 995), (330, 1036), (415, 1050), (598, 1057), (298, 978), (888, 1008), (823, 1078), (744, 1122), (711, 1075), (724, 980), (708, 907), (802, 876), (890, 823), (938, 741), (805, 1006), (863, 939), (922, 878), (939, 812), (649, 1061), (593, 1004), (586, 916), (511, 965)]
LOWER_BODY = [(609, 1096), (672, 1158), (612, 1211), (514, 1231), (468, 1229), (436, 1216), (507, 1158), (580, 1127), (636, 1080)]

# Anchor sets (image pixels): each traced stroke goes to the set its points
# lie closest to on average. Strokes of the dropped shapes go to "drop".
PARTS = [
    ("drop", "wing", TOP),
    ("upper", "wing", UPPER_WINGS + UPPER_BODY),
    ("middle", "wing", MIDDLE_BODY + MIDDLE_WING),
    ("drop", "wing", LOWER_WINGS + LOWER_BODY),
]
# Wing beat: where the wings meet the body (x, y in image pixels), how far
# each wing sweeps up and down from the drawn pose (degrees), and which side
# beats (0 both, 1 right only). Head, feet and tail stay still.
# HEADING: the way each bird is flying as drawn, in degrees on screen
# (0 right, 90 down): both are diving, the upper bird down and to the left,
# the middle one down and to the right. site.js flies them that way.
FLAP = {"upper": (565, 365, 28, 0), "middle": (370, 730, 30, 0)}
HEADING = {"upper": 140, "middle": 62}


def trace(path):
    ink = (np.asarray(Image.open(path).convert("L"), dtype=np.uint8) < 140).astype(np.uint8)

    # Zhang-Suen thinning
    b = np.pad(ink, 1)
    while True:
        changed = False
        for step in (0, 1):
            P = b
            p2, p3, p4, p5 = P[:-2, 1:-1], P[:-2, 2:], P[1:-1, 2:], P[2:, 2:]
            p6, p7, p8, p9 = P[2:, 1:-1], P[2:, :-2], P[1:-1, :-2], P[:-2, :-2]
            c = P[1:-1, 1:-1]
            nb = [p2, p3, p4, p5, p6, p7, p8, p9]
            B = sum(n.astype(np.int32) for n in nb)
            seq = nb + [p2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.int32) for i in range(8))
            if step == 0:
                m = (c == 1) & (B >= 2) & (B <= 6) & (A == 1) & (p2 * p4 * p6 == 0) & (p4 * p6 * p8 == 0)
            else:
                m = (c == 1) & (B >= 2) & (B <= 6) & (A == 1) & (p2 * p4 * p8 == 0) & (p2 * p6 * p8 == 0)
            if m.any():
                c[m] = 0
                changed = True
        if not changed:
            break
    pts = set(zip(*np.nonzero(b[1:-1, 1:-1])))

    def nbrs(p):
        # m-connectivity: a diagonal counts only if no 4-neighbour links the two
        r, c = p
        out = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                q = (r + dr, c + dc)
                if (dr or dc) and q in pts and not (dr and dc and ((r + dr, c) in pts or (r, c + dc) in pts)):
                    out.append(q)
        return out

    # prune short spurs left by thinning
    for _ in range(3):
        for e in [p for p in pts if len(nbrs(p)) == 1]:
            path, cur, prev = [e], e, None
            while len(path) <= 6:
                nx = [n for n in nbrs(cur) if n != prev]
                if len(nx) != 1:
                    break
                prev, cur = cur, nx[0]
                if len(nbrs(cur)) >= 3:
                    break
                path.append(cur)
            else:
                continue
            if len(nbrs(cur)) >= 3:
                pts.difference_update(path)

    seen = set()
    key = lambda a, b: (a, b) if a < b else (b, a)

    def walk(a, b):
        line = [a, b]
        seen.add(key(a, b))
        prev, cur = a, b
        while True:
            nx = [n for n in nbrs(cur) if n != prev and key(cur, n) not in seen]
            if len(nbrs(cur)) != 2 or not nx:
                return line
            n = min(nx, key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
            seen.add(key(cur, n))
            line.append(n)
            prev, cur = cur, n

    strokes = []
    for p in sorted(p for p in pts if len(nbrs(p)) != 2) + sorted(pts):
        for n in nbrs(p):
            if key(p, n) not in seen:
                strokes.append(walk(p, n))
    return [s for s in strokes if len(s) >= 4]


def smooth(line, k=3):
    a = np.array([[c, r] for r, c in line], dtype=float)
    if len(a) < 2 * k + 1:
        return a
    out = a.copy()
    for i in range(k, len(a) - k):
        out[i] = a[i - k:i + k + 1].mean(axis=0)
    return out


def rdp(a, eps=0.9):
    if len(a) < 3:
        return a
    s, d = a[0], a[-1] - a[0]
    L = np.hypot(*d)
    dist = np.hypot(*(a - s).T) if L == 0 else np.abs(d[0] * (a - s)[:, 1] - d[1] * (a - s)[:, 0]) / L
    i = int(np.argmax(dist))
    if dist[i] > eps:
        return np.vstack([rdp(a[: i + 1], eps)[:-1], rdp(a[i:], eps)])
    return np.vstack([s, a[-1]])


def r1(v):
    s = f"{round(float(v), 1):.1f}"
    return s[:-2] if s.endswith(".0") else s


def main(src):
    lines = [rdp(smooth(st)) for st in trace(src)]
    length = lambda a: float(np.hypot(*np.diff(a, axis=0).T).sum()) if len(a) > 1 else 0.0
    anchors = [np.array(pts, dtype=float) for _, _, pts in PARTS]

    # Each stroke goes to the part whose anchors its points lie closest to on
    # average; specks shorter than the line is wide (junction leftovers) are
    # dropped.
    members = [[] for _ in PARTS]
    for line in lines:
        if length(line) < 6:
            continue
        dist = [np.hypot(*(line[:, None, :] - a[None, :, :]).transpose(2, 0, 1)).min(axis=1).mean() for a in anchors]
        members[int(np.argmin(dist))].append(line)

    birds = {}
    for (bird, role, _), parts in zip(PARTS, members):
        if bird != "drop":
            birds.setdefault(bird, {}).setdefault(role, []).extend(parts)
    boxes = {}
    for bird, roles in birds.items():
        allp = np.vstack([q for parts in roles.values() for q in parts])
        boxes[bird] = (allp.min(axis=0) - 3, allp.max(axis=0) + 3)

    lo = np.min([b[0] for b in boxes.values()], axis=0)
    hi = np.max([b[1] for b in boxes.values()], axis=0)
    W, H = hi - lo

    def d_of(parts, a):
        return " ".join(
            "M" + " ".join((("L" if k == 1 else "") + f"{r1(x - a[0])} {r1(y - a[1])}") for k, (x, y) in enumerate(p))
            for p in parts
        )

    out = [
        f'<svg class="flock" viewBox="0 0 {r1(W)} {r1(H)}" aria-hidden="true" focusable="false" '
        'fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">'
    ]
    for bird, roles in birds.items():
        a, _ = boxes[bird]
        cx, cy, sweep, side = FLAP[bird]  # sweep: degrees up and down
        wx = np.concatenate([q[:, 0] for q in roles["wing"]])
        span = max(cx - wx.min(), wx.max() - cx)
        flap = f"{r1(cx - a[0])} {r1(cy - a[1])} {r1(span)} {sweep} {side}"
        paths = "".join(
            f'<path class="{role}" d="{d_of(roles[role], a)}" vector-effect="non-scaling-stroke"/>'
            for role in ("still", "wing") if roles.get(role)
        )
        # outer <g> places the bird; site.js flies the inner one with the scroll
        out.append(
            f'  <g transform="translate({r1(a[0] - lo[0])} {r1(a[1] - lo[1])})">'
            f'<g class="bird bird-{bird}" data-bird="{bird}" data-heading="{HEADING[bird]}" data-flap="{flap}">{paths}</g></g>'
        )
    out.append("</svg>")

    for rel in TARGETS:
        page = ROOT / rel
        if not page.exists():
            continue
        html = page.read_text()
        new, n = re.subn(
            r"([ \t]*)<!-- birds -->[\s\S]*?<!-- /birds -->",
            lambda m: "\n".join([f"{m.group(1)}<!-- birds -->", *(m.group(1) + l for l in out), f"{m.group(1)}<!-- /birds -->"]),
            html,
        )
        if not n:
            sys.exit(f"No <!-- birds --> markers in {rel}")
        page.write_text(new)
    print(f"birds: {len(birds)}  strokes: {sum(len(m) for m in members)}  bytes: {len(chr(10).join(out))}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "RossMcCampbell65.png")
