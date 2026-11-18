# Lepší kvalita obrazu: světlo a barvy z nového (přesvětleného) videa 720p,
# jemný detail z původního 4K záběru z dronu (133032), zarovnaný snímek po snímku.
import cv2, numpy as np, os, sys
sp = os.path.dirname(os.path.abspath(__file__))
AI = "/Users/martinwork/Downloads/Agent Video - Transform the lighting to an early summer sunset_ golden hour a low warm sun just abov.mp4"
SRC = "/Users/martinwork/Downloads/zasilka-WRSFU8JSRMBM9SKX/dji_fly_20261011_133032_314_1791718538469_video.mov"
OW, OH = 2560, 1440
SRC0, RATIO, SRC_LAST = 358, 29.97002997 / 24.0, 585
arg = sys.argv[1] if len(sys.argv) > 1 else 'all'
rng = tuple(int(x) for x in arg.split(':')[1:]) if arg.startswith('range:') else None
only = [int(x) for x in arg.split(',')] if arg != 'all' and not rng else None
outdir = sp + ('/enh-test' if only else '/enh'); os.makedirs(outdir, exist_ok=True)

clahe = cv2.createCLAHE(3.0, (8, 8))
sift = cv2.SIFT_create(8000, contrastThreshold=0.02)
bf = cv2.BFMatcher()
gmask = np.zeros((720, 1280), np.uint8); gmask[int(720 * 0.37):, :] = 255
def feats(im1280):
    return sift.detectAndCompute(clahe.apply(cv2.cvtColor(im1280, cv2.COLOR_BGR2GRAY)), gmask)
def homography(fs, fa):
    (ks, ds), (ka, da) = fs, fa
    m = [a for a, b in bf.knnMatch(ds, da, k=2) if a.distance < 0.75 * b.distance]
    if len(m) < 30: return None, 0
    A = np.float32([ks[x.queryIdx].pt for x in m]); B = np.float32([ka[x.trainIdx].pt for x in m])
    H, mask = cv2.findHomography(A, B, cv2.USAC_MAGSAC, 1.5, maxIters=5000, confidence=0.999)
    return H, int(mask.sum()) if mask is not None else 0
luma = lambda im: im[..., 0] * 0.0722 + im[..., 1] * 0.7152 + im[..., 2] * 0.2126
G = lambda x, s: cv2.GaussianBlur(x, (0, 0), s)
S_in = np.diag([1 / 3.0, 1 / 3.0, 1.0]); S_out = np.diag([2.0, 2.0, 1.0])

cap_a = cv2.VideoCapture(AI); cap_s = cv2.VideoCapture(SRC); cap_s2 = cv2.VideoCapture(SRC)
BACK = 150
yy = np.linspace(0, 1, OH, dtype=np.float32)[:, None]
si = -1; sframe = None; si2 = -1; sframe2 = None; k = -1; lastH = [None, None]; stats = []
def layer(src4k, H, au, Ya, lowA, bA, eA):
    M = S_out @ H @ S_in
    sw = cv2.warpPerspective(src4k, M, (OW, OH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    valid = cv2.warpPerspective(np.full(src4k.shape[:2], 255, np.uint8), M, (OW, OH), flags=cv2.INTER_LINEAR).astype(np.float32) / 255.0
    valid = np.clip(G(valid, 24) * 2 - 1, 0, 1)          # měkký okraj pokrytí
    Ys = luma(sw); lowS = G(Ys, SIG); hpS = Ys - lowS
    bS = G(Ys, 2.5) - G(Ys, 9)
    eS, eAS = G(bS * bS, W), G(bA * bS, W)
    ncc = eAS / np.sqrt(eA * eS + 1e-3)
    conf = np.clip((ncc - 0.10) / 0.30, 0, 1); conf = conf * conf * (3 - 2 * conf)
    g_con = np.sqrt((eA + 0.5) / (eS + 0.5)); g_lum = (lowA + 6) / (lowS + 6)
    gain = np.clip(np.clip(g_con, 0.3, 2.5) ** 0.35 * np.clip(g_lum, 0.2, 2.5) ** 0.65, 0.2, 2.2)
    gain = G(gain, 6); d = gain * hpS
    # osamocené výrazné tvary (sloupy, stožáry), které v novém videu na tom místě nejsou: nepřenášet, jinak by se zdvojily
    bSg = gain * bS
    z = G(np.abs(d), 1.5) / (np.sqrt(G(d * d, 40)) + 1.0)
    mis = G(np.abs(bSg - bA), 2) / (G(np.abs(bSg), 2) + G(np.abs(bA), 2) + 1.0)
    ghost = np.clip((z - 1.6) / 1.2, 0, 1) * np.clip((mis - 0.35) / 0.3, 0, 1)
    keep = 1 - np.clip(G(ghost, 3) * 2.2, 0, 1)
    return conf * valid * keep, d, sw
SIG, W = 4.0, 21
while True:
    ok, a = cap_a.read()
    if not ok: break
    k += 1
    j = min(SRC_LAST, int(round(SRC0 + k * RATIO))); j2 = max(0, j - BACK)
    while si < j:
        ok2, f = cap_s.read()
        if not ok2: break
        si += 1; sframe = f
    while si2 < j2:
        ok2, f = cap_s2.read()
        if not ok2: break
        si2 += 1; sframe2 = f
    if only and k not in only: continue
    if rng and not (rng[0] <= k < rng[1]): continue
    fa = feats(a)
    fs1 = feats(cv2.resize(sframe, (1280, 720), interpolation=cv2.INTER_AREA)); fs2 = feats(cv2.resize(sframe2, (1280, 720), interpolation=cv2.INTER_AREA))
    H1, inl = homography(fs1, fa)
    if H1 is None or inl < 40: H1 = lastH[0]
    H2, inl2 = homography(fs2, fa)
    if H2 is None or inl2 < 60:
        H21, n21 = homography(fs2, fs1); H2 = H1 @ H21 if H21 is not None else lastH[1]
    lastH = [H1, H2]
    au = cv2.resize(a, (OW, OH), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    Ya = luma(au); lowA = G(Ya, SIG); hpA = Ya - lowA
    bA = G(Ya, 2.5) - G(Ya, 9); eA = G(bA * bA, W)
    c1, d1, sw1 = layer(sframe, H1, au, Ya, lowA, bA, eA)
    c2, d2, sw2 = layer(sframe2, H2, au, Ya, lowA, bA, eA)
    # obloha: nic nepřenášet (původní záběr má mraky, nové video čisté nebe)
    prof = G(Ya, 20).mean(axis=1); gy = np.diff(G(prof[:, None], 6)[:, 0]); hz = int(np.argmin(gy[int(OH * 0.2):int(OH * 0.6)]) + OH * 0.2)
    ground = np.clip((yy * OH - (hz - 14)) / 22.0, 0, 1)
    c1 = np.minimum(G(c1, 8), G(c1, 2) + 0.15) * ground; c2 = np.minimum(G(c2, 8), G(c2, 2) + 0.15) * ground
    w1, w2 = c1 ** 3 + 1e-6, (c2 ** 3) * (1 - c1) ** 2 + 1e-6   # starší snímek jen tam, kam aktuální nedosáhne
    det = (w1 * d1 + w2 * d2) / (w1 + w2); conf = np.maximum(c1, c2)
    Yo = lowA + conf * det + (1 - conf) * hpA * 1.25
    r = np.clip((Yo + 2) / (Ya + 2), 0.55, 1.9)[..., None]
    out = np.clip(au * r, 0, 255).astype(np.uint8)
    stats.append((k, j, inl, inl2, float(conf.mean()), hz))
    if only:
        cv2.imwrite(f'{outdir}/k{k:03d}-enh.png', out); cv2.imwrite(f'{outdir}/k{k:03d}-ai.png', au.astype(np.uint8))
        cv2.imwrite(f'{outdir}/k{k:03d}-conf.jpg', (np.dstack([c2, conf, c1]) * 255).astype(np.uint8))
        print(k, 'src', j, j2, 'inliers', inl, inl2, 'conf mean %.2f' % conf.mean(), 'horizon', hz, flush=True)
    else:
        cv2.imwrite(f'{outdir}/{k + 1:05d}.png', out, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        if k % 10 == 0: print(k, 'src', j, j2, 'inliers', inl, inl2, 'conf %.2f' % conf.mean(), flush=True)
np.save(outdir + f'/stats-{rng[0] if rng else 0}.npy', np.array(stats))
print('done', len(stats), 'min inliers', min(s[2] for s in stats), min(s[3] for s in stats))
