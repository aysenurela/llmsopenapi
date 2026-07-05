# Manual Testing Notes — AI Agent Hypothesis

**Hypothesis:** Deploying `llms.txt` + `openapi.json` is enough for an LLM agent to discover and execute the SaaS signup funnel without any custom integration.

**Production URL:** `https://llmsopenapi.vercel.app`

---

## Prerequisites

- `curl` and `jq` installed (`brew install jq` on Mac)
- Confirm production is healthy:
  ```bash
  curl -s https://llmsopenapi.vercel.app/llms.txt
  ```
- **Storage:** APIs are backed by Upstash Redis — data persists across requests and Vercel instances. Run reset before each test run to start clean.
- Claude Code subscription (Option A) or ChatGPT Plus — $20/mo (Option B)

---

## Option A — Test with Claude Code (no setup)

Ask Claude Code in your session to run the agent flow:

> "Act as an AI agent. Read https://llmsopenapi.vercel.app/llms.txt, then https://llmsopenapi.vercel.app/openapi.json, then sign up a company: 20 employees, Costa Rica, needs SSO. Use a unique email like agent_test_1@test.com, name: Test User, company: Test Corp. Pause before checkout and ask me to confirm."

Claude Code will make real curl requests to production and show every step.

**What to verify:**
- [ ] Claude fetches `openapi.json` on its own (you didn't tell it to)
- [ ] Calls APIs in correct order without being told the sequence
- [ ] Uses `nextAction` value from each response to decide the next call
- [ ] Pauses at step 4 and asks for confirmation before checkout
- [ ] Only calls `create-checkout` after you say yes

---

## Option B — Test with ChatGPT Custom GPT (needs Plus $20/mo)

1. Go to `chat.openai.com` → avatar → **My GPTs** → **Create**
2. Click **Configure** tab
3. Scroll to **Actions** → **Add Action**
4. Click **Import from URL** → paste:
   ```
   https://llmsopenapi.vercel.app/openapi.json
   ```
5. Authentication: **None** → Save
6. In the Preview panel, type:

   > *"We have 20 employees in Costa Rica and need SSO. Sign us up for Acme SaaS. My email is test@test.com, name Test User, company Test Corp."*

7. Watch the **Network** panel in browser DevTools → you'll see real POST requests to your Vercel API

**What to verify:** same checklist as Option A.

---

## Option C — Manual curl (verify APIs work before agent testing)

**Reset before starting**
```bash
curl -s -X DELETE https://llmsopenapi.vercel.app/api/reset | jq
```
Expected: `{ "message": "All data cleared." }`

---

**Step 1 — Get a plan recommendation**
```bash
curl -s -X POST https://llmsopenapi.vercel.app/api/recommend-plan \
  -H "Content-Type: application/json" \
  -d '{"country":"CR","employees":20,"needsSSO":true}' | jq
```
Expected: `planId: "enterprise"`, `nextAction: "create_account"`

---

**Step 2 — Create an account**

> Use a unique email each run, or reset first. Re-using the same email returns `409` with the existing `accountId` — valid behavior, but will stall the test if you're not expecting it.

```bash
curl -s -X POST https://llmsopenapi.vercel.app/api/create-account \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","name":"Test User","company":"Test Corp"}' | jq
```
Expected: `accountId: "..."`, `nextAction: "create_subscription"`

---

**Step 3 — Create a subscription** *(replace both IDs; use the `planId` returned in Step 1, not a hardcoded value)*
```bash
curl -s -X POST https://llmsopenapi.vercel.app/api/create-subscription \
  -H "Content-Type: application/json" \
  -d '{"accountId":"PASTE_ACCOUNT_ID","planId":"PASTE_PLAN_ID"}' | jq
```
Expected: `subscriptionId: "..."`, `nextAction: "confirm_checkout"`, `agentNote: "..."`

---

**Step 4 — Verify the confirmation gate holds** *(checkout with `confirmed: false` must fail)*
```bash
curl -s -X POST https://llmsopenapi.vercel.app/api/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId":"PASTE_SUB_ID","confirmed":false}' | jq
```
Expected: `400` error — gate is working

---

**Step 5 — Complete checkout** *(after "confirming")*
```bash
curl -s -X POST https://llmsopenapi.vercel.app/api/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId":"PASTE_SUB_ID","confirmed":true}' | jq
```
Expected: `status: "active"`, `nextAction: "completed"`, `checkoutUrl: "https://checkout.example.com/pay/..."`

---

## What a passing test looks like

| Check | Pass condition |
|---|---|
| Agent reads spec unprompted | First tool call is GET openapi.json |
| Correct call order | recommend → account → subscription → checkout |
| `nextAction` followed | Agent cites nextAction as reason for each step |
| Confirmation gate | Agent stops and asks before checkout |
| Gate enforcement | `confirmed: false` returns 400 |
| Full completion | Response contains `nextAction: "completed"` |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Step 3 returns `Account not found` | Stale data or cold-start before Redis migration | Run reset, then repeat from Step 1 |
| Step 2 returns `409` | Email already exists in Redis | Run reset or use a different email |
| Any step returns `500` | Redis env vars missing in Vercel | Check Upstash integration in Vercel dashboard → Storage |
| CORS error in browser | Headers not deployed | Verify `vercel.json` has the `headers` block and redeploy |
| `curl` returns HTML | Wrong URL or Vercel routing issue | Check rewrite rules in `vercel.json` |
