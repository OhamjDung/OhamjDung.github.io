import GUI from 'lil-gui';

let root: GUI | undefined;

// Single top-right lil-gui root shared by the scene controls and the ?tune folders.
export default function getPanel(): GUI {
    if (!root) {
        root = new GUI({ title: 'Scene' });
        root.domElement.style.zIndex = '10001';
        root.domElement.classList.add('scene-panel');
        // Collapsed by default so the sliders don't read as a leftover debug panel.
        root.close();
    }
    return root;
}
