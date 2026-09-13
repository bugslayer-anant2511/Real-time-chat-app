import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';
import authRoutes from '../routes/auth.routes.js';
import userRoutes from '../routes/user.routes.js';
import conversationRoutes from '../routes/conversation.routes.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(sanitizeRequest);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const runTests = async () => {
  await connectDB();
  
  // Wipe test data
  await User.deleteMany({ email: /@test-conv\.com$/ });
  await Conversation.deleteMany({});
  
  server.listen(5011, async () => {
    console.log('[test] Conversational verification server running on http://localhost:5011');
    
    try {
      // 1) Register 3 users (Alice, Bob, Charlie)
      console.log('[test] Registering Alice, Bob, Charlie...');
      const registerUser = async (username, email) => {
        const res = await fetch('http://localhost:5011/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            email,
            password: 'Password123',
            displayName: `${username.charAt(0).toUpperCase() + username.slice(1)} Test`
          })
        });
        const d = await res.json();
        if (res.status !== 201) throw new Error(`Registration failed for ${username}: ${JSON.stringify(d)}`);
        return d.data;
      };

      const alice = await registerUser('alice_conv', 'alice@test-conv.com');
      const bob = await registerUser('bob_conv', 'bob@test-conv.com');
      const charlie = await registerUser('charlie_conv', 'charlie@test-conv.com');

      const aliceToken = alice.token;
      const bobId = bob.user._id;
      const charlieId = charlie.user._id;

      // 2) Alice creates a direct conversation with Bob
      console.log('[test] Alice opening direct chat with Bob...');
      const dir1 = await fetch('http://localhost:5011/api/conversations/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ userId: bobId })
      });
      const dir1Data = await dir1.json();
      if (dir1.status !== 200) throw new Error(`Direct chat creation failed: ${JSON.stringify(dir1Data)}`);
      const directConvId = dir1Data.data._id;
      console.log('[test] Direct chat opened:', directConvId);

      // 3) Re-open direct chat, expect the same ID
      console.log('[test] Alice re-opening direct chat with Bob (expecting same ID)...');
      const dir2 = await fetch('http://localhost:5011/api/conversations/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ userId: bobId })
      });
      const dir2Data = await dir2.json();
      if (dir2Data.data._id !== directConvId) {
        throw new Error(`Direct conversation duplication! Expected ${directConvId}, got ${dir2Data.data._id}`);
      }
      console.log('[test] Direct conversation idempotence verified.');

      // 4) Alice creates a group conversation with Bob
      console.log('[test] Alice creating group with Bob...');
      const grp = await fetch('http://localhost:5011/api/conversations/group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          name: 'Avengers Init',
          participantIds: [bobId]
        })
      });
      const grpData = await grp.json();
      if (grp.status !== 201) throw new Error(`Group creation failed: ${JSON.stringify(grpData)}`);
      const groupConvId = grpData.data._id;
      console.log('[test] Group conversation created:', groupConvId);

      // 5) Add Charlie to the group
      console.log('[test] Adding Charlie to group...');
      const addRes = await fetch(`http://localhost:5011/api/conversations/${groupConvId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ userIds: [charlieId] })
      });
      const addData = await addRes.json();
      if (addRes.status !== 200) throw new Error(`Adding member failed: ${JSON.stringify(addData)}`);
      console.log('[test] Charlie added successfully. Member count:', addData.data.participants.length);

      // 6) Promote Bob to admin
      console.log('[test] Promoting Bob to admin...');
      const promoRes = await fetch(`http://localhost:5011/api/conversations/${groupConvId}/admins/${bobId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const promoData = await promoRes.json();
      if (promoRes.status !== 200) throw new Error(`Promoting admin failed: ${JSON.stringify(promoData)}`);
      console.log('[test] Bob promoted successfully.');

      // 7) Demote Bob from admin
      console.log('[test] Demoting Bob from admin...');
      const demoteRes = await fetch(`http://localhost:5011/api/conversations/${groupConvId}/admins/${bobId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const demoteData = await demoteRes.json();
      if (demoteRes.status !== 200) throw new Error(`Demoting admin failed: ${JSON.stringify(demoteData)}`);
      console.log('[test] Bob demoted successfully.');

      // 8) Mute conversation
      console.log('[test] Muting conversation...');
      const muteRes = await fetch(`http://localhost:5011/api/conversations/${groupConvId}/mute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const muteData = await muteRes.json();
      if (muteRes.status !== 200) throw new Error(`Muting failed: ${JSON.stringify(muteData)}`);
      if (muteData.data.muted !== true) throw new Error('Mute state did not toggle to true');
      console.log('[test] Conversation muted successfully.');

      // 9) Archive conversation
      console.log('[test] Archiving conversation...');
      const archRes = await fetch(`http://localhost:5011/api/conversations/${groupConvId}/archive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const archData = await archRes.json();
      if (archRes.status !== 200) throw new Error(`Archiving failed: ${JSON.stringify(archData)}`);
      if (archData.data.archived !== true) throw new Error('Archive state did not toggle to true');
      console.log('[test] Conversation archived successfully.');

      // 10) Leave group (demote/remove self)
      console.log('[test] Alice leaving group...');
      const leaveRes = await fetch(`http://localhost:5011/api/conversations/${groupConvId}/members/${alice.user._id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const leaveData = await leaveRes.json();
      if (leaveRes.status !== 200) throw new Error(`Leaving group failed: ${JSON.stringify(leaveData)}`);
      console.log('[test] Alice left the group successfully.');

      console.log('--- ALL CONVERSATIONAL TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      // Clean up test data
      await User.deleteMany({ email: /@test-conv\.com$/ });
      await Conversation.deleteMany({});
      await mongoose.disconnect();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
