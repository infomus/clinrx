/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        mist: "#f5f7f4",
        leaf: "#1d6b57",
        coral: "#b85f4d",
        gold: "#c59435",
      },
    },
  },
  plugins: [],
};
