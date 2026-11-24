"""
4x AI upscaler for the cut-out exercise frames (Real-ESRGAN general v3,
SRVGGNetCompact), run through ONNX Runtime so it needs no PyTorch.

  python upscale.py realesr-general-x4v3.pth in_dir out_dir [target_scale]

Reads RGBA PNGs from cutout.py. The colour goes through the network; alpha
is resized smoothly. Output is resized from 4x down to target_scale (default 2).
"""
import sys, os, glob, zipfile, pickle, io
import numpy as np, cv2, onnx, onnxruntime as ort
from onnx import helper, TensorProto, numpy_helper

pth, src, dst = sys.argv[1:4]
TARGET = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
os.makedirs(dst, exist_ok=True)

# --- read a PyTorch zip checkpoint without torch --------------------------
z = zipfile.ZipFile(pth); root = z.namelist()[0].split('/')[0]
class Storage:
    def __init__(self, key, dtype): self.key, self.dtype = key, dtype
def rebuild(storage, offset, size, stride, *a):
    buf = np.frombuffer(z.read(f'{root}/data/{storage.key}'), storage.dtype)
    n = int(np.prod(size)) if size else 1
    return np.lib.stride_tricks.as_strided(buf[offset:], shape=tuple(size), strides=tuple(s * buf.itemsize for s in stride)).copy() if size else buf[offset:offset + 1].copy()
class U(pickle.Unpickler):
    def find_class(self, mod, name):
        if name == '_rebuild_tensor_v2': return rebuild
        if name == 'OrderedDict': import collections; return collections.OrderedDict
        if name.endswith('Storage'): return {'FloatStorage': np.float32, 'HalfStorage': np.float16}.get(name, np.float32)
        return super().find_class(mod, name)
    def persistent_load(self, pid):
        _, dtype, key, _, _ = pid
        return Storage(key, dtype)
sd = U(io.BytesIO(z.read(f'{root}/data.pkl'))).load()
sd = sd.get('params', sd)

# --- build the SRVGGNetCompact graph ----------------------------------------
nodes, inits = [], []
def W(name, arr): inits.append(numpy_helper.from_array(arr.astype(np.float32), name)); return name
idx = sorted({int(k.split('.')[1]) for k in sd})
x = 'x'; i = 0
for n in idx:
    w = sd[f'body.{n}.weight']
    if w.ndim == 4:
        out = f'c{n}'
        nodes.append(helper.make_node('Conv', [x, W(f'w{n}', w), W(f'b{n}', sd[f'body.{n}.bias'])], [out], pads=[1, 1, 1, 1]))
    else:
        out = f'p{n}'
        nodes.append(helper.make_node('PRelu', [x, W(f's{n}', w.reshape(-1, 1, 1))], [out]))
    x = out
nodes.append(helper.make_node('DepthToSpace', [x], ['ps'], blocksize=4, mode='CRD'))
nodes.append(helper.make_node('Resize', ['x', '', W('sc', np.array([1, 1, 4, 4], np.float32))], ['base'], mode='nearest'))
nodes.append(helper.make_node('Add', ['ps', 'base'], ['y']))
g = helper.make_graph(nodes, 'srvgg', [helper.make_tensor_value_info('x', TensorProto.FLOAT, [1, 3, None, None])],
                      [helper.make_tensor_value_info('y', TensorProto.FLOAT, [1, 3, None, None])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)])
so = ort.SessionOptions(); so.intra_op_num_threads = os.cpu_count()
sess = ort.InferenceSession(m.SerializeToString(), so, providers=['CPUExecutionProvider'])

def up(rgb):
    t = (rgb.astype(np.float32) / 255).transpose(2, 0, 1)[None]
    y = sess.run(None, {'x': t})[0][0].transpose(1, 2, 0)
    return np.clip(y * 255, 0, 255)

files = sorted(glob.glob(os.path.join(src, 'f_*.png')))
files = files or sorted(glob.glob(os.path.join(src, '*.png')))
for k, f in enumerate(files):
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED)
    if im.ndim == 3 and im.shape[2] == 3:  # plain frame (white background): upscale as is
        h, w = im.shape[:2]
        big = up(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))
        big = cv2.resize(big, (int(w * TARGET), int(h * TARGET)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(os.path.join(dst, os.path.basename(f)), cv2.cvtColor(big.astype(np.uint8), cv2.COLOR_RGB2BGR))
        if k % 25 == 0: print(k, len(files), flush=True)
        continue
    rgba = cv2.cvtColor(im, cv2.COLOR_BGRA2RGBA)
    h, w = rgba.shape[:2]
    a = rgba[..., 3:4].astype(np.float32) / 255
    # composite on black so the network never sees transparent junk colour
    big = up((rgba[..., :3] * a).astype(np.uint8))
    tw, th = int(w * TARGET), int(h * TARGET)
    big = cv2.resize(big, (tw, th), interpolation=cv2.INTER_AREA)
    al = cv2.resize(rgba[..., 3], (tw, th), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    col = big / np.clip(al[..., None] / 255, 1e-3, 1)  # back to straight alpha
    out = np.dstack([np.clip(col, 0, 255), al]).astype(np.uint8)
    cv2.imwrite(os.path.join(dst, os.path.basename(f)), cv2.cvtColor(out, cv2.COLOR_RGBA2BGRA))
    if k % 25 == 0: print(k, len(files), flush=True)
import shutil
if os.path.exists(os.path.join(src, 'box.json')): shutil.copy(os.path.join(src, 'box.json'), os.path.join(dst, 'box.json'))
