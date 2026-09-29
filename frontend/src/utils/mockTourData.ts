export const MOCK_TOUR_DATA = {
  roadmap: {
    dreamTitle: "Become a Full Stack AWS Engineer",
    eta: "Dec 2026",
    nodes: [
      { id: "1", title: "AWS Cloud Practitioner", status: "COMPLETED" },
      { id: "2", title: "Serverless DynamoDB APIs", status: "IN_REVISION" },
      { id: "3", title: "AWS Core Security", status: "PENDING" },
    ]
  },
  dailyTasks: {
    checkpointTitle: "Complete AWS Lambda Module",
    pendingCount: 2,
    tasks: [
      { id: "t1", title: "Write initial Lambda function", progress: 100 },
      { id: "t2", title: "Configure API Gateway trigger", progress: 0 },
      { id: "t3", title: "Set up IAM execution roles", progress: 0 }
    ]
  },
  chat: [
    { sender: 'AI', text: "I have analyzed your timeline. I am taking personal responsibility for this dream. I will act as your mentor—pushing you when you slack, and guiding you when you're stuck. Are you ready to begin?", timestamp: Date.now() - 60000 },
    { sender: 'USER', text: "Yes, let's do this.", timestamp: Date.now() - 30000 }
  ],
  vitals: {
    consistencyScore: 84,
    disciplineScore: 92,
    recoveryRate: 100
  },
  preferences: {
    motivationalContext: "E.g. David Goggins, Vegeta, Elon Musk"
  }
};
