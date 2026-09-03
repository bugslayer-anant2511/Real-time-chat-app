import express from 'express';
import { env, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';

validateEnv();

const app = express();

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

const start = async () => {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });
};

start();
