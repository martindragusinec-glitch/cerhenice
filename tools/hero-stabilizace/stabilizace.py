# Jen stabilizace původního videa (bez AI zvětšení): každý snímek se dorovná o zlomky pixelu na hladkou dráhu kamery.
# Jediné převzorkování (Lanczos) rovnou do 1920×1080, aby dorovnání nestálo ostrost. Barvy dorovnané na původní video v prohlížeči.
import cv2, numpy as np, os, sys
sp = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(sp)
SIGMA = float(sys.argv[1]) if len(sys.argv) > 1 else 8.0; OW, OH = 1920, 1080
Hs = np.load(sp + '/H-orig.npy'); n = len(Hs) + 1; W0, H0 = 1280, 720
P = np.array([[160, 335], [1120, 335], [1120, 700], [160, 700]], np.float64); R = int(np.ceil(3 * SIGMA))
def apply(T, pts):
    q = np.c_[pts, np.ones(len(pts))] @ T.T; return q[:, :2] / q[:, 2:3]
Wk = []; corr = []
for k in range(n):
    js, traj = [k], [P.copy()]; T = np.eye(3)
    for j in range(k, min(n - 1, k + R)): T = Hs[j] @ T; js.append(j + 1); traj.append(apply(T, P))
    T = np.eye(3)
    for j in range(k - 1, max(-1, k - R - 1), -1): T = np.linalg.inv(Hs[j]) @ T; js.append(j); traj.append(apply(T, P))
    js = np.array(js, float) - k; traj = np.array(traj)
    w = np.exp(-0.5 * (js / SIGMA) ** 2); X = np.c_[np.ones(len(js)), js, js ** 2]; WX = X * w[:, None]
    Pstar = np.linalg.solve(X.T @ WX, WX.T @ traj.reshape(len(js), -1))[0].reshape(4, 2)
    Wk.append(cv2.getPerspectiveTransform(P.astype(np.float32), Pstar.astype(np.float32)).astype(np.float64)); corr.append(np.abs(Pstar - P).max())
corners = np.array([[0, 0], [W0, 0], [W0, H0], [0, H0]], float); c = np.array([W0 / 2, H0 / 2]); need = 1.0
for T in Wk:
    q = apply(T, corners) - c; need = max(need, (W0 / 2) / np.abs(q[:, 0]).min(), (H0 / 2) / np.abs(q[:, 1]).min())
Z = need * 1.002
print(f'sigma {SIGMA:g}: největší dorovnání {max(corr):.2f} px, průměr {np.mean(corr):.2f} px | ořez {((Z - 1) * 100):.2f} %', flush=True)
z = np.load(root + '/precomp.npz'); Pc = z['P'].astype(np.float32); qc = z['q'].astype(np.float32)
Zm = np.array([[Z, 0, c[0] * (1 - Z)], [0, Z, c[1] * (1 - Z)], [0, 0, 1]]); S = np.diag([OW / W0, OH / H0, 1.0])
out = sp + '/st3'; os.makedirs(out, exist_ok=True)
cap = cv2.VideoCapture(root + '/orig.mp4'); i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    w = cv2.warpPerspective(f, S @ Zm @ Wk[i], (OW, OH), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    rgb = np.clip(w[..., ::-1].astype(np.float32) @ Pc.T + qc, 0, 255).round().astype(np.uint8)
    cv2.imwrite(f'{out}/{i + 1:05d}.png', rgb[..., ::-1], [cv2.IMWRITE_PNG_COMPRESSION, 1]); i += 1
print('vykresleno', i)
