import React from 'react';
import { Stage } from './lib/animations.jsx';
import { rebuildScenarios } from './lib/simulation.jsx';
import {
  BG_COLOR,
  STAGE_H,
  STAGE_W,
  TOTAL_DURATION,
  ThreeBodyScene,
} from './modes/StoryScene.jsx';
import { SimulatorMode } from './modes/SimulatorMode.jsx';
import { FullscreenToggleButton } from './components/FullscreenToggleButton.jsx';
import { LoopingBgm } from './components/LoopingBgm.jsx';
import { VolumeControl } from './components/VolumeControl.jsx';
import './styles.css';

function StoryMode({ onBack, onSwitchMode, volume, onVolumeChange }) {
  const stageFrameRef = React.useRef(null);

  React.useEffect(() => {
    rebuildScenarios();
  }, []);

  return (
    <div className="workspace workspace--story">
      <header className="app-toolbar">
        <div>
          <span className="eyebrow">观演模式</span>
          <h2>三体世界 · 八大天象</h2>
        </div>
        <div className="toolbar-actions">
          <VolumeControl value={volume} onChange={onVolumeChange} />
          <button className="ghost-button" onClick={onBack}>返回首页</button>
          <button className="ghost-button" onClick={() => onSwitchMode('simulator')}>切到模拟器</button>
          <FullscreenToggleButton />
        </div>
      </header>

      <div className="story-shell" ref={stageFrameRef}>
        <FullscreenToggleButton targetRef={stageFrameRef} className="frame-fullscreen-button" />
        <Stage
          width={STAGE_W}
          height={STAGE_H}
          duration={TOTAL_DURATION}
          background={BG_COLOR}
          persistKey="three-body-simulator-story"
          persistLegacyKeys={['threebody-story']}
        >
          <ThreeBodyScene />
        </Stage>
      </div>
    </div>
  );
}

function HomeMode({ onEnter, volume, onVolumeChange }) {
  return (
    <main className="home-shell">
      <div className="home-volume">
        <VolumeControl value={volume} onChange={onVolumeChange} />
      </div>
      <div className="home-copy">
        <span className="eyebrow">THREE BODY DESKTOP SIMULATOR</span>
        <h1>
          <span className="home-title-line">三体世界</span>
          <span className="home-title-line">八大天象</span>
          <span className="home-title-line">实时模拟</span>
        </h1>
        <p>
          观演模式保留完整叙事与时间轴，模拟器模式则允许你实时调整四个天体的初始条件，
          直接观察轨迹、对冲与碰撞如何变化。
        </p>
      </div>

      <div className="mode-split">
        <button className="mode-panel mode-panel--story" onClick={() => onEnter('story')}>
          <span className="eyebrow">MODE 01</span>
          <h2>观演模式</h2>
          <p>保留电影化叙事、时间轴和八大天象，适合直接播放与展示。</p>
        </button>

        <button className="mode-panel mode-panel--simulator" onClick={() => onEnter('simulator')}>
          <span className="eyebrow">MODE 02</span>
          <h2>模拟器模式</h2>
          <p>四个天体分别独立调参，支持视觉项热更新、碰撞粒子效果和官方预设切换。</p>
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const [mode, setMode] = React.useState('home');
  const [bgmVolume, setBgmVolume] = React.useState(0.55);

  return (
    <div className="app-shell">
      <div className="app-noise" />
      <LoopingBgm enabled volume={bgmVolume} />
      {mode === 'home' ? <HomeMode onEnter={setMode} volume={bgmVolume} onVolumeChange={setBgmVolume} /> : null}
      {mode === 'story' ? <StoryMode onBack={() => setMode('home')} onSwitchMode={setMode} volume={bgmVolume} onVolumeChange={setBgmVolume} /> : null}
      {mode === 'simulator' ? <SimulatorMode onBack={() => setMode('home')} onSwitchMode={setMode} volume={bgmVolume} onVolumeChange={setBgmVolume} /> : null}
    </div>
  );
}
