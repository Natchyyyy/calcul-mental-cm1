# Tests navigateur (Playwright) des deux pages : python3 tests/verif_pages.py   (après python3 construire.py)
# atelier.html : tir, terrain, armes, lieux, vrai/synthèse, explosion ; exemple_seul.html : tirs, rafale, pompe, grenade,
# le Worker prépare bien les variantes, un ennemi lointain se fait entendre, aucune erreur JS.
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
                await pg.click("#bTir"); await pg.wait_for_timeout(500); check("un tir se joue et se dessine", "−50" in await pg.inner_text("#info"), await pg.inner_text("#info"))
                n = await pg.evaluate("document.querySelectorAll('#presets button').length"); check("au moins 10 armes", n >= 10, n)
                for i in range(n): await pg.locator("#presets button").nth(i).click(); await pg.wait_for_timeout(40)
                m = await pg.evaluate("document.querySelectorAll('#lieux button').length"); check("10 lieux", m == 10, m)
                for i in range(m): await pg.locator("#lieux button").nth(i).click(); await pg.wait_for_timeout(40)
                await pg.locator("#presets button[data-nom=\"Fusil d'assaut 5,56\"]").click(); await pg.locator("#lieux button").nth(0).click()
                await pg.locator("#terrain").scroll_into_view_if_needed(); box = await pg.locator("#terrain").bounding_box(); await pg.mouse.click(box["x"] + box["width"] * 0.85, box["y"] + box["height"] * 0.75); await pg.wait_for_timeout(500)
                f = await pg.inner_text("#fiche"); check("devant le canon, la fiche annonce le claquement en avance", "avant le coup" in f, f)
                await pg.mouse.click(box["x"] + box["width"] * 0.1, box["y"] + box["height"] * 0.8); await pg.wait_for_timeout(400)
                f = await pg.inner_text("#fiche"); check("derrière le tireur : pas de claquement", "avant le coup" not in f, f)
                await pg.click("#bMoi"); await pg.wait_for_timeout(300); check("« c'est moi qui tire »", "toi qui tires" in await pg.inner_text("#fiche"))
                await pg.click("#bRafale"); await pg.wait_for_timeout(800); await pg.click("#bAction"); await pg.wait_for_timeout(300)
                k = await pg.evaluate("document.querySelectorAll('#vs button').length"); check("vrai / synthèse : au moins 8 boutons", k >= 8, k)
                for i in range(k): await pg.locator("#vs button").nth(i).click(); await pg.wait_for_timeout(120)
                await pg.locator("#presets button[data-nom='Grenade à main']").click(); await pg.wait_for_timeout(500)
                hid = await pg.evaluate("[...document.querySelectorAll('#reglages details')].filter(d => !d.hidden).map(d => d.querySelector('h2').textContent).join(',')")
                check("grenade : réglages de balle cachés, ceux d'explosion visibles", "Explosion" in hid and "Balle" not in hid, hid)
                check("grenade : la fiche donne le souffle (kPa)", "kPa" in await pg.inner_text("#fiche"), await pg.inner_text("#fiche"))
                await pg.evaluate("(e => (e.value = 1, e.dispatchEvent(new Event('input')), 0))(document.getElementById('p-charge'))")
                check("le JSON des réglages se met à jour", '"charge":1' in await pg.input_value("#json"), await pg.input_value("#json"))
                await pg.set_viewport_size({"width": 390, "height": 860}); await pg.wait_for_timeout(300)
                sw = await pg.evaluate("document.documentElement.scrollWidth"); check("téléphone : pas de défilement horizontal", sw <= 390, sw)
            else:
                await pg.click("#bTir"); await pg.wait_for_timeout(300); check("le joueur tire", "Pan" in await pg.inner_text("#etat"), await pg.inner_text("#etat"))
                r = await pg.evaluate("(async () => { await armes.charger(\"Fusil d'assaut 7,62×39\", { distances: [150], angles: [15] }); return armes.tirer(\"Fusil d'assaut 7,62×39\", { distance: 140, angle: 20 }); })()")
                check("un ennemi à 140 m se fait entendre (variantes prêtes dans le Worker)", r is True, r)
                await pg.click("#bRafale"); await pg.wait_for_timeout(300); check("rafale", "Rafale" in await pg.inner_text("#etat"), await pg.inner_text("#etat"))
                r = await pg.evaluate("armes.action('Fusil à pompe 12', 'pompe')"); check("la pompe", r is True, r)
                await pg.click("#bGrenade"); await pg.wait_for_timeout(600)
                r = await pg.evaluate("(async () => { armes.lieu('Intérieur — couloir'); await armes.charger('Pistolet 9 mm'); return armes.tirer('Pistolet 9 mm'); })()"); check("changer de lieu puis tirer", r is True, r)
                try: await pg.evaluate("armes.tirer('Arme qui n’existe pas')"); bad = False
                except Exception as e: bad = "possibles" in str(e)
                check("arme inconnue : message clair avec la liste", bad)
            check(page + " : aucune erreur JS", not errs, errs[:5])
            await pg.screenshot(path=os.path.join(H, "tests", "verif_" + page.replace(".html", ".png")))
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close(); sys.exit(0 if ok == tot else 1)
asyncio.run(main())
