// netlify/functions/pets.js

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  return await r.text();
}

function extractNextDataJson(html) {
  const startTag = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(startTag);
  if (start === -1) return null;
  const from = start + startTag.length;
  const end = html.indexOf("</script>", from);
  if (end === -1) return null;
  const jsonText = html.slice(from, end).trim();
  try { return JSON.parse(jsonText); } catch { return null; }
}

// Walk any nested JSON and collect “animal-like” objects
function collectAnimals(obj, out) {
  if (!obj || typeof obj !== "object") return;

  // Common Petfinder fields we can key off of
  const name = obj.name;
  const species = obj.species;
  const url = obj.url || obj.seoUrl || obj.detailsUrl || obj.profileUrl;

  // Photo candidates
  const photo =
    obj.primary_photo_cropped?.full ||
    obj.primaryPhotoCropped?.full ||
    obj.primary_photo_cropped?.large ||
    obj.primaryPhotoCropped?.large ||
    obj.photos?.[0]?.full ||
    obj.photos?.[0]?.large ||
    obj.photos?.[0]?.medium ||
    obj.media?.photos?.[0]?.full ||
    obj.media?.photos?.[0]?.large ||
    obj.media?.photos?.[0]?.medium ||
    null;

  const looksLikePet =
    typeof name === "string" &&
    (species === "Dog" || species === "Cat") &&
    typeof url === "string" &&
    (url.startsWith("/dog/") || url.startsWith("/cat/") || url.includes("petfinder.com/"));

  if (looksLikePet) {
    out.push({ name, species, url, photo });
  }

  if (Array.isArray(obj)) {
    for (const v of obj) collectAnimals(v, out);
  } else {
    for (const k of Object.keys(obj)) collectAnimals(obj[k], out);
  }
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

  try {
    const updatedAt = new Date().toISOString();
    const resultsByUrl = new Map();

    for (const org of orgs) {
      const html = await fetchText(org.url);
      const nextData = extractNextDataJson(html);

      const found = [];
      if (nextData) {
        collectAnimals(nextData, found);
      }

      // Dedupe + normalize URLs
      for (const item of found) {
        const profileUrl = item.url.startsWith("http")
          ? item.url
          : ("https://www.petfinder.com" + item.url);

        resultsByUrl.set(profileUrl, {
          shelter_id: org.id,
          shelter_name: org.name,
          name: item.name || "View pet",
          species: item.species || "",
          photo: item.photo || null,
          profile_url: profileUrl
        });
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
