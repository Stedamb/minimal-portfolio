/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {},
    colors: {
      primary: "var(--primary)",
      secondary: "var(--secondary)",
      tertiary: "var(--tertiary)",
      text: "var(--text)",
      background: "var(--background)",
      accent: "var(--accent)",
      shadow: "var(--shadow)",
    },
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      "2xl-max": { max: "1535px" },
      "xl-max": { max: "1279px" },
      "lg-max": { max: "1023px" },
      "md-max": { max: "767px" },
      "sm-max": { max: "639px" },
    },
  },
  plugins: [],
};
