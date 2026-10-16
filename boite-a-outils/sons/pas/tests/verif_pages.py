# Tests navigateur (Playwright) des deux pages : python3 tests/verif_pages.py   (après python3 construire.py)
# atelier.html : boutons, réglages tout prêts, vrais enregistrements, curseurs de la pièce ; exemple_seul.html : marcher, courir,
# changer de pièce, le Worker prépare bien les pas, aucune erreur JS.
import asyncio, os, sys
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ok = tot = 0
def check(nom, cond, info=""):
    global ok, tot; tot += 1; ok += bool(cond); print(("PASS " if cond else "FAIL ") + nom + ("" if cond else f"  -> {info}"), flush=True)
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for page in ("atelier.html", "exemple_seul.html"):
            pg = await br.new_page(viewport={"width": 1200, "height": 900}); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            await pg.goto("file://" + os.path.join(H, page)); await pg.wait_for_timeout(700)
            if page == "atelier.html":
                await pg.click("#bUn"); await pg.wait_for_timeout(400); check("un pas se joue et se dessine", "MS" in (await pg.inner_text("#info")).upper())
                await pg.click("#plancher", position={"x": 100, "y": 30}); await pg.click("#bMarche"); await pg.wait_for_timeout(900)
                n = await pg.evaluate("document.querySelectorAll('#presets button').length"); check("25 réglages tout prêts", n == 25, n)
                for i in range(n): await pg.locator("#presets button").nth(i).click(); await pg.wait_for_timeout(60)
                await pg.click("[data-vrai=kretopi]"); await pg.click("[data-vrai=kenney]"); await pg.click("[data-vrai=inspectorj]"); await pg.click("[data-synth='Cave en béton, talons']"); await pg.click("[data-synth='Vieux plancher massif']"); await pg.wait_for_timeout(400)
                for k in ("longueur", "absorption", "distance", "durete", "essence"):
                    await pg.evaluate(f"(e => (e.value = e.max, e.dispatchEvent(new Event('input')), 0))(document.getElementById('p-{k}'))")
                await pg.click("#bBoucle"); await pg.wait_for_timeout(1500); await pg.click("#bBoucle")
                check("la fiche physique s'affiche", "ms" in await pg.inner_text("#fiche"))
                check("le JSON des réglages se met à jour", '"durete":1' in await pg.input_value("#json"))
                await pg.locator("#presets button[data-nom='Béton, chaussures de ville']").click(); await pg.wait_for_timeout(400)
                cache = await pg.evaluate("document.getElementById('p-essence').closest('.sl').hidden")
                check("en béton, les curseurs du bois sont cachés", cache is True, cache)
                check("en béton, la fiche donne la résonance de la chaussure", "chaussure" in await pg.inner_text("#fiche"), await pg.inner_text("#fiche"))
            else:
                await pg.click("#bSon"); await pg.wait_for_timeout(1500)
                await pg.keyboard.down("d"); await pg.wait_for_timeout(3000); await pg.keyboard.up("d")
                p1 = await pg.evaluate("DEMO.pas"); check("on entend ses pas en marchant", p1 >= 4, p1)
                await pg.keyboard.down("Shift"); await pg.keyboard.down("d"); await pg.wait_for_timeout(3000); await pg.keyboard.up("d"); await pg.keyboard.up("Shift")
                z = await pg.inner_text("#hZone"); check("on arrive dans la taverne en courant", z == "Taverne", z)
                check("l'écho a changé avec la pièce", (await pg.inner_text("#hEcho")).startswith("1,"), await pg.inner_text("#hEcho"))
                await pg.evaluate("(DEMO.joueur.x = 16, DEMO.joueur.y = 9.4, 0)"); await pg.keyboard.down("s"); await pg.wait_for_timeout(1800); await pg.keyboard.up("s")
                z = await pg.inner_text("#hZone"); check("on descend dans la cave en béton", z == "Cave en béton", z)
                check("le sol est du béton", "Béton" in await pg.inner_text("#hSol"))
                r = await pg.evaluate("(async () => { const s = SonsDePas.creer({ ac: DEMO_AC(), surface: 'Pieds nus' }); await s.pret; return s.pourPromenade()({ cote: -1, course: true, force: .5 }); })()".replace("DEMO_AC()", "new AudioContext()"))
                check("branchement promenade : pourPromenade() joue un pas", r is True, r)
                d = await pg.evaluate("(async () => { const s = SonsDePas.creer({ ac: new AudioContext(), reglages: { depart: 'Parquet en chêne', changements: { durete: .5 } } }); await s.pret; return s.reglages().durete + ' ' + (s.reglages().essence === Pas.preset('Parquet en chêne').essence); })()")
                check("réglages copiés depuis l'atelier acceptés", d == "0.5 true", d)
            check(page + " : aucune erreur JS", not errs, errs[:5])
            await pg.screenshot(path=os.path.join(H, "tests", "verif_" + page.replace(".html", ".png")))
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close(); sys.exit(0 if ok == tot else 1)
asyncio.run(main())
