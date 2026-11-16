import { registerRussian } from './locale'

/**
 * Loads the Russian words chunk (`lib/ru.ts`) and registers it. Called by `main.tsx` on a Russian
 * page before the first render; an English page never calls it, so it never fetches the chunk.
 * (The shared modules both chunks use are grouped in `vite.config.ts`, which says why.)
 */
export function loadRussian(): Promise<void> {
  return import('./ru').then((m) => registerRussian(m.RU_PACK))
}
