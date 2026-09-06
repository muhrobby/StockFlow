/** @type {import('tailwindcss').Config} */
export default {
  presets: [
    require('../../packages/shared-styles/tailwind.preset.js')
  ],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
};
