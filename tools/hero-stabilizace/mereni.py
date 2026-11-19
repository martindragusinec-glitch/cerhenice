# Přesnější měření: pohyb mezi snímky jako homografie (rovina země viděná šikmo), spolehlivost ověřená dvěma nezávislými polovinami bodů.
import cv2, numpy as np, os, sys
sp = os.path.dirname(os.path.abspath(__file__)); SRC = sys.argv[1]; tag = sys.argv[2]
W0, H0 = 1280, 720
import glob
g = []
if os.path.isdir(SRC):
    for fn in sorted(glob.glob(SRC + '/*.png')): g.append(cv2.resize(cv2.imread(fn, cv2.IMREAD_GRAYSCALE), (W0, H0), interpolation=cv2.INTER_AREA))
else:
    cap = cv2.VideoCapture(SRC)
    while True:
        ok, f = cap.read()
        if not ok: break
        g.append(cv2.cvtColor(cv2.resize(f, (W0, H0), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY))
mask = np.zeros((H0, W0), np.uint8); mask[290:, :] = 255
probes = np.array([[x, y] for y in (330, 450, 570, 690) for x in (80, 453, 827, 1200)], np.float32).reshape(-1, 1, 2)
rng = np.random.default_rng(1)
def fit(p, q):
    H, m = cv2.findHomography(p, q, cv2.RANSAC, 1.0, maxIters=4000, confidence=0.999)
    return H, int(m.sum())
Hs, d_all, d_a, d_b, ninl = [], [], [], [], []
for i in range(1, len(g)):
    p = cv2.goodFeaturesToTrack(g[i - 1], 4000, 0.003, 6, mask=mask)
    q, st, _ = cv2.calcOpticalFlowPyrLK(g[i - 1], g[i], p, None, winSize=(31, 31), maxLevel=3)
    back, st2, _ = cv2.calcOpticalFlowPyrLK(g[i], g[i - 1], q, None, winSize=(31, 31), maxLevel=3)
    ok = (st[:, 0] == 1) & (st2[:, 0] == 1) & (np.abs(back - p).reshape(-1, 2).max(1) < 0.5)
    p, q = p[ok], q[ok]
    H, n = fit(p, q); Hs.append(H); ninl.append(n)
    idx = rng.permutation(len(p)); a, b = idx[: len(p) // 2], idx[len(p) // 2:]
    Ha, _ = fit(p[a], q[a]); Hb, _ = fit(p[b], q[b])
    d_all.append((cv2.perspectiveTransform(probes, H) - probes).reshape(-1, 2)); d_a.append((cv2.perspectiveTransform(probes, Ha) - probes).reshape(-1, 2)); d_b.append((cv2.perspectiveTransform(probes, Hb) - probes).reshape(-1, 2))
Hs = np.array(Hs); d = np.array(d_all); da = np.array(d_a); db = np.array(d_b)
np.save(sp + f'/H-{tag}.npy', Hs)
k = np.exp(-0.5 * (np.arange(-20, 21) / 6.0) ** 2); k /= k.sum()
hf = lambda v: v - np.convolve(np.pad(v, 20, mode='edge'), k, 'valid')
print(f'{tag}: {len(g)} snímků, shod medián {int(np.median(ninl))}')
print('  spolehlivost měření (rozdíl dvou polovin bodů v kontrolních místech): RMS %.3f px' % np.sqrt(((da - db) ** 2).sum(-1).mean()))
speed = np.hypot(d[..., 0], d[..., 1])                                  # rychlost pohybu v 16 kontrolních místech
jx = np.array([hf(d[:, j, 0]) for j in range(16)]); jy = np.array([hf(d[:, j, 1]) for j in range(16)])
j = np.hypot(jx, jy)
print('  průměrný pohyb na snímek v řadách shora dolů (px):', ' '.join('%.2f' % speed[:, r * 4:(r + 1) * 4].mean() for r in range(4)))
print('  nerovnoměrnost pohybu (odchylka od hladkého průběhu) v řadách: RMS', ' '.join('%.2f' % np.sqrt((j[r * 4:(r + 1) * 4] ** 2).mean()) for r in range(4)), '| max', ' '.join('%.2f' % j[r * 4:(r + 1) * 4].max() for r in range(4)))
m = speed[:, 8:].mean(1); ac = [np.corrcoef(hf(m)[:-l], hf(m)[l:])[0, 1] for l in range(1, 9)]
print('  opakování po 1..8 snímcích (autokorelace nerovnoměrnosti):', ' '.join('%+.2f' % a for a in ac))
print('  rychlost dole, prvních 24 snímků:', ' '.join('%.2f' % v for v in m[:24]))
