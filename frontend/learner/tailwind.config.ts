import type { Config } from 'tailwindcss'
import lmsPreset from '../shared/tailwind-preset'

const config: Config = {
  presets: [lmsPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Learner-specific overrides go here (if any)
    },
  },
  plugins: [],
}

export default config
