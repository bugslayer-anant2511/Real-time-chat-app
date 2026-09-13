import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env, validateEnv } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';
import authRoutes from '../routes/auth.routes.js';
import userRoutes from '../routes/user.routes.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(sanitizeRequest);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const runTests = async () => {
  await connectDB();
  
  // Wipe test users first
  await User.deleteMany({ email: /@test-auth-user\.com$/ });
  
  server.listen(5010, async () => {
    console.log('[test] Verification server running on http://localhost:5010');
    
    try {
      // 1) Register Alice
      console.log('[test] Registering Alice...');
      const regAlice = await fetch('http://localhost:5010/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice_test',
          email: 'alice@test-auth-user.com',
          password: 'Password123',
          displayName: 'Alice Test'
        })
      });
      const aliceData = await regAlice.json();
      if (regAlice.status !== 201) throw new Error(`Alice registration failed: ${JSON.stringify(aliceData)}`);
      console.log('[test] Alice registered successfully.');
      const aliceToken = aliceData.data.token;
      const aliceId = aliceData.data.user._id;

      // 2) Register Bob
      console.log('[test] Registering Bob...');
      const regBob = await fetch('http://localhost:5010/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'bob_test',
          email: 'bob@test-auth-user.com',
          password: 'Password123',
          displayName: 'Bob Test'
        })
      });
      const bobData = await regBob.json();
      if (regBob.status !== 201) throw new Error(`Bob registration failed: ${JSON.stringify(bobData)}`);
      console.log('[test] Bob registered successfully.');
      const bobId = bobData.data.user._id;

      // 3) Test Registration Duplicate email conflict
      console.log('[test] Registering Duplicate email...');
      const regDup = await fetch('http://localhost:5010/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'alice_dup',
          email: 'alice@test-auth-user.com',
          password: 'Password123',
          displayName: 'Alice Dup'
        })
      });
      const dupData = await regDup.json();
      if (regDup.status !== 409) throw new Error(`Expected 409, got ${regDup.status}: ${JSON.stringify(dupData)}`);
      console.log('[test] Duplicate email correctly blocked (409 Conflict).');

      // 4) Login with correct email/password
      console.log('[test] Logging in Alice...');
      const loginRes = await fetch('http://localhost:5010/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alice@test-auth-user.com',
          password: 'Password123'
        })
      });
      const loginData = await loginRes.json();
      if (loginRes.status !== 200) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
      console.log('[test] Login succeeded.');

      // 5) Login with invalid password
      console.log('[test] Logging in with wrong password...');
      const loginResBad = await fetch('http://localhost:5010/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'alice@test-auth-user.com',
          password: 'WrongPassword'
        })
      });
      const loginDataBad = await loginResBad.json();
      if (loginResBad.status !== 401) throw new Error(`Expected 401, got ${loginResBad.status}: ${JSON.stringify(loginDataBad)}`);
      console.log('[test] Invalid password correctly rejected (401 Unauthorized).');

      // 6) Get self profile via /api/auth/me
      console.log('[test] Getting Alice session profile...');
      const meRes = await fetch('http://localhost:5010/api/auth/me', {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const meData = await meRes.json();
      if (meRes.status !== 200) throw new Error(`/me failed: ${JSON.stringify(meData)}`);
      if (meData.data.user.username !== 'alice_test') throw new Error('Returned profile does not match.');
      console.log('[test] Session profile retrieval works.');

      // 7) Update Preferences
      console.log('[test] Updating Alice preferences...');
      const prefRes = await fetch('http://localhost:5010/api/users/me/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ theme: 'dark', fontSize: 'lg' })
      });
      const prefData = await prefRes.json();
      if (prefRes.status !== 200) throw new Error(`Update preferences failed: ${JSON.stringify(prefData)}`);
      if (prefData.data.preferences.theme !== 'dark') throw new Error('Theme not saved correctly.');
      console.log('[test] Update preferences works.');

      // 8) Search Bob
      console.log('[test] Searching for Bob...');
      const searchRes = await fetch('http://localhost:5010/api/users/search?q=bo', {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const searchData = await searchRes.json();
      if (searchRes.status !== 200) throw new Error(`Search failed: ${JSON.stringify(searchData)}`);
      if (!searchData.data.users.find(u => u.username === 'bob_test')) {
        throw new Error('Bob was not found in search results!');
      }
      console.log('[test] User search returns matches.');

      // 9) Block Bob
      console.log('[test] Blocking Bob...');
      const blockRes = await fetch(`http://localhost:5010/api/users/${bobId}/block`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const blockData = await blockRes.json();
      if (blockRes.status !== 201) throw new Error(`Blocking Bob failed: ${JSON.stringify(blockData)}`);
      console.log('[test] Blocked Bob successfully.');

      // 10) Search Bob again (should be excluded)
      console.log('[test] Searching Bob again (expecting no results)...');
      const searchRes2 = await fetch('http://localhost:5010/api/users/search?q=bo', {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const searchData2 = await searchRes2.json();
      if (searchData2.data.users.find(u => u.username === 'bob_test')) {
        throw new Error('Blocked user Bob was still found in search results!');
      }
      console.log('[test] Blocked user correctly excluded from search.');

      // 11) List Blocked Users
      console.log('[test] Getting blocked list...');
      const blockedRes = await fetch('http://localhost:5010/api/users/me/blocked', {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const blockedData = await blockedRes.json();
      if (blockedRes.status !== 200) throw new Error(`Get blocked list failed: ${JSON.stringify(blockedData)}`);
      if (!blockedData.data.users.find(u => u.username === 'bob_test')) {
        throw new Error('Bob was not in blocked list!');
      }
      console.log('[test] Blocked users list populated correctly.');

      // 12) Unblock Bob
      console.log('[test] Unblocking Bob...');
      const unblockRes = await fetch(`http://localhost:5010/api/users/${bobId}/block`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const unblockData = await unblockRes.json();
      if (unblockRes.status !== 200) throw new Error(`Unblocking failed: ${JSON.stringify(unblockData)}`);
      console.log('[test] Unblocked Bob successfully.');

      console.log('--- ALL AUTH & PROFILE TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      // Clean up test users
      await User.deleteMany({ email: /@test-auth-user\.com$/ });
      await mongoose.disconnect();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
