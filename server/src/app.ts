import express from 'express';

// Express programa kuriama funkcija, kad testuose būtų galima
// perduoti kitas priklausomybes (pvz., Steam kliento mock'ą).
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}
