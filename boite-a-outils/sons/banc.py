# Page d'écoute : un bouton par son (rejouer pour entendre les variantes). À publier comme artifact pour faire écouter.
# usage : python3 banc.py sons_out banc.html ["Titre"]
import sys, os, json, base64
d, out = sys.argv[1], sys.argv[2]; title = sys.argv[3] if len(sys.argv) > 3 else "Banc d'écoute"
man = json.load(open(os.path.join(d, "manifeste.json")))
data = {k: [base64.b64encode(open(os.path.join(d, f), "rb").read()).decode() for f in v] for k, v in man.items()}
html = """<title>__T__</title><meta name="claude:viewport-fit-sides" content="cover">
<style>:root{--bg:#15120e;--fg:#f1e6d4;--mute:#b3a089;--acc:#7fd1a6;--line:#352a1f;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 48px}
main{max-width:760px;margin:0 auto} h1{font:700 1.7rem Georgia,serif;margin:0 0 6px} p{color:var(--mute);margin:0 0 18px}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
button{font:700 .9rem system-ui;border:0;border-radius:999px;padding:8px 16px;background:var(--acc);color:var(--bg);cursor:pointer;min-width:110px}
button:focus-visible{outline:3px solid var(--fg);outline-offset:2px}</style>
<main><h1>__T__</h1><p>Rejoue un son pour entendre ses variantes.</p><div id="l"></div></main>
<script>const DATA = __D__; let ac = null; const B = {}, c = {};
async function play(k, b){ ac = ac || new AudioContext(); await ac.resume(); const n = DATA[k].length, i = (c[k] = ((c[k] ?? -1) + 1)) % n;
  const id = k + i; if(!B[id]) B[id] = await ac.decodeAudioData(Uint8Array.from(atob(DATA[k][i]), x => x.charCodeAt(0)).buffer);
  const s = ac.createBufferSource(); s.buffer = B[id]; s.connect(ac.destination); s.start(); b.textContent = n > 1 ? `Écouter ${i + 1}/${n}` : "Écouter"; }
const L = document.getElementById("l"); Object.keys(DATA).forEach(k => { const r = document.createElement("div"); r.className = "row";
  r.innerHTML = `<b></b><button type="button">Écouter</button>`; r.querySelector("b").textContent = k; const b = r.querySelector("button"); b.onclick = () => play(k, b); L.appendChild(r); });
</script>"""
open(out, "w", encoding="utf-8").write(html.replace("__T__", title).replace("__D__", json.dumps(data))); print(out, round(os.path.getsize(out)/1024), "Ko")
