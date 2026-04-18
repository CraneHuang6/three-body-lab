// tweaks.jsx — Scenario picker (replaces the old IC slider panel).
// Lets the user jump to any scenario or replay the current one.
// Title: "Tweaks" to match the toolbar toggle contract.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "_placeholder": true
}/*EDITMODE-END*/;

const TWEAK_PANEL_FONT = '"Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", Arial, sans-serif';

function TweaksPanel() {
  const [visible, setVisible] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setVisible(true);
      else if (d.type === '__deactivate_edit_mode') setVisible(false);
    };
    window.addEventListener('message', onMsg);
    try {
      window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    } catch {}

    // Re-render the active-scenario highlight once per second so it tracks
    // the current playhead.
    const iv = setInterval(() => setTick((x) => x + 1), 400);
    return () => { window.removeEventListener('message', onMsg); clearInterval(iv); };
  }, []);

  if (!visible) return null;

  // Figure out which scenario is currently playing by reading the Stage's
  // persisted time via localStorage (same key Stage uses: "anim:<persistKey>").
  // This avoids coupling to Stage internals — we just read the number.
  const readNow = () => {
    try {
      const raw = localStorage.getItem('anim:threebody');
      if (raw) return parseFloat(raw) || 0;
    } catch {}
    return 0;
  };
  const now = readNow();

  // Rebuild the schedule here (mirrors scene.jsx) so we can jump to a scenario.
  const INTRO = window.SCENARIO_INTRO_DUR || 6.0;
  const INTER = window.SCENARIO_INTER_DUR || 1.2;
  let cursor = INTRO;
  const sched = SCENARIOS.map((sc) => {
    const start = cursor;
    cursor += sc.duration + INTER;
    return { id: sc.id, name: sc.name, kicker: sc.kicker, start, end: start + sc.duration, metric: sc.metric };
  });
  const outroStart = cursor;

  // Find active index.
  let activeIdx = -1;
  if (now < INTRO) activeIdx = -2; // intro
  else if (now >= outroStart) activeIdx = -3; // outro
  else {
    for (let i = 0; i < sched.length; i++) {
      if (now >= sched[i].start && now < sched[i].start + (sched[i].end - sched[i].start) + INTER) {
        activeIdx = i;
        break;
      }
    }
  }

  const jumpTo = (t) => {
    try {
      localStorage.setItem('anim:threebody', String(t));
      // Force Stage to pick up the new time — we dispatch a storage event on ourselves.
      window.dispatchEvent(new StorageEvent('storage', { key: 'anim:threebody', newValue: String(t) }));
    } catch {}
  };

  const metricLabels = {
    flux_ratio_distant: '辐照占比',
    temperature_cold: '冻结温度',
    approach: '视运动 / 闭合',
    flux_hot: '辐射通量',
    flux_melt: '辐射通量',
    tide: '潮汐强度',
    torn: '洛希极限',
  };

  return (
    <div style={{
      position: 'fixed',
      right: 20, top: 20, bottom: 20,
      width: 320,
      background: 'rgba(14,14,14,0.95)',
      border: '1px solid rgba(242,240,234,0.15)',
      color: '#f2f0ea',
      fontFamily: TWEAK_PANEL_FONT,
      padding: '18px 18px 14px 18px',
      overflowY: 'auto',
      zIndex: 1000,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 13, letterSpacing: '0.24em' }}>调整</div>
        <div style={{ fontSize: 10, color: 'rgba(242,240,234,0.5)', letterSpacing: '0.14em' }}>
          TWEAKS
        </div>
      </div>

      <div style={{
        fontSize: 10.5, color: 'rgba(242,240,234,0.6)',
        lineHeight: 1.7, marginBottom: 18,
        letterSpacing: '0.02em',
      }}>
        跳转到任意一种天象，或从头回放。
        每个场景都用手工调好的初始条件演示一类典型事件。
      </div>

      {/* Intro */}
      <PickerRow
        label="开场"
        sub="三体世界观与七种天象"
        active={activeIdx === -2}
        onClick={() => jumpTo(0)}
      />

      {/* Scenarios */}
      <div style={{
        marginTop: 18, paddingTop: 14,
        borderTop: '1px solid rgba(242,240,234,0.12)',
        fontSize: 9.5, letterSpacing: '0.22em', color: 'rgba(242,240,234,0.5)',
        marginBottom: 10,
      }}>
        七种天象
      </div>

      {sched.map((s, i) => (
        <PickerRow
          key={s.id}
          index={String(i + 1).padStart(2, '0')}
          label={s.name}
          sub={s.kicker + ' · ' + (metricLabels[s.metric] || s.metric)}
          active={activeIdx === i}
          onClick={() => jumpTo(s.start + 0.05)}
        />
      ))}

      {/* Outro */}
      <div style={{
        marginTop: 18, paddingTop: 14,
        borderTop: '1px solid rgba(242,240,234,0.12)',
      }}>
        <PickerRow
          label="结语"
          sub="与混沌共处"
          active={activeIdx === -3}
          onClick={() => jumpTo(outroStart + 0.05)}
        />
      </div>

      <div style={{
        marginTop: 20, paddingTop: 14,
        borderTop: '1px solid rgba(242,240,234,0.12)',
        display: 'flex', gap: 8,
      }}>
        <button
          onClick={() => jumpTo(0)}
          style={pickerButtonStyle}
        >从头播放</button>
        <button
          onClick={() => {
            if (activeIdx >= 0) jumpTo(sched[activeIdx].start + 0.05);
          }}
          style={pickerButtonStyle}
        >重播当前</button>
      </div>

      <div style={{
        marginTop: 14,
        fontSize: 10, color: 'rgba(242,240,234,0.4)',
        lineHeight: 1.7, letterSpacing: '0.04em',
      }}>
        所有初始条件为脚本预设。每段时长由物理触发条件决定——改动参数会破坏该天象的精确再现。
      </div>
    </div>
  );
}

const pickerButtonStyle = {
  flex: 1,
  background: 'transparent',
  border: '1px solid rgba(242,240,234,0.2)',
  color: 'rgba(242,240,234,0.85)',
  fontSize: 11,
  letterSpacing: '0.16em',
  padding: '8px 10px',
  cursor: 'pointer',
  fontFamily: TWEAK_PANEL_FONT,
};

function PickerRow({ index, label, sub, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 14,
        width: '100%',
        padding: '10px 2px',
        background: 'transparent',
        border: 'none',
        borderLeft: active
          ? '2px solid #f2f0ea'
          : '2px solid transparent',
        paddingLeft: 10,
        textAlign: 'left',
        cursor: 'pointer',
        color: active ? '#f2f0ea' : 'rgba(242,240,234,0.75)',
        fontFamily: TWEAK_PANEL_FONT,
        transition: 'color 120ms',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.color = '#f2f0ea';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.color = 'rgba(242,240,234,0.75)';
      }}
    >
      {index && (
        <span style={{
          fontSize: 10, color: active ? '#f2f0ea' : 'rgba(242,240,234,0.4)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.1em',
          minWidth: 18,
        }}>{index}</span>
      )}
      <span style={{ flex: 1 }}>
        <div style={{
          fontSize: 14,
          letterSpacing: '0.1em',
          marginBottom: 3,
        }}>{label}</div>
        <div style={{
          fontSize: 10,
          color: active ? 'rgba(242,240,234,0.7)' : 'rgba(242,240,234,0.45)',
          letterSpacing: '0.08em',
        }}>{sub}</div>
      </span>
    </button>
  );
}

Object.assign(window, {
  TweaksPanel, TWEAK_DEFAULTS,
});
