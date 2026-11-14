import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { GameMaterials } from './materials';
import {
  createCoinModel,
  createJungleTree,
  createObstacleModel,
  createPowerUpModel,
} from './models';
import { CardinalDir, ObstacleKind, PowerUpType, SegmentKind } from './types';

export interface ActiveObstacle {
  id: number;
  kind: ObstacleKind;
  mesh: THREE.Group;
  segmentId: number;
  along: number; // Distance along segment
  laneStart: number; // -1, 0, 1
  laneSpan: number; // 1, 2, or 3 lanes
  hit: boolean;
}

export interface ActiveCoin {
  id: number;
  mesh: THREE.Group;
  segmentId: number;
  along: number;
  laneX: number;
  baseY: number;
  collected: boolean;
  magnetized: boolean;
  worldPos: THREE.Vector3;
}

export interface ActivePowerUp {
  id: number;
  type: PowerUpType;
  mesh: THREE.Group;
  segmentId: number;
  along: number;
  laneX: number;
  baseY: number;
  collected: boolean;
  worldPos: THREE.Vector3;
}

export interface PathSegment {
  id: number;
  kind: SegmentKind;
  dir: CardinalDir;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  length: number;
  hasGap: boolean;
  gapStart: number;
  gapEnd: number;
  mesh: THREE.Group;
  obstacles: ActiveObstacle[];
  coins: ActiveCoin[];
  powerUps: ActivePowerUp[];
  turnTaken: boolean;
}

export function dirToForward(dir: CardinalDir): { x: number; z: number } {
  switch (dir) {
    case 0:
      return { x: 0, z: -1 };
    case 1:
      return { x: 1, z: 0 };
    case 2:
      return { x: 0, z: 1 };
    case 3:
      return { x: -1, z: 0 };
  }
}

export function dirToRight(dir: CardinalDir): { x: number; z: number } {
  switch (dir) {
    case 0:
      return { x: 1, z: 0 };
    case 1:
      return { x: 0, z: 1 };
    case 2:
      return { x: -1, z: 0 };
    case 3:
      return { x: 0, z: -1 };
  }
}

export function dirToYaw(dir: CardinalDir): number {
  switch (dir) {
    case 0:
      return 0;
    case 1:
      return -Math.PI / 2;
    case 2:
      return -Math.PI;
    case 3:
      return Math.PI / 2;
  }
}

export function turnDir(dir: CardinalDir, turn: 'left' | 'right'): CardinalDir {
  if (turn === 'right') {
    return ((dir + 1) % 4) as CardinalDir;
  }
  return ((dir + 3) % 4) as CardinalDir;
}

export function localToWorld(
  seg: PathSegment,
  along: number,
  lateral: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const f = dirToForward(seg.dir);
  const r = dirToRight(seg.dir);
  out.set(
    seg.startX + f.x * along + r.x * lateral,
    0,
    seg.startZ + f.z * along + r.z * lateral
  );
  return out;
}

/**
 * Procedural chunk builder + object pools for segments, obstacles, coins, and power-ups.
 */
export class WorldManager {
  private scene: THREE.Scene;
  private materials: GameMaterials;

  public segments: PathSegment[] = [];
  private nextSegId = 1;
  private nextObjId = 1;
  private straightsSinceTurn = 0;

  // Object pools
  private straightMeshes: THREE.Group[] = [];
  private gapMeshes: THREE.Group[] = [];
  private turnLeftMeshes: THREE.Group[] = [];
  private turnRightMeshes: THREE.Group[] = [];

  private obstaclePools: Record<string, THREE.Group[]> = {
    low_1: [],
    low_3: [],
    beam_1: [],
    beam_3: [],
    tall_1: [],
  };

  private coinPool: THREE.Group[] = [];
  private powerUpPools: Record<PowerUpType, THREE.Group[]> = {
    magnet: [],
    shield: [],
    boost: [],
  };

  constructor(scene: THREE.Scene, materials: GameMaterials) {
    this.scene = scene;
    this.materials = materials;
    this.warmPools();
  }

  private warmPools(): void {
    for (let i = 0; i < 10; i++) {
      const s = this.buildStraightMesh();
      s.visible = false;
      this.scene.add(s);
      this.straightMeshes.push(s);
    }

    for (let i = 0; i < 4; i++) {
      const g = this.buildGapMesh();
      g.visible = false;
      this.scene.add(g);
      this.gapMeshes.push(g);
    }

    for (let i = 0; i < 3; i++) {
      const tl = this.buildTurnMesh('left');
      tl.visible = false;
      this.scene.add(tl);
      this.turnLeftMeshes.push(tl);

      const tr = this.buildTurnMesh('right');
      tr.visible = false;
      this.scene.add(tr);
      this.turnRightMeshes.push(tr);
    }

    const singleW = GAME_CONFIG.LANE_WIDTH * 0.9;
    const fullW = GAME_CONFIG.PATH_WIDTH - 0.6;

    for (let i = 0; i < 10; i++) {
      this.pushToObstaclePool('low_1', createObstacleModel('low_barrier', singleW, this.materials));
      this.pushToObstaclePool('tall_1', createObstacleModel('tall_block', singleW, this.materials));
      this.pushToObstaclePool('beam_1', createObstacleModel('overhead_beam', singleW + 0.4, this.materials));
    }
    for (let i = 0; i < 6; i++) {
      this.pushToObstaclePool('low_3', createObstacleModel('low_barrier', fullW, this.materials));
      this.pushToObstaclePool('beam_3', createObstacleModel('overhead_beam', fullW, this.materials));
    }

    for (let i = 0; i < 140; i++) {
      const c = createCoinModel(this.materials);
      c.visible = false;
      this.scene.add(c);
      this.coinPool.push(c);
    }

    const pTypes: PowerUpType[] = ['magnet', 'shield', 'boost'];
    pTypes.forEach((pt) => {
      for (let i = 0; i < 4; i++) {
        const pm = createPowerUpModel(pt, this.materials);
        pm.visible = false;
        this.scene.add(pm);
        this.powerUpPools[pt].push(pm);
      }
    });
  }

  private pushToObstaclePool(key: string, mesh: THREE.Group): void {
    mesh.visible = false;
    this.scene.add(mesh);
    this.obstaclePools[key].push(mesh);
  }

  private borrowObstacleMesh(kind: ObstacleKind, laneSpan: number): THREE.Group {
    const key =
      kind === 'low_barrier'
        ? laneSpan >= 3
          ? 'low_3'
          : 'low_1'
        : kind === 'overhead_beam'
          ? laneSpan >= 3
            ? 'beam_3'
            : 'beam_1'
          : 'tall_1';

    const pool = this.obstaclePools[key];
    if (pool.length > 0) {
      const m = pool.pop()!;
      m.userData.poolKey = key;
      m.visible = true;
      return m;
    }

    const w = laneSpan >= 3 ? GAME_CONFIG.PATH_WIDTH - 0.6 : GAME_CONFIG.LANE_WIDTH * 0.9;
    const m = createObstacleModel(kind, kind === 'overhead_beam' && laneSpan === 1 ? w + 0.4 : w, this.materials);
    m.userData.poolKey = key;
    this.scene.add(m);
    return m;
  }

  private returnObstacleMesh(mesh: THREE.Group): void {
    mesh.visible = false;
    const key = mesh.userData.poolKey as string;
    if (key && this.obstaclePools[key]) {
      this.obstaclePools[key].push(mesh);
    }
  }

  private borrowCoinMesh(): THREE.Group {
    if (this.coinPool.length > 0) {
      const c = this.coinPool.pop()!;
      c.visible = true;
      c.scale.setScalar(1);
      return c;
    }
    const c = createCoinModel(this.materials);
    this.scene.add(c);
    return c;
  }

  private returnCoinMesh(mesh: THREE.Group): void {
    mesh.visible = false;
    this.coinPool.push(mesh);
  }

  private borrowPowerUpMesh(type: PowerUpType): THREE.Group {
    const pool = this.powerUpPools[type];
    if (pool.length > 0) {
      const m = pool.pop()!;
      m.visible = true;
      return m;
    }
    const m = createPowerUpModel(type, this.materials);
    this.scene.add(m);
    return m;
  }

  private returnPowerUpMesh(type: PowerUpType, mesh: THREE.Group): void {
    mesh.visible = false;
    this.powerUpPools[type].push(mesh);
  }

  private buildSideDecor(group: THREE.Group, length: number, skipMiddleHole = false): void {
    const halfW = GAME_CONFIG.PATH_WIDTH / 2;

    // Raised stone curbs
    const curbGeo = new THREE.BoxGeometry(0.55, 0.42, length);
    const curbL = new THREE.Mesh(curbGeo, this.materials.stoneTrim);
    curbL.position.set(-halfW - 0.25, 0.21, -length / 2);
    curbL.receiveShadow = true;
    group.add(curbL);

    const curbR = new THREE.Mesh(curbGeo, this.materials.stoneTrim);
    curbR.position.set(halfW + 0.25, 0.21, -length / 2);
    curbR.receiveShadow = true;
    group.add(curbR);

    // Ruined mossy flanking walls
    const wallGeo = new THREE.BoxGeometry(0.85, 1.35, length * 0.44);
    [-1, 1].forEach((side) => {
      const wx = side * (halfW + 1.05);
      const w1 = new THREE.Mesh(wallGeo, this.materials.mossyWall);
      w1.position.set(wx, 0.67, -length * 0.24);
      w1.castShadow = true;
      w1.receiveShadow = true;
      group.add(w1);

      if (!skipMiddleHole) {
        const w2 = new THREE.Mesh(wallGeo, this.materials.mossyWall);
        w2.position.set(wx, 0.67, -length * 0.76);
        w2.castShadow = true;
        w2.receiveShadow = true;
        group.add(w2);
      }
    });

    // Flanking stone pillars with warm glowing rune braziers
    [-length * 0.22, -length * 0.78].forEach((zPos) => {
      [-1, 1].forEach((side) => {
        const px = side * (halfW + 0.85);
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.8, 0.95), this.materials.mossyWall);
        pillar.position.set(px, 1.9, zPos);
        pillar.castShadow = true;
        group.add(pillar);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.35, 1.25), this.materials.stoneTrim);
        cap.position.set(px, 3.9, zPos);
        group.add(cap);

        const brazier = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), this.materials.runeAmber);
        brazier.position.set(px, 4.3, zPos);
        group.add(brazier);
      });
    });

    // Jungle terrain skirt outside path so nothing floats over an empty void
    const skirtGeo = new THREE.PlaneGeometry(36, length + 2);
    const skirtL = new THREE.Mesh(skirtGeo, this.materials.jungleFloor);
    skirtL.rotation.x = -Math.PI / 2;
    skirtL.position.set(-halfW - 18.5, -0.35, -length / 2);
    skirtL.receiveShadow = true;
    group.add(skirtL);

    const skirtR = new THREE.Mesh(skirtGeo, this.materials.jungleFloor);
    skirtR.rotation.x = -Math.PI / 2;
    skirtR.position.set(halfW + 18.5, -0.35, -length / 2);
    skirtR.receiveShadow = true;
    group.add(skirtR);

    // Jungle trees along both sides
    for (let i = 0; i < 3; i++) {
      const zt = -3 - i * (length / 3);
      const tL = createJungleTree(this.materials, 0.85 + ((i * 17) % 5) * 0.08);
      tL.position.set(-halfW - 4.2 - (i % 2) * 3.5, -0.35, zt);
      group.add(tL);

      const tR = createJungleTree(this.materials, 0.9 + ((i * 23) % 5) * 0.07);
      tR.position.set(halfW + 4.4 + ((i + 1) % 2) * 3.4, -0.35, zt - 1.5);
      group.add(tR);
    }

    // Overhead hanging vine arch at segment midpoint
    if (!skipMiddleHole) {
      const vineArch = new THREE.Mesh(
        new THREE.BoxGeometry(GAME_CONFIG.PATH_WIDTH + 2.2, 0.25, 0.35),
        this.materials.vine
      );
      vineArch.position.set(0, 5.4, -length * 0.5);
      group.add(vineArch);
    }
  }

  private buildStraightMesh(): THREE.Group {
    const group = new THREE.Group();
    const len = GAME_CONFIG.STRAIGHT_SEG_LENGTH;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(GAME_CONFIG.PATH_WIDTH, 1.4, len), this.materials.stonePath);
    slab.position.set(0, -0.7, -len / 2);
    slab.receiveShadow = true;
    group.add(slab);

    // Subtle lane divider grooves
    [-GAME_CONFIG.LANE_WIDTH * 0.5, GAME_CONFIG.LANE_WIDTH * 0.5].forEach((lx) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, len - 0.5), this.materials.stoneTrim);
      line.position.set(lx, 0.015, -len / 2);
      group.add(line);
    });

    this.buildSideDecor(group, len, false);
    return group;
  }

  private buildGapMesh(): THREE.Group {
    const group = new THREE.Group();
    const len = GAME_CONFIG.GAP_SEG_LENGTH;
    const hole = GAME_CONFIG.GAP_HOLE_LENGTH;
    const solidLen = (len - hole) / 2;

    // Front approach slab
    const frontSlab = new THREE.Mesh(
      new THREE.BoxGeometry(GAME_CONFIG.PATH_WIDTH, 1.4, solidLen),
      this.materials.stonePath
    );
    frontSlab.position.set(0, -0.7, -solidLen / 2);
    frontSlab.receiveShadow = true;
    group.add(frontSlab);

    // Back landing slab
    const backSlab = new THREE.Mesh(
      new THREE.BoxGeometry(GAME_CONFIG.PATH_WIDTH, 1.4, solidLen),
      this.materials.stonePath
    );
    backSlab.position.set(0, -0.7, -len + solidLen / 2);
    backSlab.receiveShadow = true;
    group.add(backSlab);

    // Warning stone lip at chasm edge
    const lipGeo = new THREE.BoxGeometry(GAME_CONFIG.PATH_WIDTH + 0.1, 0.22, 0.45);
    const lip1 = new THREE.Mesh(lipGeo, this.materials.dangerAccent);
    lip1.position.set(0, 0.04, -solidLen + 0.22);
    group.add(lip1);

    const lip2 = new THREE.Mesh(lipGeo, this.materials.dangerAccent);
    lip2.position.set(0, 0.04, -len + solidLen - 0.22);
    group.add(lip2);

    this.buildSideDecor(group, len, true);
    return group;
  }

  private buildTurnMesh(turn: 'left' | 'right'): THREE.Group {
    const group = new THREE.Group();
    const size = GAME_CONFIG.TURN_SEG_LENGTH; // 9x9 square intersection

    const deck = new THREE.Mesh(new THREE.BoxGeometry(size, 1.4, size), this.materials.stonePath);
    deck.position.set(0, -0.7, -size / 2);
    deck.receiveShadow = true;
    group.add(deck);

    // Dead-end ruined wall across the far side so player clearly sees they cannot run straight
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.8, 2.2, 0.9),
      this.materials.mossyWall
    );
    backWall.position.set(0, 1.1, -size + 0.35);
    backWall.castShadow = true;
    group.add(backWall);

    const backTrim = new THREE.Mesh(
      new THREE.BoxGeometry(size + 0.9, 0.25, 1.05),
      this.materials.dangerAccent
    );
    backTrim.position.set(0, 2.25, -size + 0.35);
    group.add(backTrim);

    // Closed outer side wall opposite the turn direction
    const closedSide = turn === 'left' ? 1 : -1;
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 2.2, size),
      this.materials.mossyWall
    );
    sideWall.position.set(closedSide * (size / 2 - 0.35), 1.1, -size / 2);
    sideWall.castShadow = true;
    group.add(sideWall);

    // Glowing directional stone chevrons on the corner floor pointing toward the open exit
    const openSign = turn === 'left' ? -1 : 1;
    for (let i = 0; i < 2; i++) {
      const chevron = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1.1, 3),
        this.materials.runeAmber
      );
      chevron.rotation.x = Math.PI / 2;
      chevron.rotation.z = turn === 'left' ? Math.PI / 2 : -Math.PI / 2;
      chevron.scale.set(1, 1, 0.14);
      chevron.position.set(openSign * (i * 1.45 - 0.4), 0.04, -size / 2);
      group.add(chevron);
    }

    // Flanking guardian torches at the turn exit
    const exitX = openSign * (size / 2 - 0.3);
    [-size * 0.88, -size * 0.12].forEach((zp) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 0.7), this.materials.stoneTrim);
      post.position.set(exitX, 1.7, zp);
      post.castShadow = true;
      group.add(post);

      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), this.materials.runeAmber);
      flame.position.set(exitX, 3.7, zp);
      group.add(flame);
    });

    // Ground jungle skirt around the corner
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.materials.jungleFloor);
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(0, -0.75, -size / 2);
    skirt.receiveShadow = true;
    group.add(skirt);

    return group;
  }

  private borrowSegmentMesh(kind: SegmentKind): THREE.Group {
    let pool: THREE.Group[];
    let builder: () => THREE.Group;

    if (kind === 'turn_left') {
      pool = this.turnLeftMeshes;
      builder = () => this.buildTurnMesh('left');
    } else if (kind === 'turn_right') {
      pool = this.turnRightMeshes;
      builder = () => this.buildTurnMesh('right');
    } else if (kind === 'gap') {
      pool = this.gapMeshes;
      builder = () => this.buildGapMesh();
    } else {
      pool = this.straightMeshes;
      builder = () => this.buildStraightMesh();
    }

    if (pool.length > 0) {
      const m = pool.pop()!;
      m.visible = true;
      return m;
    }
    const m = builder();
    this.scene.add(m);
    return m;
  }

  private returnSegmentMesh(kind: SegmentKind, mesh: THREE.Group): void {
    mesh.visible = false;
    if (kind === 'turn_left') this.turnLeftMeshes.push(mesh);
    else if (kind === 'turn_right') this.turnRightMeshes.push(mesh);
    else if (kind === 'gap') this.gapMeshes.push(mesh);
    else this.straightMeshes.push(mesh);
  }

  /**
   * Check whether a candidate turn direction keeps the next few segments clear of active path segments.
   */
  private isTurnSafe(fromX: number, fromZ: number, nextDir: CardinalDir): boolean {
    const f = dirToForward(nextDir);
    const probeDist = 28;
    const probeX = fromX + f.x * probeDist;
    const probeZ = fromZ + f.z * probeDist;

    for (let i = 0; i < Math.max(0, this.segments.length - 1); i++) {
      const s = this.segments[i];
      const cx = (s.startX + s.endX) * 0.5;
      const cz = (s.startZ + s.endZ) * 0.5;
      const dx = probeX - cx;
      const dz = probeZ - cz;
      if (dx * dx + dz * dz < 19 * 19) {
        return false;
      }
    }
    return true;
  }

  public reset(): void {
    while (this.segments.length > 0) {
      this.recycleOldestSegment();
    }
    this.nextSegId = 1;
    this.nextObjId = 1;
    this.straightsSinceTurn = 0;

    // Spawn initial segments starting at (0,0) heading North (-Z)
    this.appendSegment('straight', 0, 0, 0, true);
    for (let i = 1; i < GAME_CONFIG.SEGMENTS_AHEAD; i++) {
      this.spawnNextSegment(i < GAME_CONFIG.INTRO_SAFE_SEGMENTS);
    }
  }

  public ensureAhead(activeIndex: number): void {
    while (this.segments.length - 1 - activeIndex < GAME_CONFIG.SEGMENTS_AHEAD) {
      this.spawnNextSegment(false);
    }
    while (activeIndex > GAME_CONFIG.SEGMENTS_BEHIND) {
      this.recycleOldestSegment();
      activeIndex--;
    }
  }

  private recycleOldestSegment(): void {
    const seg = this.segments.shift();
    if (!seg) return;

    seg.obstacles.forEach((o) => this.returnObstacleMesh(o.mesh));
    seg.coins.forEach((c) => this.returnCoinMesh(c.mesh));
    seg.powerUps.forEach((p) => this.returnPowerUpMesh(p.type, p.mesh));
    this.returnSegmentMesh(seg.kind, seg.mesh);
  }

  private spawnNextSegment(safeIntro: boolean): void {
    const prev = this.segments[this.segments.length - 1];
    let dir: CardinalDir = prev.dir;
    let startX = prev.endX;
    let startZ = prev.endZ;

    // If previous segment was a turn, the next segment starts from the turn's exit edge in the new direction!
    if (prev.kind === 'turn_left' || prev.kind === 'turn_right') {
      const turnSide = prev.kind === 'turn_left' ? 'left' : 'right';
      const oldF = dirToForward(prev.dir);
      const centerX = prev.startX + oldF.x * (prev.length * 0.5);
      const centerZ = prev.startZ + oldF.z * (prev.length * 0.5);
      dir = turnDir(prev.dir, turnSide);
      const newF = dirToForward(dir);
      startX = centerX + newF.x * (prev.length * 0.5);
      startZ = centerZ + newF.z * (prev.length * 0.5);
      this.straightsSinceTurn = 0;
    }

    let kind: SegmentKind = 'straight';

    if (!safeIntro) {
      if (
        prev.kind === 'straight' &&
        this.straightsSinceTurn >= GAME_CONFIG.MIN_STRAIGHTS_BETWEEN_TURNS &&
        Math.random() < GAME_CONFIG.TURN_PROBABILITY
      ) {
        const tryLeftFirst = Math.random() < 0.5;
        const firstChoice: 'left' | 'right' = tryLeftFirst ? 'left' : 'right';
        const secondChoice: 'left' | 'right' = tryLeftFirst ? 'right' : 'left';

        const d1 = turnDir(dir, firstChoice);
        const d2 = turnDir(dir, secondChoice);

        if (this.isTurnSafe(startX, startZ, d1)) {
          kind = firstChoice === 'left' ? 'turn_left' : 'turn_right';
        } else if (this.isTurnSafe(startX, startZ, d2)) {
          kind = secondChoice === 'left' ? 'turn_left' : 'turn_right';
        }
      } else if (
        prev.kind === 'straight' &&
        this.straightsSinceTurn >= 1 &&
        Math.random() < GAME_CONFIG.GAP_PROBABILITY
      ) {
        kind = 'gap';
      }
    }

    if (kind === 'straight' || kind === 'gap') {
      this.straightsSinceTurn++;
    }

    this.appendSegment(kind, dir, startX, startZ, safeIntro);
  }

  private appendSegment(
    kind: SegmentKind,
    dir: CardinalDir,
    startX: number,
    startZ: number,
    safeIntro: boolean
  ): void {
    const length =
      kind === 'turn_left' || kind === 'turn_right'
        ? GAME_CONFIG.TURN_SEG_LENGTH
        : kind === 'gap'
          ? GAME_CONFIG.GAP_SEG_LENGTH
          : GAME_CONFIG.STRAIGHT_SEG_LENGTH;

    const f = dirToForward(dir);
    const endX = startX + f.x * length;
    const endZ = startZ + f.z * length;

    const mesh = this.borrowSegmentMesh(kind);
    mesh.position.set(startX, 0, startZ);
    mesh.rotation.y = dirToYaw(dir);

    const hasGap = kind === 'gap';
    const gapStart = (length - GAME_CONFIG.GAP_HOLE_LENGTH) * 0.5;
    const gapEnd = gapStart + GAME_CONFIG.GAP_HOLE_LENGTH;

    const seg: PathSegment = {
      id: this.nextSegId++,
      kind,
      dir,
      startX,
      startZ,
      endX,
      endZ,
      length,
      hasGap,
      gapStart,
      gapEnd,
      mesh,
      obstacles: [],
      coins: [],
      powerUps: [],
      turnTaken: false,
    };

    if (!safeIntro) {
      this.populateSegmentContents(seg);
    } else if (seg.id === 1) {
      // Friendly starter line of coins in center lane
      this.spawnCoinLine(seg, 0, 7, 15, 4);
    }

    this.segments.push(seg);
  }

  private populateSegmentContents(seg: PathSegment): void {
    if (seg.kind === 'turn_left' || seg.kind === 'turn_right') {
      // Place 1 guiding coin right at the center of the corner
      this.spawnCoin(seg, seg.length * 0.5, 0, 1.0);
      return;
    }

    if (seg.kind === 'gap') {
      // Coin arc jumping cleanly across the chasm in a random lane
      const lane = (Math.floor(Math.random() * 3) - 1) * GAME_CONFIG.LANE_WIDTH;
      this.spawnCoinArc(seg, lane, seg.gapStart - 1.2, seg.gapEnd + 1.2, 5, 2.3);
      return;
    }

    // Straight segment: choose a fair, varied obstacle pattern
    const patternRoll = Math.random();
    const midAlong = seg.length * 0.52;

    if (patternRoll < 0.24) {
      // Wide low barrier across all 3 lanes (jump over) + guiding coin arc
      this.addObstacle(seg, 'low_barrier', midAlong, -1, 3);
      const lane = (Math.floor(Math.random() * 3) - 1) * GAME_CONFIG.LANE_WIDTH;
      this.spawnCoinArc(seg, lane, midAlong - 2.6, midAlong + 2.6, 5, 2.1);
    } else if (patternRoll < 0.46) {
      // Wide overhead beam across all 3 lanes (slide under) + low coin line
      this.addObstacle(seg, 'overhead_beam', midAlong, -1, 3);
      const lane = (Math.floor(Math.random() * 3) - 1) * GAME_CONFIG.LANE_WIDTH;
      this.spawnCoinLine(seg, lane, midAlong - 3.6, midAlong + 3.6, 5);
    } else if (patternRoll < 0.74) {
      // Tall stone monoliths in 1 or 2 lanes (always leaves at least 1 open lane!)
      const lanes = [-1, 0, 1];
      const openIdx = Math.floor(Math.random() * 3);
      const openLane = lanes[openIdx];
      const blockCount = Math.random() < 0.48 ? 2 : 1;
      let placed = 0;
      for (const l of lanes) {
        if (l !== openLane && placed < blockCount) {
          this.addObstacle(seg, 'tall_block', midAlong, l, 1);
          placed++;
        }
      }
      this.spawnCoinLine(seg, openLane * GAME_CONFIG.LANE_WIDTH, 3.5, 14.5, 5);
    } else {
      // Mixed pair: one lane has a low barrier, another has a tall block, third is open!
      const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
      this.addObstacle(seg, 'tall_block', midAlong, lanes[0], 1);
      this.addObstacle(seg, 'low_barrier', midAlong, lanes[1], 1);
      this.spawnCoinLine(seg, lanes[2] * GAME_CONFIG.LANE_WIDTH, 4, 14, 4);
    }

    // Occasional power-up floating in a safe spot
    if (Math.random() < GAME_CONFIG.POWERUP_SPAWN_CHANCE) {
      const types: PowerUpType[] = ['magnet', 'shield', 'boost'];
      const pType = types[Math.floor(Math.random() * types.length)];
      const lane = (Math.floor(Math.random() * 3) - 1) * GAME_CONFIG.LANE_WIDTH;
      this.spawnPowerUp(seg, pType, 3.0, lane);
    }
  }

  private addObstacle(
    seg: PathSegment,
    kind: ObstacleKind,
    along: number,
    laneStart: number,
    laneSpan: number
  ): void {
    const mesh = this.borrowObstacleMesh(kind, laneSpan);
    const centerLane = laneStart + (laneSpan - 1) * 0.5;
    const lateral = centerLane * GAME_CONFIG.LANE_WIDTH;

    localToWorld(seg, along, lateral, mesh.position);
    mesh.position.y = 0;
    mesh.rotation.y = dirToYaw(seg.dir);

    seg.obstacles.push({
      id: this.nextObjId++,
      kind,
      mesh,
      segmentId: seg.id,
      along,
      laneStart,
      laneSpan,
      hit: false,
    });
  }

  private spawnCoin(seg: PathSegment, along: number, laneX: number, baseY = 1.0): void {
    const mesh = this.borrowCoinMesh();
    const worldPos = new THREE.Vector3();
    localToWorld(seg, along, laneX, worldPos);
    worldPos.y = baseY;
    mesh.position.copy(worldPos);

    seg.coins.push({
      id: this.nextObjId++,
      mesh,
      segmentId: seg.id,
      along,
      laneX,
      baseY,
      collected: false,
      magnetized: false,
      worldPos,
    });
  }

  private spawnCoinLine(
    seg: PathSegment,
    laneX: number,
    fromAlong: number,
    toAlong: number,
    count: number
  ): void {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      this.spawnCoin(seg, THREE.MathUtils.lerp(fromAlong, toAlong, t), laneX, 0.95);
    }
  }

  private spawnCoinArc(
    seg: PathSegment,
    laneX: number,
    fromAlong: number,
    toAlong: number,
    count: number,
    peakHeight: number
  ): void {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const y = 0.95 + Math.sin(t * Math.PI) * peakHeight;
      this.spawnCoin(seg, THREE.MathUtils.lerp(fromAlong, toAlong, t), laneX, y);
    }
  }

  private spawnPowerUp(seg: PathSegment, type: PowerUpType, along: number, laneX: number): void {
    const mesh = this.borrowPowerUpMesh(type);
    const worldPos = new THREE.Vector3();
    localToWorld(seg, along, laneX, worldPos);
    worldPos.y = 1.35;
    mesh.position.copy(worldPos);

    seg.powerUps.push({
      id: this.nextObjId++,
      type,
      mesh,
      segmentId: seg.id,
      along,
      laneX,
      baseY: 1.35,
      collected: false,
      worldPos,
    });
  }

  public dispose(): void {
    while (this.segments.length > 0) {
      this.recycleOldestSegment();
    }
  }
}
