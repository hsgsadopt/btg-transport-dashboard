export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

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
    const results = [];

    for (const org of orgs) {
      const html = await fetch(org.url).then(r => r.text());

      const linkRe = /href="(\/(dog|cat)\/[^"]+)"/g;
      const seen = new Set();
      let m;

      while ((m = linkRe.exec(html)) !== null) {
        const path = m[1];
        if (seen.has(path)) continue;
        seen.add(path);

        results.push({
          shelter_id: org.id,
          shelter_name: org.name,
          species: path.startsWith("/cat/") ? "Cat" : "Dog",
          profile_url: "https://www.petfinder.com" + path,
          name: "View Pet"
        });
      }
    }

    res.status(200).json({
      updated_at: updatedAt,
      pets: results
    });

  } catch (err) {
    res.status(500).json({ error: "Something went wrong" });
  }
}
