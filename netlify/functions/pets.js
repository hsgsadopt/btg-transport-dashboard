// netlify/functions/pets.js

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return await r.text();
}

function getMeta(html, property) {
  // <meta property="og:image" content="...">
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  return html.match(re)?.[1] || null;
}

async function enrichPet(profileUrl) {
  const html = await fetchText(profileUrl);
  const ogTitle = getMeta(html, "og:title"); // "Coco | Petfinder"
  const ogImage = getMeta(html, "og:image"); // correct image for that pet
  const name = ogTitle ? ogTitle.split("|")[0].trim() : "View pet";
  return { name, photo: ogImage || null };
}

// Simple concurrency limiter so we don’t overload Netlify/Petfinder
async function runPool(items, worker, concurrency) {
  const results = [];
  let i = 0;

  async function runner() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = await worker(items[idx]);
      } catch {
        results[idx] = null;
      }
    }
  }

  const runners = Array.from({ length: concurrency }, () => runner());
  await Promise.all(runners);
  return results;
}

exports.handler = async function () {
  const orgs = [
    { id: "GA99",  name: "Macon-Bibb Animal Welfare",        url: "https://www.petfinder.com/member/us/ga/macon/macon-bibb-county-animal-welfare-ga99/" },
    { id: "GA529", name: "Bryan County Animal Services",     url: "https://www.petfinder.com/member/us/ga/richmond-hill/bryan-county-animal-services-ga529/" },
    { id: "GA168", name: "Friends of Perry Animal Shelter",  url: "https://www.petfinder.com/member/us/ga/perry/friends-of-perry-animal-shelter-ga168/" },
    { id: "GA1109",name: "Lyons Animal Control",             url: "https://www.petfinder.com/member/us/ga/lyons/lyons-animal-control-ga1109/" },
    { id: "GA947", name: "Waycross Animal Services",         url: "https://www.petfinder.com/member/us/ga/waycross/waycross-animal-services-ga947/" },
    { id: "GA1063",name: "City of Perry Animal Control",     url: "https://www.petfinder.com/member/us/ga/perry/city-of-perry-animal-control-ga1063/" }
  ];

  // Keep this moderate to avoid Netlify timeouts
  const MAX_PETS_PER_SHELTER = 40;   // increase later if it stays fast
  const CONCURRENCY = 6;             // how many pet pages we fetch at once

  try {
    const updatedAt = new Date().toISOString();

    // Step A: collect pet profile URLs (dogs/cats only) from shelter pages
    const collected = [];

    for (const org of orgs) {
      const html = await fetchText(org.url);

      const linkRe = /href="(\/(dog|cat)\/[^"]+)"/g;
      const seen = new Set();
      let m;

      while ((m = linkRe.exec(html)) !== null) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);

        const profileUrl = "https://www.petfinder.com" + path;
        const species = path.startsWith("/cat/") ? "Cat" : "Dog";

        collected.push({
          shelter_id: org.id,
          shelter_name: org.name,
          species,
          profile_url: profileUrl
        });

        if (seen.size >= MAX_PETS_PER_SHELTER) break;
      }
    }

    // Dedup URLs
    const byUrl = new Map();
    for (const p of collected) byUrl.set(p.profile_url, p);
    const pets = Array.from(byUrl.values());

    // Step B: enrich each pet by reading its own page (correct name/photo)
    const enriched = await runPool(
      pets,
      async (p) => {
        const extra = await enrichPet(p.profile_url);
        return { ...p, ...extra };
      },
      CONCURRENCY
    );

    const finalPets = enriched.filter(Boolean);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // Helps Squarespace load faster + reduces repeat calls
        "Cache-Control": "public, max-age=300"
      },
      body: JSON.stringify({ updated_at: updatedAt, pets: finalPets })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to build feed", details: String(err) })
    };
  }
};
