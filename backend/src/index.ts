import express from 'express';
import cors from 'cors';
import { config } from './config';
import executeRouter from './routes/execute';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'CodeForge Backend' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', executeRouter);

app.use(errorHandler);

async function start() {
  app.listen(config.port, () => {
    console.log(`CodeForge backend running on port ${config.port}`);
  });
}

start().catch(console.error);
