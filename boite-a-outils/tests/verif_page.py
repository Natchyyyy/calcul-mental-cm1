# Modèle de test automatique d'une page (Playwright) : on ouvre la page, on agit, on vérifie, on compte les erreurs JS.
# usage : python3 verif_page.py http://127.0.0.1:8765/index.html
# Recopier et compléter la partie « vérifications » pour chaque nouveauté ; relancer tout après chaque changement.
import asyncio, sys
from playwright.async_api import async_playwright
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
ok = tot = 0
def check(nom, cond, info=""):
    global ok, tot; tot += 1; ok += bool(cond); print(("PASS " if cond else "FAIL ") + nom + ("" if cond else f"  -> {info}"), flush=True)
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=GL); pg = await br.new_page(viewport={"width": 1366, "height": 768}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(sys.argv[1]); await pg.wait_for_timeout(1000)
        # ---- vérifications (exemples) ----
        titre = await pg.title(); check("la page a un titre", bool(titre), titre)
        n = await pg.evaluate("() => document.querySelectorAll('canvas').length"); check("la scène 3D est là (un canvas)", n > 0, n)
        son = await pg.evaluate("async () => { if(typeof Son === 'undefined') return 'pas de lecteur'; Son.init(); await Son.charger(); return Son.jouer('clic') }")
        check("les sons se décodent et se jouent", son is True, son)
        await pg.screenshot(path="verif.png")
        # -----------------------------------
        check("aucune erreur JS", not errs, errs[:5])
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close()
asyncio.run(main())
