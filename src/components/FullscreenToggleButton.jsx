import React from 'react';

export function FullscreenToggleButton({ targetRef = null, className = '' }) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    const sync = () => {
      const target = targetRef?.current;
      if (target) {
        setIsFullscreen(document.fullscreenElement === target);
        return;
      }
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [targetRef]);

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await (targetRef?.current || document.documentElement).requestFullscreen();
      }
    } catch {
      // Ignore platform-specific fullscreen failures; keep the control non-fatal.
    }
  }, [targetRef]);

  return (
    <button className={`ghost-button ${className}`.trim()} onClick={toggleFullscreen}>
      {isFullscreen ? '退出全屏' : '全屏'}
    </button>
  );
}
