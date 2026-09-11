/**
 * Cover art shown when a tournament has no picture, or when its picture fails
 * to load (for example an expired storage link). Keeping these per game means
 * a broken image still looks intentional instead of showing a random photo.
 */
export const GAME_COVERS: Record<string, string> = {
  fifa: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=70",
  cod: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?auto=format&fit=crop&w=1200&q=70",
  pubg: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=70",
  fortnite:
    "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=1200&q=70",
  apex: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=1200&q=70",
  valorant:
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=70",
  other:
    "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=70",
};

export function gameCover(game?: string | null): string {
  return GAME_COVERS[game ?? "other"] ?? GAME_COVERS.other;
}
