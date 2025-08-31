import React, { useState, useRef, useCallback, useEffect } from 'react';
import styles from './MyComponent.module.css';
import { deleteScenario } from '../components/deleteScenario';
import NodeDetails from '../components/NodeDetails';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Panel,
  BackgroundVariant
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios'; 
import Sidebar from './sidebar';
import './style.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const nodeTypes = {
  delay: DelayNode,
};

const initialNodes = [
  {
    id: '1',
    type: 'input',
    data: { label: 'start' },
    position: { x: 250, y: 5 },
  },
  {
    id: '2',
    type: 'output',
    data: { label: 'end' },
    position: { x: 250, y: 200 },
  },
];

var idnumber = 0;
const getId = () => `N${idnumber}`;

const DnDFlow = ({nodeData, scenarioToLoad, onScenarioSaved }) => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rfInstance, setRfInstance] = useState(null);
  const [currentScenarioName, setCurrentScenarioName] = useState('');
  const [isEditable, setIsEditable] = useState(!scenarioToLoad);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showDelayConfig, setShowDelayConfig] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(!scenarioToLoad);

  const [executionState, setExecutionState] = useState({
    isRunning: false,
    currentNodes: [],
    completedNodes: [],
    failedNodes: [],
    executionLog: [],
    startTime: null,
    activePaths: new Set() 
  });

  const updateExecutionState = useCallback((updater) => {
    setExecutionState(prev => updater(prev));
  }, []);

  const executeNode = async (node, pathId = null) => {
    console.log(`Executing node: ${node.id} - ${node.data.label} (Path: ${pathId})`);
    
    updateExecutionState(prev => ({
      ...prev,
      currentNodes: [...prev.currentNodes, node.id]
    }));
    
    setNodes(nds => nds.map(n => ({
      ...n,
      style: n.id === node.id 
        ? { ...n.style, backgroundColor: '#ffeb3b', border: '2px solid #ff9800' }
        : n.style
    })));

    try {
      switch (node.data.deviceType || node.type) {
        case 'device':
          await executeDeviceNode(node);
          break;
        case 'virtual':
          await executeVirtualNode(node);
          break;
        case 'delay':
          await executeDelayNode(node);
          break;
        case 'condition':
          await executeConditionNode(node);
          break;
        case 'input':
        case 'output':
          await new Promise(resolve => setTimeout(resolve, 500));
          break;
        default:
          console.warn(`Unknown node type: ${node.data.deviceType || node.type}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
      }

      updateExecutionState(prev => ({
        ...prev,
        completedNodes: [...prev.completedNodes, node.id],
        currentNodes: prev.currentNodes.filter(id => id !== node.id),
        executionLog: [...prev.executionLog, {
          type: 'success',
          nodeId: node.id,
          nodeName: node.data.label,
          timestamp: new Date(),
          message: `Successfully executed ${node.data.label}`,
          pathId: pathId
        }]
      }));

      setNodes(nds => nds.map(n => ({
        ...n,
        style: n.id === node.id 
          ? { ...n.style, backgroundColor: '#4caf50', border: '2px solid #2e7d32' }
          : n.style
      })));

      return true;

    } catch (error) {
      console.error(`Error executing node ${node.id}:`, error);
      
      updateExecutionState(prev => ({
        ...prev,
        failedNodes: [...prev.failedNodes, node.id],
        currentNodes: prev.currentNodes.filter(id => id !== node.id),
        executionLog: [...prev.executionLog, {
          type: 'error',
          nodeId: node.id,
          nodeName: node.data.label,
          timestamp: new Date(),
          message: `Failed to execute ${node.data.label}: ${error.message}`,
          pathId: pathId
        }]
      }));

      setNodes(nds => nds.map(n => ({
        ...n,
        style: n.id === node.id 
          ? { ...n.style, backgroundColor: '#f44336', border: '2px solid #d32f2f' }
          : n.style
      })));

      throw error;
    }
  };

  const executeDeviceNode = async (node, pathId = null) => {
  const { config, originalDeviceId } = node.data;
  
  try {
    // Call the combined start route (which now includes execute_device functionality)
    const response = await fetch(`${API_BASE_URL}/start/${originalDeviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config,
        nodeId: node.id,
        scenarioName: currentScenarioName
      })
    });

    if (!response.ok) {
      throw new Error(`Device start failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Device start result:', result);
    
    // Poll for device status until completed or failed
    let status = 'in progress';
    let attempts = 0;
    const maxAttempts = 300;
    const pollInterval = 1000;
    
    while (status === 'in progress' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      try {
        const statusResponse = await fetch(`${API_BASE_URL}/get_status/${originalDeviceId}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          status = statusData.status;
          
          // Update node visual feedback
          setNodes(nds => nds.map(n => {
            if (n.id === node.id) {
              let backgroundColor, borderColor;
              
              switch (status) {
                case 'in progress':
                  backgroundColor = '#ffeb3b';
                  borderColor = '#ff9800';
                  break;
                case 'completed':
                  backgroundColor = '#4caf50';
                  borderColor = '#2e7d32';
                  break;
                case 'failed':
                  backgroundColor = '#f44336';
                  borderColor = '#d32f2f';
                  break;
                default:
                  backgroundColor = '#ffeb3b';
                  borderColor = '#ff9800';
              }
              
              return {
                ...n,
                style: { ...n.style, backgroundColor, border: `2px solid ${borderColor}` }
              };
            }
            return n;
          }));
          
          if (status === 'completed') {
            console.log(`Device ${originalDeviceId} completed successfully`);
            return result;
          } else if (status === 'failed') {
            throw new Error(`Device ${originalDeviceId} failed`);
          }
        }
      } catch (error) {
        console.warn(`Status check failed for device ${originalDeviceId}:`, error);
      }
      
      attempts++;
      
      if (attempts % 10 === 0) {
        console.log(`Waiting for device ${originalDeviceId}... (${attempts}s elapsed)`);
      }
    }
    
    if (status === 'in progress') {
      throw new Error(`Device ${originalDeviceId} timeout after ${maxAttempts} seconds`);
    }
    
    return result;
    
  } catch (error) {
    console.error('Device execution error:', error);
    
    setNodes(nds => nds.map(n => {
      if (n.id === node.id) {
        return {
          ...n,
          style: { ...n.style, backgroundColor: '#f44336', border: '2px solid #d32f2f' }
        };
      }
      return n;
    }));
    
    throw error;
  }
};

  const executeVirtualNode = async (node) => {
    const speed = node.data.config?.speed?.value || 3000;
    console.log(`Virtual node waiting for ${speed}ms`);
    await new Promise(resolve => setTimeout(resolve, parseInt(speed)));
  };

  const executeDelayNode = async (node) => {
    const delaySeconds = node.data.config?.delaySeconds?.value || node.data.delaySeconds || 3;
    console.log(`Delay node waiting for ${delaySeconds} seconds`);
    
    for (let i = delaySeconds; i > 0; i--) {
      setNodes(nds => nds.map(n => ({
        ...n,
        data: n.id === node.id 
          ? { ...n.data, remainingTime: i }
          : n.data
      })));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    setNodes(nds => nds.map(n => ({
      ...n,
      data: n.id === node.id 
        ? { ...n.data, remainingTime: undefined }
        : n.data
    })));
  };

  const executeConditionNode = async (node) => {
    const { config } = node.data;
    
    const sourceConfigs = Object.keys(config)
      .filter(key => key.startsWith('source_'))
      .map(key => ({
        key,
        sourceNodeId: config[key].sourceNodeId,
        isChecked: config[key].value === true
      }));
    
    const checkedSources = sourceConfigs
      .filter(source => source.isChecked)
      .map(source => source.sourceNodeId);
    
    console.log('Condition node analysis:');
    console.log('- All source configs:', sourceConfigs);
    console.log('- Checked sources (must complete):', checkedSources);
    
    if (checkedSources.length === 0) {
      console.log('No sources checked - condition node passes immediately');
      await new Promise(resolve => setTimeout(resolve, 500));
      return;
    }
    
    console.log(`Waiting for ${checkedSources.length} checked source(s) to complete...`);
    
    let attempts = 0;
    const maxAttempts = 120; 
    
    while (attempts < maxAttempts) {
      const currentState = executionState;
      const currentCompleted = currentState.completedNodes;
      const currentFailed = currentState.failedNodes;
      
      const anySourceFailed = checkedSources.some(sourceId => 
        currentFailed.includes(sourceId)
      );
      
      if (anySourceFailed) {
        const failedSources = checkedSources.filter(sourceId => 
          currentFailed.includes(sourceId)
        );
        throw new Error(`Required source node(s) failed: ${failedSources.join(', ')}`);
      }
      
      const completedSources = checkedSources.filter(sourceId => 
        currentCompleted.includes(sourceId)
      );
      
      const allRequiredSourcesCompleted = checkedSources.every(sourceId => 
        currentCompleted.includes(sourceId)
      );
      
      console.log(`Condition check - Completed: ${completedSources.length}/${checkedSources.length} required sources`);
      console.log(`- Completed sources: [${completedSources.join(', ')}]`);
      console.log(`- Still waiting for: [${checkedSources.filter(id => !completedSources.includes(id)).join(', ')}]`);
      
      if (allRequiredSourcesCompleted) {
        console.log('All required source paths completed - condition satisfied!');
        break;
      }
      
      if (!currentState.isRunning) {
        throw new Error('Execution was stopped while waiting for source nodes');
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
      
      if (attempts % 10 === 0) {
        console.log(`Still waiting... (${attempts}s elapsed)`);
      }
    }
    
    if (attempts >= maxAttempts) {
      const incompleteSources = checkedSources.filter(sourceId => 
        !executionState.completedNodes.includes(sourceId)
      );
      throw new Error(`Timeout waiting for required source nodes: ${incompleteSources.join(', ')}`);
    }
    
    console.log('Condition node satisfied - proceeding with execution');
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  const getNextNodes = (currentNodeId) => {
    const nextEdges = edges.filter(edge => edge.source === currentNodeId);
    return nextEdges.map(edge => nodes.find(node => node.id === edge.target)).filter(Boolean);
  };

  const generatePathId = () => {
    return `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const traverseFlow = async (startNodeId, pathId = null) => {
    if (!pathId) {
      pathId = generatePathId();
      updateExecutionState(prev => ({
        ...prev,
        activePaths: new Set([...prev.activePaths, pathId])
      }));
    }

    const startNode = nodes.find(node => node.id === startNodeId);
    if (!startNode) {
      console.error(`Node with id ${startNodeId} not found`);
      return;
    }

    try {
      await executeNode(startNode, pathId);
      
      const nextNodes = getNextNodes(startNodeId);
      
      if (nextNodes.length === 0) {
        console.log(`Path ${pathId} completed - no more nodes from ${startNode.data.label}`);
        updateExecutionState(prev => ({
          ...prev,
          activePaths: new Set([...prev.activePaths].filter(p => p !== pathId))
        }));
        return;
      }

      if (nextNodes.length === 1) {
        const nextNode = nextNodes[0];
        
        if (nextNode.data.deviceType === 'condition') {
          console.log(`Approaching condition node: ${nextNode.data.label}`);
          
          await traverseFlow(nextNode.id, pathId);
        } else {
          await traverseFlow(nextNode.id, pathId);
        }
      } else {
        console.log(`Branching into ${nextNodes.length} paths from ${startNode.data.label}`);
        const conditionNodes = nextNodes.filter(node => node.data.deviceType === 'condition');
        const regularNodes = nextNodes.filter(node => node.data.deviceType !== 'condition');
        
        const branchPromises = [];
        
        regularNodes.forEach((nextNode, index) => {
          const branchPathId = `${pathId}_branch_${index}`;
          updateExecutionState(prev => ({
            ...prev,
            activePaths: new Set([...prev.activePaths, branchPathId])
          }));
          branchPromises.push(traverseFlow(nextNode.id, branchPathId));
        });
        
        conditionNodes.forEach((nextNode, index) => {
          const conditionPathId = `${pathId}_condition_${index}`;
          updateExecutionState(prev => ({
            ...prev,
            activePaths: new Set([...prev.activePaths, conditionPathId])
          }));
          branchPromises.push(traverseFlow(nextNode.id, conditionPathId));
        });

        const results = await Promise.allSettled(branchPromises);
        
        const failures = results.filter(result => result.status === 'rejected');
        if (failures.length > 0) {
          console.error(`${failures.length} branch(es) failed:`, failures);
        }
        
        updateExecutionState(prev => ({
          ...prev,
          activePaths: new Set([...prev.activePaths].filter(p => p !== pathId))
        }));
      }
      
    } catch (error) {
      console.error(`Flow traversal error in path ${pathId}:`, error);
      updateExecutionState(prev => ({
        ...prev,
        activePaths: new Set([...prev.activePaths].filter(p => p !== pathId))
      }));
      throw error;
    }
  };

  const handleStartExecution = async () => {
    console.log('Starting flow execution...');
    
    setExecutionState({
      isRunning: true,
      currentNodes: [],
      completedNodes: [],
      failedNodes: [],
      executionLog: [{
        type: 'info',
        message: 'Flow execution started',
        timestamp: new Date()
      }],
      startTime: new Date(),
      activePaths: new Set()
    });

    setNodes(nds => nds.map(n => ({
      ...n,
      style: { ...n.style, backgroundColor: undefined, border: undefined }
    })));

    try {
      const startNode = nodes.find(node => node.type === 'input');
      if (!startNode) {
        throw new Error('No start node found');
      }

      await traverseFlow(startNode.id);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      updateExecutionState(prev => ({
        ...prev,
        isRunning: false,
        executionLog: [...prev.executionLog, {
          type: 'success',
          message: 'Flow execution completed successfully',
          timestamp: new Date(),
          duration: new Date() - prev.startTime
        }]
      }));

      console.log('Flow execution completed successfully');
      alert('Flow execution completed successfully!');

    } catch (error) {
      console.error('Flow execution failed:', error);
      
      updateExecutionState(prev => ({
        ...prev,
        isRunning: false,
        activePaths: new Set(), 
        executionLog: [...prev.executionLog, {
          type: 'error',
          message: `Flow execution failed: ${error.message}`,
          timestamp: new Date(),
          duration: prev.startTime ? new Date() - prev.startTime : 0
        }]
      }));

      alert(`Flow execution failed: ${error.message}`);
    }
  };

  const handleStopExecution = () => {
    updateExecutionState(prev => ({
      ...prev,
      isRunning: false,
      activePaths: new Set(), 
      executionLog: [...prev.executionLog, {
        type: 'warning',
        message: 'Flow execution stopped by user',
        timestamp: new Date()
      }]
    }));

    setNodes(nds => nds.map(n => ({
      ...n,
      style: { ...n.style, backgroundColor: undefined, border: undefined }
    })));

    console.log('Flow execution stopped by user');
  };

  const onNodeClick = (e, clickedNode) => {
    if (clickedNode.data.deviceType === 'delay') {
      setSelectedNode(clickedNode);
      setShowDelayConfig(true);
    } else if (!(clickedNode.type === 'input' || clickedNode.type === 'output')) {
      setSelectedNode(clickedNode);
    }
  };

  const closeDelayConfig = () => {
    setShowDelayConfig(false);
    setSelectedNode(null);
  };

  const updateNodeData = (nodeId, newData) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: newData }
          : node
      )
    );
    setShowDelayConfig(false);
    setSelectedNode(null);
  };

  const closeNodeDetails = () => {
    setSelectedNode(null);
  }

  const onConnect = useCallback((params) => {
    if (isEditable) {
      setEdges((eds) => addEdge(params, eds));
    }
  }, [isEditable, setEdges]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
  if (!isEditable) return;
  
  event.preventDefault();
  const type = event.dataTransfer.getData('application/reactflow');
  const label = event.dataTransfer.getData('application/label');
  const config = JSON.parse(event.dataTransfer.getData('application/config'));
  const deviceDataStr = event.dataTransfer.getData('application/deviceData');
  const deviceData = deviceDataStr ? JSON.parse(deviceDataStr) : null;
  const uniqueId = event.dataTransfer.getData('application/uniqueId');
  const deviceId = event.dataTransfer.getData('application/deviceId');

  if (typeof type === 'undefined' || !type) return;

  const position = rfInstance.screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  
  const newNodeId = uniqueId || getId();
  
  if (!uniqueId) {
    idnumber = idnumber + 1;
  }

  const newNode = {
    id: newNodeId,
    type: type === 'device' ? 'default' : type, 
    position,
    data: { 
      label: label || `${type} node`,
      deviceType: type === 'device' ? 
        (deviceData?.node_type || 'device') : 
        type,
      config: config,
      uniqueId: uniqueId,
      originalDeviceId: deviceId,
      deviceData: deviceData
    },
  };

  console.log("Created new node:", newNode);
  console.log("Node data.originalDeviceId:", newNode.data.originalDeviceId);
  
  setNodes((nds) => nds.concat(newNode));
}, [rfInstance, isEditable, setNodes]);

  const validateFlow = () => {
    const errors = [];
    if (nodes.length === 0) {
      errors.push("Flow must contain at least one node");
      return { isValid: false, errors };
    }
    
    const inputNodes = nodes.filter(node => node.type === 'input');
    const outputNodes = nodes.filter(node => node.type === 'output');
    
    if (inputNodes.length === 0 || inputNodes.length > 1) {
      errors.push("Flow must have one input node");
    }
    if (outputNodes.length === 0 || outputNodes.length > 1) {
      errors.push("Flow must have one output node");
    }
    
    outputNodes.forEach(outputNode => {
      const hasIncomingEdge = edges.some(edge => edge.target === outputNode.id);
      if (!hasIncomingEdge) {
        errors.push(`Output node must have at least one incoming Edge`);
      }
    });
    inputNodes.forEach(inputNode => {
      const hasOutgoingEdge = edges.some(edge => edge.source === inputNode.id);
      if (!hasOutgoingEdge) {
        errors.push(`Input node should have at least one outgoing Edge`);
      }
    });

    const connectedNodeIds = new Set();
    edges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    
    const isolatedNodes = nodes.filter(node => 
      !connectedNodeIds.has(node.id) && 
      node.type !== 'input' && 
      node.type !== 'output'
    );

    const NormalNodes = nodes.filter(node => 
      connectedNodeIds.has(node.id) && 
      node.type !== 'input' && 
      node.type !== 'output'
    )

    NormalNodes.forEach(NormalNodes => {
      const hasIncomingEdge = edges.some(edge => edge.target === NormalNodes.id);
      const hasOutgoingEdge = edges.some(edge => edge.source === NormalNodes.id);
      if (!hasIncomingEdge || !hasOutgoingEdge) {
        errors.push(`each node must have at least one incoming edge and one outgoing edge`);
        return ;
      }
    });
    
    if (isolatedNodes.length > 0) {
      errors.push(`Found a node with no edeges`);
    }
    
    if (inputNodes.length > 0 && outputNodes.length> 0) {
      const hasValidPath = outputNodes.some(outputNode => {
        const reachableFromInput = edges.some(edge => 
          edge.target === outputNode.id || 
          inputNodes.some(inputNode => edge.source === inputNode.id)
        );
        return reachableFromInput;
      });
      
      if (!hasValidPath && edges.length > 0) {
        errors.push("must have path from input to output nodes");
      }
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const saveFlowToBackend = async () => {
    const validation = validateFlow();
    
    if (!validation.isValid) {
      const errorMessage = "Cannot save flow due to the following issues:\n\n" + 
        validation.errors.map((error, index) => `${index + 1}. ${error}`).join('\n') +
        "\n\nPlease fix these issues before saving.";
      
      alert(errorMessage);
      return false; 
    }

    if (currentScenarioName) {
      try {
        let data = {
          "nodes": nodes,
          "edges": edges,
          "name": currentScenarioName
        };
        
        await axios.post(`${API_BASE_URL}/save_flow`, data);
        return true;
        
      } catch (error) {
        console.error('Error saving flow:', error);
      }
    } else {
      const SC_Name = prompt("Enter the name of scenario: ");
      if (!SC_Name) return;
      
      try {
        let data = {
          "nodes": nodes,
          "edges": edges,
          "name": SC_Name
        };
        
        await axios.post(`${API_BASE_URL}/save_flow`, data);
        setCurrentScenarioName(SC_Name);
        
        if (onScenarioSaved) {
          onScenarioSaved();
        }
      } catch (error) {
        console.error('Error saving flow:', error);
      }
    }
  };

  const loadFlowFromBackend = useCallback(async (flowId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/load-flow/${flowId}`);
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      setNodes(response.data.nodes || []);
      setEdges(response.data.edges || []);
      setCurrentScenarioName(flowId);
      
      setIsEditable(false);
      setIsCreatingNew(false);
      
      if (response.data.viewport && rfInstance) {
        rfInstance.setViewport(response.data.viewport);
      }
      
     } catch (error) {
    console.error('Load error details:', error.response?.data);
  }
}, [rfInstance, setNodes, setEdges, setCurrentScenarioName, setIsEditable]);

  useEffect(() => {
  if (scenarioToLoad) {
    loadFlowFromBackend(scenarioToLoad);
  } else {
      setIsEditable(true);
      setIsCreatingNew(true);
      setNodes(initialNodes);
      setEdges([]);
      setCurrentScenarioName('');
    }
}, [scenarioToLoad, currentScenarioName, isCreatingNew, loadFlowFromBackend, setNodes, setIsEditable, setCurrentScenarioName]);
 
  const handleSaveAs = async () => {
    const newScenarioName = prompt("Enter a new name for this scenario:");
    
    if (!newScenarioName) {
      return; 
    }

    try {
      const data = {
        nodes: nodes,
        edges: edges,
        name: newScenarioName
      };

      const response = await axios.post(`${API_BASE_URL}/save_flow`, data);
      
      if (response.status === 200) {
        setCurrentScenarioName(newScenarioName);
        
        if (onScenarioSaved) {
          onScenarioSaved(); 
        }
      }
    } catch (error) {
      console.error('Error saving scenario:', error);
    }
  };

  const handleLoadScenario = (scenarioName) => {
    loadFlowFromBackend(scenarioName);
  };

  const handleEdit = () => {
    setIsEditable(true);
  };

  const handleSave = async () => {
    const saveSuccess = await saveFlowToBackend();
    if (saveSuccess) {
      setIsEditable(false);
    }
  };

  const handleSaveAsAndStayEditable = async () => {
    const validation = validateFlow();
    if (!validation.isValid) {
      const errorMessage = "Cannot save flow due to the following issues:\n\n" + 
      validation.errors.map((error, index) => `${index + 1}. ${error}`).join('\n') +
      "\n\nPlease fix these issues before saving.";
      alert(errorMessage);
      return;
    }
    await handleSaveAs();
  };

  const handledeleteScenario = () => {
    deleteScenario(
      currentScenarioName,
      setCurrentScenarioName,
      setNodes,
      setEdges, 
      onScenarioSaved
    )
  }

  return (
    <div className="dndflow">
      <Panel position="top-right">
        <div className={styles.flowButtons}>
          {!isEditable && !executionState.isRunning && (
            <button 
              className={styles.theme__button} 
              onClick={handleStartExecution}
            >
              START
            </button>
          )}

          {!isEditable && executionState.isRunning && (
            <button 
              className={`${styles.theme__button} ${styles.stopButton}`} 
              onClick={handleStopExecution}
            >
              STOP
            </button>
          )}

          {!isEditable && executionState.isRunning && (
            <button className={styles.theme__button}>
              SKIP
            </button>
          )}
          
          {isEditable && (
            <button className={styles.theme__button} onClick={handleSaveAsAndStayEditable}>
              SAVE AS
            </button>
          )}

          <button className={styles.theme__button} onClick={isEditable ? handleSave : handleEdit}>
            {isEditable ? 'SAVE' : 'EDIT'}
          </button>

          <button className={styles.theme__button} onClick={handledeleteScenario}>
            DELETE
          </button>
        </div>

        {currentScenarioName && (
          <div className={styles.scenarionnamebox}>
            <div className={styles.scenarionname}>
              scenario name: {currentScenarioName}
            </div>
          </div>
        )}

      
      </Panel>

      <ReactFlowProvider>
        <div className="reactflow-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}  
            onNodesChange={isEditable ? onNodesChange : undefined}
            onEdgesChange={isEditable ? onEdgesChange : undefined}
            onConnect={isEditable ? onConnect : undefined}
            onNodeClick={onNodeClick}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodesDraggable={isEditable}
            nodesConnectable={isEditable}
            elementsSelectable={isEditable}
            edgesUpdatable={isEditable}
            edgesFocusable={isEditable}
            nodesFocusable={isEditable}
            panOnDrag={true}
            zoomOnDoubleClick={true}
            selectNodesOnDrag={isEditable}
            fitView
            >
            <Background 
              id="my-background" 
              gap={15} 
              color="#ccc" 
              variant={BackgroundVariant.Dots} 
            />  
            <Controls />
          </ReactFlow>
        </div>
        {isEditable && ( 
          <Sidebar onLoadScenario={handleLoadScenario} />
        )}

        {isEditable && (
          <NodeDetails 
            nodeData={selectedNode} 
            onClose={closeNodeDetails}
            onUpdate={updateNodeData}
            scenarioName={currentScenarioName}
            nodes={nodes}
            edges={edges}
          />
        )}
        
      </ReactFlowProvider>
    </div>
  );
};

export default DnDFlow;