import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
}

/**
 * Pooled 3D particle emitter (zero allocations during gameplay loop).
 */
export class ParticlePool {
  private particles: Particle[] = [];
  private geometry: THREE.OctahedronGeometry;
  private materials: THREE.MeshBasicMaterial[] = [];

  constructor(scene: THREE.Scene, count = 110) {
    this.geometry = new THREE.OctahedronGeometry(0.14, 0);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.materials.push(mat);
      this.particles.push({
        mesh,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        gravity: -18,
      });
    }
  }

  public emitBurst(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count = 10,
    speed = 7.5,
    gravity = -18
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.34 + Math.random() * 0.28;
      p.gravity = gravity;

      const angle = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.85;
      const spd = speed * (0.5 + Math.random() * 0.75);
      p.vx = Math.cos(angle) * spd * 0.7;
      p.vy = up * spd;
      p.vz = Math.sin(angle) * spd * 0.7;

      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      p.mesh.visible = true;
      spawned++;
    }
  }

  public update(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.vy += p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 10;

      const t = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.01, t));
    }
  }

  public clear(): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
      this.particles[i].mesh.visible = false;
    }
  }

  public dispose(): void {
    this.geometry.dispose();
    this.materials.forEach((m) => m.dispose());
  }
}
