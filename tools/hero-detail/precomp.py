import cv2, numpy as np, os, glob
from multiprocessing import Pool
sp = os.path.dirname(os.path.abspath(__file__))
z = np.load(sp + '/precomp.npz'); P = z['P'].astype(np.float32); q = z['q'].astype(np.float32)
os.makedirs(sp + '/enhP', exist_ok=True)
def one(f):
    im = cv2.imread(f)[..., ::-1].astype(np.float32)
    out = np.clip(im @ P.T + q, 0, 255).round().astype(np.uint8)
    cv2.imwrite(sp + '/enhP/' + os.path.basename(f), out[..., ::-1], [cv2.IMWRITE_PNG_COMPRESSION, 1])
if __name__ == '__main__':
    with Pool(6) as p: p.map(one, sorted(glob.glob(sp + '/enh/*.png')))
    print(len(glob.glob(sp + '/enhP/*.png')))
