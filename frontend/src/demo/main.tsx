import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../App';
import '../style.css';
import './style.css';
import {createDemoTransport} from './transport';

const demo=createDemoTransport();
createRoot(document.getElementById('root')!).render(<App demo transport={demo.transport} onDemoReset={demo.reset}/>);

import '../workspace.css';
