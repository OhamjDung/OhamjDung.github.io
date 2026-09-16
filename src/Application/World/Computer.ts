import * as THREE from 'three';
import Application from '../Application';
import BakedModel from '../Utils/BakedModel';
import Resources from '../Utils/Resources';

export default class Computer {
    application: Application;
    scene: THREE.Scene;
    resources: Resources;
    bakedModel: BakedModel;

    constructor() {
        this.application = new Application();
        this.scene = this.application.scene;
        this.resources = this.application.resources;

        this.bakeModel();
        this.setModel();
    }

    bakeModel() {
        this.bakedModel = new BakedModel(
            this.resources.items.gltfModel.computerSetupModel,
            this.resources.items.texture.computerSetupTexture,
            900
        );
    }

    setModel() {
        // Hide baked badges at render time, retaining the attributed source atlas unchanged.
        this.bakedModel.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                #ifdef USE_MAP
                    vec2 badgeUv = vUv;
                    if (vUv.x > 0.550 && vUv.x < 0.590 && vUv.y > 0.468 && vUv.y < 0.486) badgeUv.x = 0.546;
                    if (vUv.x > 0.414 && vUv.x < 0.448 && vUv.y > 0.132 && vUv.y < 0.185) badgeUv.x = 0.398;
                    if (vUv.x > 0.676 && vUv.x < 0.732 && vUv.y > 0.804 && vUv.y < 0.840) badgeUv.x = 0.743;
                    vec4 sampledDiffuseColor = texture2D(map, badgeUv);
                    if (vUv.x > 0.322 && vUv.x < 0.408 && vUv.y > 0.644 && vUv.y < 0.671) {
                        vec4 cleanBand = mix(texture2D(map, vec2(0.321, vUv.y)), texture2D(map, vec2(0.409, vUv.y)), smoothstep(0.322, 0.408, vUv.x));
                        float edge = smoothstep(0.644, 0.646, vUv.y) * (1.0 - smoothstep(0.669, 0.671, vUv.y));
                        sampledDiffuseColor = mix(sampledDiffuseColor, cleanBand, edge);
                    }
                    diffuseColor *= sampledDiffuseColor;
                #endif
            `);
        };
        this.scene.add(this.bakedModel.getModel());
    }
}
