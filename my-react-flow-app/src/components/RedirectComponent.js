import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const RedirectComponent = ({ to, replace = true }) => {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  
  return null;
};

export default RedirectComponent;