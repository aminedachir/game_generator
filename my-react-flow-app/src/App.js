import React, { useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import DnDFlow from './DragDrop/DnDFlow';
import Navbar from './components/Navbar';
import Scenariopage from './components/Scenariopage';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import RedirectComponent from './components/RedirectComponent';

function FlowEditorWrapper({ onFlowRunningChange }) {
  const { scenarioName } = useParams();
  const navigate = useNavigate();

  const handleScenarioSaved = () => {
    navigate('/scenarios');
  };

  const handleBackToList = () => {
    navigate('/scenarios');
  };

  return (
    <ReactFlowProvider>
      <DnDFlow 
        scenarioToLoad={scenarioName || null} 
        onScenarioSaved={handleScenarioSaved}
        onBackToList={handleBackToList}
        onFlowRunningChange={onFlowRunningChange}
        navigate={navigate} 
      />
    </ReactFlowProvider>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [isFlowRunning, setIsFlowRunning] = useState(false);
  const [currentFlowPath, setCurrentFlowPath] = useState('');

  const handleReturnScenarioSelect = () => {
    if (!isFlowRunning) {
      navigate('/scenarios');
    }
  };

  const handleFlowRunningChange = (isRunning) => {
    setIsFlowRunning(isRunning);
  };

  const handleScenarioSelect = (scenarioName) => {
    const flowPath = `/flow/${scenarioName}`;
    setCurrentFlowPath(flowPath);
    navigate(flowPath);
  };

  return (
    <div className="app">
      <Navbar 
        onReturnScenarioSelect={handleReturnScenarioSelect}
        isFlowRunning={isFlowRunning}
      />
      <div style={{ display: 'flex' }}>
        <Routes>
          <Route 
            path="/scenarios" 
            element={
              isFlowRunning ? (
                <RedirectComponent to={currentFlowPath} />
              ) : (
                <Scenariopage
                  onScenarioSelect={handleScenarioSelect}
                  onCreateNew={() => {
                    setCurrentFlowPath('/flow');
                    navigate('/flow');
                  }} 
                />
              )
            } 
          />
          <Route 
            path="/flow/:scenarioName?" 
            element={<FlowEditorWrapper 
              onFlowRunningChange={setIsFlowRunning}
              onFlowPathChange={setCurrentFlowPath}
               />
              } 
          />
          <Route path="*" element={<Navigate to="/scenarios" replace />} />
        </Routes>
      </div>
    </div>
  );
}