import { MessageSquare, Plus, Users } from 'lucide-react';

import { useChatState } from '../../contexts/ChatStateContext.jsx';

const EmptyChatPage = () => {
  const { openNewChat, openNewGroup } = useChatState();

  return (
    <div className="flex h-full w-full items-center justify-center bg-gray-50 px-6 text-center dark:bg-gray-950">
      <div className="max-w-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
          <MessageSquare className="h-7 w-7" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Select a conversation or start a one
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Pick a chat from the sidebar to keep talking, or invite someone new and
          say hi.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={openNewChat}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New chat
          </button>
          <button
            type="button"
            onClick={openNewGroup}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            New group
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmptyChatPage;
