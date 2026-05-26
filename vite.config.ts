import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'api-sanmar-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/sanmar/proxy-image')) {
            const urlObj = new URL(req.url, 'http://localhost');
            const targetUrl = urlObj.searchParams.get('url');
            if (!targetUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'url param required' }));
              return;
            }
            try {
              const fetchRes = await fetch(targetUrl);
              const buffer = await fetchRes.arrayBuffer();
              const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
              res.setHeader('Content-Type', contentType);
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.statusCode = fetchRes.status;
              res.end(Buffer.from(buffer));
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: msg }));
            }
            return;
          }
          next();
        });
      }
    }
  ],
})
