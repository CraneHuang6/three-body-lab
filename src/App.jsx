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
import { LabMode } from './modes/LabMode.jsx';
import { FullscreenToggleButton } from './components/FullscreenToggleButton.jsx';
import { LoopingBgm } from './components/LoopingBgm.jsx';
import './styles.css';

function StoryMode({ onBack, onSwitchMode }) {
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
          <button className="ghost-button" onClick={onBack}>返回首页</button>
          <button className="ghost-button" onClick={() => onSwitchMode('lab')}>切到实验室</button>
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
          persistKey="threebody-story"
        >
          <ThreeBodyScene />
        </Stage>
      </div>
    </div>
  );
}

function HomeMode({ onEnter }) {
  return (
    <main className="home-shell">
      <div className="home-copy">
        <span className="eyebrow">THREE BODY DESKTOP LAB</span>
        <h1>三体八大天象动画已上线观演模式，并新增可手动调参的实验室模式</h1>
        <p>
          现在它不再只是一个静态原型页面。
          你可以在观演模式里沉浸观看八种天象，也可以切进实验室，实时拖动四个天体的初始条件，观察新的轨迹、对冲与碰撞。
        </p>
      </div>

      <div className="mode-split">
        <button className="mode-panel mode-panel--story" onClick={() => onEnter('story')}>
          <span className="eyebrow">MODE 01</span>
          <h2>观演模式</h2>
          <p>保留电影化叙事、时间轴和八大天象，适合直接播放与展示。</p>
        </button>

        <button className="mode-panel mode-panel--lab" onClick={() => onEnter('lab')}>
          <span className="eyebrow">MODE 02</span>
          <h2>实验室模式</h2>
          <p>四个天体分别独立调参，支持视觉项热更新、碰撞粒子效果和官方预设切换。</p>
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const [mode, setMode] = React.useState('home');

  return (
    <div className="app-shell">
      <div className="app-noise" />
      <LoopingBgm enabled={mode === 'story' || mode === 'lab'} />
      {mode === 'home' ? <HomeMode onEnter={setMode} /> : null}
      {mode === 'story' ? <StoryMode onBack={() => setMode('home')} onSwitchMode={setMode} /> : null}
      {mode === 'lab' ? <LabMode onBack={() => setMode('home')} onSwitchMode={setMode} /> : null}
    </div>
  );
}
