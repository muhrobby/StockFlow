const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [
    require('../../packages/shared-styles/tailwind.preset.js')
  ],
  content: {
    relative: true,
    files: [
      "./index.html",
      "./js/**/*.js",
      "../../packages/*/*.js",
      "../../packages/*/src/**/*.{js,ts}"
    ],
  },
  theme: {
    extend: {},
  },
  plugins: [
    require("tailwindcss-animate"),
  ],
};
