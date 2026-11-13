import type { Config } from "tailwindcss";
const config: Config = { content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { ink: "#101827", muted: "#758094", accent: "#e5a84b" } } }, plugins: [] };
export default config;
