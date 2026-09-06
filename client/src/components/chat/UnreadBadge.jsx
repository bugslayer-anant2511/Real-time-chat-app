import Badge from '../common/Badge.jsx';

const UnreadBadge = ({ count, className }) => (
  <Badge count={count} max={99} variant="brand" className={className} />
);

export default UnreadBadge;
