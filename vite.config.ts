/**
 * Build configuration.
 *
 * The project builds in two environments and must not depend on either one:
 *
 *  1. Inside the Lovable sandbox, `@lovable.dev/vite-tanstack-config` is used
 *     (it wires TanStack Start, React, Tailwind, tsconfig paths, nitro, env
 *     injection and the sandbox dev-server settings).
 *  2. Anywhere else (Dokploy, Docker, a VPS, CI) the same plugin set is
 *     assembled here directly, so a plain `bun install && bun run build`
 *     produces a self-contained Node server with no vendor-specific package.
 *
 * The server target is environment driven: SERVER_PRESET (or NITRO_PRESET)
 * selects the nitro preset and defaults to `node-server` for self-hosting.
 */
import type { UserConfig } from "vite";

const SELF_HOST_PRESET = process.env["SERVER_PRESET"] ?? process.env["NITRO_PRESET"] ?? "node-server";

/** TanStack Start options shared by both paths (src/server.ts is our SSR wrapper). */
const START_OPTIONS = { server: { entry: "server" } } as const;

type ConfigEnv = { command: string; mode: string };

async function lovableConfig(env: ConfigEnv): Promise<UserConfig | null> {
  // STANDALONE=1 forces the portable path, useful to verify a self-hosted build.
  if (process.env["STANDALONE"] === "1") return null;
  try {
    const mod = await import("@lovable.dev/vite-tanstack-config");
    const cfg = mod.defineConfig({ tanstackStart: START_OPTIONS }) as unknown;
    // The wrapper may return a config object or a config factory.
    const resolved = typeof cfg === "function" ? await (cfg as (e: ConfigEnv) => unknown)(env) : cfg;
    return (resolved ?? null) as UserConfig | null;
  } catch {
    // Package not installed (self-hosted build) — fall through to the portable config.
    return null;
  }
}

async function standaloneConfig(command: string): Promise<UserConfig> {
  const [{ tanstackStart }, react, tailwindcss, tsConfigPaths] = await Promise.all([
    import("@tanstack/react-start/plugin/vite"),
    import("@vitejs/plugin-react").then((m) => m.default),
    import("@tailwindcss/vite").then((m) => m.default),
    import("vite-tsconfig-paths").then((m) => m.default),
  ]);

  const plugins = [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(START_OPTIONS),
    react(),
  ];

  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        preset: SELF_HOST_PRESET,
        output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
      }),
    );
  }

  return {
    plugins,
    server: {
      host: process.env["HOST"] ?? "0.0.0.0",
      port: Number(process.env["PORT"] ?? 8080),
    },
    build: { sourcemap: false },
  };
}

export default async (env: ConfigEnv): Promise<UserConfig> =>
  (await lovableConfig(env)) ?? (await standaloneConfig(env.command));
