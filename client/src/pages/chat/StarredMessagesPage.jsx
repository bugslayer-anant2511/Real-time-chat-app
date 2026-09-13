import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star } from 'lucide-react';
import * as messageService from '../../api/message.service.js';
import Spinner from '../../components/common/Spinner.jsx';
import { formatRelativeTime } from '../../utils/formatRelativeTime.js';

const StarredMessagesPage = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const result = await messageService.getStarredMessages();
        setMessages(result?.data?.items || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-gray-50 dark:bg-gray-950 p-6 overflow-y-auto">
      <div className="flex items-center gap-2 mb-6">
        <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Starred Messages</h1>
      </div>
      
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <Star className="h-12 w-12 text-gray-300 dark:text-gray-700 mb-4" />
          <p>No starred messages yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-w-3xl">
          {messages.map(msg => (
            <div
              key={msg._id}
              onClick={() => navigate(`/chat/${msg.conversationId}?jump=${msg._id}`)}
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
              <p className="text-gray-800 dark:text-gray-200 break-words">{msg.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StarredMessagesPage;
