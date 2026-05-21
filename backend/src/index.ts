import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import executeRouter from './routes/execute';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import { initDb } from './db';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', executeRouter);

app.use(errorHandler);

async function start() {
  await initDb();
  app.listen(config.port, () => {
    console.log(`CodeForge backend running on port ${config.port}`);
  });
}

start().catch(console.error);
