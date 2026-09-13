import http from 'node:http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { sanitizeRequest } from '../middlewares/sanitize.middleware.js';
import { errorHandler, notFoundHandler } from '../middlewares/error.middleware.js';
import authRoutes from '../routes/auth.routes.js';
import userRoutes from '../routes/user.routes.js';
import conversationRoutes from '../routes/conversation.routes.js';
import messageRouter, { conversationMessageRouter } from '../routes/message.routes.js';

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

app.use(notFoundHandler);
app.use(errorHandler);

const server = http.createServer(app);

const runTests = async () => {
  await connectDB();
  
  // Wipe test data
  await User.deleteMany({ email: /@test-msg\.com$/ });
  await Conversation.deleteMany({});
  await Message.deleteMany({});
  
  server.listen(5012, async () => {
    console.log('[test] Message verification server running on http://localhost:5012');
    
    try {
      // 1) Register Alice and Bob
      console.log('[test] Registering users...');
      const registerUser = async (username, email) => {
        const res = await fetch('http://localhost:5012/api/auth/register', {
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

      const alice = await registerUser('alice_msg', 'alice@test-msg.com');
      const bob = await registerUser('bob_msg', 'bob@test-msg.com');

      const aliceToken = alice.token;
      const bobToken = bob.token;
      const bobId = bob.user._id;

      // 2) Open direct chat
      console.log('[test] Opening direct chat...');
      const dir = await fetch('http://localhost:5012/api/conversations/direct', {
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

      // 3) Send a text message
      console.log('[test] Alice sending message...');
      const sendRes = await fetch(`http://localhost:5012/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ text: 'Hello Bob! This is message 1.' })
      });
      const sendData = await sendRes.json();
      if (sendRes.status !== 201) throw new Error(`Sending message failed: ${JSON.stringify(sendData)}`);
      const msg1Id = sendData.data._id;
      console.log('[test] Message 1 sent:', msg1Id);

      // 4) Send a reply
      console.log('[test] Bob sending a reply message...');
      const replyRes = await fetch(`http://localhost:5012/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        },
        body: JSON.stringify({
          text: 'Hi Alice! Replying to your message.',
          replyTo: msg1Id
        })
      });
      const replyData = await replyRes.json();
      if (replyRes.status !== 201) throw new Error(`Sending reply failed: ${JSON.stringify(replyData)}`);
      console.log('[test] Reply sent successfully.');

      // 5) Edit message 1
      console.log('[test] Alice editing message 1...');
      const editRes = await fetch(`http://localhost:5012/api/messages/${msg1Id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ text: 'Hello Bob! This is message 1 (EDITED).' })
      });
      const editData = await editRes.json();
      if (editRes.status !== 200) throw new Error(`Editing failed: ${JSON.stringify(editData)}`);
      console.log('[test] Edited successfully.');

      // 6) Test Edit window expiry
      console.log('[test] Expiring edit window...');
      await Message.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(msg1Id) },
        { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
      );
      const editExpiredRes = await fetch(`http://localhost:5012/api/messages/${msg1Id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ text: 'Should fail' })
      });
      const editExpiredData = await editExpiredRes.json();
      if (editExpiredRes.status !== 403) {
        throw new Error(`Expected 403 edit window expired, got ${editExpiredRes.status}: ${JSON.stringify(editExpiredData)}`);
      }
      console.log('[test] Edit window expiration correctly enforced (403 Forbidden).');

      // Restore createdAt
      await Message.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(msg1Id) },
        { $set: { createdAt: new Date() } }
      );

      // 7) Toggle Reactions (Bob reacts with 👍)
      console.log('[test] Bob reacting with emoji...');
      const reactRes = await fetch(`http://localhost:5012/api/messages/${msg1Id}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        },
        body: JSON.stringify({ emoji: '👍' })
      });
      const reactData = await reactRes.json();
      if (reactRes.status !== 200) throw new Error(`Reacting failed: ${JSON.stringify(reactData)}`);
      if (reactData.data.action !== 'added') throw new Error('Reaction not added');
      console.log('[test] Bob reacted 👍.');

      // Toggle reaction again (should remove it)
      console.log('[test] Bob toggling reaction off...');
      const reactRes2 = await fetch(`http://localhost:5012/api/messages/${msg1Id}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        },
        body: JSON.stringify({ emoji: '👍' })
      });
      const reactData2 = await reactRes2.json();
      if (reactData2.data.action !== 'removed') throw new Error('Reaction not removed');
      console.log('[test] Bob removed 👍 reaction.');

      // 8) Search messages
      console.log('[test] Searching messages for "edited"...');
      const searchRes = await fetch(`http://localhost:5012/api/conversations/${convId}/messages/search?q=edited`, {
        headers: { 'Authorization': `Bearer ${aliceToken}` }
      });
      const searchData = await searchRes.json();
      if (searchRes.status !== 200) throw new Error(`Search failed: ${JSON.stringify(searchData)}`);
      if (searchData.data.total === 0) throw new Error('Search did not return matches!');
      console.log('[test] Search works.');

      // 9) Delete for everyone
      console.log('[test] Alice deleting message for everyone...');
      const delRes = await fetch(`http://localhost:5012/api/messages/${msg1Id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        },
        body: JSON.stringify({ for: 'everyone' })
      });
      const delData = await delRes.json();
      if (delRes.status !== 200) throw new Error(`Delete failed: ${JSON.stringify(delData)}`);
      if (delData.data.message.deletedFor !== 'everyone') throw new Error('Message status is not everyone');
      console.log('[test] Message retracted successfully.');

      console.log('--- ALL MESSAGE TESTS PASSED ---');
    } catch (err) {
      console.error('[test] Test failed:', err);
    } finally {
      // Clean up test data
      await User.deleteMany({ email: /@test-msg\.com$/ });
      await Conversation.deleteMany({});
      await Message.deleteMany({});
      await mongoose.disconnect();
      server.close();
      console.log('[test] Server closed and db disconnected.');
    }
  });
};

runTests();
