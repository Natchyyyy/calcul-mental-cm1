# Assemble plusieurs captures en une planche (pour tout regarder d'un coup).
# usage : python3 planche.py sortie.png colonnes largeur_case image1.png image2.png …
import sys
from PIL import Image
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); ims = [Image.open(f).convert("RGB") for f in sys.argv[4:]]
h = int(w*ims[0].height/ims[0].width); rows = (len(ims) + cols - 1)//cols
m = Image.new("RGB", (cols*w, rows*h), (12, 10, 8))
for i, im in enumerate(ims): im = im.resize((w, h)); m.paste(im, ((i % cols)*w, (i//cols)*h))
m.save(out); print(out, m.size)
