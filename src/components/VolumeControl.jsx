import React from 'react';

export function VolumeControl({ value, onChange }) {
  const lastVolumeRef = React.useRef(value);

  React.useEffect(() => {
    if (value > 0) {
      lastVolumeRef.current = value;
    }
  }, [value]);

  const handleToggle = () => {
    if (value > 0) {
      lastVolumeRef.current = value;
      onChange(0);
    } else {
      onChange(lastVolumeRef.current || 0.55);
    }
  };

  return (
    <div className="volume-control">
      <button
        type="button"
        className="volume-control__icon"
        onClick={handleToggle}
        aria-label={value === 0 ? '取消静音' : '静音'}
        aria-pressed={value === 0}
      >
        {value === 0 ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="volume-control__slider"
      />
    </div>
  );
}
