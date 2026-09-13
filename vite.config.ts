import { fileURLToPath } from "node:url";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT ?? 8080);
  const host = env.HOST ?? "0.0.0.0";
  const isBuild = command === "build";

  return {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
    },

    server: {
      port,
      host,
    },

    preview: {
      port,
      host,
    },

    /*
     * IMPORTANT:
     *
     * TanStack Start re-exports createMiddleware/createCsrfMiddleware
     * through @tanstack/start-client-core.
     *
     * Vite/Nitro can otherwise split that re-export chain incorrectly.
     */
    ssr: {
      optimizeDeps: {
        include: ["@tanstack/react-start", "@tanstack/start-client-core"],
      },
    },

    build: {
      sourcemap: false,
      reportCompressedSize: true,
      chunkSizeWarningLimit: 900,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "react-vendor";
            }

            if (id.includes("@tanstack/react-router") || id.includes("@tanstack/react-query")) {
              return "router-vendor";
            }

            if (
              id.includes("@radix-ui") ||
              id.includes("lucide-react") ||
              id.includes("cmdk") ||
              id.includes("vaul") ||
              id.includes("sonner")
            ) {
              return "ui-vendor";
            }

            if (id.includes("@supabase/supabase-js") || id.includes("@supabase/server")) {
              return "supabase-vendor";
            }

            if (id.includes("recharts")) {
              return "chart-vendor";
            }

            if (id.includes("framer-motion")) {
              return "motion-vendor";
            }

            return undefined;
          },
        },
      },
    },

    plugins: [
      tailwindcss(),

      tanstackStart({
        server: {
          entry: "server",
        },
      }),

      viteReact(),

      ...(isBuild
        ? [
            nitro({
              preset: env.NITRO_PRESET ?? "node-server",

              output: {
                dir: env.BUILD_OUTPUT_DIR ?? "dist",
                serverDir: "{{ output.dir }}/server",
                publicDir: "{{ output.dir }}/client",
              },

              cloudflare: {
                nodeCompat: true,
                deployConfig: true,
              },
            }),
          ]
        : []),
    ],
  };
});
