export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:         '#0a0c10',
        surface:    '#12151c',
        surface2:   '#1a1e28',
        accent:     '#7c6af7',
        accentAlt:  '#a78bfa',
        success:    '#4ade80',
        danger:     '#f87171',
        warning:    '#fbbf24',
        muted:      '#3d4255',
        text:       '#e8eaf0',
        textDim:    '#8b90a0',
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
        display: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
