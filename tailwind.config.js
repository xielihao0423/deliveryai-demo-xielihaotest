/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f4f6',
          100: '#e5e7eb',
          200: '#d1d5db',
          300: '#9ca3af',
          400: '#6b7280',
          500: '#4b5563',
          600: '#374151',
          700: '#1f2937',
          800: '#111827',
          900: '#030712',
        },
        success: { 50: '#dcfce7', 100: '#bbf7d0', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
        warning: { 50: '#fef3c7', 100: '#fde68a', 500: '#f59e0b', 600: '#d97706', 700: '#92400e' },
        danger: { 50: '#fee2e2', 100: '#fecaca', 500: '#ef4444', 600: '#dc2626', 700: '#991b1b' },
        info: { 50: '#dbeafe', 100: '#bfdbfe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['Fira Code', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'slide-in': 'slideIn 0.2s cubic-bezier(0.2, 0, 0, 1) both',
        'fade-in': 'fadeIn 0.15s ease-out both',
      },
      keyframes: {
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
