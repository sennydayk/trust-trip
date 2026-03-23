'use client';

import { useState, useRef } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  function handleEnter() {
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  }

  function handleLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(false);
  }

  return (
    <div
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {visible && (
        <div className="absolute left-0 top-full z-50 mt-1 max-w-[280px] rounded bg-neutral-dark px-2.5 py-1.5 text-[11px] font-normal text-white shadow-lg">
          {content}
          <div className="absolute -top-1 left-3 h-2 w-2 rotate-45 bg-neutral-dark" />
        </div>
      )}
    </div>
  );
}
