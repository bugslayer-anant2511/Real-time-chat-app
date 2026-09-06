import ConfirmModal from '../common/ConfirmModal.jsx';

const BlockUserModal = ({ open, onClose, onConfirm, target }) => {
  const targetName = target?.displayName || target?.username || 'this user';

  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Block user?"
      confirmLabel="Block user"
      cancelLabel="Cancel"
      variant="danger"
    >
      <p>
        <span className="font-semibold text-gray-900 dark:text-white">
          {targetName}
        </span>{' '}
        will no longer be able to message you. They won&apos;t be told
        you&apos;ve blocked them.
      </p>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        You can unblock anyone from{' '}
        <span className="font-medium">Settings &rarr; Blocked Users</span>.
      </p>
    </ConfirmModal>
  );
};

export default BlockUserModal;
