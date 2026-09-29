import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import PageLoader from './PageLoader';

const RoadmapRedirect: React.FC = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const findActiveRoadmap = async () => {
            try {
                // Fetch dreams to find the most recent active one
                const { data } = await api.get('/dreams');
                const dreams = data.dreams || [];
                
                if (dreams.length > 0) {
                    // Just take the first one (most recent)
                    navigate(`/app/dreams/${dreams[0].id}/roadmap`, { replace: true });
                } else {
                    // No dreams, go to dreams page to create one
                    navigate('/app/dreams', { replace: true });
                }
            } catch (error) {
                console.error("Failed to redirect to roadmap", error);
                navigate('/app/dreams', { replace: true });
            }
        };

        findActiveRoadmap();
    }, [navigate]);

    return <PageLoader />;
};

export default RoadmapRedirect;
