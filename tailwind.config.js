/* Tailwind config for the compiled build (standalone CLI v3.4.17 — see
   tools/build_css.md). Colors resolve through the CSS custom properties
   defined in css/input.css, which hold bare RGB triplets so opacity
   modifiers like text-asfa-text/60 keep working. Light and dark values
   both live in input.css; this file never needs to change for a retheme. */
module.exports = {
  content: ['./*.html', './js/*.js'],
  theme: {
    extend: {
      colors: {
        asfa: {
          bg1: 'rgb(var(--paper) / <alpha-value>)',
          bg2: 'rgb(var(--panel) / <alpha-value>)',
          text: 'rgb(var(--ink) / <alpha-value>)',
          green: 'rgb(var(--green) / <alpha-value>)',
          greenHover: 'rgb(var(--green-hi) / <alpha-value>)',
          accent: 'rgb(var(--rust) / <alpha-value>)',
          accentHover: 'rgb(var(--rust-hi) / <alpha-value>)',
          border: 'rgb(var(--line) / <alpha-value>)',
          navy: 'rgb(var(--well) / <alpha-value>)',
          paper: 'rgb(var(--paper) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
};
