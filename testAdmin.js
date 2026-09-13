import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { AdminAuditLog } from '../models/AdminAuditLog.js';
import { Conversation } from '../models/Conversation.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';
import authRoutes from '../routes/auth.routes.js';
import userRoutes from '../routes/user.routes.js';
import conversationRoutes from '../routes/conversation.routes.js';
import messageRouter, { conversationMessageRouter } from '../routes/message.routes.js';
import uploadRoutes from '../routes/upload.routes.js';
import reportRoutes from '../routes/report.routes.js';
import notificationRoutes from '../routes/notification.routes.js';
import adminRoutes from '../routes/admin.routes.js';

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
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const runTests = async () => {
  await connectDB();
  
  // Wipe test data
  await User.deleteMany({ email: /@test-admin\.com$/ });
  await AdminAuditLog.deleteMany({});
  await Conversation.deleteMany({});
  
  server.listen(5014, async () => {
    console.log('[test] Admin moderation verification server running on http://localhost:5014');
    
    try {
      // 1) Register Alice, Bob, and Super Admin
      console.log('[test] Registering users...');
      const registerUser = async (username, email) => {
        const res = await fetch('http://localhost:5014/api/auth/register', {
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

      const alice = await registerUser('alice_adm', 'alice@test-admin.com');
      const bob = await registerUser('bob_adm', 'bob@test-admin.com');
      const adminRaw = await registerUser('super_adm', 'admin@test-admin.com');

      const aliceToken = alice.token;
      const bobId = bob.user._id;
      const adminId = adminRaw.user._id;

      // Promote super_adm to Admin role directly via Database update
      console.log('[test] Promoting Super Admin to admin role...');
      await User.updateOne({ _id: adminId }, { $set: { role: 'admin' } });

      // Fetch super_adm token by logging in again to verify updated role claims inside token
      const loginRes = await fetch('http://localhost:5014/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@test-admin.com', password: 'Password123' })
      });
      const loginData = await loginRes.json();
      const adminToken = loginData.data.token;

      // 2) Normal user trying to access admin endpoints (expect 403 Forbidden)
      console.log('[test] Alice trying to fetch admin stats (expect 403)...');
      const statsAliceRes = await fetch('http://localhost:5014/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      if (statsAliceRes.status !== 403) {
        throw new Error(`Expected 403 Forbidden, got ${statsAliceRes.status}`);
      }
      console.log('[test] Non-admin access correctly denied (403 Forbidden).');

      // 3) Admin fetching statistics
      console.log('[test] Admin fetching stats...');
      const statsRes = await fetch('http://localhost:5014/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const statsData = await statsRes.json();
      if (statsRes.status !== 200) throw new Error(`Admin stats failed: ${JSON.stringify(statsData)}`);
      if (typeof statsData.data.totalUsers !== 'number') throw new Error('totalUsers stat is missing');
      console.log('[test] Admin statistics fetched successfully.');

      // 4) Admin listing users
      console.log('[test] Admin listing users...');
      const usersRes = await fetch('http://localhost:5014/api/admin/users', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const usersData = await usersRes.json();
      if (usersRes.status !== 200) throw new Error(`Listing users failed: ${JSON.stringify(usersData)}`);
      console.log('[test] Listed users. Count:', usersData.data.users.length);

      // 5) Admin suspending Bob
      console.log('[test] Admin suspending Bob...');
      const suspendRes = await fetch(`http://localhost:5014/api/admin/users/${bobId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: 'suspended' })
      });
      const suspendData = await suspendRes.json();
      if (suspendRes.status !== 200) throw new Error(`Suspending user failed: ${JSON.stringify(suspendData)}`);
      console.log('[test] Bob suspended successfully.');

      // Verify Bob cannot log in anymore
      console.log('[test] Bob trying to log in while suspended (expecting fail)...');
      const bobLoginRes = await fetch('http://localhost:5014/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bob@test-admin.com', password: 'Password123' })
      });
      const bobLoginData = await bobLoginRes.json();
      if (bobLoginRes.status !== 403) {
        throw new Error(`Expected 403 Forbidden for suspended login, got ${bobLoginRes.status}: ${JSON.stringify(bobLoginData)}`);
      }
      console.log('[test] Suspended account authentication correctly blocked (403 Forbidden).');

      // 6) Verify Audit Log entries
      console.log('[test] Checking database audit logs...');
      const auditLog = await AdminAuditLog.findOne({ adminId, action: 'user.suspend' }).lean();
      if (!auditLog) throw new Error('user.suspend audit log entry was not written!');
      if (String(auditLog.targetId) !== String(bobId)) throw new Error('Audit log has wrong targetId');
      console.log('[test] Audit logs successfully recorded in Database.');

      console.log('--- ALL ADMIN MODERATION TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      // Clean up test data
      await User.deleteMany({ email: /@test-admin\.com$/ });
      await AdminAuditLog.deleteMany({});
      await Conversation.deleteMany({});
      await mongoose.disconnect();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
