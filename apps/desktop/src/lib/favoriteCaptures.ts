import { useCallback, useState } from "react";
import { z } from "zod";

const STORAGE_KEY = "capkit.favoriteCaptures";
const favoritePathsSchema = z.array(z.string());

function readFavorites(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    return new Set(favoritePathsSchema.parse(JSON.parse(raw)));
  } catch {
    // Unreadable or hand-edited storage: start with no favourites rather than failing the page.
    return new Set();
  }
}

function writeFavorites(favorites: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch {
    // Storage full or blocked; the star still works for this session.
  }
}

/** Favourite screenshots, keyed by file path and kept on this device only. */
export function useFavoriteCaptures(): {
  favorites: ReadonlySet<string>;
  toggleFavorite: (path: string) => void;
} {
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(readFavorites);
  const toggleFavorite = useCallback((path: string): void => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      writeFavorites(next);
      return next;
    });
  }, []);
  return { favorites, toggleFavorite };
}
