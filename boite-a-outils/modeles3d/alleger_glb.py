# Allège un .glb Meshy : textures PNG → JPEG redimensionnées (couleur, relief, métal/rugosité). La géométrie ne change pas.
import json, struct, io, sys
from PIL import Image
def repack(src, dst, sizes=(1024, 1024, 512), q=(88, 92, 90)):
    b = open(src, "rb").read(); n = struct.unpack("<I", b[12:16])[0]; j = json.loads(b[20:20+n])
    bin0 = 20 + n + 8; blen = struct.unpack("<I", b[20+n:24+n])[0]; B = b[bin0:bin0+blen]
    mat = j["materials"][0]; roles = {}
    pbr = mat.get("pbrMetallicRoughness", {})
    if "baseColorTexture" in pbr: roles[j["textures"][pbr["baseColorTexture"]["index"]]["source"]] = 0
    if "normalTexture" in mat: roles[j["textures"][mat["normalTexture"]["index"]]["source"]] = 1
    if "metallicRoughnessTexture" in pbr: roles[j["textures"][pbr["metallicRoughnessTexture"]["index"]]["source"]] = 2
    chunks = []; views = []
    def add(data):
        off = sum(len(c) for c in chunks); pad = (-len(data)) % 4; chunks.append(data + b"\0"*pad); return off, len(data)
    # recopie des vues non-image
    img_views = {im["bufferView"]: k for k, im in enumerate(j["images"])}
    newviews = []
    for vi, v in enumerate(j["bufferViews"]):
        data = B[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
        if vi in img_views:
            k = img_views[vi]; r = roles.get(k, 0); im = Image.open(io.BytesIO(data)).convert("RGB")
            print("  image", k, "rôle", r, im.size, "→", sizes[r])
            im = im.resize((sizes[r], sizes[r]), Image.LANCZOS); o = io.BytesIO(); im.save(o, "JPEG", quality=q[r], optimize=True); data = o.getvalue()
            j["images"][k]["mimeType"] = "image/jpeg"
        off, ln = add(data); nv = dict(v); nv["byteOffset"] = off; nv["byteLength"] = ln; newviews.append(nv)
    j["bufferViews"] = newviews; binb = b"".join(chunks); j["buffers"] = [{"byteLength": len(binb)}]
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((-len(js)) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binb), 0x004E4942) + binb
    open(dst, "wb").write(out); print(dst, len(out))
repack(sys.argv[1], sys.argv[2], tuple(int(x) for x in sys.argv[3].split(",")) if len(sys.argv) > 3 else (1024, 1024, 512))
