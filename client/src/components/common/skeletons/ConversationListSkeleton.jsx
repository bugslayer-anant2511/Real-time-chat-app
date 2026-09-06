import Skeleton from './Skeleton.jsx';

const ConversationListSkeleton = ({ rows = 6 }) => (
  <ul className="space-y-1.5" aria-busy="true" aria-label="Loading conversations">
    {Array.from({ length: rows }).map((_, index) => (
      <li
        key={index}
        className="flex items-center gap-3 rounded-lg px-2 py-2"
      >
        <Skeleton className="h-10 w-10" rounded="full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-10" />
          </div>
          <Skeleton className="h-2.5 w-3/4" />
        </div>
      </li>
    ))}
  </ul>
);

export default ConversationListSkeleton;
