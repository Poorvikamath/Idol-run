import * as THREE from 'three';
import { GameMaterials } from './materials';
import { ObstacleKind, PowerUpType } from './types';

export interface PlayerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  scarfTail: THREE.Mesh;
  shieldAura: THREE.Mesh;
  magnetRing: THREE.Mesh;
  boostAura: THREE.Mesh;
  shadow: THREE.Mesh;
}

export interface ChaserRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  eyeLeft: THREE.Mesh;
  eyeRight: THREE.Mesh;
}

/**
 * Composite 10-part explorer character pivoted at bottom-center (y = 0).
 */
export function createPlayerModel(materials: GameMaterials): PlayerRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.95;
  root.add(bodyGroup);

  const jacketMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.72, metalness: 0.05 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.85, metalness: 0.0 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x3b352e, roughness: 0.88, metalness: 0.02 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6b48a, roughness: 0.65, metalness: 0.0 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.82, metalness: 0.04 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.75, metalness: 0.0 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x78502c, roughness: 0.8, metalness: 0.08 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x261a12, roughness: 0.7, metalness: 0.1 });

  // Torso (primary silhouette)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.76, 0.36), jacketMat);
  torso.position.y = 0.38;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Shirt V-insert
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.38), shirtMat);
  shirt.position.set(0, 0.56, 0.01);
  bodyGroup.add(shirt);

  // Backpack & golden idol strapped on back
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.24), packMat);
  backpack.position.set(0, 0.42, 0.28);
  backpack.castShadow = true;
  bodyGroup.add(backpack);

  const idolTrim = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), materials.goldCoin);
  idolTrim.position.set(0, 0.72, 0.29);
  bodyGroup.add(idolTrim);

  // Scarf collar & fluttering tail
  const scarfCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.12, 8), scarfMat);
  scarfCollar.position.set(0, 0.78, 0);
  bodyGroup.add(scarfCollar);

  const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.48), scarfMat);
  scarfTail.position.set(0.08, 0.76, 0.32);
  scarfTail.castShadow = true;
  bodyGroup.add(scarfTail);

  // Head + Explorer Hat
  const head = new THREE.Group();
  head.position.set(0, 0.96, 0);
  bodyGroup.add(head);

  const cranium = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skinMat);
  cranium.position.y = 0.06;
  cranium.castShadow = true;
  head.add(cranium);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.05, 10), hatMat);
  hatBrim.position.y = 0.27;
  hatBrim.castShadow = true;
  head.add(hatBrim);

  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.22, 10), hatMat);
  hatCrown.position.y = 0.39;
  hatCrown.castShadow = true;
  head.add(hatCrown);

  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.05, 10), materials.goldCoin);
  hatBand.position.y = 0.31;
  head.add(hatBand);

  // Arms pivoted at shoulder
  const makeArm = (xOffset: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(xOffset, 0.7, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.46, 0.18), jacketMat);
    upper.position.y = -0.22;
    upper.castShadow = true;
    pivot.add(upper);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), skinMat);
    hand.position.y = -0.5;
    pivot.add(hand);
    bodyGroup.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-0.42);
  const rightArm = makeArm(0.42);

  // Legs pivoted at hip
  const makeLeg = (xOffset: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(xOffset, 0.02, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.54, 0.22), pantsMat);
    leg.position.y = -0.27;
    leg.castShadow = true;
    pivot.add(leg);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.28), bootMat);
    boot.position.set(0, -0.62, -0.03);
    boot.castShadow = true;
    pivot.add(boot);
    bodyGroup.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-0.17);
  const rightLeg = makeLeg(0.17);

  // Contact shadow disc
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), materials.contactShadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  root.add(shadow);

  // Power-up visual auras
  const shieldAura = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 18, 14),
    new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
    })
  );
  shieldAura.position.y = 1.05;
  shieldAura.visible = false;
  root.add(shieldAura);

  const magnetRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.045, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xf87171, transparent: true, opacity: 0.75 })
  );
  magnetRing.rotation.x = Math.PI / 2;
  magnetRing.position.y = 0.9;
  magnetRing.visible = false;
  root.add(magnetRing);

  const boostAura = new THREE.Mesh(
    new THREE.ConeGeometry(0.92, 2.2, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    })
  );
  boostAura.rotation.x = Math.PI / 2;
  boostAura.position.set(0, 1.05, 0.45);
  boostAura.visible = false;
  root.add(boostAura);

  return {
    root,
    bodyGroup,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    scarfTail,
    shieldAura,
    magnetRing,
    boostAura,
    shadow,
  };
}

/**
 * Menacing low-poly ancient Temple Guardian chaser (composite 9-part model).
 */
export function createChaserModel(materials: GameMaterials): ChaserRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 1.25;
  root.add(bodyGroup);

  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x221b1d,
    roughness: 0.68,
    metalness: 0.22,
    flatShading: true,
  });
  const hornMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.55,
    metalness: 0.15,
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });

  // Hulking stone chest
  const chest = new THREE.Mesh(new THREE.DodecahedronGeometry(0.86, 0), obsidianMat);
  chest.scale.set(1.15, 1.05, 0.85);
  chest.position.y = 0.62;
  chest.castShadow = true;
  bodyGroup.add(chest);

  // Glowing core rune on chest
  const runePlate = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), materials.runeAmber);
  runePlate.position.set(0, 0.65, -0.58);
  bodyGroup.add(runePlate);

  // Horned guardian head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 0.68), obsidianMat);
  head.position.set(0, 1.42, -0.15);
  head.castShadow = true;
  bodyGroup.add(head);

  const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), eyeMat);
  eyeLeft.position.set(-0.18, 1.46, -0.5);
  bodyGroup.add(eyeLeft);

  const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), eyeMat);
  eyeRight.position.set(0.18, 1.46, -0.5);
  bodyGroup.add(eyeRight);

  const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.68, 5), hornMat);
  hornL.position.set(-0.36, 1.84, -0.05);
  hornL.rotation.z = 0.45;
  hornL.rotation.x = -0.25;
  bodyGroup.add(hornL);

  const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.68, 5), hornMat);
  hornR.position.set(0.36, 1.84, -0.05);
  hornR.rotation.z = -0.45;
  hornR.rotation.x = -0.25;
  bodyGroup.add(hornR);

  // Heavy articulated arms
  const makeArm = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.95, -0.05);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.15, 0.38), obsidianMat);
    arm.position.y = -0.52;
    arm.castShadow = true;
    pivot.add(arm);

    const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), materials.mossyWall);
    fist.position.y = -1.1;
    pivot.add(fist);
    bodyGroup.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-1.05);
  const rightArm = makeArm(1.05);

  // Heavy legs
  const makeLeg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.05, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.38), obsidianMat);
    leg.position.y = -0.45;
    leg.castShadow = true;
    pivot.add(leg);
    bodyGroup.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-0.42);
  const rightLeg = makeLeg(0.42);

  return {
    root,
    bodyGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    eyeLeft,
    eyeRight,
  };
}

/**
 * Composite spinning gold coin mesh (outer rim + embossed center).
 */
export function createCoinModel(materials: GameMaterials): THREE.Group {
  const group = new THREE.Group();

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14), materials.goldCoin);
  disc.rotation.x = Math.PI / 2;
  disc.castShadow = true;
  group.add(disc);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 6, 16), materials.goldCoin);
  group.add(ring);

  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), materials.runeAmber);
  gem.scale.set(1, 1, 0.45);
  group.add(gem);

  return group;
}

/**
 * Composite power-up relic models.
 */
export function createPowerUpModel(type: PowerUpType, materials: GameMaterials): THREE.Group {
  const group = new THREE.Group();

  if (type === 'magnet') {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 16, Math.PI), materials.magnetMat);
    group.add(arch);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.25, metalness: 0.85 });
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), tipMat);
    tipL.position.set(-0.42, -0.13, 0);
    group.add(tipL);
    const tipR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), tipMat);
    tipR.position.set(0.42, -0.13, 0);
    group.add(tipR);
  } else if (type === 'shield') {
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 1), materials.shieldMat);
    group.add(orb);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.05, 8, 20), materials.shieldMat);
    ring.rotation.x = Math.PI / 3;
    group.add(ring);
  } else {
    // Speed Boost: winged sun idol
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.44, 0), materials.boostMat);
    core.scale.set(0.85, 1.35, 0.85);
    group.add(core);
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.12), materials.goldCoin);
    wingL.position.set(-0.46, 0.12, 0);
    wingL.rotation.z = 0.35;
    group.add(wingL);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.12), materials.goldCoin);
    wingR.position.set(0.46, 0.12, 0);
    wingR.rotation.z = -0.35;
    group.add(wingR);
  }

  return group;
}

/**
 * Composite obstacle builders (all bottom-center pivoted at y = 0).
 */
export function createObstacleModel(kind: ObstacleKind, width: number, materials: GameMaterials): THREE.Group {
  const group = new THREE.Group();

  if (kind === 'low_barrier') {
    // Carved stone barrier with spikes (jump over)
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 0.72), materials.obstacleStone);
    base.position.y = 0.45;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.16, 0.82), materials.dangerAccent);
    trim.position.y = 0.92;
    group.add(trim);

    const spikeCount = Math.max(2, Math.round(width / 0.85));
    for (let i = 0; i < spikeCount; i++) {
      const sx = -width / 2 + 0.42 + (i * (width - 0.84)) / Math.max(1, spikeCount - 1);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 4), materials.stoneTrim);
      spike.position.set(sx, 1.15, 0);
      group.add(spike);
    }
  } else if (kind === 'overhead_beam') {
    // Two tall ruin pillars + mossy overhead timber/stone lintel (slide under)
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.65), materials.mossyWall);
    pillarL.position.set(-width / 2 + 0.25, 1.6, 0);
    pillarL.castShadow = true;
    group.add(pillarL);

    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.65), materials.mossyWall);
    pillarR.position.set(width / 2 - 0.25, 1.6, 0);
    pillarR.castShadow = true;
    group.add(pillarR);

    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 1.05, 0.85), materials.woodLog);
    beam.position.y = 2.05; // Bottom of beam at y ≈ 1.52 — forces slide, standing hits!
    beam.castShadow = true;
    group.add(beam);

    const warnBand = new THREE.Mesh(new THREE.BoxGeometry(width + 0.34, 0.16, 0.9), materials.dangerAccent);
    warnBand.position.y = 1.6;
    group.add(warnBand);

    // Hanging vine accents
    for (let i = 0; i < 3; i++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.55, 5), materials.vine);
      v.position.set(-width * 0.28 + i * width * 0.28, 2.75, 0.38);
      group.add(v);
    }
  } else {
    // Tall stone monolith / fallen temple block (change lanes)
    const block = new THREE.Mesh(new THREE.BoxGeometry(width * 0.88, 2.75, 1.25), materials.obstacleStone);
    block.position.y = 1.375;
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.32, 1.35), materials.mossyWall);
    cap.position.y = 2.78;
    group.add(cap);

    const rune = new THREE.Mesh(new THREE.BoxGeometry(width * 0.45, 0.9, 1.3), materials.runeAmber);
    rune.position.y = 1.45;
    group.add(rune);
  }

  return group;
}

/**
 * Composite jungle tree prop (trunk + roots + 3 tiered low-poly canopy clusters).
 */
export function createJungleTree(materials: GameMaterials, scale = 1): THREE.Group {
  const tree = new THREE.Group();

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.56, 4.8, 7), materials.woodLog);
  trunk.position.y = 2.4;
  trunk.castShadow = true;
  tree.add(trunk);

  const canopy1 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2, 0), materials.foliageDark);
  canopy1.position.set(0, 5.1, 0);
  canopy1.scale.set(1.25, 0.72, 1.25);
  canopy1.castShadow = true;
  tree.add(canopy1);

  const canopy2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.65, 0), materials.foliageLight);
  canopy2.position.set(0.6, 6.1, -0.35);
  canopy2.scale.set(1.1, 0.7, 1.1);
  tree.add(canopy2);

  const canopy3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 0), materials.foliageDark);
  canopy3.position.set(-0.7, 5.8, 0.45);
  tree.add(canopy3);

  tree.scale.setScalar(scale);
  return tree;
}
