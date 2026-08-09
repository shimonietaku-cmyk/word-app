// Vitest の設定も同じファイルに書けるよう、vitest/config の defineConfig を使う
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のURLは https://<ユーザー名>.github.io/<リポジトリ名>/ になる。
// リポジトリ名を変えたときは、下の 'word-app' を新しいリポジトリ名に書き換えること。
const REPO_NAME = 'word-app';

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'WordClimb 英単語',
        short_name: 'WordClimb',
        description: 'NEW HORIZON 1・2 の英単語を自分のペースで積み上げる学習アプリ',
        lang: 'ja',
        start_url: `/${REPO_NAME}/`,
        scope: `/${REPO_NAME}/`,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#3366f2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // words.json（約550KB）もオフラインで使えるようにキャッシュ対象に含める
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
