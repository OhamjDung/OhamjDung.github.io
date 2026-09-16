import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import LoadingScreen from './components/LoadingScreen';
import InterfaceUI from './components/InterfaceUI';
import eventBus from './EventBus';
import './style.css';

const App = () => {
    const [loading, setLoading] = useState(true);
    const [haze, setHaze] = useState(29);
    const [sun, setSun] = useState(15);
    const [stage, setStage] = useState('loading');

    useEffect(() => {
        eventBus.on('loadingScreenDone', () => {
            setLoading(false);
        });
        const observer = new MutationObserver(() => setStage(document.body.dataset.camera || ''));
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-camera'] });
        return () => observer.disconnect();
    }, []);

    return (
        <div id="ui-app">
            <LoadingScreen />
            {!loading && stage !== 'idle' && !stage.startsWith('to-') && (
                <button className="stage-arrow stage-arrow-left" data-scene-control aria-label="Zoom out" title="Zoom out"
                    onClick={() => eventBus.dispatch('cameraBackward', {})}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8" /></svg>
                </button>
            )}
            {!loading && stage !== 'monitor' && !stage.startsWith('to-') && (
                <button className="stage-arrow stage-arrow-right" data-scene-control aria-label="Zoom in" title="Zoom in"
                    onClick={() => eventBus.dispatch('cameraForward', {})}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8" /></svg>
                </button>
            )}
            {!loading && <label className="haze-control" data-scene-control>
                <span>Haze</span>
                <input aria-label="Haze" type="range" min="0" max="100" value={haze}
                    onChange={(event) => { const value = Number(event.target.value); setHaze(value); eventBus.dispatch('hazeChange', value); }} />
                <output>{haze}%</output>
            </label>}
            {!loading && <label className="haze-control sun-control" data-scene-control>
                <span>Sun</span>
                <input aria-label="Sun height" type="range" min="2" max="80" value={sun}
                    onChange={(event) => { const value = Number(event.target.value); setSun(value); eventBus.dispatch('sunChange', value); }} />
                <output>{sun}°</output>
            </label>}
        </div>
    );
};

const createUI = () => {
    ReactDOM.render(<App />, document.getElementById('ui'));
};

const createVolumeUI = () => {
    ReactDOM.render(<InterfaceUI />, document.getElementById('ui-interactive'));
};

export { createUI, createVolumeUI };
