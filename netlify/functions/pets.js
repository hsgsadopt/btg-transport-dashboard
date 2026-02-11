exports.handler = async function (event) {
  const orgs = [
    { id: "GA99", name: "Macon-Bibb Animal Welfare", url: "https://www.petfinder.com/member/us/ga/macon/macon-bibb-county-animal-welfare-ga99/" },
    { id: "GA529", name: "Bryan County Animal Services", url: "https://www.petfinder.com/member/us/ga/richmond-hill/bryan-county-animal-services-ga529/" },
    { id: "GA168", name: "Friends of Perry Animal Shelter", url: "https://www.petfinder.com/member/us/ga/perry/friends-of-perry-animal-shelter-ga168/" },
    { id: "GA1109", name: "Lyons Animal Control", url: "https://www.petfinder.com/member/us/ga/lyons/lyons-animal-control-ga1109/" },
    { id: "GA947", name: "Waycross Animal Services", url: "https://www.petfinder.com/member/us/ga/waycross/waycross-animal-services-ga947/" },
    { id: "SC507", name: "Barnwell County Animal Shelter", url: "https://www.petfinder.com/member/us/sc/barnwell/barnwell-county-animal-shelter-sc507/" },
    { id: "GA1063", name: "City of Perry Animal Control", url: "https://www.petfinder.com/member/us/ga/perry/city-of-perry-animal-control-ga1063/" }
  ];

  try {
    const updatedAt = new Date().toISOString();
    const resultsByUrl = new Map();

    for (const org of orgs) {
      const html = await fetch(org.url, {
        headers: { "User-Agent": "Mozilla/5.0" }
      }).then(r => r.text());

      // Dogs + Cats only
      const linkRe = /href="(\/(dog|cat)\/[^"]+)"/g;
      const seen = new Set();
      let m;

      while ((m = linkRe.exec(html)) !== null) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);

        const profileUrl = "https://www.petfinder.com" + path;

        // Grab a window near the link to try to find a name + photo
        const start = Math.max(0, m.index - 700);
        const end = Math.min(html.length, m.index + 1600);
        const chunk = html.slice(start, end);

        const nameMatch =
          chunk.match(/aria-label="([^"]{1,80})"/) ||
          chunk.match(/"name":"([^"]{1,80})"/);

        const imgMatch =
          chunk.match(/src="([^"]+\.(?:jpg|jpeg|png)[^"]*)"/i) ||
          chunk.match(/"url":"([^"]+\.(?:jpg|jpeg|png)[^"]*)"/i);

        const name = (nameMatch?.[1] || "View pet").trim();
        const photo = imgMatch?.[1] || null;
        const species = path.startsWith("/cat/") ? "Cat" : "Dog";

        resultsByUrl.set(profileUrl, {
          shelter_id: org.id,
          shelter_name: org.name,
          name,
          species,
          photo,
          profile_url: profileUrl
        });

        if (seen.size >= 250) break;
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
