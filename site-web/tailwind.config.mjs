import { type Config } from 'tailwindcss';

/**
 * Tailwind CSS configuration for the OFM Social OS site.
 *
 * The content array tells Tailwind where to find class names so that unused
 * styles can be purged from the final build. We include the `app` and
 * `components` directories because the Next.js App Router places pages and
 * reusable components there. You can add additional paths if you create
 * more directories containing Tailwind classes.
 */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        secondary: '#1e293b',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
} satisfies Config;