export type GameStatus = 'start' | 'playing' | 'paused' | 'gameover';

export type PowerUpType = 'magnet' | 'shield' | 'boost';

export type ObstacleKind = 'low_barrier' | 'overhead_beam' | 'tall_block';

export type SegmentKind = 'straight' | 'turn_left' | 'turn_right' | 'gap';

/**
 * Cardinal heading index in XZ world space:
 * 0 = North (-Z), 1 = East (+X), 2 = South (+Z), 3 = West (-X)
 */
export type CardinalDir = 0 | 1 | 2 | 3;

export interface ActivePowerUps {
  magnet: number;
  shield: number;
  boost: number;
}

export interface HudSnapshot {
  status: GameStatus;
  distance: number;
  coins: number;
  bestDistance: number;
  isNewBest: boolean;
  speed: number;
  stumbleTimer: number;
  chaserDanger: boolean;
  turnHint: 'left' | 'right' | null;
  powerUps: ActivePowerUps;
  endReason: string;
  muted: boolean;
}
