# Tests navigateur (Playwright) : python3 tests/verif_pages.py   (après python3 construire.py)
# atelier.html et exemple_seul.html : les vrais sons se chargent, les tirs se jouent, aucune erreur JS ;
# rendu hors ligne (OfflineAudioContext) avec le vrai lecteur : niveaux cohérents (près > loin, réverbération en dessous du coup).
import asyncio, os, sys
from playwright.async_api import async_playwright
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ok = tot = 0
def check(nom, cond, info=""):
    global ok, tot; tot += 1; ok += bool(cond); print(("PASS " if cond else "FAIL ") + nom + ("" if cond else f"  -> {info}"), flush=True)
RENDU = """async ([nom, lieu, q]) => {
  const ac = new OfflineAudioContext(2, 48000 * 3, 48000), A = SonsDArmes.creer({ ac, lieu, retard: false });
  await A.pret; await A.charger(nom); await A.lieu(lieu); const ok = A.tirer(nom, Object.assign({ quand: 0.02 }, q));
  const b = await ac.startRendering(), x = b.getChannelData(0), e = k => { let s = 0; for (let i = Math.round(k[0] * 48000); i < k[1] * 48000; i++) s += x[i] * x[i]; return 10 * Math.log10(s / ((k[1] - k[0]) * 48000) + 1e-15); };
  let p = 0; for (const v of x) p = Math.max(p, Math.abs(v));
  return { ok, crete: 20 * Math.log10(p + 1e-12), coup: e([0.02, 0.07]), queue: e([0.3, 1.0]) };
}"""
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        for page in ("atelier.html", "exemple_seul.html"):
            pg = await br.new_page(viewport={"width": 1200, "height": 900}); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            await pg.goto("file://" + os.path.join(H, page)); await pg.wait_for_timeout(600)
            if page == "atelier.html":
                n = await pg.evaluate("document.querySelectorAll('#presets button').length"); check("8 armes (dont 2 explosions)", n == 8, n)
                m = await pg.evaluate("document.querySelectorAll('#lieux button').length"); check("10 lieux", m == 10, m)
                await pg.click("#bTir"); await pg.wait_for_timeout(2500); check("le premier tir charge les sons", "prêt" in (await pg.inner_text("#info")).lower(), await pg.inner_text("#info"))
                for i in range(n): await pg.locator("#presets button").nth(i).click(); await pg.wait_for_timeout(700)
                await pg.locator("#presets button").nth(2).click(); await pg.wait_for_timeout(400)
                for i in range(m): await pg.locator("#lieux button").nth(i).click(); await pg.wait_for_timeout(250)
                await pg.locator("#terrain").scroll_into_view_if_needed(); box = await pg.locator("#terrain").bounding_box()
                await pg.mouse.click(box["x"] + box["width"] * 0.85, box["y"] + box["height"] * 0.8); await pg.wait_for_timeout(400)
                f = await pg.inner_text("#fiche"); check("devant le canon (5,56) : la balle claque avant le coup", "claque" in f, f)
                await pg.mouse.click(box["x"] + box["width"] * 0.1, box["y"] + box["height"] * 0.8); await pg.wait_for_timeout(300)
                check("derrière le tireur : pas de claquement", "claque" not in await pg.inner_text("#fiche"))
                k = await pg.evaluate("document.querySelectorAll('#actions button').length"); check("boutons de manipulation", k >= 2, k)
                for i in range(k): await pg.locator("#actions button").nth(i).click(); await pg.wait_for_timeout(150)
                await pg.click("#bRafale"); await pg.wait_for_timeout(600)
                check("le JSON dit ce qu'on écoute", "ecoute" in await pg.input_value("#json"))
                await pg.set_viewport_size({"width": 390, "height": 860}); await pg.wait_for_timeout(300)
                sw = await pg.evaluate("document.documentElement.scrollWidth"); check("téléphone : pas de défilement horizontal", sw <= 390, sw)
            else:
                r = await pg.evaluate(RENDU, ["Fusil d'assaut 5,56", "Stand de tir (plein air)", {}]); check("le joueur tire (rendu hors ligne)", r["ok"] and r["crete"] > -12, r)
                check("au stand, la vraie queue est 20 dB sous le coup", r["queue"] < r["coup"] - 20, r)
                r2 = await pg.evaluate(RENDU, ["Fusil d'assaut 5,56", "Stand de tir (plein air)", {"distance": 150, "angle": 90}]); check("à 150 m, nettement plus faible (≥ 15 dB)", r2["ok"] and r2["crete"] < r["crete"] - 15, (r["crete"], r2["crete"]))
                for lieu in ("Forêt", "Intérieur — couloir", "Village / rue"):
                    r3 = await pg.evaluate(RENDU, ["Pistolet 9 mm", lieu, {}]); check(f"{lieu} : réverbération présente mais sous le coup", r3["ok"] and r3["coup"] - 40 < r3["queue"] < r3["coup"] - 12, r3)
                r4 = await pg.evaluate(RENDU, ["Grenade à main", "Champ ouvert", {"distance": 30}]); check("grenade à 30 m", r4["ok"] and r4["crete"] > -40, r4)
                r5 = await pg.evaluate("(async () => { const A = SonsDArmes.creer({ ac: new OfflineAudioContext(2, 48000, 48000) }); await A.pret; await A.charger('Fusil à pompe 12'); return A.action('Fusil à pompe 12', 'pompe'); })()"); check("la pompe", r5 is True, r5)
                try: await pg.evaluate("(async () => { const A = SonsDArmes.creer({ ac: new OfflineAudioContext(2, 48000, 48000) }); await A.pret; A.tirer('Arme qui n’existe pas'); })()"); bad = False
                except Exception as e: bad = "possibles" in str(e)
                check("arme inconnue : message clair avec la liste", bad)
            check(page + " : aucune erreur JS", not errs, errs[:5])
            await pg.screenshot(path=os.path.join(H, "tests", "verif_" + page.replace(".html", ".png")))
        print(f"\n{ok}/{tot} vérifications réussies"); await br.close(); sys.exit(0 if ok == tot else 1)
asyncio.run(main())
