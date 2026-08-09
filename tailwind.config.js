/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // 'class' 指定：<html class="dark"> が付いたときだけダークモードになる（自動判定は自前で行う）
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // アクセント1色（藍色）。派手にしないため色数は絞る
        accent: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bcd3ff',
          300: '#8eb6ff',
          400: '#588dff',
          500: '#3366f2',
          600: '#2148d6',
          700: '#1b39ab',
          800: '#1a3288',
          900: '#1b2e6b',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Hiragino Sans"',
          '"Hiragino Kaku Gothic ProN"',
          '"Yu Gothic UI"',
          'Meiryo',
          'sans-serif',
        ],
      },
      transitionDuration: {
        // アニメーションは0.2〜0.3秒に統一
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
};
