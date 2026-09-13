import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { swaggerSpec, swaggerUiOptions } from '../config/swagger.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(sanitizeRequest);

const docsRelaxedHelmet = helmet({ contentSecurityPolicy: false });

app.get('/api-docs.json', docsRelaxedHelmet, (_req, res) => {
  res.status(200).json(swaggerSpec);
});

app.use(
  '/api-docs',
  docsRelaxedHelmet,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, swaggerUiOptions),
);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const runTests = async () => {
  await connectDB();
  
  server.listen(5016, async () => {
    console.log('[test] Swagger verification server running on http://localhost:5016');
    
    try {
      // 1) Fetch Swagger JSON spec
      console.log('[test] Fetching Swagger JSON spec (/api-docs.json)...');
      const specRes = await fetch('http://localhost:5016/api-docs.json');
      const specData = await specRes.json();
      if (specRes.status !== 200) throw new Error(`Fetching spec failed: ${specRes.status}`);
      if (specData.openapi !== '3.0.3') throw new Error(`Unexpected openapi version: ${specData.openapi}`);
      console.log('[test] Swagger spec JSON fetched successfully.');

      // 2) Fetch Swagger UI
      console.log('[test] Fetching Swagger UI html (/api-docs)...');
      const uiRes = await fetch('http://localhost:5016/api-docs/');
      if (uiRes.status !== 200) throw new Error(`Fetching UI page failed: ${uiRes.status}`);
      const uiHtml = await uiRes.text();
      if (!uiHtml.includes('swagger-ui')) throw new Error('HTML response is missing swagger-ui element!');
      console.log('[test] Swagger UI page rendered successfully.');

      console.log('--- ALL SWAGGER TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      await mongoose.disconnect();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
