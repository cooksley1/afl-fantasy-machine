import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Player } from "@shared/schema";

export function usePlayerLookup() {
  const { data: players } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    staleTime: 5 * 60 * 1000,
  });

  const nameToId = useMemo(() => {
    const map = new Map<string, number>();
    if (!players) return map;
    for (const p of players) {
      map.set(p.name.toLowerCase().trim(), p.id);
    }
    return map;
  }, [players]);

  const getPlayerId = (name: string): number | null => {
    return nameToId.get(name.toLowerCase().trim()) ?? null;
  };

  return { getPlayerId, isReady: !!players };
}
