import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from './audio';
import { GAME_CONFIG } from './config';
import { createGameMaterials, GameMaterials } from './materials';
import { ChaserRig, createChaserModel, createPlayerModel, PlayerRig } from './models';
import { ParticlePool } from './particles';
import { ActivePowerUps, GameStatus, HudSnapshot, PowerUpType } from './types';
import {
  dirToForward,
  dirToRight,
  dirToYaw,
  localToWorld,
  PathSegment,
  turnDir,
  WorldManager,
} from './world';

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _lookDesired = new THREE.Vector3();
const _worldPos = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createSunsetSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(320, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x231936) },
      midColor: { value: new THREE.Color(0xb4532a) },
      horizonColor: { value: new THREE.Color(0xf6a964) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      void main() {
        float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.28, h));
        col = mix(col, topColor, smoothstep(0.25, 0.85, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

function createMountainRing(materials: GameMaterials): THREE.Group {
  const ring = new THREE.Group();
  const count = 20;
  const radius = 190;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const h = 34 + ((i * 19) % 28);
    const w = 24 + ((i * 11) % 16);
    const peak = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5), materials.mountainMat);
    peak.position.set(Math.cos(angle) * radius, h * 0.42 - 4, Math.sin(angle) * radius);
    peak.rotation.y = angle;
    ring.add(peak);
  }
  return ring;
}

export class TempleRunnerEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;
  private skyDome!: THREE.Mesh;
  private mountainRing!: THREE.Group;

  private materials!: GameMaterials;
  private world!: WorldManager;
  private particles!: ParticlePool;
  private playerRig!: PlayerRig;
  private chaserRig!: ChaserRig;
  public sound = new SoundEngine();

  // Loop & lifecycle
  private clock = new THREE.Clock();
  private rafId = 0;
  private timeoutId = 0;
  private disposed = false;
  private contextLost = false;

  // Game state
  private status: GameStatus = 'start';
  private distance = 0;
  private coins = 0;
  private coinCombo = 0;
  private coinComboTimer = 0;
  private bestDistance = 0;
  private isNewBest = false;
  private endReason = '';

  // Player kinematics along active segment
  private segIndex = 0;
  private along = 4.0;
  private currentLane = 0; // -1, 0, 1
  private lateralX = 0;
  private playerY = 0;
  private velocityY = 0;
  private grounded = true;
  private fastFalling = false;
  private slideTimer = 0;
  private playerYaw = 0;
  private targetYaw = 0;
  private speed: number = GAME_CONFIG.BASE_SPEED;
  private stumbleTimer = 0;
  private stumbleSlowTimer = 0;
  private shieldGraceTimer = 0;
  private queuedTurn: 'left' | 'right' | null = null;
  private queuedTurnTimer = 0;

  // Crash animation state
  private crashTimer = 0;
  private fallingOut = false;

  // Chaser & Camera
  private chaserGap: number = GAME_CONFIG.CHASER_FAR_GAP;
  private cameraYaw = 0;
  private cameraShake = 0;
  private runCycle = 0;
  private idleTime = 0;
  private hudEmitAccum = 0;

  private powerUps: ActivePowerUps = {
    magnet: 0,
    shield: 0,
    boost: 0,
  };

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isSoftwareGl = detectSoftwareGl();

    try {
      const saved = localStorage.getItem(GAME_CONFIG.STORAGE_BEST_KEY);
      if (saved) this.bestDistance = Math.max(0, parseInt(saved, 10) || 0);
    } catch {
      this.bestDistance = 0;
    }

    this.initScene();
    this.resetWorldState();
    this.bindEvents();
    this.emitHud();
    this.startLoop();
  }

  private initScene(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(GAME_CONFIG.FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(GAME_CONFIG.FOG_COLOR, GAME_CONFIG.FOG_DENSITY);

    // Procedural RoomEnvironment reflections for metallic gold coins & relics
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.2, 420);

    // Warm sunset lighting rig
    const hemiLight = new THREE.HemisphereLight(0xffcf99, 0x263829, 0.72);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffb36b, 2.2);
    this.sunLight.position.set(22, 34, 18);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    const d = 26;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 95;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Cool rim backlight for silhouette separation
    const rimLight = new THREE.DirectionalLight(0x7c8cf8, 0.55);
    rimLight.position.set(-18, 16, -24);
    this.scene.add(rimLight);

    this.materials = createGameMaterials(this.renderer);
    this.skyDome = createSunsetSkyDome();
    this.scene.add(this.skyDome);

    this.mountainRing = createMountainRing(this.materials);
    this.scene.add(this.mountainRing);

    this.world = new WorldManager(this.scene, this.materials);
    this.particles = new ParticlePool(this.scene, 110);

    this.playerRig = createPlayerModel(this.materials);
    this.scene.add(this.playerRig.root);

    this.chaserRig = createChaserModel(this.materials);
    this.scene.add(this.chaserRig.root);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private resetWorldState(): void {
    this.world.reset();
    this.particles.clear();

    this.distance = 0;
    this.coins = 0;
    this.coinCombo = 0;
    this.coinComboTimer = 0;
    this.isNewBest = false;
    this.endReason = '';

    this.segIndex = 0;
    this.along = 5.0;
    this.currentLane = 0;
    this.lateralX = 0;
    this.playerY = 0;
    this.velocityY = 0;
    this.grounded = true;
    this.fastFalling = false;
    this.slideTimer = 0;

    this.playerYaw = 0;
    this.targetYaw = 0;
    this.cameraYaw = 0;
    this.cameraShake = 0;
    this.speed = GAME_CONFIG.BASE_SPEED;
    this.stumbleTimer = 0;
    this.stumbleSlowTimer = 0;
    this.shieldGraceTimer = 0;
    this.queuedTurn = null;
    this.queuedTurnTimer = 0;
    this.crashTimer = 0;
    this.fallingOut = false;

    this.chaserGap = GAME_CONFIG.CHASER_FAR_GAP;
    this.powerUps.magnet = 0;
    this.powerUps.shield = 0;
    this.powerUps.boost = 0;

    this.syncPlayerTransform();
    this.syncChaserTransform(0);
    this.updateBackdropAndLights();
  }

  public startRun(): void {
    this.sound.unlock();
    this.sound.startMusic();
    this.resetWorldState();
    this.status = 'playing';
    this.emitHud();
  }

  public pauseRun(): void {
    if (this.status === 'playing') {
      this.status = 'paused';
      this.emitHud();
    }
  }

  public resumeRun(): void {
    if (this.status === 'paused') {
      this.sound.unlock();
      this.clock.getDelta(); // Discard elapsed pause delta
      this.status = 'playing';
      this.emitHud();
    }
  }

  public togglePause(): void {
    if (this.status === 'playing') this.pauseRun();
    else if (this.status === 'paused') this.resumeRun();
  }

  public toggleMute(): boolean {
    const muted = this.sound.toggleMute();
    this.emitHud();
    return muted;
  }

  // Player controls
  public moveLeft(): void {
    if (this.status !== 'playing') return;
    if (this.tryHandleTurnInput('left')) return;
    if (this.currentLane > -1) {
      this.currentLane--;
    }
  }

  public moveRight(): void {
    if (this.status !== 'playing') return;
    if (this.tryHandleTurnInput('right')) return;
    if (this.currentLane < 1) {
      this.currentLane++;
    }
  }

  public jump(): void {
    if (this.status !== 'playing') return;
    if (this.grounded) {
      this.grounded = false;
      this.fastFalling = false;
      this.slideTimer = 0;
      this.velocityY = GAME_CONFIG.JUMP_VELOCITY;
      this.sound.playJump();
      this.particles.emitBurst(
        this.playerRig.root.position.x,
        0.15,
        this.playerRig.root.position.z,
        0xc4a484,
        6,
        3.5,
        -10
      );
    }
  }

  public slide(): void {
    if (this.status !== 'playing') return;
    if (!this.grounded) {
      this.fastFalling = true;
      this.velocityY = Math.min(this.velocityY, -18);
      this.slideTimer = GAME_CONFIG.SLIDE_DURATION;
    } else if (this.slideTimer <= 0.15) {
      this.slideTimer = GAME_CONFIG.SLIDE_DURATION;
      this.sound.playSlide();
      this.particles.emitBurst(
        this.playerRig.root.position.x,
        0.15,
        this.playerRig.root.position.z,
        0xc4a484,
        5,
        3.0,
        -8
      );
    }
  }

  private tryHandleTurnInput(dir: 'left' | 'right'): boolean {
    const seg = this.world.segments[this.segIndex];
    const nextSeg = this.world.segments[this.segIndex + 1];
    if (!seg) return false;

    // Already inside a turn segment
    if ((seg.kind === 'turn_left' || seg.kind === 'turn_right') && !seg.turnTaken) {
      const expected = seg.kind === 'turn_left' ? 'left' : 'right';
      if (dir === expected) {
        this.executeTurn(seg, nextSeg);
      } else {
        // Pressed the wrong way inside a turn -> crash into outer wall!
        this.triggerGameOver('Wrong Turn at the Temple Corner');
      }
      return true;
    }

    // Approaching a turn segment on the straight just before it
    if (
      nextSeg &&
      (nextSeg.kind === 'turn_left' || nextSeg.kind === 'turn_right') &&
      seg.length - this.along <= GAME_CONFIG.TURN_BUFFER_DISTANCE
    ) {
      this.queuedTurn = dir;
      this.queuedTurnTimer = 0.85;
      return true;
    }

    return false;
  }

  private executeTurn(turnSeg: PathSegment, nextSeg: PathSegment | undefined): void {
    if (!nextSeg) return;
    turnSeg.turnTaken = true;
    this.queuedTurn = null;

    // Preserve continuous world XZ position when transitioning onto nextSeg!
    localToWorld(turnSeg, this.along, this.lateralX, _worldPos);
    const f = dirToForward(nextSeg.dir);
    const r = dirToRight(nextSeg.dir);
    const dx = _worldPos.x - nextSeg.startX;
    const dz = _worldPos.z - nextSeg.startZ;

    this.segIndex++;
    this.along = dx * f.x + dz * f.z;
    this.lateralX = dx * r.x + dz * r.z;

    // Snap target lane to nearest valid lane (-1, 0, 1) so corner exit feels crisp
    this.currentLane = Math.max(-1, Math.min(1, Math.round(this.lateralX / GAME_CONFIG.LANE_WIDTH)));

    const deltaYaw = turnSeg.kind === 'turn_left' ? Math.PI / 2 : -Math.PI / 2;
    this.targetYaw += deltaYaw;
    this.sound.playTurn();
  }

  private getUpcomingTurnHint(): 'left' | 'right' | null {
    const seg = this.world.segments[this.segIndex];
    if (!seg) return null;
    if ((seg.kind === 'turn_left' || seg.kind === 'turn_right') && !seg.turnTaken) {
      return seg.kind === 'turn_left' ? 'left' : 'right';
    }
    const nextSeg = this.world.segments[this.segIndex + 1];
    if (
      nextSeg &&
      (nextSeg.kind === 'turn_left' || nextSeg.kind === 'turn_right') &&
      seg.length - this.along <= 15
    ) {
      return nextSeg.kind === 'turn_left' ? 'left' : 'right';
    }
    return null;
  }

  private updatePlaying(dt: number): void {
    // Speed ramp
    this.speed = Math.min(
      GAME_CONFIG.MAX_SPEED,
      this.speed + GAME_CONFIG.SPEED_RAMP_PER_SEC * dt
    );

    if (this.coinComboTimer > 0) {
      this.coinComboTimer = Math.max(0, this.coinComboTimer - dt);
      if (this.coinComboTimer === 0) this.coinCombo = 0;
    }

    if (this.queuedTurnTimer > 0) {
      this.queuedTurnTimer = Math.max(0, this.queuedTurnTimer - dt);
      if (this.queuedTurnTimer === 0) this.queuedTurn = null;
    }

    // Power-up countdowns
    if (this.powerUps.magnet > 0) this.powerUps.magnet = Math.max(0, this.powerUps.magnet - dt);
    if (this.powerUps.shield > 0) this.powerUps.shield = Math.max(0, this.powerUps.shield - dt);
    if (this.powerUps.boost > 0) this.powerUps.boost = Math.max(0, this.powerUps.boost - dt);

    if (this.stumbleTimer > 0) this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    if (this.stumbleSlowTimer > 0) this.stumbleSlowTimer = Math.max(0, this.stumbleSlowTimer - dt);
    if (this.shieldGraceTimer > 0) this.shieldGraceTimer = Math.max(0, this.shieldGraceTimer - dt);

    let effectiveSpeed = this.speed;
    if (this.powerUps.boost > 0) {
      effectiveSpeed *= GAME_CONFIG.BOOST_MULTIPLIER;
    } else if (this.stumbleSlowTimer > 0) {
      effectiveSpeed *= GAME_CONFIG.STUMBLE_SPEED_PENALTY;
    }

    // Advance along path
    const step = effectiveSpeed * dt;
    this.along += step;
    this.distance += step;

    // Check segment transitions & turn execution
    let seg = this.world.segments[this.segIndex];
    while (seg && this.along >= seg.length) {
      if (seg.kind === 'turn_left' || seg.kind === 'turn_right') {
        if (!seg.turnTaken) {
          const expected = seg.kind === 'turn_left' ? 'left' : 'right';
          if (this.queuedTurn === expected) {
            this.executeTurn(seg, this.world.segments[this.segIndex + 1]);
            seg = this.world.segments[this.segIndex];
            continue;
          }
          // Missed the 90-degree turn!
          this.triggerGameOver('Missed the Temple Turn');
          return;
        }
      }

      const overflow = this.along - seg.length;
      this.segIndex++;
      this.along = overflow;
      seg = this.world.segments[this.segIndex];
    }

    if (!seg) return;

    // Auto-execute queued turn smoothly once entering the middle zone of the corner
    if (
      (seg.kind === 'turn_left' || seg.kind === 'turn_right') &&
      !seg.turnTaken &&
      this.along >= 2.2 &&
      this.queuedTurn
    ) {
      const expected = seg.kind === 'turn_left' ? 'left' : 'right';
      if (this.queuedTurn === expected) {
        this.executeTurn(seg, this.world.segments[this.segIndex + 1]);
        seg = this.world.segments[this.segIndex];
      } else {
        this.triggerGameOver('Wrong Turn at the Temple Corner');
        return;
      }
    }

    // Ensure future segments & recycle passed segments
    const prevCount = this.world.segments.length;
    const firstIdBefore = this.world.segments[0]?.id;
    this.world.ensureAhead(this.segIndex);
    if (this.world.segments[0]?.id !== firstIdBefore) {
      const shifted = Math.max(0, prevCount - this.world.segments.length + 1);
      // Re-find current segment index safely by id
      const foundIdx = this.world.segments.findIndex((s) => s.id === seg.id);
      if (foundIdx >= 0) this.segIndex = foundIdx;
      else this.segIndex = Math.max(0, this.segIndex - shifted);
    }

    // Lateral lane damping
    const targetX = this.currentLane * GAME_CONFIG.LANE_WIDTH;
    this.lateralX = THREE.MathUtils.damp(this.lateralX, targetX, GAME_CONFIG.LANE_SWITCH_DAMP, dt);

    // Vertical jump & gravity
    if (!this.grounded) {
      const g = this.fastFalling ? GAME_CONFIG.FAST_FALL_GRAVITY : GAME_CONFIG.GRAVITY;
      this.velocityY += g * dt;
      this.playerY += this.velocityY * dt;
      if (this.playerY <= 0) {
        // Check if landing directly inside a chasm gap!
        const overGap =
          seg.hasGap && this.along > seg.gapStart + 0.45 && this.along < seg.gapEnd - 0.45;
        if (overGap && this.powerUps.boost <= 0) {
          this.fallingOut = true;
          this.triggerGameOver('Fell into the Chasm');
          return;
        }
        this.playerY = 0;
        this.velocityY = 0;
        this.grounded = true;
        this.fastFalling = false;
      }
    } else {
      // Grounded over a gap?
      if (seg.hasGap && this.along > seg.gapStart + 0.5 && this.along < seg.gapEnd - 0.5) {
        if (this.powerUps.boost > 0) {
          // Boost dashes cleanly over chasms with a brief hop
          this.playerY = 0.35;
        } else {
          this.fallingOut = true;
          this.triggerGameOver('Fell into the Chasm');
          return;
        }
      }
    }

    if (this.slideTimer > 0) {
      this.slideTimer = Math.max(0, this.slideTimer - dt);
    }

    // Smooth yaw rotation during turns
    this.playerYaw = THREE.MathUtils.damp(this.playerYaw, this.targetYaw, 15, dt);
    this.cameraYaw = THREE.MathUtils.damp(this.cameraYaw, this.targetYaw, 10, dt);

    // Sync world transforms
    this.syncPlayerTransform();
    this.animatePlayerLimbs(dt, effectiveSpeed);

    // Chaser pursuit distance
    const targetGap =
      this.stumbleTimer > 0 ? GAME_CONFIG.CHASER_CLOSE_GAP : GAME_CONFIG.CHASER_FAR_GAP;
    this.chaserGap = THREE.MathUtils.damp(this.chaserGap, targetGap, 5.5, dt);
    this.syncChaserTransform(dt);

    // Check collisions with obstacles, coins, and power-ups
    this.checkObstacles(seg);
    this.updateCoinsAndPowerUps(dt);

    // Update camera
    this.updateFollowCamera(dt);

    // Emit HUD at ~20 Hz to keep React lightweight
    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.05) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private checkObstacles(seg: PathSegment): void {
    const playerLanePos = this.lateralX / GAME_CONFIG.LANE_WIDTH;
    const isSliding = this.slideTimer > 0 && this.grounded;
    const playerTop = isSliding ? 0.92 : this.playerY + 1.85;
    const playerBottom = this.playerY;

    for (let i = 0; i < seg.obstacles.length; i++) {
      const obs = seg.obstacles[i];
      if (obs.hit) continue;

      const dz = Math.abs(this.along - obs.along);
      if (dz > 0.88) continue;

      const minLane = obs.laneStart - 0.44;
      const maxLane = obs.laneStart + obs.laneSpan - 1 + 0.44;
      if (playerLanePos < minLane || playerLanePos > maxLane) continue;

      let collided = false;
      if (obs.kind === 'low_barrier') {
        collided = playerBottom < 0.96;
      } else if (obs.kind === 'overhead_beam') {
        collided = playerTop > 1.48 && playerBottom < 2.55;
      } else {
        collided = playerBottom < 2.65;
      }

      if (!collided) continue;
      obs.hit = true;

      // Speed Boost smashes cleanly through any obstacle!
      if (this.powerUps.boost > 0) {
        obs.mesh.visible = false;
        this.cameraShake = Math.max(this.cameraShake, 0.25);
        this.particles.emitBurst(
          obs.mesh.position.x,
          1.2,
          obs.mesh.position.z,
          0xf59e0b,
          16,
          11,
          -20
        );
        this.sound.playStumble();
        continue;
      }

      // Shield absorbs one hit!
      if (this.powerUps.shield > 0) {
        this.powerUps.shield = 0;
        this.shieldGraceTimer = GAME_CONFIG.SHIELD_GRACE_TIME;
        this.cameraShake = Math.max(this.cameraShake, 0.35);
        this.sound.playShieldBreak();
        this.particles.emitBurst(
          this.playerRig.root.position.x,
          1.2,
          this.playerRig.root.position.z,
          0x22d3ee,
          18,
          10,
          -14
        );
        this.emitHud();
        continue;
      }

      if (this.shieldGraceTimer > 0) continue;

      // First stumble brings the Guardian right behind the player; second stumble ends the run!
      if (this.stumbleTimer <= 0) {
        this.stumbleTimer = GAME_CONFIG.STUMBLE_WINDOW;
        this.stumbleSlowTimer = 0.65;
        this.cameraShake = 0.48;
        this.sound.playStumble();
        this.particles.emitBurst(
          this.playerRig.root.position.x,
          1.0,
          this.playerRig.root.position.z,
          0xd97706,
          14,
          8,
          -16
        );
        this.emitHud();
      } else {
        this.triggerGameOver('Caught by the Temple Guardian');
        return;
      }
    }
  }

  private updateCoinsAndPowerUps(dt: number): void {
    const px = this.playerRig.root.position.x;
    const py = this.playerRig.root.position.y + 1.0;
    const pz = this.playerRig.root.position.z;
    const magnetActive = this.powerUps.magnet > 0;
    const magnetRadiusSq = GAME_CONFIG.COIN_MAGNET_RADIUS * GAME_CONFIG.COIN_MAGNET_RADIUS;

    const startIdx = Math.max(0, this.segIndex - 1);
    const endIdx = Math.min(this.world.segments.length - 1, this.segIndex + 3);

    for (let s = startIdx; s <= endIdx; s++) {
      const seg = this.world.segments[s];

      for (let i = 0; i < seg.coins.length; i++) {
        const coin = seg.coins[i];
        if (coin.collected) continue;

        coin.mesh.rotation.y += dt * 4.2;

        if (magnetActive) {
          const dx = px - coin.mesh.position.x;
          const dy = py - coin.mesh.position.y;
          const dz = pz - coin.mesh.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < magnetRadiusSq || coin.magnetized) {
            coin.magnetized = true;
            const dist = Math.sqrt(distSq) || 0.001;
            const pull = Math.min(dist, GAME_CONFIG.COIN_MAGNET_PULL_SPEED * dt);
            coin.mesh.position.x += (dx / dist) * pull;
            coin.mesh.position.y += (dy / dist) * pull;
            coin.mesh.position.z += (dz / dist) * pull;
          }
        }

        const dx = px - coin.mesh.position.x;
        const dy = py - coin.mesh.position.y;
        const dz = pz - coin.mesh.position.z;
        if (dx * dx + dy * dy + dz * dz < 1.55 * 1.55) {
          coin.collected = true;
          coin.mesh.visible = false;
          this.coins++;
          this.coinCombo++;
          this.coinComboTimer = 1.1;
          this.sound.playCoin(this.coinCombo);
          this.particles.emitBurst(
            coin.mesh.position.x,
            coin.mesh.position.y,
            coin.mesh.position.z,
            0xffd166,
            7,
            5.5,
            -12
          );
        }
      }

      for (let i = 0; i < seg.powerUps.length; i++) {
        const pu = seg.powerUps[i];
        if (pu.collected) continue;

        pu.mesh.rotation.y += dt * 2.6;
        pu.mesh.position.y = pu.baseY + Math.sin(this.idleTime * 3.5 + pu.id) * 0.16;

        const dx = px - pu.mesh.position.x;
        const dy = py - pu.mesh.position.y;
        const dz = pz - pu.mesh.position.z;
        if (dx * dx + dy * dy + dz * dz < 1.75 * 1.75) {
          pu.collected = true;
          pu.mesh.visible = false;
          this.activatePowerUp(pu.type);
          const col =
            pu.type === 'magnet' ? 0xf87171 : pu.type === 'shield' ? 0x22d3ee : 0xfbbf24;
          this.particles.emitBurst(
            pu.mesh.position.x,
            pu.mesh.position.y,
            pu.mesh.position.z,
            col,
            16,
            8.5,
            -12
          );
        }
      }
    }
  }

  private activatePowerUp(type: PowerUpType): void {
    this.powerUps[type] = GAME_CONFIG.POWERUP_DURATION[type];
    this.sound.playPowerUp(type);
    this.emitHud();
  }

  private triggerGameOver(reason: string): void {
    this.status = 'gameover';
    this.endReason = reason;
    this.crashTimer = 0;
    this.cameraShake = 0.72;
    this.sound.stopMusic();
    this.sound.playCrash();

    this.particles.emitBurst(
      this.playerRig.root.position.x,
      this.playerY + 1.0,
      this.playerRig.root.position.z,
      0xf97316,
      24,
      10,
      -18
    );

    const rounded = Math.floor(this.distance);
    if (rounded > this.bestDistance) {
      this.bestDistance = rounded;
      this.isNewBest = true;
      try {
        localStorage.setItem(GAME_CONFIG.STORAGE_BEST_KEY, String(this.bestDistance));
      } catch {
        // Ignore storage errors
      }
    }

    this.emitHud();
  }

  private syncPlayerTransform(): void {
    const seg = this.world.segments[this.segIndex];
    if (!seg) return;
    localToWorld(seg, this.along, this.lateralX, _vecA);
    this.playerRig.root.position.set(_vecA.x, this.playerY, _vecA.z);
    this.playerRig.root.rotation.y = this.playerYaw;

    // Keep contact shadow anchored on the ground below the jumper
    this.playerRig.shadow.position.y = Math.max(0.03, -this.playerY + 0.03);
    const shadowScale = Math.max(0.45, 1 - this.playerY * 0.16);
    this.playerRig.shadow.scale.setScalar(shadowScale);
    (this.playerRig.shadow.material as THREE.MeshBasicMaterial).opacity =
      Math.max(0.18, 0.55 - this.playerY * 0.12);

    // Aura visibility
    this.playerRig.shieldAura.visible = this.powerUps.shield > 0;
    this.playerRig.magnetRing.visible = this.powerUps.magnet > 0;
    this.playerRig.boostAura.visible = this.powerUps.boost > 0;

    if (this.playerRig.shieldAura.visible) {
      this.playerRig.shieldAura.rotation.y += 0.03;
    }
    if (this.playerRig.magnetRing.visible) {
      this.playerRig.magnetRing.rotation.z += 0.06;
    }
  }

  private animatePlayerLimbs(dt: number, effectiveSpeed: number): void {
    this.runCycle += dt * effectiveSpeed * 0.85;
    const isSliding = this.slideTimer > 0 && this.grounded;

    if (isSliding) {
      this.playerRig.bodyGroup.position.y = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.position.y,
        0.5,
        18,
        dt
      );
      this.playerRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.rotation.x,
        0.85,
        18,
        dt
      );
      this.playerRig.leftLeg.rotation.x = -0.35;
      this.playerRig.rightLeg.rotation.x = -0.35;
      this.playerRig.leftArm.rotation.x = -0.5;
      this.playerRig.rightArm.rotation.x = -0.5;
      return;
    }

    this.playerRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
      this.playerRig.bodyGroup.rotation.x,
      -0.12,
      14,
      dt
    );

    if (!this.grounded) {
      // Mid-air heroic jump pose
      this.playerRig.bodyGroup.position.y = 0.98;
      this.playerRig.leftLeg.rotation.x = 0.55;
      this.playerRig.rightLeg.rotation.x = -0.45;
      this.playerRig.leftArm.rotation.x = -0.9;
      this.playerRig.rightArm.rotation.x = -0.7;
    } else {
      const swing = Math.sin(this.runCycle) * 0.85;
      const bob = Math.abs(Math.cos(this.runCycle)) * 0.12;
      this.playerRig.bodyGroup.position.y = 0.92 + bob;
      this.playerRig.leftLeg.rotation.x = swing;
      this.playerRig.rightLeg.rotation.x = -swing;
      this.playerRig.leftArm.rotation.x = -swing * 0.85;
      this.playerRig.rightArm.rotation.x = swing * 0.85;
    }

    // Scarf flutter
    this.playerRig.scarfTail.rotation.x = 0.18 + Math.sin(this.runCycle * 1.4) * 0.22;
    this.playerRig.scarfTail.rotation.y = Math.cos(this.runCycle * 1.1) * 0.24;

    // Slight body lean into lane switches
    const leanTarget = (this.currentLane * GAME_CONFIG.LANE_WIDTH - this.lateralX) * -0.14;
    this.playerRig.bodyGroup.rotation.z = THREE.MathUtils.damp(
      this.playerRig.bodyGroup.rotation.z,
      leanTarget,
      12,
      dt
    );
  }

  private syncChaserTransform(dt: number): void {
    const px = this.playerRig.root.position.x;
    const pz = this.playerRig.root.position.z;
    const sinY = Math.sin(this.playerYaw);
    const cosY = Math.cos(this.playerYaw);

    // Local +Z is behind the player in rotated yaw space
    const bx = px + sinY * this.chaserGap;
    const bz = pz + cosY * this.chaserGap;

    this.chaserRig.root.position.set(bx, 0, bz);
    this.chaserRig.root.rotation.y = this.playerYaw;

    // Heavy menacing bounding animation
    const cSwing = Math.sin(this.runCycle * 0.78) * 0.75;
    const cBob = Math.abs(Math.cos(this.runCycle * 0.78)) * 0.22;
    this.chaserRig.bodyGroup.position.y = 1.25 + cBob;
    this.chaserRig.leftArm.rotation.x = -cSwing * 0.9 - 0.35;
    this.chaserRig.rightArm.rotation.x = cSwing * 0.9 - 0.35;
    this.chaserRig.leftLeg.rotation.x = cSwing;
    this.chaserRig.rightLeg.rotation.x = -cSwing;

    if (dt > 0 && this.stumbleTimer > 0) {
      const pulse = 0.8 + Math.sin(this.idleTime * 14) * 0.2;
      this.chaserRig.eyeLeft.scale.setScalar(pulse);
      this.chaserRig.eyeRight.scale.setScalar(pulse);
    }
  }

  private updateFollowCamera(dt: number): void {
    const px = this.playerRig.root.position.x;
    const pz = this.playerRig.root.position.z;

    const sinY = Math.sin(this.cameraYaw);
    const cosY = Math.cos(this.cameraYaw);

    const extraPull = this.stumbleTimer > 0 ? 1.5 : 0;
    const distBehind = 7.4 + extraPull;
    const camHeight = 4.2 + (this.stumbleTimer > 0 ? 0.55 : 0) + this.playerY * 0.42;

    // Slight lateral damping so camera follows lane switches subtly
    _camDesired.set(
      px + sinY * distBehind,
      camHeight,
      pz + cosY * distBehind
    );
    _lookDesired.set(
      px - sinY * 6.5,
      1.45 + this.playerY * 0.38,
      pz - cosY * 6.5
    );

    if (dt === 0) {
      this.camera.position.copy(_camDesired);
    } else {
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camDesired.x, 11, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camDesired.y, 10, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camDesired.z, 11, dt);
    }

    // Decayed camera shake
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 1.9);
      const amp = this.cameraShake * 0.38;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp;
    }

    this.camera.lookAt(_lookDesired);

    // Dynamic FOV widening with speed / Speed Boost
    const targetFov = this.powerUps.boost > 0 ? 73 : 62 + ((this.speed - GAME_CONFIG.BASE_SPEED) / 20) * 5;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt || 0.016);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateIdleCamera(dt: number): void {
    const px = this.playerRig.root.position.x;
    const pz = this.playerRig.root.position.z;
    const angle = Math.sin(this.idleTime * 0.35) * 0.48 + 0.35;
    const rad = 8.5;

    _camDesired.set(px + Math.sin(angle) * rad, 3.8, pz + Math.cos(angle) * rad);
    _lookDesired.set(px, 1.4, pz - 2.0);
    this.camera.position.lerp(_camDesired, Math.min(1, dt * 4));
    this.camera.lookAt(_lookDesired);

    // Gentle idle breathing
    this.playerRig.bodyGroup.position.y = 0.95 + Math.sin(this.idleTime * 2.4) * 0.03;
    this.chaserRig.root.position.set(px + 0.8, 0, pz + 4.4);
    this.chaserRig.bodyGroup.position.y = 1.25 + Math.sin(this.idleTime * 2.0) * 0.06;
  }

  private updateCrashAnimation(dt: number): void {
    this.crashTimer += dt;
    if (this.fallingOut) {
      this.velocityY += GAME_CONFIG.GRAVITY * dt;
      this.playerY += this.velocityY * dt;
      this.playerRig.root.position.y = this.playerY;
      this.playerRig.bodyGroup.rotation.x += dt * 4.5;
    } else {
      // Stumble backward + Guardian looms in
      this.playerRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.rotation.x,
        -1.35,
        8,
        dt
      );
      this.playerRig.bodyGroup.position.y = THREE.MathUtils.damp(
        this.playerRig.bodyGroup.position.y,
        0.35,
        8,
        dt
      );
      this.chaserGap = THREE.MathUtils.damp(this.chaserGap, 1.35, 8, dt);
      this.syncChaserTransform(dt);
    }

    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 1.6);
      const amp = this.cameraShake * 0.4;
      _vecB.copy(this.camera.position);
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp;
    }
  }

  private updateBackdropAndLights(): void {
    const px = this.playerRig.root.position.x;
    const pz = this.playerRig.root.position.z;

    this.skyDome.position.set(px, 0, pz);
    this.mountainRing.position.set(px, 0, pz);

    this.sunLight.position.set(px + 22, 34, pz + 18);
    this.sunLight.target.position.set(px, 0, pz - 8);
    this.sunLight.target.updateMatrixWorld();
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDelta = this.clock.getDelta();
    const dt = Math.min(rawDelta, 0.05);
    this.idleTime += dt;

    if (!this.contextLost) {
      if (this.status === 'playing') {
        this.updatePlaying(dt);
      } else if (this.status === 'start') {
        this.updateIdleCamera(dt);
      } else if (this.status === 'gameover') {
        this.updateCrashAnimation(dt);
      }

      this.particles.update(dt);
      this.updateBackdropAndLights();
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.timeoutId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.timeoutId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.timeoutId = window.setTimeout(cb, 80);
      }
    };
    this.timeoutId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    this.clock.start();
    if (this.isSoftwareGl) {
      this.tick();
    } else {
      this.rafId = requestAnimationFrame(this.tick);
    }
  }

  private emitHud(): void {
    this.onHudUpdate({
      status: this.status,
      distance: Math.floor(this.distance),
      coins: this.coins,
      bestDistance: this.bestDistance,
      isNewBest: this.isNewBest,
      speed: Math.round(this.speed * 10) / 10,
      stumbleTimer: this.stumbleTimer,
      chaserDanger: this.stumbleTimer > 0,
      turnHint: this.status === 'playing' ? this.getUpcomingTurnHint() : null,
      powerUps: { ...this.powerUps },
      endReason: this.endReason,
      muted: this.sound.isMuted(),
    });
  }

  private handleResize = (): void => {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    if (this.status === 'playing') this.pauseRun();
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
  };

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timeoutId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.sound.dispose();
    this.world.dispose();
    this.particles.dispose();
    this.materials.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
