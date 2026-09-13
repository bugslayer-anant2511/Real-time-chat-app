import cron from 'node-cron';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';

export const startMessageScheduler = (io) => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      // Find messages that are scheduled and scheduledFor is in the past or now
      const messagesToSend = await Message.find({
        status: 'scheduled',
        scheduledFor: { $lte: now },
      }).populate([
        {
          path: 'sender',
          select: 'username displayName avatar status isOnline showOnlineStatus role',
        },
        {
          path: 'replyTo',
          select: 'text type sender',
          populate: { path: 'sender', select: 'username displayName' },
        },
      ]);

      if (messagesToSend.length === 0) return;

      console.log(`[Scheduler] Found ${messagesToSend.length} scheduled messages to send.`);

      // Since the socket logic requires importing from message.socket.js
      const msgSocket = await import('../sockets/message.socket.js');
      const { User } = await import('../models/User.js');

      for (const message of messagesToSend) {
        try {
          const sendTime = new Date();

          // Bypass mongoose immutable createdAt check using native driver
          await Message.collection.updateOne(
            { _id: message._id },
            { $set: { status: 'sent', createdAt: sendTime, updatedAt: sendTime } }
          );

          // Update memory object for broadcast
          message.status = 'sent';
          message.createdAt = sendTime;
          message.updatedAt = sendTime;

          // Update conversation's lastMessageAt, lastMessage snapshot, and unreadCounts
          let textPreview = message.text || '';
          if (message.deletedFor === 'everyone') textPreview = '';
          else if (message.type === 'image') textPreview = '[image]';

          const snapshot = {
            text: textPreview,
            sender: message.sender?._id || message.sender,
            type: message.type,
            createdAt: sendTime,
          };

          const conversation = await Conversation.findById(message.conversationId).select('participants');
          if (conversation) {
            const update = {
              $set: {
                lastMessageAt: sendTime,
                lastMessage: snapshot,
                isActive: true,
              }
            };

            if (message.sender) {
              const senderId = (message.sender?._id || message.sender).toString();
              const recipientIds = conversation.participants
                .map(p => p.toString())
                .filter(pid => pid !== senderId);

              let mutedSet = new Set();
              if (recipientIds.length > 0) {
                const mutedRows = await User.find(
                  { _id: { $in: recipientIds }, mutedConversations: message.conversationId },
                  { _id: 1 }
                ).lean();
                mutedSet = new Set(mutedRows.map(u => u._id.toString()));
              }

              const inc = {};
              for (const pid of recipientIds) {
                if (mutedSet.has(pid)) continue;
                inc[`unreadCounts.${pid}`] = 1;
              }
              if (Object.keys(inc).length > 0) update.$inc = inc;
            }

            await Conversation.findByIdAndUpdate(message.conversationId, update);
          }

          // Broadcast
          if (io && msgSocket?.broadcastNewMessage) {
            const freshMessage = await Message.findById(message._id).populate([
              {
                path: 'sender',
                select: 'username displayName avatar status isOnline showOnlineStatus role',
              },
              {
                path: 'replyTo',
                select: 'text type sender',
                populate: { path: 'sender', select: 'username displayName' },
              },
            ]);
            if (freshMessage) {
              await msgSocket.broadcastNewMessage(io, { message: freshMessage });
            }
          }
        } catch (err) {
          console.error(`[Scheduler] Error sending scheduled message ${message._id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error checking for scheduled messages:', err);
    }
  });
  
  console.log('[Scheduler] Message scheduler initialized.');
};
