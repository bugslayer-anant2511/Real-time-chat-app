import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as messageService from '../../api/message.service.js';
import Spinner from '../common/Spinner.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

const ScheduledMessagesModal = ({ conversationId, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await messageService.getScheduledMessages(conversationId);
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
            <Clock className="h-5 w-5 text-indigo-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Scheduled Messages</h2>
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
              <Clock className="h-12 w-12 text-gray-300 dark:text-gray-700 mb-4" />
              <p>No scheduled messages in this chat.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <div key={msg._id} className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">
                      {msg.sender?.displayName || msg.sender?.username}
                    </span>
                    <span className="text-xs text-gray-500">
                      Sends: {new Date(msg.scheduledFor).toLocaleString()}
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await messageService.cancelScheduledMessage(msg._id);
                          setMessages(prev => prev.filter(m => m._id !== msg._id));
                          toast.success('Scheduled message cancelled');
                        } catch (err) {
                          toast.error('Failed to cancel message');
                        }
                      }}
                      className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-full transition-colors"
                      title="Cancel schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {msg.type === 'text' ? (
                    <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{msg.text}</p>
                  ) : (
                    <div className="text-sm text-gray-500 italic">Media message</div>
                  )}
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

export default ScheduledMessagesModal;
