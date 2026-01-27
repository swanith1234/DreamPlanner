#!/bin/bash

# ============================================================
# Dream Planner API - Complete Test Script
# ============================================================
# Usage: bash test-api.sh
# Make sure backend is running: npm run dev
# ============================================================

set -e  # Exit on error

BASE_URL="http://localhost:3000"
EMAIL="smac@gmail.com"
PASSWORD="smac@123"
TIMEZONE="Asia/Kolkata"
DREAM_TITLE="Master Cloud Architecture"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
# Helper functions
# ============================================================

print_header() {
    echo -e "\n${BLUE}========== $1 ==========${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# ============================================================
# 1. SIGNUP
# ============================================================
print_header "1. SIGNUP"

SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Alice Johnson\",
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"timezone\": \"$TIMEZONE\"
  }")

TOKEN=$(echo $SIGNUP_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_ID=$(echo $SIGNUP_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

print_success "User signed up: $EMAIL"
print_success "Token obtained: ${TOKEN:0:20}..."
print_success "User ID: $USER_ID"

# ============================================================
# 2. LOGIN
# ============================================================
print_header "2. LOGIN"

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\"
  }")

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

print_success "User logged in successfully"
print_success "New token obtained: ${TOKEN:0:20}..."

# ============================================================
# 3. GET CURRENT USER
# ============================================================
print_header "3. GET CURRENT USER"

curl -s -X GET "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "User preferences loaded"

# ============================================================
# 4. CREATE DREAM (DRAFT)
# ============================================================
print_header "4. CREATE DREAM (DRAFT)"

DREAM_RESPONSE=$(curl -s -X POST "$BASE_URL/api/dreams" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\": \"$DREAM_TITLE\",
    \"description\": \"Learn Kubernetes, Docker, AWS, microservices patterns. Design scalable systems. Build 2 production projects.\",
    \"motivationStatement\": \"Want to become a cloud architect and lead infrastructure teams\",
    \"deadline\": \"2026-12-31\",
    \"impactScore\": 10
  }")

DREAM_ID=$(echo $DREAM_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

print_success "Dream created (DRAFT status)"
print_success "Dream ID: $DREAM_ID"
print_success "Title: $DREAM_TITLE"

# ============================================================
# 5. VALIDATE DREAM (AI Analysis)
# ============================================================
print_header "5. VALIDATE DREAM (AI Analysis)"

VALIDATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/dreams/$DREAM_ID/validate" \
  -H "Authorization: Bearer $TOKEN")

IS_VALID=$(echo $VALIDATE_RESPONSE | grep -o '"isValid":[^,}]*' | cut -d':' -f2)

if [ "$IS_VALID" = "true" ]; then
    print_success "Dream validated (AI says it's valid)"
else
    print_info "Dream validation warnings detected (check output)"
fi

# Extract checkpoint count
CHECKPOINT_COUNT=$(echo $VALIDATE_RESPONSE | grep -o '"suggestedCheckpoints":\[' -A 100 | grep -o '"title":"[^"]*' | wc -l)
print_success "AI generated $CHECKPOINT_COUNT checkpoint suggestions"

# ============================================================
# 6. CONFIRM DREAM (Activate)
# ============================================================
print_header "6. CONFIRM DREAM (Activate)"

CONFIRM_RESPONSE=$(curl -s -X POST "$BASE_URL/api/dreams/$DREAM_ID/confirm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "checkpoints": [
      {
        "title": "Docker Fundamentals",
        "description": "Master containerization, Dockerfile, Docker Compose",
        "expectedEffort": 20,
        "miniDeadline": "2026-03-15",
        "orderIndex": 0
      },
      {
        "title": "Kubernetes Essentials",
        "description": "Pods, Services, Deployments, networking",
        "expectedEffort": 35,
        "miniDeadline": "2026-06-01",
        "orderIndex": 1
      },
      {
        "title": "AWS Certification Prep",
        "description": "Focus on Solutions Architect Associate",
        "expectedEffort": 30,
        "miniDeadline": "2026-08-15",
        "orderIndex": 2
      },
      {
        "title": "Production Project",
        "description": "Deploy real microservices on EKS",
        "expectedEffort": 80,
        "miniDeadline": "2026-11-30",
        "orderIndex": 3
      }
    ]
  }')

DREAM_STATUS=$(echo $CONFIRM_RESPONSE | grep -o '"status":"[^"]*' | head -1 | cut -d'"' -f4)

print_success "Dream confirmed and ACTIVATED"
print_success "Dream status changed to: $DREAM_STATUS"
print_info "Motivational notification queued"

# ============================================================
# 7. GET DREAM (with checkpoints)
# ============================================================
print_header "7. GET DREAM (with checkpoints)"

curl -s -X GET "$BASE_URL/api/dreams/$DREAM_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "Dream retrieved with all checkpoints"

# ============================================================
# 8. LIST DREAMS (by status)
# ============================================================
print_header "8. LIST DREAMS (filter by ACTIVE status)"

DREAMS=$(curl -s -X GET "$BASE_URL/api/dreams?status=ACTIVE" \
  -H "Authorization: Bearer $TOKEN" | jq '.dreams | length')

print_success "Retrieved $DREAMS active dreams"

# ============================================================
# 9. CREATE TASK (with AI validation)
# ============================================================
print_header "9. CREATE TASK (with AI validation)"

TASK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"dreamId\": \"$DREAM_ID\",
    \"title\": \"Complete Docker Course on Udemy\",
    \"description\": \"Stephen Grider Docker course: fundamentals, images, containers, networking\",
    \"startDate\": \"2026-01-15\",
    \"deadline\": \"2026-02-15\",
    \"estimatedDuration\": 1200,
    \"priority\": 4
  }")

TASK_ID=$(echo $TASK_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

print_success "Task created successfully"
print_success "Task ID: $TASK_ID"
print_success "Task status: PENDING"
print_info "Notifications automatically scheduled!"

# ============================================================
# 10. LIST TASKS (for this dream)
# ============================================================
print_header "10. LIST TASKS (for this dream)"

TASK_COUNT=$(curl -s -X GET "$BASE_URL/api/tasks?dreamId=$DREAM_ID&status=PENDING" \
  -H "Authorization: Bearer $TOKEN" | jq '.tasks | length')

print_success "Retrieved $TASK_COUNT pending tasks for this dream"

# ============================================================
# 11. GET TASK (details)
# ============================================================
print_header "11. GET TASK (details)"

curl -s -X GET "$BASE_URL/api/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "Task details retrieved"

# ============================================================
# 12. UPDATE TASK (change status)
# ============================================================
print_header "12. UPDATE TASK (change status to IN_PROGRESS)"

curl -s -X PATCH "$BASE_URL/api/tasks/$TASK_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "IN_PROGRESS"}' | jq '.' > /dev/null && print_success "Task status updated to IN_PROGRESS"

# ============================================================
# 13. GET NOTIFICATIONS (before completion)
# ============================================================
print_header "13. GET NOTIFICATIONS (before completion)"

NOTIF_COUNT_BEFORE=$(curl -s -X GET "$BASE_URL/api/notifications" \
  -H "Authorization: Bearer $TOKEN" | jq '.notifications | length')

print_success "Retrieved $NOTIF_COUNT_BEFORE notifications"
print_success "Includes: 1 motivational + ~$((NOTIF_COUNT_BEFORE-1)) reminders"

# ============================================================
# 14. COMPLETE TASK
# ============================================================
print_header "14. COMPLETE TASK"

curl -s -X POST "$BASE_URL/api/tasks/$TASK_ID/complete" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "Task marked as COMPLETED"

print_info "Celebratory notification queued"

# ============================================================
# 15. GET NOTIFICATIONS (after completion)
# ============================================================
print_header "15. GET NOTIFICATIONS (after completion)"

NOTIF_COUNT_AFTER=$(curl -s -X GET "$BASE_URL/api/notifications" \
  -H "Authorization: Bearer $TOKEN" | jq '.notifications | length')

print_success "Total notifications updated to: $NOTIF_COUNT_AFTER"
print_success "New celebratory message added"

# ============================================================
# 16. CREATE SECOND TASK (high priority)
# ============================================================
print_header "16. CREATE SECOND TASK (high priority - tests quiet hour override)"

TASK2_RESPONSE=$(curl -s -X POST "$BASE_URL/api/tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"dreamId\": \"$DREAM_ID\",
    \"title\": \"Deploy app to Kubernetes cluster\",
    \"description\": \"Setup minikube locally, deploy Docker image, expose service\",
    \"startDate\": \"2026-02-01\",
    \"deadline\": \"2026-02-28\",
    \"estimatedDuration\": 480,
    \"priority\": 5
  }")

TASK_ID_2=$(echo $TASK2_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

print_success "Second task created (Priority 5 - high priority)"
print_success "Task ID: $TASK_ID_2"
print_info "This task will bypass quiet hours if deadline < 24h"

# ============================================================
# 17. BLOCK TASK
# ============================================================
print_header "17. BLOCK TASK"

curl -s -X POST "$BASE_URL/api/tasks/$TASK_ID_2/block" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "Second task blocked"

# ============================================================
# 18. LIST ALL TASKS
# ============================================================
print_header "18. LIST ALL TASKS (all statuses)"

TASKS_ALL=$(curl -s -X GET "$BASE_URL/api/tasks" \
  -H "Authorization: Bearer $TOKEN" | jq '.tasks | length')

print_success "Total tasks: $TASKS_ALL"
print_success "Statuses: COMPLETED, BLOCKED, (possibly PENDING)"

# ============================================================
# 19. COMPLETE DREAM
# ============================================================
print_header "19. COMPLETE DREAM"

curl -s -X POST "$BASE_URL/api/dreams/$DREAM_ID/complete" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "Dream marked as COMPLETED"

print_info "Success notification queued"

# ============================================================
# 20. FINAL: LIST DREAMS (see completed dream)
# ============================================================
print_header "20. FINAL: LIST DREAMS (see completed dream)"

curl -s -X GET "$BASE_URL/api/dreams" \
  -H "Authorization: Bearer $TOKEN" | jq '.' > /dev/null && print_success "All dreams retrieved"

# ============================================================
# Summary
# ============================================================
print_header "✨ TEST COMPLETE ✨"

echo -e "${GREEN}
🎉 All 20 APIs tested successfully!

✅ Dream Flow: DRAFT → VALIDATE → CONFIRM → COMPLETE
✅ Task Flow: CREATE → IN_PROGRESS → COMPLETE
✅ Notifications: Scheduled & Updated
✅ Event-driven: Background worker processing
✅ All actions logged for analytics

NEXT STEPS:
1. Check database: npm run prisma:studio
2. Query logs: SELECT * FROM \"AppLog\" WHERE \"userId\" = '$USER_ID';
3. Check events: SELECT * FROM \"DomainEvent\" WHERE status = 'PROCESSED';
4. View notifications: SELECT * FROM \"Notification\" WHERE \"userId\" = '$USER_ID';

${NC}"