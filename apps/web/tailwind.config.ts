import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        brand: "#3d4fc4",
        canvas: "#f5f6f8",
        muted: "#727b8c",
      },
      boxShadow: { quiet: "0 8px 28px rgba(25, 34, 58, .055)" },
    },
  },
  plugins: [],
} satisfies Config;
