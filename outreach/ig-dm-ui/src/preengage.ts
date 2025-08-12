// src/preengage.ts
import type { Page, ElementHandle } from "puppeteer";

// Predicate réseau large (variantes d'URL possibles côté IG)
const isLikeResponse = (r: any) =>
  r.request().method() === "POST" &&
  (r.url().includes("/web/likes/") || r.url().includes("/api/v1/web/likes/"));

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

/**
 * Pré-engagement profil IG : jusqu'à 2 likes "safe" sur les posts récents.
 * - Jamais si déjà liké
 * - Sync réseau via waitForResponse() (preuve d'action)
 * - Aucune dépendance aux classes obfusquées
 *
 * @param page Puppeteer Page
 * @param username Cible IG (sans @)
 * @param opts Options (probas, dwell, maxLikes)
 */
export async function preEngageTwoLikes(
  page: Page,
  username: string,
  opts?: {
    dwellMs?: [number, number];   // pause de lecture profil
    maxLikes?: number;            // par défaut 2
  }
) {
  const dwell = opts?.dwellMs ?? [3500, 9000];
  const maxLikes = Math.max(0, Math.min(opts?.maxLikes ?? 2, 2)); // cap à 2

  console.log(`[PreEngage] Starting 2-likes for ${username} (max: ${maxLikes})`);

  // 1) Aller sur le profil
  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: "networkidle2",
    timeout: 30_000
  });

  // 2) Dwell "humain" (lecture profil)
  const dwellTime = rand(dwell[0], dwell[1]);
  console.log(`[PreEngage] Reading profile for ${Math.round(dwellTime/1000)}s...`);
  await new Promise((r) => setTimeout(r, dwellTime));

  // 3) Récupère les premiers posts (grid : posts & reels)
  const POST_LINK = 'a[href*="/p/"], a[href*="/reel/"]';
  await page.waitForSelector(POST_LINK, { visible: true, timeout: 15_000 });
  
  const links = await page.evaluate((selector) => {
    const elements = document.querySelectorAll(selector);
    return Array.from(elements)
      .slice(0, 8) // on limite la fenêtre de candidats
      .map((a) => (a as HTMLAnchorElement).href)
      .filter(Boolean);
  }, POST_LINK);

  console.log(`[PreEngage] Found ${links.length} posts to evaluate`);

  let liked = 0;

  for (const href of links) {
    if (liked >= maxLikes) break;

    console.log(`[PreEngage] Checking post ${liked + 1}/${maxLikes}...`);

    try {
      // Ouvre le post (IG ouvre généralement un modal overlay)
      const openPromise = page.waitForNavigation({ 
        waitUntil: "networkidle2", 
        timeout: 8_000 
      }).catch(() => null);
      
      await page.evaluate((url) => {
        const a = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'))
          .find((n) => (n as HTMLAnchorElement).href === url) as HTMLAnchorElement | undefined;
        if (a) {
          a.click();
        } else {
          window.location.assign(url);
        }
      }, href);
      
      await openPromise; // si pas de nav, on reste en modal
      
      // Petite pause pour que le modal se charge
      await new Promise(r => setTimeout(r, rand(800, 1500)));

      // Cherche une icône "Unlike" (déjà liké ?)
      const UNLIKE_ICON = 'svg[aria-label*="Unlike" i]';
      const LIKE_ICON   = 'svg[aria-label*="Like" i]';

      const already = await page.$(UNLIKE_ICON);
      if (already) {
        console.log(`[PreEngage] Post already liked, skipping...`);
        // Ferme modal si présent (sinon on restera sur la page post)
        await page.keyboard.press("Escape").catch(() => {});
        continue;
      }

      // 4) Armer la preuve réseau AVANT le clic (bonne pratique Puppeteer)
      const waitLike = page.waitForResponse(isLikeResponse, { timeout: 15_000 });

      // 5) Click sur le bouton Like (parent du svg "Like")
      const likeButtons: ElementHandle[] = await page.$x(
        '//button[.//svg[contains(@aria-label,"Like") or contains(@aria-label,"J\'aime")]]'
      );
      
      if (likeButtons[0]) {
        await likeButtons[0].click({ delay: rand(30, 90) });

        // 6) Attends la réponse réseau OU le toggle UI → "Unlike"
        const uiToggle = page.waitForSelector(UNLIKE_ICON, { 
          visible: true, 
          timeout: 5_000 
        }).catch(() => null);
        
        const result = await Promise.race([
          waitLike.catch(() => null), 
          uiToggle
        ]);

        if (result) {
          liked += 1;
          console.log(`[PreEngage] ✅ Liked post ${liked}/${maxLikes}`);
        } else {
          console.log(`[PreEngage] ⚠️ Like action uncertain, continuing...`);
        }
      } else {
        console.log(`[PreEngage] Like button not found, skipping...`);
      }

      // 7) Ferme le modal si ouvert (Escape), petite pause
      await page.keyboard.press("Escape").catch(() => {});
      await new Promise((r) => setTimeout(r, rand(600, 1200)));

    } catch (error) {
      console.warn(`[PreEngage] Error on post: ${error.message}`);
      // Essaye de fermer le modal et continuer
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  console.log(`[PreEngage] Completed: ${liked}/${maxLikes} likes for ${username}`);
  return liked; // nombre de likes réellement effectués (0..2)
}