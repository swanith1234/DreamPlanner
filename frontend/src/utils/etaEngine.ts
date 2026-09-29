export type RoadmapNode = {
  status: string;
  difficultyLevel: number;
  startDate?: string | null;
  completedAt?: string | null;
};

export type ETAMetrics = {
  baselineETA: number;
  predictiveETA: number;
  delta: number; // predictive - baseline
  projectedGraduationDate: Date;
  nextActionLeverage: number;
};

const BASELINES: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export const calculatePredictiveETA = (nodes: RoadmapNode[]): ETAMetrics => {
  // Calculate true velocity (average completion time) for each difficulty level
  const completionTimesByDifficulty: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  nodes.forEach(node => {
    if (node.status === 'COMPLETED' && node.startDate && node.completedAt) {
      const start = new Date(node.startDate).getTime();
      const end = new Date(node.completedAt).getTime();
      const days = (end - start) / (1000 * 60 * 60 * 24);
      if (days >= 0) {
        const diffIndex = node.difficultyLevel || 3;
        if (!completionTimesByDifficulty[diffIndex]) completionTimesByDifficulty[diffIndex] = [];
        completionTimesByDifficulty[diffIndex].push(days);
      }
    }
  });

  const avgVelocityByDifficulty: Record<number, number | null> = { 1: null, 2: null, 3: null, 4: null, 5: null };
  for (const diff of [1, 2, 3, 4, 5]) {
    const times = completionTimesByDifficulty[diff];
    if (times && times.length > 0) {
      avgVelocityByDifficulty[diff] = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  // Iterate through all uncompleted nodes
  let baselineRemainingDays = 0;
  let predictiveRemainingDays = 0;
  let nextActionLeverage = 0;
  let foundFirstAction = false;

  nodes.forEach(node => {
    if (node.status !== 'COMPLETED') {
      const diff = node.difficultyLevel || 3;
      const baseline = BASELINES[diff] || BASELINES[3];
      const velocity = avgVelocityByDifficulty[diff];
      const predictive = velocity !== null ? velocity : baseline;
      
      baselineRemainingDays += baseline;
      predictiveRemainingDays += predictive;

      if (!foundFirstAction && (node.status === 'PENDING' || node.status === 'IN_PROGRESS' || node.status === 'FAILED' || node.status === 'REVISION_REQUIRED')) {
        nextActionLeverage = predictive;
        foundFirstAction = true;
      }
    }
  });

  const baselineETA = Math.ceil(baselineRemainingDays);
  const predictiveETA = Math.ceil(predictiveRemainingDays);
  const delta = predictiveETA - baselineETA;
  
  const projectedGraduationDate = new Date();
  projectedGraduationDate.setDate(projectedGraduationDate.getDate() + predictiveETA);

  return {
    baselineETA,
    predictiveETA,
    delta,
    projectedGraduationDate,
    nextActionLeverage: Math.ceil(nextActionLeverage),
  };
};
