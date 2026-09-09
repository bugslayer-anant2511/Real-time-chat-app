import { useState, useRef } from 'react';

/**
 * A premium, delayed tooltip wrapper component.
 * Displays content after the specified delay (defaults to 800ms) on hover.
 */
export const Tooltip = ({ content, label, children, position = 'top', delay = 800 }) => {
  const [active, setActive] = useState(false);
  const timerRef = useRef(null);

  const displayContent = content || label;

  const showTip = () => {
    timerRef.current = setTimeout(() => {
      setActive(true);
    }, delay);
  };

  const hideTip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setActive(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position];

  return (
    <div
      className="relative inline-flex items-center justify-center"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
    >
      {children}
      {active && displayContent && (
        <div
          role="tooltip"
          className={`absolute z-50 pointer-events-none whitespace-nowrap rounded-md bg-gray-900/90 px-2 py-1 text-[10px] font-semibold text-white shadow-md backdrop-blur-[2px] transition-all duration-200 dark:bg-white/95 dark:text-gray-950 ${positionClasses}`}
        >
          {displayContent}
        </div>
      )}
    </div>
  );
};

export default Tooltip;
