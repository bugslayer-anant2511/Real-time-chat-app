import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Report } from '../models/Report.js';
import { Notification } from '../models/Notification.js';
import { Conversation } from '../models/Conversation.js';
import { persistMessageNotification } from '../utils/notificationService.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';
import authRoutes from '../routes/auth.routes.js';
import userRoutes from '../routes/user.routes.js';
import conversationRoutes from '../routes/conversation.routes.js';
import messageRouter, { conversationMessageRouter } from '../routes/message.routes.js';
import uploadRoutes from '../routes/upload.routes.js';
import reportRoutes from '../routes/report.routes.js';
import notificationRoutes from '../routes/notification.routes.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(sanitizeRequest);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/conversations/:id/messages', conversationMessageRouter);
app.use('/api/messages', messageRouter);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const runTests = async () => {
  await connectDB();
  
  // Wipe test data
  await User.deleteMany({ email: /@test-safety\.com$/ });
  await Report.deleteMany({});
  await Notification.deleteMany({});
  await Conversation.deleteMany({});
  
  server.listen(5013, async () => {
    console.log('[test] Safety & Notification verification server running on http://localhost:5013');
    
    try {
      // 1) Register Alice and Bob
      console.log('[test] Registering users...');
      const registerUser = async (username, email) => {
        const res = await fetch('http://localhost:5013/api/auth/register', {
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

      const alice = await registerUser('alice_safety', 'alice@test-safety.com');
      const bob = await registerUser('bob_safety', 'bob@test-safety.com');

      const aliceToken = alice.token;
      const bobToken = bob.token;
      const bobId = bob.user._id;

      // 2) Create direct chat
      console.log('[test] Opening direct chat...');
      const dir = await fetch('http://localhost:5013/api/conversations/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ userId: bobId })
      });
      const dirData = await dir.json();
      const convId = dirData.data._id;
      console.log('[test] Direct chat opened:', convId);

      // 3) Submit safety report (Alice reports Bob)
      console.log('[test] Alice reporting Bob...');
      const reportRes = await fetch('http://localhost:5013/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          targetType: 'user',
          targetId: bobId,
          reason: 'harassment',
          description: 'Spamming messages'
        })
      });
      const reportData = await reportRes.json();
      if (reportRes.status !== 201) throw new Error(`Report submission failed: ${JSON.stringify(reportData)}`);
      console.log('[test] Report submitted successfully.');

      // 4) Cooldown check (Alice reports Bob again immediately)
      console.log('[test] Alice reporting Bob again (expecting 429 cooldown)...');
      const reportRes2 = await fetch('http://localhost:5013/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({
          targetType: 'user',
          targetId: bobId,
          reason: 'harassment',
          description: 'Spamming messages again'
        })
      });
      const reportData2 = await reportRes2.json();
      if (reportRes2.status !== 429) {
        throw new Error(`Expected 429 Too Many Requests, got ${reportRes2.status}: ${JSON.stringify(reportData2)}`);
      }
      console.log('[test] Cooldown restriction successfully verified.');

      // 5) Persist notification for Bob
      console.log('[test] Persisting message notification for Bob...');
      const mockMessage = {
        _id: new mongoose.Types.ObjectId(),
        type: 'text',
        text: 'Hello Bob! Unread alert.',
        createdAt: new Date()
      };
      await persistMessageNotification({
        recipientId: bobId,
        conversationId: convId,
        messageId: mockMessage._id,
        actorId: alice.user._id,
        message: mockMessage,
        fromUser: alice.user
      });

      // 6) Bob fetches his notifications
      console.log('[test] Bob fetching notifications...');
      const notifRes = await fetch('http://localhost:5013/api/notifications', {
        headers: { 'Authorization': `Bearer ${bobToken}` }
      });
      const notifData = await notifRes.json();
      if (notifRes.status !== 200) throw new Error(`Fetching notifications failed: ${JSON.stringify(notifData)}`);
      if (notifData.data.items.length !== 1) throw new Error(`Expected 1 notification, got ${notifData.data.items.length}`);
      const notifId = notifData.data.items[0]._id;
      console.log('[test] Notifications read successfully. Notif ID:', notifId);

      // 7) Bob marks notification as read
      console.log('[test] Bob marking notification as read...');
      const readRes = await fetch(`http://localhost:5013/api/notifications/${notifId}/read`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${bobToken}` }
      });
      const readData = await readRes.json();
      if (readRes.status !== 200) throw new Error(`Marking read failed: ${JSON.stringify(readData)}`);
      if (readData.data.isRead !== true) throw new Error('isRead was not set to true');
      console.log('[test] Notification marked read successfully.');

      console.log('--- ALL SAFETY & NOTIFICATION TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      // Clean up test data
      await User.deleteMany({ email: /@test-safety\.com$/ });
      await Report.deleteMany({});
      await Notification.deleteMany({});
      await Conversation.deleteMany({});
      await mongoose.disconnect();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
