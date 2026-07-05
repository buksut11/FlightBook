"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { useTheme } from "next-themes";

/**
 * Full-screen Three.js sky with a stylized airliner, drifting clouds,
 * engine contrails and a day/night palette that follows the app theme.
 * Motion is driven by GSAP (intro fly-in, idle bobbing/banking, pointer
 * parallax) and respects prefers-reduced-motion.
 */

type Palette = {
  skyTop: number;
  skyBottom: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  sunIntensity: number;
  ambient: number;
  cloud: number;
  cloudOpacity: number;
  starsOpacity: number;
  celestial: number;
  celestialOpacity: number;
};

const DAY: Palette = {
  skyTop: 0x2563eb,
  skyBottom: 0xdbeafe,
  hemiSky: 0xbfdbfe,
  hemiGround: 0xe0f2fe,
  sun: 0xfff4d6,
  sunIntensity: 2.4,
  ambient: 0.55,
  cloud: 0xffffff,
  cloudOpacity: 0.9,
  starsOpacity: 0,
  celestial: 0xfff1b8,
  celestialOpacity: 0.85,
};

const NIGHT: Palette = {
  skyTop: 0x020617,
  skyBottom: 0x14304f,
  hemiSky: 0x334e75,
  hemiGround: 0x0f172a,
  sun: 0xa5c4ff,
  sunIntensity: 1.1,
  ambient: 0.28,
  cloud: 0x8fa6c4,
  cloudOpacity: 0.5,
  starsOpacity: 0.9,
  celestial: 0xdbeafe,
  celestialOpacity: 0.9,
};

function makePuffTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildAirliner(accent: number): THREE.Group {
  const plane = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.25, metalness: 0.4 });

  // Fuselage lies along the X axis, nose toward +X.
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 5, 8, 24), bodyMat);
  fuselage.rotation.z = Math.PI / 2;
  plane.add(fuselage);

  const cockpit = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 12), darkMat);
  cockpit.rotation.z = Math.PI / 2;
  cockpit.position.set(2.35, 0.16, 0);
  cockpit.scale.set(1, 0.55, 1.6);
  plane.add(cockpit);

  const windows = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.02), darkMat);
  windows.position.set(0.1, 0.16, 0);
  plane.add(windows);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.1, 1.01), accentMat);
  stripe.position.set(0, -0.14, 0);
  plane.add(stripe);

  // Swept wing built from a 2D outline, extruded thin.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.9, 0);
  wingShape.lineTo(0.9, 0);
  wingShape.lineTo(-1.3, 3.4);
  wingShape.lineTo(-1.9, 3.4);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: false });

  const rightWing = new THREE.Mesh(wingGeo, bodyMat);
  rightWing.rotation.x = Math.PI / 2; // span extends toward +Z
  rightWing.rotation.z = -0.06; // dihedral
  rightWing.position.set(0.2, -0.15, 0.2);
  plane.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeo, bodyMat);
  leftWing.rotation.x = -Math.PI / 2; // span extends toward -Z
  leftWing.rotation.z = 0.06;
  leftWing.position.set(0.2, -0.15, -0.2);
  plane.add(leftWing);

  // Horizontal stabilizers: the same outline, scaled down.
  const stabRight = new THREE.Mesh(wingGeo, bodyMat);
  stabRight.scale.setScalar(0.38);
  stabRight.rotation.x = Math.PI / 2;
  stabRight.position.set(-2.55, 0.12, 0.1);
  plane.add(stabRight);

  const stabLeft = new THREE.Mesh(wingGeo, bodyMat);
  stabLeft.scale.setScalar(0.38);
  stabLeft.rotation.x = -Math.PI / 2;
  stabLeft.position.set(-2.55, 0.12, -0.1);
  plane.add(stabLeft);

  // Tail fin, swept toward the tail (-X).
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(1.1, 0);
  finShape.lineTo(-0.55, 1.45);
  finShape.lineTo(-1.05, 1.45);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.1, bevelEnabled: false });
  finGeo.translate(0, 0, -0.05);
  const fin = new THREE.Mesh(finGeo, accentMat);
  fin.position.set(-2.3, 0.35, 0);
  plane.add(fin);

  // Engines under each wing.
  const nacelleGeo = new THREE.CylinderGeometry(0.26, 0.3, 0.85, 16);
  const intakeGeo = new THREE.CircleGeometry(0.24, 16);
  for (const side of [1, -1]) {
    const nacelle = new THREE.Mesh(nacelleGeo, accentMat);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(0.55, -0.5, side * 1.45);
    plane.add(nacelle);

    const intake = new THREE.Mesh(intakeGeo, darkMat);
    intake.rotation.y = Math.PI / 2;
    intake.position.set(0.99, -0.5, side * 1.45);
    plane.add(intake);
  }

  return plane;
}

type Puff = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number; // 0 = fresh, 1 = expired
  velocity: THREE.Vector3;
};

export function SkyScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const applyThemeRef = useRef<(dark: boolean, animate: boolean) => void>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      return; // WebGL unavailable — the CSS gradient behind the canvas stands in.
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = reducedMotion ? 0 : 1;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 300);
    const rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);
    const lookTarget = new THREE.Vector3(0, 2.2, 0);

    // --- Sky dome (vertical gradient shader) -----------------------------
    const skyUniforms = {
      topColor: { value: new THREE.Color(DAY.skyTop) },
      bottomColor: { value: new THREE.Color(DAY.skyBottom) },
      offset: { value: 12 },
      exponent: { value: 0.7 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(150, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        side: THREE.BackSide,
        vertexShader: /* glsl */ `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          uniform float offset;
          uniform float exponent;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
            gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
          }
        `,
      }),
    );
    scene.add(sky);

    // --- Lights ----------------------------------------------------------
    const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, 0.9);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight(DAY.sun, DAY.sunIntensity);
    sunLight.position.set(18, 24, 10);
    scene.add(sunLight);
    const ambient = new THREE.AmbientLight(0xffffff, DAY.ambient);
    scene.add(ambient);

    // --- Sun / moon sprite ------------------------------------------------
    const puffTexture = makePuffTexture();
    const celestialMat = new THREE.SpriteMaterial({
      map: puffTexture,
      color: DAY.celestial,
      opacity: DAY.celestialOpacity,
      transparent: true,
      depthWrite: false,
    });
    const celestial = new THREE.Sprite(celestialMat);
    celestial.scale.setScalar(26);
    celestial.position.set(38, 30, -90);
    scene.add(celestial);

    // --- Stars (visible at night) ------------------------------------------
    const starCount = 450;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85); // bias toward the upper dome
      const r = 120;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      size: 0.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: DAY.starsOpacity,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // --- Clouds -----------------------------------------------------------
    type Cloud = { group: THREE.Group; speed: number; material: THREE.SpriteMaterial };
    const clouds: Cloud[] = [];
    const cloudField = 55;
    for (let i = 0; i < 16; i++) {
      const material = new THREE.SpriteMaterial({
        map: puffTexture,
        color: DAY.cloud,
        opacity: DAY.cloudOpacity,
        transparent: true,
        depthWrite: false,
      });
      const group = new THREE.Group();
      const puffCount = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffCount; p++) {
        const sprite = new THREE.Sprite(material);
        const s = 3 + Math.random() * 4.5;
        sprite.scale.set(s * (1.2 + Math.random() * 0.6), s * 0.6, 1);
        sprite.position.set((p - puffCount / 2) * 1.8 + Math.random(), (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2);
        group.add(sprite);
      }
      group.position.set(
        (Math.random() * 2 - 1) * cloudField,
        -1 + Math.random() * 11,
        -30 + Math.random() * 26,
      );
      const speed = 1.2 + Math.random() * 1.8;
      clouds.push({ group, speed, material });
      scene.add(group);
    }

    // --- The airliner -------------------------------------------------------
    const airliner = buildAirliner(0x0ea5e9);
    const planeAnchor = new THREE.Group(); // GSAP intro + idle drive the anchor
    planeAnchor.add(airliner);
    airliner.rotation.y = -0.55; // three-quarter view, nose toward the viewer's right
    airliner.scale.setScalar(1.05);

    // Rest the plane upper-left of the sign-in card; on narrow screens keep it
    // closer to center so it stays in frame above the card.
    const planeBaseFor = (aspect: number) => ({
      x: -Math.min(4.6, Math.max(1.1, aspect * 2.9)),
      y: aspect < 0.8 ? 4.9 : 4.1,
      z: -2,
    });
    let planeBase = planeBaseFor(camera.aspect);
    planeAnchor.position.set(planeBase.x, planeBase.y, planeBase.z);
    scene.add(planeAnchor);

    const engineOffsets = [new THREE.Vector3(0.1, -0.5, 1.45), new THREE.Vector3(0.1, -0.5, -1.45)];

    // --- Contrail puff pool ---------------------------------------------------
    const puffPool: Puff[] = [];
    const maxPuffs = 140;
    for (let i = 0; i < maxPuffs; i++) {
      const material = new THREE.SpriteMaterial({
        map: puffTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      puffPool.push({ sprite, material, life: 1, velocity: new THREE.Vector3() });
    }
    let puffCursor = 0;
    let puffSide = 0;
    const spawnWorld = new THREE.Vector3();

    const spawnPuff = () => {
      const puff = puffPool[puffCursor];
      puffCursor = (puffCursor + 1) % maxPuffs;
      puffSide = 1 - puffSide;
      spawnWorld.copy(engineOffsets[puffSide]);
      airliner.localToWorld(spawnWorld);
      puff.sprite.position.copy(spawnWorld);
      puff.sprite.visible = true;
      puff.sprite.scale.setScalar(0.35);
      puff.life = 0;
      puff.velocity.set(-6 - Math.random() * 2, 0.3 * Math.random(), (Math.random() - 0.5) * 0.4);
    };

    // --- Theme handling ------------------------------------------------------
    const applyTheme = (dark: boolean, animate: boolean) => {
      const p = dark ? NIGHT : DAY;
      const duration = animate && !reducedMotion ? 1.6 : 0;
      const tint = (color: THREE.Color, hex: number) => {
        const target = new THREE.Color(hex);
        gsap.to(color, { r: target.r, g: target.g, b: target.b, duration, ease: "sine.inOut", overwrite: "auto" });
      };
      tint(skyUniforms.topColor.value, p.skyTop);
      tint(skyUniforms.bottomColor.value, p.skyBottom);
      tint(hemi.color, p.hemiSky);
      tint(hemi.groundColor, p.hemiGround);
      tint(sunLight.color, p.sun);
      tint(celestialMat.color, p.celestial);
      gsap.to(sunLight, { intensity: p.sunIntensity, duration, overwrite: "auto" });
      gsap.to(ambient, { intensity: p.ambient, duration, overwrite: "auto" });
      gsap.to(starMat, { opacity: p.starsOpacity, duration, overwrite: "auto" });
      gsap.to(celestialMat, { opacity: p.celestialOpacity, duration, overwrite: "auto" });
      for (const cloud of clouds) {
        tint(cloud.material.color, p.cloud);
        gsap.to(cloud.material, { opacity: p.cloudOpacity, duration, overwrite: "auto" });
      }
    };
    applyThemeRef.current = applyTheme;

    // --- GSAP: intro, idle motion, pointer parallax ---------------------------
    const ctx = gsap.context(() => {
      if (reducedMotion) {
        camera.position.set(0, 2.2, 13);
        return;
      }

      camera.position.set(0, 5.5, 24);
      planeAnchor.position.set(-30, -2, -8);
      planeAnchor.rotation.z = 0.22;

      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .to(camera.position, { x: 0, y: 2.2, z: 13, duration: 2.4 }, 0)
        .to(planeAnchor.position, { x: planeBase.x, y: planeBase.y, z: planeBase.z, duration: 2.6 }, 0)
        .to(planeAnchor.rotation, { z: 0, duration: 2.2 }, 0.4)
        // Idle: gentle bobbing and banking, forever.
        .to(planeAnchor.position, { y: "+=0.45", duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1 })
        .to(planeAnchor.rotation, { z: 0.06, duration: 4.1, ease: "sine.inOut", yoyo: true, repeat: -1 }, "<")
        .to(airliner.rotation, { x: 0.04, duration: 5.3, ease: "sine.inOut", yoyo: true, repeat: -1 }, "<");
    });

    const parallaxX = gsap.quickTo(rig.rotation, "y", { duration: 0.9, ease: "power2.out" });
    const parallaxY = gsap.quickTo(rig.rotation, "x", { duration: 0.9, ease: "power2.out" });
    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion) return;
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = (event.clientY / window.innerHeight) * 2 - 1;
      parallaxX(-nx * 0.05);
      parallaxY(-ny * 0.03);
    };
    window.addEventListener("pointermove", onPointerMove);

    // --- Render loop ----------------------------------------------------------
    const clock = new THREE.Clock();
    let frame = 0;
    let puffAccumulator = 0;
    let disposed = false;

    const renderLoop = () => {
      if (disposed) return;
      frame = requestAnimationFrame(renderLoop);
      const delta = Math.min(clock.getDelta(), 0.1);

      // Clouds stream past to sell forward motion; wrap around the field.
      for (const cloud of clouds) {
        cloud.group.position.x -= cloud.speed * delta * (motion || 0.08);
        if (cloud.group.position.x < -cloudField) {
          cloud.group.position.x = cloudField;
          cloud.group.position.y = -1 + Math.random() * 11;
        }
      }

      if (motion) {
        puffAccumulator += delta;
        while (puffAccumulator > 0.03) {
          puffAccumulator -= 0.03;
          spawnPuff();
        }
        for (const puff of puffPool) {
          if (!puff.sprite.visible) continue;
          puff.life += delta / 2.4;
          if (puff.life >= 1) {
            puff.sprite.visible = false;
            puff.material.opacity = 0;
            continue;
          }
          puff.sprite.position.addScaledVector(puff.velocity, delta);
          const growth = 0.35 + puff.life * 1.7;
          puff.sprite.scale.setScalar(growth);
          puff.material.opacity = 0.55 * (1 - puff.life);
        }
      }

      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
    };
    renderLoop();

    const onResize = () => {
      const { clientWidth, clientHeight } = container;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
      // Keep the plane in frame if the viewport shape changes; only x is
      // retargeted so the idle bobbing tween on y is left alone.
      planeBase = planeBaseFor(camera.aspect);
      gsap.to(planeAnchor.position, { x: planeBase.x, duration: 0.8, ease: "power2.out", overwrite: false });
    };
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      applyThemeRef.current = null;
      ctx.revert();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((m) => m.dispose());
        }
        if (obj instanceof THREE.Sprite) obj.material.dispose();
      });
      puffTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Follow the app theme; the first paint applies instantly, later switches tween.
  const firstThemeApply = useRef(true);
  useEffect(() => {
    if (!resolvedTheme || !applyThemeRef.current) return;
    applyThemeRef.current(resolvedTheme === "dark", !firstThemeApply.current);
    firstThemeApply.current = false;
  }, [resolvedTheme]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 overflow-hidden bg-gradient-to-b from-blue-600 to-blue-100 dark:from-slate-950 dark:to-slate-800"
    />
  );
}
