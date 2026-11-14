import * as THREE from 'three';

export interface GameMaterials {
  stonePath: THREE.MeshStandardMaterial;
  stoneTrim: THREE.MeshStandardMaterial;
  mossyWall: THREE.MeshStandardMaterial;
  jungleFloor: THREE.MeshStandardMaterial;
  woodLog: THREE.MeshStandardMaterial;
  foliageDark: THREE.MeshStandardMaterial;
  foliageLight: THREE.MeshStandardMaterial;
  vine: THREE.MeshStandardMaterial;
  goldCoin: THREE.MeshPhysicalMaterial;
  runeAmber: THREE.MeshStandardMaterial;
  magnetMat: THREE.MeshStandardMaterial;
  shieldMat: THREE.MeshPhysicalMaterial;
  boostMat: THREE.MeshStandardMaterial;
  obstacleStone: THREE.MeshStandardMaterial;
  dangerAccent: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
  mountainMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function createStoneTileTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base warm weathered sandstone
  ctx.fillStyle = '#7c6955';
  ctx.fillRect(0, 0, size, size);

  // Subtle stone grain speckles
  for (let i = 0; i < 3600; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.5;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255, 232, 198, 0.08)' : 'rgba(26, 18, 12, 0.11)';
    ctx.fillRect(x, y, r, r);
  }

  // Carved 3-lane temple flagstones
  const cols = 3;
  const rows = 4;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW;
      const y = r * cellH;
      const shade = (Math.random() - 0.5) * 16;
      ctx.fillStyle = `rgb(${124 + shade}, ${105 + shade}, ${85 + shade})`;
      ctx.fillRect(x + 4, y + 4, cellW - 8, cellH - 8);

      // Subtle bevel highlight
      ctx.strokeStyle = 'rgba(255, 224, 178, 0.16)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 6, y + 6, cellW - 12, cellH - 12);

      // Mortar gap
      ctx.strokeStyle = 'rgba(28, 22, 16, 0.55)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, cellW, cellH);

      // Mossy tufts in crevices
      if (Math.random() > 0.55) {
        ctx.fillStyle = 'rgba(67, 108, 48, 0.45)';
        ctx.beginPath();
        ctx.arc(x + Math.random() * cellW, y + (Math.random() > 0.5 ? 5 : cellH - 5), 6 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  tex.anisotropy = maxAniso;
  return tex;
}

function createMossWallTexture(maxAniso: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#5a5044';
  ctx.fillRect(0, 0, size, size);

  // Masonry bricks
  const rows = 4;
  const rowH = size / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 32;
    for (let x = -32; x < size; x += 64) {
      ctx.fillStyle = `rgba(${85 + Math.random() * 25}, ${76 + Math.random() * 20}, ${64 + Math.random() * 16}, 1)`;
      ctx.fillRect(x + offset + 2, r * rowH + 2, 60, rowH - 4);
    }
  }

  // Overgrown moss patches
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(${56 + Math.random() * 28}, ${104 + Math.random() * 35}, ${42 + Math.random() * 20}, 0.55)`;
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 8 + Math.random() * 20, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(12, 8, 5, 0.72)');
  grad.addColorStop(0.55, 'rgba(12, 8, 5, 0.3)');
  grad.addColorStop(1, 'rgba(12, 8, 5, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGameMaterials(renderer: THREE.WebGLRenderer): GameMaterials {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const stoneTex = createStoneTileTexture(maxAniso);
  const mossTex = createMossWallTexture(maxAniso);
  const shadowTex = createContactShadowTexture();

  const stonePath = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.86,
    metalness: 0.04,
  });

  const stoneTrim = new THREE.MeshStandardMaterial({
    color: 0x625648,
    roughness: 0.78,
    metalness: 0.08,
  });

  const mossyWall = new THREE.MeshStandardMaterial({
    map: mossTex,
    roughness: 0.9,
    metalness: 0.02,
  });

  const jungleFloor = new THREE.MeshStandardMaterial({
    color: 0x2f4324,
    roughness: 0.96,
    metalness: 0.0,
  });

  const woodLog = new THREE.MeshStandardMaterial({
    color: 0x5c3c24,
    roughness: 0.9,
    metalness: 0.02,
  });

  const foliageDark = new THREE.MeshStandardMaterial({
    color: 0x264b26,
    roughness: 0.84,
    metalness: 0.0,
    flatShading: true,
  });

  const foliageLight = new THREE.MeshStandardMaterial({
    color: 0x457a33,
    roughness: 0.8,
    metalness: 0.0,
    flatShading: true,
  });

  const vine = new THREE.MeshStandardMaterial({
    color: 0x3b6e28,
    roughness: 0.85,
    metalness: 0.0,
  });

  const goldCoin = new THREE.MeshPhysicalMaterial({
    color: 0xffc633,
    emissive: 0x5c3600,
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.94,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });

  const runeAmber = new THREE.MeshStandardMaterial({
    color: 0xff9e2c,
    emissive: 0xff6a00,
    emissiveIntensity: 1.35,
    roughness: 0.35,
    metalness: 0.1,
  });

  const magnetMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 0.6,
    roughness: 0.32,
    metalness: 0.75,
  });

  const shieldMat = new THREE.MeshPhysicalMaterial({
    color: 0x22d3ee,
    emissive: 0x0891b2,
    emissiveIntensity: 0.75,
    roughness: 0.18,
    metalness: 0.35,
    clearcoat: 1.0,
  });

  const boostMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    metalness: 0.8,
  });

  const obstacleStone = new THREE.MeshStandardMaterial({
    color: 0x4e433a,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true,
  });

  const dangerAccent = new THREE.MeshStandardMaterial({
    color: 0xc2410c,
    emissive: 0x7c2d12,
    emissiveIntensity: 0.35,
    roughness: 0.55,
    metalness: 0.2,
  });

  const contactShadow = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });

  const mountainMat = new THREE.MeshStandardMaterial({
    color: 0x3b2c32,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
  });

  const allMaterials: THREE.Material[] = [
    stonePath,
    stoneTrim,
    mossyWall,
    jungleFloor,
    woodLog,
    foliageDark,
    foliageLight,
    vine,
    goldCoin,
    runeAmber,
    magnetMat,
    shieldMat,
    boostMat,
    obstacleStone,
    dangerAccent,
    contactShadow,
    mountainMat,
  ];
  const allTextures: THREE.Texture[] = [stoneTex, mossTex, shadowTex];

  return {
    stonePath,
    stoneTrim,
    mossyWall,
    jungleFloor,
    woodLog,
    foliageDark,
    foliageLight,
    vine,
    goldCoin,
    runeAmber,
    magnetMat,
    shieldMat,
    boostMat,
    obstacleStone,
    dangerAccent,
    contactShadow,
    mountainMat,
    dispose: () => {
      allMaterials.forEach((m) => m.dispose());
      allTextures.forEach((t) => t.dispose());
    },
  };
}
