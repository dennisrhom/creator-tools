import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Bundled JS/CSS/fonts go to dist/bundle/ so they don't mix with the
    // Valorant images, which are copied from public/assets to dist/assets/.
    assetsDir: 'bundle',
  },
});
