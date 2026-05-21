import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import executeRouter from './routes/execute';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';

const app = express();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.cors.origins.includes('*') || config.cors.origins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true,
};

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', executeRouter);

app.use(errorHandler);

async function start() {
  app.listen(config.port, () => {
    console.log(`CodeForge backend running on port ${config.port}`);
    console.log(`CORS origins: ${config.cors.origins.join(', ')}`);
  });
}

start().catch(console.error);
