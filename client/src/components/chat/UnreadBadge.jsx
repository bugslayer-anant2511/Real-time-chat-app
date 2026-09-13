import Badge from '../common/Badge.jsx';

const UnreadBadge = ({ count, className }) => (
  <span
    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${className ?? ''}`}
    style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}
  >
    {count > 99 ? '99+' : count}
  </span>
);

export default UnreadBadge;
