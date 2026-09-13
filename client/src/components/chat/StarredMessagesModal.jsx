import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Star, X } from 'lucide-react';
import * as messageService from '../../api/message.service.js';
import Spinner from '../common/Spinner.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

const StarredMessagesModal = ({ conversationId, onClose, onJumpToMessage }) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await messageService.getStarredMessages(conversationId);
        setMessages(result?.data?.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [conversationId]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm ww-fade-in">
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ww-scale-in dark:bg-gray-900 border border-gray-200 dark:border-gray-800 h-[80vh] max-h-[600px]">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Starred Messages</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-950/50">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Star className="h-12 w-12 text-gray-300 dark:text-gray-700 mb-4" />
              <p>No starred messages in this chat.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  onClick={() => {
                    if (onJumpToMessage) {
                      onJumpToMessage(msg._id);
                      onClose();
                    }
                  }}
                  className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">
                      {msg.sender?.displayName || msg.sender?.username}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                  <p className="text-gray-800 dark:text-gray-200 break-words whitespace-pre-wrap">{msg.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StarredMessagesModal;
