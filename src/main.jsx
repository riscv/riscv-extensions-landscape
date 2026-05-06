import React from 'react';
import ReactDOM from 'react-dom/client';
import RISCVExplorer from './risc_v_visualizer';
// Ensure Tailwind directives are in this file if you haven't set up a separate CSS file
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RISCVExplorer />
  </React.StrictMode>,
);
