import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { useAuth } from '../../contexts/AuthContext.jsx';
import { useChatState } from '../../contexts/ChatStateContext.jsx';
import * as conversationService from '../../api/conversation.service.js';
import Modal from '../common/Modal.jsx';
import UserSearchInput from '../chat/UserSearchInput.jsx';

const NewChatModal = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { upsertConversation } = useChatState();

  const [creatingId, setCreatingId] = useState(null);
  const currentUserId = user?._id ? String(user._id) : null;

  const handleSelect = useCallback(
    async (target) => {
      const targetId = target?._id ? String(target._id) : null;
      if (!targetId || creatingId) return;

      setCreatingId(targetId);
      try {
        const result = await conversationService.createDirect(targetId);
        const conversation = result?.data ?? null;
        if (!conversation?._id) {
          throw new Error('Conversation could not be opened');
        }
        upsertConversation(conversation);
        onClose?.();
        navigate(`/chat/${conversation._id}`);
      } catch (err) {
        toast.error(err?.response?.data?.message || 'Could not open chat');
      } finally {
        setCreatingId(null);
      }
    },
    [creatingId, navigate, onClose, upsertConversation],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Start a new chat"
      description="Search for someone by name or @username, then tap to open a direct conversation."
      size="md"
      panelClassName="h-[32rem]"
    >
      <UserSearchInput
        mode="single"
        autoFocus
        onSelect={handleSelect}
        excludeIds={currentUserId ? [currentUserId] : []}
        busyId={creatingId}
        emptyHint="Make sure you typed at least 2 characters."
      />
    </Modal>
  );
};

export default NewChatModal;
