import * as THREE from 'three';
import Application from '../Application';
import BakedModel from '../Utils/BakedModel';
import Resources from '../Utils/Resources';

export default class Environment {
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
            this.resources.items.gltfModel.environmentModel,
            this.resources.items.texture.environmentTexture,
            900
        );
    }

    setModel() {
        const model = this.bakedModel.getModel();
        // The baked backdrop cube is replaced by the procedural hills scene.
        const background = model.getObjectByName('Background');
        if (background) background.visible = false;
        const desk = model.getObjectByName('desk') as THREE.Mesh;
        if (desk) {
            desk.geometry = desk.geometry.clone();
            desk.geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({ map: this.bakedModel.texture, roughness: 0.88 });
            material.onBeforeCompile = (shader) => {
                shader.vertexShader = 'varying vec3 vDeskPosition;\nvarying vec3 vDeskNormal;\n' + shader.vertexShader;
                shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeskPosition = position; vDeskNormal = normal;');
                shader.fragmentShader = 'varying vec3 vDeskPosition;\nvarying vec3 vDeskNormal;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
                    // Replace only the top's baked prop shadows with clean laminate.
                    if (vDeskPosition.y > -0.67 && vDeskNormal.y > 0.8) {
                        float grain = sin(vDeskPosition.x * 900.0 + sin(vDeskPosition.z * 25.0)) * 0.006;
                        diffuseColor.rgb = vec3(0.21, 0.22, 0.22) + grain;
                    }
                `);
            };
            desk.material = material;
            desk.receiveShadow = true;
            desk.castShadow = true;
        }
        this.scene.add(model);
        this.addDeskShadowCatcher();
    }

    // The baked desk is unlit, so an invisible plane on its top catches the cat/monitor shadows.
    addDeskShadowCatcher() {
        const catcher = new THREE.Mesh(
            new THREE.PlaneGeometry(6070, 2790),
            new THREE.ShadowMaterial({ opacity: 0.38, transparent: true })
        );
        catcher.rotation.x = -Math.PI / 2;
        // Desk top spans x -3587..2481, z -1146..1639 at y -452.
        catcher.position.set(-553, -449, 246);
        catcher.receiveShadow = true;
        this.scene.add(catcher);
    }

    update() {}
}
