import { siteConfig } from "@/config/site";

/**
 * Lobby overflow helpers.
 *
 * A tournament hosts a fixed number of players per lobby. Once a lobby is full,
 * additional registrations overflow into the next lobby (#1, #2, #3 ...). Slots
 * inside each lobby are numbered too, so a player can be told exactly where
 * they play: "Lobby #2 • Slot #3".
 */

export interface LobbyTournamentLike {
  lobby_size?: number | null;
  max_participants?: number | null;
  current_participants?: number | null;
}

export interface LobbySlot<T> {
  /** 1-based lobby number. */
  lobby: number;
  /** 1-based slot number inside the lobby. */
  slot: number;
  /** 1-based overall queue position. */
  position: number;
  entry: T;
}

export interface Lobby<T> {
  number: number;
  label: string;
  capacity: number;
  slots: LobbySlot<T>[];
  isFull: boolean;
}

/** Players per lobby for a tournament. */
export function lobbySize(tournament: LobbyTournamentLike | null | undefined): number {
  const explicit = Number(tournament?.lobby_size ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const max = Number(tournament?.max_participants ?? 0);
  const fallback = siteConfig.defaultLobbySize > 0 ? siteConfig.defaultLobbySize : 16;
  if (Number.isFinite(max) && max > 0) return Math.min(Math.floor(max), fallback);
  return fallback;
}

/** How many lobbies are needed for the current registration count. */
export function lobbyCount(tournament: LobbyTournamentLike | null | undefined): number {
  const size = lobbySize(tournament);
  const registered = Math.max(Number(tournament?.current_participants ?? 0) || 0, 0);
  return Math.max(1, Math.ceil(registered / size));
}

/** Total lobbies the tournament is planned to run at full capacity. */
export function plannedLobbyCount(tournament: LobbyTournamentLike | null | undefined): number {
  const size = lobbySize(tournament);
  const max = Math.max(Number(tournament?.max_participants ?? 0) || 0, 0);
  return Math.max(lobbyCount(tournament), max > 0 ? Math.ceil(max / size) : 1);
}

export function lobbyLabel(lobbyNumber: number): string {
  return `Lobby #${lobbyNumber}`;
}

/**
 * Split an ordered list of entries (registrations, players, squads) into
 * numbered lobbies. Entries should already be ordered by join time.
 */
export function buildLobbies<T>(
  entries: readonly T[],
  tournament: LobbyTournamentLike | null | undefined,
): Lobby<T>[] {
  const size = lobbySize(tournament);
  const lobbies: Lobby<T>[] = [];

  entries.forEach((entry, index) => {
    const lobbyNumber = Math.floor(index / size) + 1;
    const slot = (index % size) + 1;
    let lobby = lobbies[lobbyNumber - 1];
    if (!lobby) {
      lobby = {
        number: lobbyNumber,
        label: lobbyLabel(lobbyNumber),
        capacity: size,
        slots: [],
        isFull: false,
      };
      lobbies[lobbyNumber - 1] = lobby;
    }
    lobby.slots.push({ lobby: lobbyNumber, slot, position: index + 1, entry });
  });

  for (const lobby of lobbies) lobby.isFull = lobby.slots.length >= lobby.capacity;
  return lobbies;
}

/** Find the lobby/slot for a single entry by predicate. */
export function findLobbySlot<T>(
  lobbies: readonly Lobby<T>[],
  match: (entry: T) => boolean,
): LobbySlot<T> | null {
  for (const lobby of lobbies) {
    const found = lobby.slots.find((s) => match(s.entry));
    if (found) return found;
  }
  return null;
}
