import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import routes, { bootstrapAdmin } from './routes';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.frontendUrls.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many auth attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/admin/login', authLimiter);
app.use('/waitlist', authLimiter);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'somahland-api', env: env.nodeEnv });
});

app.use(routes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    if (err.message === 'Not allowed by CORS') {
      res.status(403).json({ error: 'CORS blocked' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
);

async function start(): Promise<void> {
  await bootstrapAdmin();

  app.listen(env.port, () => {
    console.log(`SOMAHLAND API listening on :${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
