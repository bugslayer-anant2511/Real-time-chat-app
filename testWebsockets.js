import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { io as Client } from 'socket.io-client';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { createSocketServer } from '../config/socket.js';
import { registerSocketHandlers } from '../sockets/index.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';
import authRoutes from '../routes/auth.routes.js';
import conversationRoutes from '../routes/conversation.routes.js';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(sanitizeRequest);

app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);
const io = createSocketServer(server, env);
registerSocketHandlers(io);
app.set('io', io);

const runTests = async () => {
  await connectDB();
  
  // Wipe test data
  await User.deleteMany({ email: /@test-ws\.com$/ });
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  await Notification.deleteMany({});
  
  server.listen(5015, async () => {
    console.log('[test] WebSocket verification server running on http://localhost:5015');
    
    try {
      // 1) Register Alice and Bob
      console.log('[test] Registering users...');
      const registerUser = async (username, email) => {
        const res = await fetch('http://localhost:5015/api/auth/register', {
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

      const alice = await registerUser('alice_ws', 'alice@test-ws.com');
      const bob = await registerUser('bob_ws', 'bob@test-ws.com');

      const aliceToken = alice.token;
      const bobToken = bob.token;
      const bobId = bob.user._id;

      // 2) Open direct chat via REST
      console.log('[test] Opening direct chat...');
      const dir = await fetch('http://localhost:5015/api/conversations/direct', {
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

      // 3) Connect Alice and Bob sockets
      console.log('[test] Connecting WebSocket clients...');
      const connectSocket = (token) => {
        return new Promise((resolve, reject) => {
          const socket = Client('http://localhost:5015', {
            auth: { token },
            transports: ['websocket']
          });
          socket.on('connect', () => resolve(socket));
          socket.on('connect_error', (err) => reject(err));
        });
      };

      const aliceSocket = await connectSocket(aliceToken);
      const bobSocket = await connectSocket(bobToken);
      console.log('[test] Sockets connected successfully.');

      // Give server setup time to join rooms and fetch online status from DB
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4) Bob listens for typing and messages
      const bobReceivedEvents = [];
      bobSocket.on('typing:start', (data) => {
        console.log('[test] Bob received typing:start:', data);
        bobReceivedEvents.push({ event: 'typing:start', data });
      });
      bobSocket.on('message:new', (data) => {
        console.log('[test] Bob received message:new:', data);
        bobReceivedEvents.push({ event: 'message:new', data });
      });
      bobSocket.on('message:edited', (data) => {
        console.log('[test] Bob received message:edited:', data);
        bobReceivedEvents.push({ event: 'message:edited', data });
      });
      bobSocket.on('message:deleted', (data) => {
        console.log('[test] Bob received message:deleted:', data);
        bobReceivedEvents.push({ event: 'message:deleted', data });
      });
      bobSocket.on('userOffline', (data) => {
        console.log('[test] Bob received userOffline presence event:', data);
        bobReceivedEvents.push({ event: 'userOffline', data });
      });

      // 5) Alice triggers typing start
      console.log('[test] Alice emitting typing:start...');
      aliceSocket.emit('typing:start', { conversationId: convId });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 6) Alice sends a message via Socket
      console.log('[test] Alice emitting message:send...');
      let msgId;
      await new Promise((resolve, reject) => {
        aliceSocket.emit('message:send', {
          conversationId: convId,
          text: 'Hello Bob! From socket.'
        }, (res) => {
          if (!res.success) reject(new Error(`message:send failed: ${res.message}`));
          msgId = res.message._id;
          resolve();
        });
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 7) Alice edits message via Socket
      console.log('[test] Alice emitting message:edit...');
      await new Promise((resolve, reject) => {
        aliceSocket.emit('message:edit', {
          messageId: msgId,
          text: 'Hello Bob! From socket (EDITED).'
        }, (res) => {
          if (!res.success) reject(new Error(`message:edit failed: ${res.message}`));
          resolve();
        });
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 8) Alice deletes message via Socket
      console.log('[test] Alice emitting message:delete...');
      await new Promise((resolve, reject) => {
        aliceSocket.emit('message:delete', {
          messageId: msgId,
          for: 'everyone'
        }, (res) => {
          if (!res.success) reject(new Error(`message:delete failed: ${res.message}`));
          resolve();
        });
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 9) Alice disconnects (verifies userOffline presence event)
      console.log('[test] Alice disconnecting socket...');
      aliceSocket.disconnect();

      await new Promise(resolve => setTimeout(resolve, 500));

      bobSocket.disconnect();

      // Check results
      const events = bobReceivedEvents.map(e => e.event);
      console.log('[test] Bob received events list:', events);
      if (!events.includes('typing:start')) throw new Error('Missing typing:start event');
      if (!events.includes('message:new')) throw new Error('Missing message:new event');
      if (!events.includes('message:edited')) throw new Error('Missing message:edited event');
      if (!events.includes('message:deleted')) throw new Error('Missing message:deleted event');
      if (!events.includes('userOffline')) throw new Error('Missing userOffline presence event');

      console.log('--- ALL WEBSOCKET TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      // Clean up test data
      await User.deleteMany({ email: /@test-ws\.com$/ });
      await Conversation.deleteMany({});
      await Message.deleteMany({});
      await Notification.deleteMany({});
      await mongoose.disconnect();
      io.close();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
