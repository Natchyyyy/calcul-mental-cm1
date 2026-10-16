# Met les sons dans une page HTML (un seul fichier, marche même hors ligne / en file://) : bloc <script type="text/plain" id="sons-data">.
# usage : python3 integrer.py sons_out page.html      (remplace le bloc s'il existe déjà, sinon l'ajoute avant </body> ou à la fin)
import sys, os, json, base64, re
d, page = sys.argv[1], sys.argv[2]; man = json.load(open(os.path.join(d, "manifeste.json")))
data = {k: [base64.b64encode(open(os.path.join(d, f), "rb").read()).decode() for f in v] for k, v in sorted(man.items())}
blk = '<!--SONS--><script type="text/plain" id="sons-data">' + json.dumps(data, separators=(",", ":")) + '</script><!--/SONS-->\n'
s = open(page, encoding="utf-8").read()
if "<!--SONS-->" in s: s = re.sub(r"<!--SONS-->.*?<!--/SONS-->\n", lambda m: blk, s, count=1, flags=re.S)
elif "</body>" in s: s = s.replace("</body>", blk + "</body>", 1)
else: s += "\n" + blk
open(page, "w", encoding="utf-8").write(s); print(page, len(data), "sons,", round(len(blk)/1024), "Ko ajoutés")
