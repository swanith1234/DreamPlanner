import dotenv from 'dotenv';
dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 3000}/api`;

async function runTests() {
  console.log('=============================================');
  console.log('🚀 INITIALIZING AI EDGE-CASE TEST SUITE 🚀');
  console.log('=============================================\n');

  // 1. Authenticate (Create a disposable test user)
  const testEmail = `qa.ai.test.${Date.now()}@test.com`;
  console.log(`[AUTH] Creating temporary user: ${testEmail}`);
  
  let token = '';
  try {
    const authRes = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'QA Tester',
        email: testEmail,
        password: 'Password123!',
      }),
    });

    if (!authRes.ok) throw new Error(await authRes.text());
    
    // Auth controllers return the token via HttpOnly cookies, not JSON payloads
    const cookieHeader = authRes.headers.get('set-cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/accessToken=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) throw new Error('Failed to parse accessToken from Set-Cookie header');
    console.log(`[AUTH] ✅ Success. Token acquired from cookies.\n`);
  } catch (err: any) {
    console.error(`[AUTH] ❌ Failed to create user. Is the server running on ${API_URL}?`);
    console.error(err.message);
    process.exit(1);
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `accessToken=${token}`
  };

  // -----------------------------------------------------------------
  // Test Suite 1: Dream Validator
  // -----------------------------------------------------------------
  console.log('------------------------------------------------');
  console.log('🧪 TEST SUITE 1: DREAM VALIDATOR');
  console.log('------------------------------------------------\n');

  // Payload A: The Troll
  console.log('▶ Payload A (The Troll): "I want to be Elon Musk and go to Mars tomorrow."');
  const payloadA = {
    title: 'Go to Mars',
    domain: 'SpaceX',
    targetGoal: 'I want to be Elon Musk and go to Mars tomorrow.',
    currentSkillLevel: 'Beginner',
    deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
    motivationStatement: 'For the memes',
    confirmed: false
  };

  const resA = await fetch(`${API_URL}/dreams/sync`, { method: 'POST', headers, body: JSON.stringify(payloadA) });
  const dataA = await resA.json() as any;
  if (dataA.status === 'INVALID' || dataA.error) {
    console.log(`✅ Passed. AI Rejected Troll. Reason: ${dataA.reason || dataA.warnings?.[0]}`);
  } else {
    console.error(`❌ Failed. AI accepted the troll dream! Status: ${dataA.status}`);
  }

  // Payload B: The Impossible
  console.log('\n▶ Payload B (The Impossible): "Build a real working Time Machine by tomorrow."');
  const payloadB = {
    title: 'Time Machine',
    domain: 'Physics',
    targetGoal: 'Build a working time machine tomorrow.',
    currentSkillLevel: 'Beginner',
    deadline: new Date(Date.now() + 86400000).toISOString().split('T')[0], // tomorrow
    motivationStatement: 'To fix my past mistakes',
    confirmed: false
  };

  const resB = await fetch(`${API_URL}/dreams/sync`, { method: 'POST', headers, body: JSON.stringify(payloadB) });
  const dataB = await resB.json() as any;
  if (dataB.status === 'INVALID' || dataB.error) {
    console.log(`✅ Passed. AI Rejected Impossible timeline. Reason: ${dataB.reason || dataB.warnings?.[0]}`);
  } else {
    console.error(`❌ Failed. AI accepted the impossible dream! Status: ${dataB.status}`);
  }

  // Payload C: The Golden Path
  console.log('\n▶ Payload C (The Golden Path): "Get a Google software engineering job in 1 week."');
  const payloadC = {
    title: 'Google SWE',
    domain: 'Software Engineering',
    targetGoal: 'Pass the Google coding interviews and get an offer in 1 week.',
    currentSkillLevel: 'Expert',
    deadline: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], // 1 week
    motivationStatement: 'To work with the best engineers',
    confirmed: false
  };

  const resC = await fetch(`${API_URL}/dreams/sync`, { method: 'POST', headers, body: JSON.stringify(payloadC) });
  const dataC = await resC.json() as any;
  if (dataC.status === 'PENDING_CONFIRMATION') {
    console.log(`✅ Passed. AI Approved realistic dream. (Status: PENDING_CONFIRMATION)`);
  } else {
    console.error(`❌ Failed. AI rejected the golden path! Status: ${dataC.status}, Reason: ${dataC.reason}, Error: ${dataC.error}`);
    process.exit(1);
  }

  // -----------------------------------------------------------------
  // Test Suite 2: Roadmap Generator
  // -----------------------------------------------------------------
  console.log('\n------------------------------------------------');
  console.log('🧪 TEST SUITE 2: ROADMAP GENERATOR (Zod Hardened)');
  console.log('------------------------------------------------\n');
  
  console.log('▶ Submitting Payload C with "confirmed: true"... waiting for Roadmap AI...');
  payloadC.confirmed = true;
  
  const startTime = Date.now();
  const resGen = await fetch(`${API_URL}/dreams/sync`, { method: 'POST', headers, body: JSON.stringify(payloadC) });
  
  if (!resGen.ok) {
    console.error(`❌ Failed. Server returned HTTP ${resGen.status}.`);
    console.error(await resGen.text());
    process.exit(1);
  }

  const dataGen = await resGen.json() as any;
  console.log(`\n⏳ Roadmap generation took ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  if (dataGen.status !== 'COMPLETE' || !dataGen.roadmap?.milestones) {
    console.error(`❌ Failed. Missing roadmap data in COMPLETE payload.`);
    console.error(JSON.stringify(dataGen, null, 2));
    process.exit(1);
  }

  const milestones = dataGen.roadmap.milestones;
  
  console.log(`\n[ASSERTIONS]`);
  // Assertion 1: > 5 nodes
  if (milestones.length >= 5) {
    console.log(`✅ Assert Length: Passed. Generated ${milestones.length} milestones (>= 5).`);
  } else {
    console.error(`❌ Assert Length: Failed. Generated ${milestones.length} milestones, expected >= 5.`);
  }

  // Assertion 2: Strict integer 1-5
  let diffAssertPassed = true;
  milestones.forEach((m: any, idx: number) => {
    const d = m.difficultyLevel;
    if (!Number.isInteger(d) || d < 1 || d > 5) {
      console.error(`❌ Assert Difficulty: Failed at Milestone ${idx + 1} ("${m.title}"). Expected integer 1-5, got: ${d} (type: ${typeof d})`);
      diffAssertPassed = false;
    }
  });

  if (diffAssertPassed) {
    console.log(`✅ Assert Difficulty: Passed. All ${milestones.length} milestones strictly contain integer difficulties between 1 and 5.`);
  }

  console.log('\n=============================================');
  console.log('🎉 ALL TESTS COMPLETED 🎉');
  console.log('=============================================');
}

runTests().catch(console.error);
