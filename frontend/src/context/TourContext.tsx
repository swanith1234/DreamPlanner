import React, { createContext, useContext, useState, useEffect } from 'react';
import { Preferences } from '@capacitor/preferences';

interface TourContextType {
  isTourMode: boolean;           // kept for mock-data gates in existing pages
  showOnboarding: boolean;       // controls AnimatedOnboarding overlay
  currentStep: number;
  advanceTour: (step: number) => void;
  endTour: () => void;
  startTour: () => void;
  completeOnboarding: () => void;
}

export const TourContext = createContext<TourContextType | null>(null);

export const TourProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isTourMode, setIsTourMode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const init = async () => {
      const { value } = await Preferences.get({ key: 'hasSeenTour' });
      if (value !== 'true') {
        // First-time user: show the animated onboarding
        setShowOnboarding(true);
        setIsTourMode(true);
      }
    };
    init();
  }, []);

  const advanceTour = (nextStep: number) => setCurrentStep(nextStep);

  const endTour = async () => {
    await Preferences.set({ key: 'hasSeenTour', value: 'true' });
    setIsTourMode(false);
    setShowOnboarding(false);
  };

  const startTour = async () => {
    await Preferences.remove({ key: 'hasSeenTour' });
    setCurrentStep(0);
    setIsTourMode(true);
    setShowOnboarding(true);
  };

  const completeOnboarding = async () => {
    await Preferences.set({ key: 'hasSeenTour', value: 'true' });
    setShowOnboarding(false);
    setIsTourMode(false);
  };

  return (
    <TourContext.Provider value={{ isTourMode, showOnboarding, currentStep, advanceTour, endTour, startTour, completeOnboarding }}>
      {children}
    </TourContext.Provider>
  );
};

export const useTour = () => {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
};
