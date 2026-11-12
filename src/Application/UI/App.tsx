import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import LoadingScreen from './components/LoadingScreen';
import InterfaceUI from './components/InterfaceUI';
import eventBus from './EventBus';
import './style.css';

const App = () => {
    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState('loading');
    // The desk hint goes away for good once the visitor has been inside the monitor.
    const [entered, setEntered] = useState(false);

    useEffect(() => {
        eventBus.on('loadingScreenDone', () => {
            setLoading(false);
        });
        const observer = new MutationObserver(() => {
            const next = document.body.dataset.camera || '';
            setStage(next);
            if (next === 'to-monitor' || next === 'monitor') setEntered(true);
        });
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
            {!loading && !entered && stage === 'desk' && (
                <div className="stage-hint" role="status">
                    <span>Click the screen</span>
                    <span className="blinking-cursor" />
                </div>
            )}
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
