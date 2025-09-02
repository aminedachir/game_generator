import React, { useRef, useState, useEffect } from 'react';
import styles from './MyComponent.module.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function NodeDetails({ nodeData, onClose, onUpdate, scenarioName, nodes, edges }) {
  const containerRef = useRef(null);
  const [imagePreviews, setImagePreviews] = useState({});
  const [uploading, setUploading] = useState({});
  const [uploadStatus, setUploadStatus] = useState({});
  const [connectedSources, setConnectedSources] = useState([]);
  
  useEffect(() => {
    if (nodeData && nodeData.data && nodeData.data.config) {
      const previews = {};
      Object.keys(nodeData.data.config).forEach(key => {
        const config = nodeData.data.config[key];
        if (config.type === 'file' && config.value) {
          if (config.value.startsWith('data:image/')) {
            previews[key] = config.value;
          } else {
            const imageUrl = config.value.startsWith('/static/uploads/') 
              ? `${API_BASE_URL}${config.value}`
              : config.value;
            previews[key] = imageUrl;
          }
        }
      });
      setImagePreviews(previews);
    }

    if (nodeData && nodeData.data?.deviceType === 'condition') {
      const sourceNodeIds = edges
        .filter(edge => edge.target === nodeData.id)
        .map(edge => edge.source);
      
      const sourceNodes = nodes.filter(node => 
        sourceNodeIds.includes(node.id) && 
        node.type !== 'input'
      );
      
      setConnectedSources(sourceNodes);

      if (nodeData.data.config) {
        console.log("____________________________");
        sourceNodes.forEach(sourceNode => {
          const checkboxKey = `source_${sourceNode.id}`;
          console.log(sourceNode.data.label);
          if (!nodeData.data.config[checkboxKey]) {
            nodeData.data.config[checkboxKey] = {
              type: 'checkbox',
              value: false,
              sourceNodeId: sourceNode.id,
              sourceNodeLabel: sourceNode.data?.label || `Node ${sourceNode.id}`
            };
          }
        });
      }
    }
  }, [nodeData, nodes, edges]);

  if (!nodeData) return null;

  const handleFileChange = async (e, fieldName) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImagePreviews(prev => ({ ...prev, [fieldName]: dataUrl }));
      if (nodeData.data.config[fieldName]) {
        nodeData.data.config[fieldName].tempDataUrl = dataUrl;
      }
    };
    reader.readAsDataURL(file);
    
    setUploading(prev => ({ ...prev, [fieldName]: true }));
    setUploadStatus(prev => ({ ...prev, [fieldName]: 'uploading' }));
    
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('nodeId', nodeData.id);
      formData.append('scenarioName', scenarioName);
      formData.append('fieldName', fieldName);

      const response = await fetch(`${API_BASE_URL}/upload-image`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        nodeData.data.config[fieldName].value = data.imageUrl;
        delete nodeData.data.config[fieldName].tempDataUrl;
        
        const fullImageUrl = `${API_BASE_URL}${data.imageUrl}`;
        setImagePreviews(prev => ({ ...prev, [fieldName]: fullImageUrl }));
        
        setUploadStatus(prev => ({ ...prev, [fieldName]: 'success' }));
        setTimeout(() => {
          setUploadStatus(prev => {
            const newStatus = { ...prev };
            delete newStatus[fieldName];
            return newStatus;
          });
        }, 2000);
      } else { 
        console.error('Upload failed');
        setUploadStatus(prev => ({ ...prev, [fieldName]: 'error' }));
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus(prev => ({ ...prev, [fieldName]: 'error' }));
    }
    setUploading(prev => ({ ...prev, [fieldName]: false }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!containerRef.current) return;
    
    const formElements = containerRef.current.querySelectorAll('input, select, textarea');
    formElements.forEach(element => {
      if (element.type !== 'file') {
        if (element.type === 'checkbox') {
          nodeData.data.config[element.name].value = element.checked;
        } else {
          nodeData.data.config[element.name].value = element.value;
        }
      }
    });

    const hasUnuploadedImages = Object.keys(nodeData.data.config).some(key => {
      const config = nodeData.data.config[key];
      return config.type === 'file' && 
             config.tempDataUrl && 
             !config.value.startsWith('/static/uploads');
    });

    if (hasUnuploadedImages) {
      alert('Please complete all image uploads before saving');
      return;
    }

    if (onUpdate) {
      onUpdate(nodeData.id, nodeData.data);
    }
    onClose();
  };

  const getUploadStatusMessage = (fieldName) => {
    const status = uploadStatus[fieldName];
    switch (status) {
      case 'uploading':
        return <span className={`${styles.uploadStatus} ${styles.uploading}`}>Uploading...</span>;
      case 'success':
        return <span className={`${styles.uploadStatus} ${styles.uploadSuccess}`}>Upload successful!</span>;
      case 'error':
        return <span className={`${styles.uploadStatus} ${styles.uploadError}`}>Upload failed. Please try again.</span>;
      default:
        return null;
    }
  };

  const isAnyUploading = Object.values(uploading).some(status => status);

  return (
    <div className={styles.nodeDetailsContainer} ref={containerRef}>
      <div className={styles.nodeDetailsContent}>
        <p><strong>Name:</strong> {nodeData.data?.label}</p>
        <p><strong>Type:</strong> {nodeData.type}</p>
        
        {nodeData.data?.deviceType === 'condition' && connectedSources.length > 0 && (
          <div className={styles.connectedSources}>
            <h4>Connected Source Nodes:</h4>
            {connectedSources.map(sourceNode => {
              const checkboxKey = `source_${sourceNode.id}`;
              const config = nodeData.data.config[checkboxKey] || {
                type: 'checkbox',
                value: false,
                sourceNodeId: sourceNode.id,
                sourceNodeLabel: sourceNode.data?.label || `Node ${sourceNode.id}`
              };
              
              return (
                <div key={sourceNode.id} className={styles.sourceCheckbox}>
                  <label className={styles.sourcenode}>
                    <input
                      type="checkbox"
                      name={checkboxKey}
                      defaultChecked={config.value === true || config.value === 'true'}
                      onChange={(e) => {
                        if (!nodeData.data.config[checkboxKey]) {
                          nodeData.data.config[checkboxKey] = {
                            type: 'checkbox',
                            value: e.target.checked,
                            sourceNodeId: sourceNode.id,
                            sourceNodeLabel: sourceNode.data?.label || `Node ${sourceNode.id}`
                          };
                        } else {
                          nodeData.data.config[checkboxKey].value = e.target.checked;
                        }
                      }}
                    />
                    {`${sourceNode.data.label}`}
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <div className={styles.nodeDetailsConfig}>
          {Object.keys(nodeData.data.config).map((item) => {
            const value = nodeData.data.config[item];
            if (item.startsWith('source_')) {
              return null;
            }

            return (
              <div key={item}>
                <label>
                  <div className={styles.inputtitlecountainer}>
                    <strong className={styles.titleinputNodeDetails}>{item}: </strong>  
                    {value.type === "select" ? (
                      <select name={item} defaultValue={value.value} className={styles.optionNodeDetails}>
                        <option value=""></option>
                        {value.options.map((option, i) => (
                          <option key={i} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : value.type === "file" ? (
                      <div className={styles.fileInputContainer}>
                        <label className={styles.fileInputLabel}>
                          Choose {item}
                          <input 
                            type="file" 
                            name={item} 
                            accept={value.accept || 'image/*'}
                            onChange={(e) => handleFileChange(e, item)}
                            className={styles.hiddenFileInput}
                            disabled={uploading[item]}
                          />
                        </label>
                        {getUploadStatusMessage(item)}
                        
                        {imagePreviews[item] && (
                          <div className={styles.imagePreviewContainer}>
                            <img 
                              src={imagePreviews[item]} 
                              alt={`${item} preview`} 
                              className={styles.imagePreview}
                              onError={(e) => {
                                console.error('Image failed to load:', imagePreviews[item]);
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : value.type === "checkbox" ? (
                      <div>
                        <label>
                          <input 
                            type={value.type}
                            name={item} 
                            defaultChecked={value.value === true || value.value === 'true'}
                            value={value.value || true}
                          />
                        </label>
                      </div>
                    ) : (
                      <input 
                        className={styles.inputNodeDetails} 
                        name={item} 
                        type={value.type} 
                        defaultValue={value.value}
                        {...(nodeData.data.deviceType === 'delay' && item === 'delaySeconds' ? {
                          type: 'number',
                          min: '1',
                          step: '1'
                        } : {})}
                      />
                    )}
                  </div>
                </label>
              </div>
            );
          })}
          <div className={styles.configButtons}>
            <button 
              className={styles.theme__button} 
              onClick={handleSave} 
              disabled={isAnyUploading}
            >
              {isAnyUploading ? 'Uploading...' : 'Save'}
            </button>
            <button 
              onClick={onClose} 
              className={styles.theme__button} 
              disabled={isAnyUploading}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NodeDetails;

