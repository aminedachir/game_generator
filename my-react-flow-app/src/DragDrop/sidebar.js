import React, { useState, useEffect, useRef } from 'react';
import styles from './MyComponent.module.css';
import './style.css'
import DelayNode from '../components/DelayNode';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function Sidebar({nodeData, onLoadScenario, onNodeClick}) {
  const [devices, setDevices] = useState({});
  const idCounter = useRef(0);

  const onDragStart = (event, nodeType, label, config, deviceData, uniqueId, deviceId) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/label', label);
    event.dataTransfer.setData('application/config', JSON.stringify(config));
    event.dataTransfer.setData('application/uniqueId', uniqueId);
    event.dataTransfer.setData('application/deviceId', deviceId || ''); 
    
    if (deviceData) {
      event.dataTransfer.setData('application/deviceData', JSON.stringify(deviceData));
    }
    event.dataTransfer.effectAllowed = 'move';
  };

  const fetchDevices = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/get_devices`);
      if (response.ok) {
        const devicesData = await response.text();
        try {
          const parsedDevices = JSON.parse(devicesData.replace(/'/g, '"'));
          setDevices(parsedDevices);
        } catch (parseError) {
          console.error('Error parsing devices data:', parseError);
        }
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <aside className="sidebar">
      <div className={styles.sidenav}>
        <h3 className={styles.titledev}>Connected Devices</h3>
        <div className={styles.titledev2}>Drag devices to create Scenario</div>
        <br></br><br></br>
        {Object.keys(devices).length > 0 ? (
          Object.entries(devices).map(([deviceId, deviceData]) => {
            const uniqueId = idCounter.current;
            idCounter.current++;
            
            return (
              <div
                key={uniqueId}
                className="dndnode device"
                onDragStart={(event) => onDragStart(
                  event, 
                  'device', 
                  `${deviceData.device_name}-${deviceId}/${uniqueId}`, 
                  deviceData.config, 
                  deviceData,
                  uniqueId, 
                  deviceId 
                )}
                draggable
              >
                {deviceData.device_name} - {deviceId}
              </div>
            );
          })
        ) : (
          <div className="no-devices">No devices connected</div>
        )}
        <br></br><br></br>
        <p className={styles.titledev2}>virtual nodes</p>
        <div
          className="dndnode device"
          onDragStart={(event) => onDragStart(
            event,
            'Timer',
            `Timer-${idCounter.current++}`,
            {
              "seconds":{
                    'type' : 'number'
                }
            },
            null, 
            idCounter.current,
            null
          )}
          draggable
        >
          Timer
        </div>
        <div
          className="dndnode device"
          onDragStart={(event) => onDragStart(
            event,
            'condition',
            `Condition-${idCounter.current++}`,
            {},
            null, 
            idCounter.current,
            null
          )}
          draggable
        >
          Condition
        </div>
      </div>
    </aside>
  );
}


export default Sidebar;