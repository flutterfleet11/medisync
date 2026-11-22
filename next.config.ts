import type { NextConfig } from "next";

// cacheComponents is intentionally disabled: every MediSync screen is
// session-scoped (Supabase auth cookies), so pages render dynamically.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
