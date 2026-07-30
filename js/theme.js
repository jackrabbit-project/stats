/* Tailwind CDN configuration, loaded immediately after the CDN script so every
   page shares one palette. Colours follow the field/coursing theme: warm
   off-white paper, sage panels, deep green chrome, rust accent. */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        asfa: {
          bg1: '#F7F5EF',        // Page background (warm off-white)
          bg2: '#E8EFEA',        // Panel background (light sage)
          text: '#2F2F2F',       // Body text (soft charcoal)
          green: '#2C6E49',      // Headings, nav band
          greenHover: '#1F4C33',
          accent: '#A44A2F',     // Accent (warm rust)
          accentHover: '#7A3422',
          border: '#D6DCD7',     // Dividers (soft gray-green)
          navy: '#1B3041',       // Footer
        },
      },
      fontFamily: {
        abel: ['Abel', 'sans-serif'],
      },
    },
  },
};
