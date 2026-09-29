import React from 'react';
import ThreeDLoader from './ThreeDLoader';

const PageLoader: React.FC = () => {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        }}>
            <div style={{ width: '100px', height: '100px' }}>
                <ThreeDLoader />
            </div>
        </div>
    );
};

export default PageLoader;
