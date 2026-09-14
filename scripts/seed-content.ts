/**
 * Seeds functional demo content into a GameFlex database.
 *
 * Usage:
 *   PROD_SUPABASE_URL=... PROD_SUPABASE_SERVICE_ROLE_KEY=... bun scripts/seed-content.ts [posts]
 *
 * Idempotent: seed accounts are reused when they already exist, and the script
 * tops the feed up to the requested number of seeded posts instead of adding
 * duplicates. It never touches or deletes real user data.
 */
const URL_BASE = (process.env["PROD_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "").replace(
  /\/+$/,
  "",
);
const KEY =
  process.env["PROD_SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
if (!URL_BASE || !KEY) throw new Error("Missing database URL or service key");

const TARGET_POSTS = Number(process.argv[2] ?? 150);
const SEED_TAG = "gameflex-seed";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "content-type": "application/json",
};

async function rest<T>(path: string, init?: RequestInit & { prefer?: string }): Promise<T> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init?.prefer ? { Prefer: init.prefer } : {}), ...init?.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

const GAMES = ["fifa", "cod", "pubg", "fortnite", "apex", "valorant"] as const;

const CREATORS = [
  ["kelvin_ke", "Kelvin Mwangi", "FIFA sniper from Nairobi. Pro Clubs every night.", "fifa"],
  ["shanty254", "Shantel Achieng", "Valorant duelist. Radiant grind in progress.", "valorant"],
  ["brianzedd", "Brian Otieno", "CODM sniper main. Clips only.", "cod"],
  ["nairobi_nate", "Nathan Kimani", "PUBG chicken dinners and squad IGL.", "pubg"],
  ["queen_apex", "Faith Wanjiru", "Apex Wraith. Kenyan ranked ladder.", "apex"],
  ["mkeka_gaming", "Dennis Kariuki", "Fortnite builds, edits and boxfight coaching.", "fortnite"],
  ["coast_clutch", "Amina Hassan", "Mombasa based. FIFA and Valorant.", "valorant"],
  ["thika_thunder", "Peter Njoroge", "CODM tournament grinder.", "cod"],
  ["eldo_eagle", "Sharon Chebet", "PUBG mobile sniper. Eldoret squad captain.", "pubg"],
  ["ke_apexking", "Victor Omondi", "Apex Predator. Coaching DMs open.", "apex"],
  ["gamer_gracie", "Grace Njeri", "Casual FIFA, competitive trash talk.", "fifa"],
  ["254_flick", "Samuel Mutua", "Fortnite arena. Zero build enjoyer.", "fortnite"],
] as const;

const CAPTIONS = [
  "Last-minute winner in the 94th. Still shaking 😮‍💨",
  "1v4 clutch to close the set. Squad kept the comms clean.",
  "Chicken dinner number 7 tonight. Zone luck finally paid off.",
  "New sensitivity settings feel unreal. Headshots are free now.",
  "Grinded from Gold to Platinum in one weekend. Sleep is optional.",
  "Tournament bracket run starts tomorrow — who's watching?",
  "This drag flick was too clean not to post.",
  "Squad wipe on final circle. Best round of the month.",
  "Went 28-4 and my teammates still blamed the ping 😭",
  "Coaching session paid off, first ranked win of the season.",
  "New controller day. Thumbsticks feel like butter.",
  "Anyone else running Kenya servers tonight? Lobby is stacked.",
  "Prize money hit the wallet. GameFlex payouts are quick.",
  "Custom lobby with the squad — chaos from start to finish.",
  "Ranked reset hurt but we climbing again.",
  "Streaming the qualifiers at 8pm. Link in bio.",
  "One tap after one tap. Aim trainer works, trust me.",
  "Team just qualified for the weekend final 🔥",
  "Underrated loadout that carried my whole season.",
  "Rate this play out of 10. Be honest.",
];

const COMMENTS = [
  "Insane clip 🔥",
  "Teach me that setup",
  "Clean. What sensitivity?",
  "We need you in our squad",
  "Bro is cracked",
  "Watching the qualifiers for sure",
  "This is the play of the week",
  "Ping looks smooth, which server?",
  "Congrats champ 🏆",
  "Add me, let's run customs",
];

function pick<T>(list: readonly T[], i: number): T {
  return list[i % list.length]!;
}

async function ensureCreators() {
  const ids: { id: string; username: string; game: string }[] = [];

  for (const [username, fullName, bio, game] of CREATORS) {
    const email = `${username}@seed.gameflex.co.ke`;
    let userId: string | undefined;

    const created = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email,
        password: `Seed!${username}2026`,
        email_confirm: true,
        user_metadata: { username, full_name: fullName, seed: SEED_TAG },
      }),
    });
    if (created.ok) {
      userId = ((await created.json()) as { id: string }).id;
    } else {
      const list = (await fetch(
        `${URL_BASE}/auth/v1/admin/users?page=1&per_page=200`,
        { headers },
      ).then((r) => r.json())) as { users?: { id: string; email: string }[] };
      userId = list.users?.find((u) => u.email?.toLowerCase() === email)?.id;
    }
    if (!userId) {
      console.warn(`skipped creator ${username}`);
      continue;
    }

    await rest("profiles", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({
        user_id: userId,
        username,
        full_name: fullName,
        email,
        bio,
        game_handle: username,
        avatar_url: `https://api.dicebear.com/9.x/adventurer/svg?seed=${username}`,
        platform: "mobile",
        favorite_genres: [],
      }),
    }).catch(async () => {
      await rest(`profiles?user_id=eq.${userId}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: JSON.stringify({ full_name: fullName, bio, game_handle: username }),
      }).catch(() => undefined);
    });

    ids.push({ id: userId, username, game });
  }
  return ids;
}

async function hasColumn(table: string, column: string) {
  try {
    await rest(`${table}?select=${column}&limit=1`);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Seeding into ${URL_BASE}`);
  const creators = await ensureCreators();
  if (!creators.length) throw new Error("No seed creators available");
  console.log(`creators ready: ${creators.length}`);

  const supportsGallery = await hasColumn("user_statuses", "media_urls");
  const existing = await rest<{ id: string }[]>(
    `user_statuses?select=id&user_id=in.(${creators.map((c) => c.id).join(",")})`,
  );
  const missing = Math.max(0, TARGET_POSTS - existing.length);
  console.log(`existing seeded posts: ${existing.length}; creating ${missing}`);

  const now = Date.now();
  const posts: Record<string, unknown>[] = [];
  for (let i = 0; i < missing; i++) {
    const creator = creators[i % creators.length]!;
    const gallery = i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1;
    const urls = Array.from(
      { length: gallery },
      (_, n) => `https://picsum.photos/seed/gf-${i}-${n}/1080/1080`,
    );
    posts.push({
      user_id: creator.id,
      content: `${pick(CAPTIONS, i)} #${creator.game}`,
      media_url: urls[0],
      ...(supportsGallery ? { media_urls: urls } : {}),
      media_type: "image",
      post_type: "status",
      game: creator.game,
      tags: [creator.game, "gameflex"],
      created_at: new Date(now - (i + 1) * 37 * 60 * 1000).toISOString(),
    });
  }

  const created: { id: string; user_id: string }[] = [];
  for (let i = 0; i < posts.length; i += 25) {
    const chunk = posts.slice(i, i + 25);
    const rows = await rest<{ id: string; user_id: string }[]>("user_statuses", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify(chunk),
    });
    created.push(...rows);
    console.log(`posts inserted: ${created.length}/${posts.length}`);
  }

  const allPosts = [...existing.map((p) => ({ id: p.id, user_id: "" })), ...created];

  // Likes: every creator likes a spread of posts (unique per pair).
  const likes: Record<string, unknown>[] = [];
  allPosts.forEach((post, index) => {
    creators.forEach((creator, c) => {
      if ((index + c) % 3 === 0 && creator.id !== post.user_id) {
        likes.push({ status_id: post.id, user_id: creator.id });
      }
    });
  });
  for (let i = 0; i < likes.length; i += 200) {
    await rest("status_likes", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: JSON.stringify(likes.slice(i, i + 200)),
    }).catch((e) => console.warn("likes chunk skipped", String(e).slice(0, 120)));
  }
  console.log(`likes: ${likes.length}`);

  // Comments on the newest posts.
  const comments = created.slice(0, 60).flatMap((post, i) => {
    const author = creators[(i + 3) % creators.length]!;
    return author.id === post.user_id
      ? []
      : [{ status_id: post.id, user_id: author.id, content: pick(COMMENTS, i), is_encrypted: false }];
  });
  if (comments.length) {
    await rest("status_comments", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify(comments),
    }).catch((e) => console.warn("comments skipped", String(e).slice(0, 120)));
  }
  console.log(`comments: ${comments.length}`);

  // Follow graph so the Following feed and suggestions have substance.
  const follows: Record<string, unknown>[] = [];
  creators.forEach((a, i) =>
    creators.forEach((b, j) => {
      if (i !== j && (i + j) % 2 === 0) {
        follows.push({ follower_id: a.id, following_id: b.id });
      }
    }),
  );
  await rest("user_follows", {
    method: "POST",
    prefer: "resolution=ignore-duplicates,return=minimal",
    body: JSON.stringify(follows),
  }).catch((e) => console.warn("follows skipped", String(e).slice(0, 120)));
  console.log(`follows: ${follows.length}`);

  // A few open tournaments so the competitive side is not empty.
  const tournaments = GAMES.map((game, i) => ({
    title: `${game.toUpperCase()} Weekly Cup #${i + 1}`,
    description: `Open ${game.toUpperCase()} tournament for Kenyan players. Single elimination, best of three.`,
    game,
    format: "single_elimination",
    status: "registration_open",
    entry_fee: [0, 50, 100, 150][i % 4],
    prize_pool: [1000, 2500, 5000, 7500][i % 4],
    max_participants: 32,
    start_date: new Date(now + (i + 2) * 86400000).toISOString(),
    registration_deadline: new Date(now + (i + 1) * 86400000).toISOString(),
    rules: "Fair play enforced. Screenshots required for every result.",
    created_by: creators[0]!.id,
  }));
  const existingTournaments = await rest<{ id: string }[]>(
    "tournaments?select=id&status=eq.registration_open&limit=1",
  );
  if (!existingTournaments.length) {
    await rest("tournaments", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify(tournaments),
    }).catch((e) => console.warn("tournaments skipped", String(e).slice(0, 120)));
    console.log(`tournaments: ${tournaments.length}`);
  }

  console.log("done");
}

await main();
