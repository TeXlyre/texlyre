import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PositionedDropdownProps {
  children: React.ReactNode;
  isOpen: boolean;
  triggerElement: HTMLElement | null;
  className?: string;
  spacing?: number;
  padding?: number;
  align?: 'left' | 'right';
}

const PositionedDropdown: React.FC<PositionedDropdownProps> = ({
  children,
  isOpen,
  triggerElement,
  className = '',
  spacing = 4,
  padding = 8,
  align = 'right'
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isPositioned, setIsPositioned] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !triggerElement || !dropdownRef.current) return;

    const updatePosition = () => {
      if (!triggerElement || !dropdownRef.current) return;

      const triggerRect = triggerElement.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = triggerRect.bottom + spacing;
      let left = align === 'right'
        ? triggerRect.right - dropdownRect.width
        : triggerRect.left;

      if (left + dropdownRect.width > viewportWidth - padding) {
        left = viewportWidth - dropdownRect.width - padding;
      }
      if (left < padding) {
        left = padding;
      }

      if (top + dropdownRect.height > viewportHeight - padding) {
        top = triggerRect.top - dropdownRect.height - spacing;
        if (top < padding) {
          top = padding;
        }
      }

      setPosition({ top, left });
      setIsPositioned(true);
    };

    updatePosition();

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, triggerElement, spacing, padding, align]);

  useEffect(() => {
    if (!isOpen) {
      setIsPositioned(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={className}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1001,
        width: 'max-content',
        opacity: isPositioned ? 1 : 0
      }}>
      {children}
    </div>,
    document.body
  );
};

export default PositionedDropdown;