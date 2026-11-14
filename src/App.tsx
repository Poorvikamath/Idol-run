import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  Flame,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GAME_CONFIG } from './game/config';
import { TempleRunnerEngine } from './game/engine';
import { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  status: 'start',
  distance: 0,
  coins: 0,
  bestDistance: 0,
  isNewBest: false,
  speed: GAME_CONFIG.BASE_SPEED,
  stumbleTimer: 0,
  chaserDanger: false,
  turnHint: null,
  powerUps: {
    magnet: 0,
    shield: 0,
    boost: 0,
  },
  endReason: '',
  muted: false,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TempleRunnerEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  // Touch swipe tracking refs (no re-renders during gestures)
  const touchStartRef = useRef<{ x: number; y: number; handled: boolean } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new TempleRunnerEngine(container, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      const code = e.code;
      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (code === 'ArrowLeft' || code === 'KeyA') {
        engine.moveLeft();
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        engine.moveRight();
      } else if (code === 'ArrowUp' || code === 'KeyW' || code === 'Space') {
        if (hud.status === 'start' || hud.status === 'gameover') {
          engine.startRun();
        } else {
          engine.jump();
        }
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        engine.slide();
      } else if (code === 'Escape' || code === 'KeyP') {
        engine.togglePause();
      } else if (code === 'KeyM') {
        engine.toggleMute();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hud.status]);

  // Touch swipe handlers on the viewport
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, handled: false };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    const engine = engineRef.current;
    if (!start || start.handled || !engine || e.touches.length !== 1) return;

    const t = e.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const threshold = 28;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    start.handled = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) engine.moveLeft();
      else engine.moveRight();
    } else {
      if (dy < 0) engine.jump();
      else engine.slide();
    }
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  const handlePlay = () => engineRef.current?.startRun();
  const handlePauseToggle = () => engineRef.current?.togglePause();
  const handleMuteToggle = () => engineRef.current?.toggleMute();

  const activePowerUps = [
    {
      key: 'magnet' as const,
      label: 'Magnet',
      remaining: hud.powerUps.magnet,
      duration: GAME_CONFIG.POWERUP_DURATION.magnet,
      color: 'bg-red-500',
      textColor: 'text-red-300',
      Icon: Magnet,
    },
    {
      key: 'shield' as const,
      label: 'Shield',
      remaining: hud.powerUps.shield,
      duration: GAME_CONFIG.POWERUP_DURATION.shield,
      color: 'bg-cyan-400',
      textColor: 'text-cyan-300',
      Icon: Shield,
    },
    {
      key: 'boost' as const,
      label: 'Boost',
      remaining: hud.powerUps.boost,
      duration: GAME_CONFIG.POWERUP_DURATION.boost,
      color: 'bg-amber-400',
      textColor: 'text-amber-300',
      Icon: Flame,
    },
  ].filter((p) => p.remaining > 0);

  return (
    <div
      className="relative w-full h-full overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={mountRef} className="fixed inset-0 w-full h-full" />

      {/* Subtle danger edge tint when the Guardian is close behind */}
      {hud.status === 'playing' && hud.chaserDanger && (
        <div
          className="pointer-events-none fixed inset-0 z-10 border-4 border-red-500/55"
          style={{
            boxShadow: 'inset 0 0 85px rgba(220, 38, 38, 0.45)',
          }}
        />
      )}

      {/* In-Game HUD */}
      {hud.status !== 'start' && (
        <header className="pointer-events-none fixed top-0 left-0 right-0 z-20 flex items-start justify-between gap-4 p-4 sm:p-5">
          {/* Top-Left: Distance, Coins, Best */}
          <div
            className="pointer-events-auto flex items-center gap-5 rounded-xl border border-amber-400/20 px-4 py-2.5 shadow-lg"
            style={{ backgroundColor: 'rgba(20, 14, 10, 0.84)' }}
          >
            <div>
              <div className="text-[11px] font-medium tracking-wide text-amber-200/70">
                Distance
              </div>
              <div className="font-mono-tabular text-xl font-bold leading-tight text-amber-50 sm:text-2xl">
                {hud.distance.toLocaleString()} m
              </div>
            </div>

            <div className="h-8 w-px bg-amber-300/15" />

            <div>
              <div className="text-[11px] font-medium tracking-wide text-amber-200/70">
                Coins
              </div>
              <div className="font-mono-tabular flex items-center gap-1.5 text-xl font-bold leading-tight text-amber-300 sm:text-2xl">
                <Coins className="h-4 w-4 text-amber-400" />
                <span>{hud.coins}</span>
              </div>
            </div>

            {hud.bestDistance > 0 && (
              <>
                <div className="hidden h-8 w-px bg-amber-300/15 sm:block" />
                <div className="hidden sm:block">
                  <div className="text-[11px] font-medium tracking-wide text-amber-200/70">
                    Best
                  </div>
                  <div className="font-mono-tabular text-base font-semibold leading-tight text-amber-100/85">
                    {hud.bestDistance.toLocaleString()} m
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Top-Center: Power-Up Timers & Alerts */}
          <div className="flex flex-col items-center gap-2">
            {activePowerUps.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {activePowerUps.map(({ key, label, remaining, duration, color, textColor, Icon }) => (
                  <div
                    key={key}
                    className="flex min-w-[116px] flex-col gap-1 rounded-lg border border-amber-300/20 px-3 py-1.5"
                    style={{ backgroundColor: 'rgba(20, 14, 10, 0.86)' }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className={`flex items-center gap-1.5 ${textColor}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </span>
                      <span className="font-mono-tabular text-amber-50/90">
                        {remaining.toFixed(1)}s
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full ${color}`}
                        style={{ width: `${Math.min(100, (remaining / duration) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hud.chaserDanger && hud.status === 'playing' && (
              <div
                className="rounded-lg border border-red-400/40 px-3 py-1 text-xs font-semibold text-red-200"
                style={{ backgroundColor: 'rgba(69, 10, 10, 0.88)' }}
              >
                Guardian right behind you — avoid another stumble
              </div>
            )}

            {hud.turnHint && hud.status === 'playing' && (
              <div
                className="flex items-center gap-1.5 rounded-lg border border-amber-400/45 px-3 py-1 text-xs font-semibold text-amber-200"
                style={{ backgroundColor: 'rgba(32, 20, 10, 0.88)' }}
              >
                {hud.turnHint === 'left' ? (
                  <>
                    <ArrowLeft className="h-4 w-4 text-amber-400" />
                    <span>Turn Left Ahead</span>
                  </>
                ) : (
                  <>
                    <span>Turn Right Ahead</span>
                    <ArrowRight className="h-4 w-4 text-amber-400" />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Top-Right: Mute & Pause */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleMuteToggle}
              aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/20 text-amber-100 transition-colors hover:border-amber-300/45 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-amber-400"
              style={{ backgroundColor: 'rgba(20, 14, 10, 0.84)' }}
            >
              {hud.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>

            {hud.status !== 'gameover' && (
              <button
                type="button"
                onClick={handlePauseToggle}
                aria-label={hud.status === 'paused' ? 'Resume game' : 'Pause game'}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/20 text-amber-100 transition-colors hover:border-amber-300/45 hover:text-amber-300 focus-visible:outline-2 focus-visible:outline-amber-400"
                style={{ backgroundColor: 'rgba(20, 14, 10, 0.84)' }}
              >
                {hud.status === 'paused' ? (
                  <Play className="h-5 w-5" />
                ) : (
                  <Pause className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        </header>
      )}

      {/* Start Screen Overlay */}
      {hud.status === 'start' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-amber-400/25 p-7 shadow-2xl sm:p-8"
            style={{ backgroundColor: 'rgba(20, 14, 10, 0.88)' }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-amber-400">
                  Ancient Jungle Ruins
                </p>
                <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-amber-50 sm:text-4xl">
                  Idol Run
                </h1>
              </div>

              <button
                type="button"
                onClick={handleMuteToggle}
                aria-label={hud.muted ? 'Unmute audio' : 'Mute audio'}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 text-amber-100 transition-colors hover:border-amber-300/50 hover:text-amber-300"
                style={{ backgroundColor: 'rgba(34, 24, 17, 0.9)' }}
              >
                {hud.muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-amber-100/80">
              Outrun the temple guardian through crumbling jungle walkways. Leap over stone barriers,
              slide under mossy beams, and turn sharp corners in time.
            </p>

            {/* Concise control instructions */}
            <div className="mt-5 space-y-2.5 border-y border-amber-300/15 py-4 text-sm text-amber-100/90">
              <div className="flex items-center justify-between gap-4">
                <span className="text-amber-200/70">Switch Lanes & Turn</span>
                <span className="font-mono-tabular text-xs font-semibold text-amber-100">
                  Left / Right or A / D
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-amber-200/70">Jump Gaps & Barriers</span>
                <span className="font-mono-tabular text-xs font-semibold text-amber-100">
                  Up / W / Space
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-amber-200/70">Slide Under Beams</span>
                <span className="font-mono-tabular text-xs font-semibold text-amber-100">
                  Down / S
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-amber-200/70">Touch Devices</span>
                <span className="text-xs font-semibold text-amber-100">
                  Swipe Left, Right, Up, Down
                </span>
              </div>
            </div>

            {hud.bestDistance > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-amber-200/75">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  Best Distance
                </span>
                <span className="font-mono-tabular font-bold text-amber-300">
                  {hud.bestDistance.toLocaleString()} m
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handlePlay}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-base font-bold text-stone-950 transition-colors hover:bg-amber-400 active:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              <Play className="h-5 w-5 fill-current" />
              <span>Play</span>
            </button>
          </div>
        </div>
      )}

      {/* Pause Overlay */}
      {hud.status === 'paused' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-amber-400/25 p-6 shadow-2xl"
            style={{ backgroundColor: 'rgba(20, 14, 10, 0.92)' }}
          >
            <h2 className="font-display text-center text-2xl font-bold text-amber-50">
              Paused
            </h2>
            <p className="mt-1 text-center text-sm text-amber-200/75">
              {hud.distance.toLocaleString()} m · {hud.coins} coins
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>Resume</span>
              </button>

              <button
                type="button"
                onClick={handlePlay}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/25 px-5 py-3 text-sm font-semibold text-amber-100 transition-colors hover:border-amber-300/50 hover:text-amber-300"
                style={{ backgroundColor: 'rgba(34, 24, 17, 0.9)' }}
              >
                <RotateCcw className="h-4 w-4" />
                <span>Restart</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {hud.status === 'gameover' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 p-4">
          <div
            className="w-full max-w-md rounded-2xl border border-amber-400/30 p-7 shadow-2xl"
            style={{ backgroundColor: 'rgba(20, 14, 10, 0.92)' }}
          >
            <p className="text-center text-xs font-semibold tracking-wider text-orange-400">
              {hud.endReason || 'Run Ended'}
            </p>
            <h2 className="font-display mt-1 text-center text-3xl font-extrabold text-amber-50">
              Temple Escape Over
            </h2>

            <div className="mt-6 grid grid-cols-3 gap-3 border-y border-amber-300/15 py-4 text-center">
              <div>
                <div className="text-xs text-amber-200/70">Distance</div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-amber-50">
                  {hud.distance.toLocaleString()} m
                </div>
              </div>

              <div>
                <div className="text-xs text-amber-200/70">Coins</div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-amber-300">
                  {hud.coins}
                </div>
              </div>

              <div>
                <div className="text-xs text-amber-200/70">
                  {hud.isNewBest ? 'New Best' : 'Best'}
                </div>
                <div className="font-mono-tabular mt-1 text-xl font-bold text-amber-400">
                  {hud.bestDistance.toLocaleString()} m
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePlay}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-base font-bold text-stone-950 transition-colors hover:bg-amber-400 active:bg-amber-600 focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              <RotateCcw className="h-5 w-5" />
              <span>Restart</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
