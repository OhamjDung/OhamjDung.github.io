import * as THREE from 'three';
import Application from '../Application';
import Time from '../Utils/Time';
import GUI from 'lil-gui';
import getPanel from '../Utils/Panel';

// Ported from thebenezer/FluffyGrass (MIT): instanced tuft cards with an alpha-cut blade texture,
// noise-driven tip colour and wind, lit as Lambert with directional shadows. See CREDITS.md.

export type HeightFn = (x: number, z: number) => number;

const MAX_COUNT = window.innerWidth < 768 ? 40000 : 180000;
const TUFT_SCALE = 2700; // LOD00 card is ~0.13 units tall -> ~350 scene units
// Tunable with ?grass (or ?tune); bake the numbers back here.
const GRASS = {
    count: window.innerWidth < 768 ? 30000 : 120000,
    radius: 157000,
    // Lower = more tufts clustered near the desk, 1 = uniform.
    falloff: 0.81,
    tuftScale: 3.95,
    windAmp: 300,
    heightVariation: 0,
    noiseScale: 6.9,
    lightIntensity: 0.53,
    shadowDarkness: 0.44,
    baseColor: '#49601f',
    tipColor1: '#8fe14c',
    tipColor2: '#bf8522',
};

export default class FluffyGrass {
    application = new Application();
    time: Time;
    mesh: THREE.InstancedMesh;
    heightAt: HeightFn;
    avoidRadius: number;
    gui: GUI | undefined;
    uniforms = {
        uTime: { value: 0 },
        uTerrainSize: { value: GRASS.radius * 2 },
        uWindAmp: { value: GRASS.windAmp },
        uHeightVariation: { value: GRASS.heightVariation },
        uNoiseScale: { value: GRASS.noiseScale },
        uShadowDarkness: { value: GRASS.shadowDarkness },
        uGrassLightIntensity: { value: GRASS.lightIntensity },
        uBaseColor: { value: new THREE.Color(GRASS.baseColor).convertSRGBToLinear() },
        uTipColor1: { value: new THREE.Color(GRASS.tipColor1).convertSRGBToLinear() },
        uTipColor2: { value: new THREE.Color(GRASS.tipColor2).convertSRGBToLinear() },
        uNoiseTexture: { value: null as THREE.Texture | null },
        uGrassAlphaTexture: { value: null as THREE.Texture | null },
    };

    constructor(heightAt: HeightFn, avoidRadius: number) {
        this.heightAt = heightAt;
        this.avoidRadius = avoidRadius;
        this.time = this.application.time;
        const items = this.application.resources.items;
        const noise = items.texture.grassNoiseTexture;
        noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
        const alpha = items.texture.grassAlphaTexture;
        this.uniforms.uNoiseTexture.value = noise;
        this.uniforms.uGrassAlphaTexture.value = alpha;

        let geometry: THREE.BufferGeometry | undefined;
        items.gltfModel.grassTuftModel.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.name.includes('LOD00')) geometry = child.geometry;
        });
        if (!geometry) throw new Error('grassLODs.glb has no LOD00 mesh');
        geometry = geometry.clone();
        geometry.scale(TUFT_SCALE, TUFT_SCALE, TUFT_SCALE);

        const material = new THREE.MeshLambertMaterial({
            side: THREE.DoubleSide,
            transparent: true,
            alphaTest: 0.1,
            shadowSide: THREE.FrontSide,
        });
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.uniforms);
            shader.vertexShader = VERTEX;
            shader.fragmentShader = FRAGMENT;
        };

        this.mesh = new THREE.InstancedMesh(geometry, material, MAX_COUNT);
        this.mesh.receiveShadow = true;
        this.mesh.frustumCulled = false;
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.scatter();
        this.application.scene.add(this.mesh);
        this.setGui();
    }

    // Deterministic placement so slider tweaks re-lay the same field instead of reshuffling it.
    scatter() {
        const count = Math.min(GRASS.count, MAX_COUNT);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const matrix = new THREE.Matrix4();
        const euler = new THREE.Euler();
        let seed = 1337;
        const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        let n = 0;
        while (n < count) {
            const r = Math.pow(random(), GRASS.falloff * 0.5) * GRASS.radius;
            const a = random() * Math.PI * 2;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;
            const yaw = random() * Math.PI * 2;
            const s = (0.75 + random() * 0.6) * GRASS.tuftScale;
            if (Math.hypot(x, z) < this.avoidRadius) continue;
            position.set(x, this.heightAt(x, z), z);
            euler.set(0, yaw, 0);
            quaternion.setFromEuler(euler);
            scale.set(s, s, s);
            matrix.compose(position, quaternion, scale);
            this.mesh.setMatrixAt(n, matrix);
            n++;
        }
        this.mesh.count = count;
        this.mesh.instanceMatrix.needsUpdate = true;
        this.uniforms.uTerrainSize.value = GRASS.radius * 2;
    }

    applyUniforms() {
        this.uniforms.uWindAmp.value = GRASS.windAmp;
        this.uniforms.uHeightVariation.value = GRASS.heightVariation;
        this.uniforms.uNoiseScale.value = GRASS.noiseScale;
        this.uniforms.uGrassLightIntensity.value = GRASS.lightIntensity;
        this.uniforms.uShadowDarkness.value = GRASS.shadowDarkness;
        this.uniforms.uBaseColor.value.set(GRASS.baseColor).convertSRGBToLinear();
        this.uniforms.uTipColor1.value.set(GRASS.tipColor1).convertSRGBToLinear();
        this.uniforms.uTipColor2.value.set(GRASS.tipColor2).convertSRGBToLinear();
    }

    setGui() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('grass') && !params.has('tune')) return;
        this.gui = getPanel().addFolder('Grass');
        const layout = () => this.scatter();
        const shade = () => this.applyUniforms();
        this.gui.add(GRASS, 'count', 1000, MAX_COUNT, 1000).onChange(layout);
        this.gui.add(GRASS, 'radius', 20000, 300000, 1000).onChange(layout);
        this.gui.add(GRASS, 'falloff', 0.3, 1, 0.01).name('spread (1 = even)').onChange(layout);
        this.gui.add(GRASS, 'tuftScale', 0.3, 8, 0.05).name('tuft size').onChange(layout);
        this.gui.add(GRASS, 'windAmp', 0, 600, 1).name('wind').onChange(shade);
        this.gui.add(GRASS, 'heightVariation', 0, 400, 1).name('height variation').onChange(shade);
        this.gui.add(GRASS, 'noiseScale', 0.5, 20, 0.1).name('patchiness').onChange(shade);
        this.gui.add(GRASS, 'lightIntensity', 0, 2, 0.01).name('brightness').onChange(shade);
        this.gui.add(GRASS, 'shadowDarkness', 0, 1, 0.01).name('shadow darkness').onChange(shade);
        this.gui.addColor(GRASS, 'baseColor').name('base color').onChange(shade);
        this.gui.addColor(GRASS, 'tipColor1').name('tip color 1').onChange(shade);
        this.gui.addColor(GRASS, 'tipColor2').name('tip color 2').onChange(shade);
    }

    update() {
        this.uniforms.uTime.value = this.time.elapsed * 0.001;
    }
}

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <shadowmap_pars_vertex>
uniform sampler2D uNoiseTexture;
uniform float uNoiseScale;
uniform float uTime;
uniform float uTerrainSize;
uniform float uWindAmp;
uniform float uHeightVariation;
varying vec2 vGlobalUV;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
    #include <begin_vertex>
    #include <project_vertex>
    #include <fog_vertex>
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <worldpos_vertex>
    #include <shadowmap_vertex>

    vec4 modelPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vGlobalUV = (uTerrainSize - modelPosition.xz) / uTerrainSize;
    vec4 noise = texture2D(uNoiseTexture, vGlobalUV + uTime * 0.001);
    vec2 windDirection = normalize(vec2(1.0, 1.0));
    float sinWave = sin(50.0 * dot(windDirection, vGlobalUV) + noise.g * 5.5 + uTime) * uWindAmp * (1.0 - uv.y);
    modelPosition.x += sinWave;
    modelPosition.z += sinWave;
    modelPosition.y += exp(texture2D(uNoiseTexture, vGlobalUV * uNoiseScale).r) * uHeightVariation * (1.0 - uv.y);

    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;
    vUv = vec2(uv.x, 1.0 - uv.y);
    vNormal = normalize(normalMatrix * normal);
    vViewPosition = -viewPosition.xyz;
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uBaseColor;
uniform vec3 uTipColor1;
uniform vec3 uTipColor2;
uniform sampler2D uGrassAlphaTexture;
uniform sampler2D uNoiseTexture;
uniform float uNoiseScale;
uniform float uGrassLightIntensity;
uniform float uShadowDarkness;
varying vec2 vUv;
varying vec2 vGlobalUV;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
    float grassAlpha = texture2D(uGrassAlphaTexture, vUv).r;
    if (grassAlpha < 0.1) discard;
    float variation = texture2D(uNoiseTexture, vGlobalUV * uNoiseScale).r;
    vec3 tipColor = mix(uTipColor1, uTipColor2, variation);
    vec3 color = mix(uBaseColor, tipColor, vUv.y) * uGrassLightIntensity;

    float shadow = 1.0;
    #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
        DirectionalLightShadow directionalLightShadow;
        #pragma unroll_loop_start
        for (int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i++) {
            directionalLightShadow = directionalLightShadows[i];
            float currentShadow = getShadow(directionalShadowMap[i], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[i]);
            // Fade toward the shadow camera's edge so the frustum border never shows.
            float weight = clamp(pow(length(vDirectionalShadowCoord[i].xy * 2.0 - 1.0), 4.0), 0.0, 1.0);
            shadow = mix(currentShadow, 1.0, weight);
        }
        #pragma unroll_loop_end
    #endif
    color = mix(color * uShadowDarkness, color, shadow);
    gl_FragColor = vec4(color, 1.0);
    #include <encodings_fragment>
    #include <fog_fragment>
}
`;
