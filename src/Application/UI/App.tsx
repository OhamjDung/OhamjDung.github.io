import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import LoadingScreen from './components/LoadingScreen';
import InterfaceUI from './components/InterfaceUI';
import eventBus from './EventBus';
import './style.css';

const App = () => {
    const [loading, setLoading] = useState(true);
    const [haze, setHaze] = useState(29);

    useEffect(() => {
        eventBus.on('loadingScreenDone', () => {
            setLoading(false);
        });
    }, []);

    return (
        <div id="ui-app">
            <LoadingScreen />
            {!loading && <label className="haze-control" data-scene-control>
                <span>Haze</span>
                <input aria-label="Haze" type="range" min="0" max="100" value={haze}
                    onChange={(event) => { const value = Number(event.target.value); setHaze(value); eventBus.dispatch('hazeChange', value); }} />
                <output>{haze}%</output>
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
