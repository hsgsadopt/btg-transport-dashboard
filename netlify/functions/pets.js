// netlify/functions/pets.js

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return await r.text();
}

function parseOg(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  return html.match(re)?.[1] || null;
}

async function enrichFromPetPage(profileUrl) {
  const html = await fetchText(profileUrl);

  // These are very stable on Petfinder detail pages
  const ogTitle = parseOg(html, "og:title");   // e.g., "Coco | Petfinder"
  const ogImage = parseOg(html, "og:image");   // correct image for that pet

  const name = ogTitle ? ogTitle.split("|")[0].trim() : "View pet";
  const photo = ogImage || null;

  return { name, photo };
}

exports.handler = async function () {
  const orgs = [
    { id: "GA99", name: "Macon-Bibb Animal Welfare", url: "https://www.petfinder.com/member/us/ga/macon/macon-bibb-county-animal-welfare-ga99/" },
    { id: "GA529", name: "Bryan County Animal Services", url: "https://www.petfinder.com/member/us/ga/richmond-hill/bryan-county-animal-services-ga529/" },
    { id: "GA168", name: "Friends of Perry Animal Shelter", url: "https://www.petfinder.com/member/us/ga/perry/friends-of-perry-animal-shelter-ga168/" },
    { id: "GA1109", name: "Lyons Animal Control", url: "https://www.petfinder.com/member/us/ga/lyons/lyons-animal-control-ga1109/" },
    { id: "GA947", name: "Waycross Animal Services", url: "https://www.petfinder.com/member/us/ga/waycross/waycross-animal-services-ga947/" },
    { id: "GA1063", name: "City of Perry Animal Control", url: "https://www.petfinder.com/member/us/ga/perry/city-of-perry-animal-control-ga1063/" }
  ];

  // Keep this conservative so Netlify doesn't time out
  const MAX_PETS_PER_SHELTER = 80;

  try {
    const updatedAt = new Date().toISOString();
    const resultsByUrl = new Map();

    for (const org of orgs) {
      const html = await fetchText(org.url);

      // Dogs + Cats only
      const linkRe = /href="(\/(dog|cat)\/[^"]+)"/g;

      const seen = new Set();
      let m;

      while ((m = linkRe.exec(html)) !== null) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);

        const profileUrl = "https://www.petfinder.com" + path;
        const species = path.startsWith("/cat/") ? "Cat" : "Dog";

        resultsByUrl.set(profileUrl, {
          shelter_id: org.id,
          shelter_name: org.name,
          species,
          profile_url: profileUrl,
          name: "Loading…",
          photo: null
        });

        if (seen.size >= MAX_PETS_PER_SHELTER) break;
      }
    }

    // Enrich each pet with the *correct* name + photo from its own page.
    // Do it sequentially to avoid rate limits / timeouts. (Caching on Netlify helps a lot.)
    for (const [url, pet] of resultsByUrl.entries()) {
      try {
        const { name, photo } = await enrichFromPetPage(url);
        pet.name = name;
        pet.photo = photo;
        resultsByUrl.set(url, pet);
      } catch {
        // If one pet fails, keep going
      }
    }

    const payload = {
      updated_at: updatedAt,
      pets: Array.from(resultsByUrl.values())
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(payload)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Failed to fetch Petfinder pages", details: String(err) })
    };
  }
};

