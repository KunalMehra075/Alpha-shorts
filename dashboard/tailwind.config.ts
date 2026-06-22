import type { Config } from 'tailwindcss';

// Strict palette: white / black / red / gray only. All tokens are driven by CSS
// variables defined in src/styles/index.css so the same component code adapts to
// light + dark themes.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        // Red accent ramp (the only non-neutral color in the app)
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        // glossy red button glow
        'red-glow': '0 6px 20px -4px hsl(var(--accent) / 0.55)',
        'red-glow-lg': '0 10px 30px -6px hsl(var(--accent) / 0.6)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        // Used by the centered DialogContent (left/top 50% + translate -50%).
        // The keyframe must keep that centering offset, otherwise the animated
        // transform overrides it and the dialog opens off-center then snaps back.
        'slide-up': {
          from: { opacity: '0', transform: 'translate(-50%, calc(-50% + 6px))' },
          to: { opacity: '1', transform: 'translate(-50%, -50%)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 180ms ease-out'
      }
    }
  },
  plugins: []
} satisfies Config;
