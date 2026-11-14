/**
 * Central gameplay, physics, world generation, and difficulty configuration.
 * Tweak these values to tune game feel, pace, and challenge.
 */
export const GAME_CONFIG = {
  // Lane geometry (world units; 1 unit ≈ 1 meter)
  LANE_WIDTH: 2.35,
  PATH_WIDTH: 7.8,
  WALL_HEIGHT: 1.5,

  // Speed & difficulty progression
  BASE_SPEED: 16.5, // Starting forward speed (m/s)
  MAX_SPEED: 34.0, // Maximum natural running speed (m/s)
  SPEED_RAMP_PER_SEC: 0.24, // Gradual acceleration over time
  BOOST_MULTIPLIER: 1.52, // Speed multiplier during Speed Boost power-up

  // Player physics
  JUMP_VELOCITY: 14.8,
  GRAVITY: -39.5,
  FAST_FALL_GRAVITY: -68.0, // Extra gravity when pressing Down mid-air
  SLIDE_DURATION: 0.72, // Seconds spent sliding
  LANE_SWITCH_DAMP: 16.0, // Higher = snappier horizontal lane switch

  // Path & procedural chunk generation
  STRAIGHT_SEG_LENGTH: 18,
  TURN_SEG_LENGTH: 9, // Corner platform length (also determines turn window)
  GAP_SEG_LENGTH: 18, // Total segment length containing a chasm gap
  GAP_HOLE_LENGTH: 5.4, // Actual open chasm span inside a gap segment
  SEGMENTS_AHEAD: 7,
  SEGMENTS_BEHIND: 2,

  // Turn timing & forgiveness
  TURN_BUFFER_DISTANCE: 7.5, // How early before a corner a Left/Right turn input registers
  MIN_STRAIGHTS_BETWEEN_TURNS: 3, // Guarantees space to recover after each 90° turn
  TURN_PROBABILITY: 0.42, // Chance to spawn a 90° turn once minimum straights elapsed
  GAP_PROBABILITY: 0.22, // Chance a straight segment becomes a chasm gap (after intro distance)

  // Obstacles & collectibles
  INTRO_SAFE_SEGMENTS: 2, // First N segments are obstacle-free so player gets oriented
  POWERUP_SPAWN_CHANCE: 0.16, // Chance per eligible segment to spawn a power-up
  COIN_MAGNET_RADIUS: 11.5,
  COIN_MAGNET_PULL_SPEED: 34.0,

  // Power-up durations (seconds)
  POWERUP_DURATION: {
    magnet: 9.0,
    shield: 12.0,
    boost: 5.0,
  },

  // Chaser & stumble rules
  STUMBLE_WINDOW: 6.5, // Seconds the Guardian stays right behind after a stumble
  STUMBLE_SPEED_PENALTY: 0.68, // Temporary speed factor right after stumbling
  CHASER_FAR_GAP: 11.5, // Normal trailing distance behind player
  CHASER_CLOSE_GAP: 2.35, // Trailing distance when player is in stumble danger
  SHIELD_GRACE_TIME: 1.15, // Brief invulnerability after shield absorbs a hit

  // Visual atmosphere (warm sunset jungle ruins)
  FOG_COLOR: 0xd98a52,
  FOG_DENSITY: 0.0115,
  STORAGE_BEST_KEY: 'idol_run_best_distance_v1',
} as const;
