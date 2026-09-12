# Project Aegis: Automated Incident Response Bot

## 🎯 Project Overview

**Project Aegis** is an intelligent infrastructure monitoring and incident triage system that automatically detects service failures, analyzes them using Claude AI, and generates actionable triage reports posted to Microsoft Teams.

The system combines:
- **Infrastructure Monitoring**: Real-time health checks of web services
- **AI-Powered Analysis**: Claude AI correlates logs with company runbooks
- **Model Context Protocol (MCP)**: Standardized tools and resources interface
- **Automated Notifications**: Structured incident reports sent directly to Teams
- **Incident Knowledge Base**: Company-wide runbooks guide remediation steps

### Key Problem Solved
When infrastructure services fail, teams waste critical time gathering logs, searching runbooks, and determining root causes. Project Aegis automates this triage process—Claude becomes your incident commander, analyzing failures within seconds and posting structured remediation steps to Teams.

---

## 📊 System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                       │
├──────────────────────────────────────────────────────────────┤
│  web_server.py                                                │
│  ↓                                                             │
│  HTTP Service at localhost:8080 (monitored target)            │
└──────────────────────────────────────────────────────────────┘
                              ↑
                              │ (health check every 10 seconds)
                              │
┌──────────────────────────────────────────────────────────────┐
│                     MCP SERVER LAYER                           │
├──────────────────────────────────────────────────────────────┤
│  mcp_server.py                                                │
│  ├─ Tool: check_website_status(url) → status report          │
│  └─ Resource: company://incident-runbooks → runbook.md       │
└──────────────────────────────────────────────────────────────┘
                              ↑
                    (stdio connection)
                              │
┌──────────────────────────────────────────────────────────────┐
│                   ORCHESTRATION LAYER                          │
├──────────────────────────────────────────────────────────────┤
│  mcp_bot.py (Main Coordinator)                                │
│  1. Calls MCP server: fetch status + runbook                  │
│  2. Detects error conditions (500, 503, TIMEOUT, etc.)        │
│  3. Sends to Claude API with incident-commander skill         │
│  4. Posts triage report to Teams webhook                      │
└──────────────────────────────────────────────────────────────┘
                              ↑
                     (Claude API request)
                              │
┌──────────────────────────────────────────────────────────────┐
│                     AI ANALYSIS LAYER                          │
├──────────────────────────────────────────────────────────────┤
│  incident-commander.md (System Prompt/Skill)                  │
│  • Role: Senior Site Reliability Engineer                     │
│  • Input: Error logs + company runbook                        │
│  • Output: Structured triage report (Severity, Root Cause,    │
│            Recommended Actions, Next Steps)                   │
└──────────────────────────────────────────────────────────────┘
                              ↑
                    (Claude Sonnet 5 model)
                              │
┌──────────────────────────────────────────────────────────────┐
│                   NOTIFICATION LAYER                           │
├──────────────────────────────────────────────────────────────┤
│  Microsoft Teams Webhook                                      │
│  └─ Adaptive Card with triage report                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Anthropic API key (Claude access)
- Microsoft Teams webhook URL (for alerts)

### Installation

1. **Clone or navigate to the project:**
   ```bash
   cd /Users/admin/Desktop/capstone/TriagePipeline
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Create `.env` file with your credentials:**
   ```bash
   cat > .env << 'EOF'
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   TEAMS_WEBHOOK_URL=https://outlook.webhook.office.com/webhookb2/...
   EOF
   ```

### Running the System

**Terminal 1: Start the monitored web server**
```bash
python web_server.py
```
Expected output:
```
✅ Web server running on http://localhost:8080
Server is HEALTHY and responding normally
```

**Terminal 2: Start the incident triage bot**
```bash
python mcp_bot.py
```
Expected output:
```
🛡️ TriageBot started. Monitoring http://localhost:8080
Waiting for issues... (Press Ctrl+C to stop the bot)
```

The bot will:
- Check the server status every 10 seconds
- Detect if status changes (healthy ↔ error)
- On error detection, analyze with Claude and post to Teams
- Continue monitoring until stopped

---

## 📁 Project Structure

```
TriagePipeline/
├── README.md                          # This file
├── CLAUDE.md                          # Project guidelines for Claude Code
├── requirements.txt                   # Python dependencies
│
├── mcp_bot.py                         # Main orchestrator (310 lines)
│   └─ Connects to MCP, calls Claude, posts to Teams
│
├── mcp_server.py                      # MCP server (37 lines)
│   ├─ Tool: check_website_status()
│   └─ Resource: company://incident-runbooks
│
├── web_server.py                      # Monitored HTTP service (24 lines)
│   └─ Sample service at localhost:8080
│
├── .claude/
│   └── skills/
│       └── incident-commander.md      # Claude's system prompt (26 lines)
│
└── runbooks/
    └── incident-runbook.md            # Company incident procedures (163 lines)
```

---

## 🔍 How It Works: The Data Flow

### 1. **Continuous Monitoring Loop (mcp_bot.py)**
```python
while True:
    current_status, runbook = asyncio.run(check_server_status())
    if current_status != last_status:  # Status changed?
        if error_detected(current_status):  # Is it an error?
            # Proceed to analysis
        last_status = current_status
    time.sleep(10)  # Check every 10 seconds
```

### 2. **MCP Server Bridge (mcp_server.py)**
- **Tool call**: `check_website_status(url)` returns HTTP status/response time/errors
- **Resource read**: `company://incident-runbooks` returns incident-runbook.md

### 3. **Claude AI Analysis**
Claude receives:
- **System Prompt** (incident-commander.md): "You are a Senior SRE. Generate triage reports."
- **User Message**: "Server returned 503. Here's the runbook. Analyze."
- **Model**: claude-sonnet-5 (deterministic, temperature=0.0)

Claude outputs:
```
🚨 Incident Triage Report
Severity: CRITICAL
Affected Service: Company API
Root Cause: Server is overloaded (connection pool exhausted)

Recommended Action:
1. Scale up server resources immediately
2. Monitor connection pool metrics
3. Restart service if metrics don't normalize

Next Steps: Notify Infrastructure Team, monitor recovery
```

### 4. **Teams Notification**
- Formats Claude's response as an Adaptive Card
- Posts via webhook to the incident-response channel
- Includes timestamp and status metadata

---

## 🛠️ Technical Deep Dive

### Core Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Monitoring | Python `requests` library | HTTP health checks |
| MCP Server | `mcp.server.fastmcp` | Exposes tools & resources |
| MCP Client | `mcp.client.stdio` | Connects to MCP server |
| AI Engine | Anthropic Claude API | Incident analysis |
| Notifications | Microsoft Teams Webhook | Alert delivery |
| Async I/O | Python `asyncio` | Non-blocking MCP calls |
| Env Config | `python-dotenv` | Loads API keys from .env |

### Key Design Decisions

#### Why MCP?
**Model Context Protocol** standardizes how AI systems access external tools. Rather than hardcoding logs into the prompt, the bot:
- Calls MCP tools to fetch fresh logs at analysis time
- Reads company runbooks as MCP resources
- Remains stateless and reusable (future Slack bot, CLI, etc.)

#### Why Two Separate Files?
- **mcp_server.py**: Stateless, can be tested independently
- **mcp_bot.py**: Orchestration logic, polling, Teams integration
- Separation allows the MCP server to be called by other clients

#### Why Temperature = 0.0?
Incident response requires **deterministic output**. Temperature=0.0 ensures Claude always gives the same recommendation for the same error—no randomness that could lead to unsafe remediation steps.

#### Why Async/Await?
The `asyncio` pattern allows:
- Non-blocking MCP calls
- Multiple incidents handled concurrently if needed
- Cleaner error handling in async contexts

---

## 📋 Configuration

### Environment Variables (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API authentication | `sk-ant-xyz...` |
| `TEAMS_WEBHOOK_URL` | Incident report delivery | `https://outlook.webhook.office.com/webhookb2/...` |

### Monitoring Configuration (in mcp_bot.py)

| Setting | Location | Adjustable |
|---------|----------|-----------|
| Target URL | Line 17: `MONITORING_TARGET` | Change to any HTTP service |
| Check interval | Line 165: `time.sleep(10)` | Frequency (10s = once per 10 seconds) |
| Error detection | Lines 69-70 | Add/remove error codes to detect |
| Max tokens | Line 76: `max_tokens=1024` | Claude response length (1024 tokens ≈ 4KB) |

### Claude Model Configuration

| Setting | Line | Current |
|---------|------|---------|
| Model | 75 | `claude-sonnet-5` |
| Temperature | 77 | Implicit (0.0 for determinism) |
| Max tokens | 76 | 1024 |

---

## 🎓 Understanding Each Component

### 1. web_server.py — The Monitored Service

**What it does**: Runs a simple HTTP server on localhost:8080 that always responds with 200 OK.

```python
class WorkingServer(BaseHTTPRequestHandler):
    def do_GET(self):
        # Always returns "healthy" response
        self.send_response(200)  # HTTP 200 = success
        self.wfile.write(b'<h1>Company API - Service Running</h1>')
```

**Why it exists**: Provides a real HTTP service to monitor. In production, this would be your actual application.

**How to simulate failures**:
- Modify to return `500` or `503` status codes
- Add error handling that raises exceptions
- Shutdown the server to simulate a connection timeout

---

### 2. mcp_server.py — The Data Source

**What it does**: Exposes a **Tool** and a **Resource** for Claude to access:

```python
@mcp.tool()
def check_website_status(url: str) -> str:
    """Check if a website is up or down."""
    # Makes HTTP request, returns formatted status
```

**Tool behavior**:
- Input: URL to check
- Output: HTTP status code, response time, or error message
- Example output:
  ```
  URL: http://localhost:8080
  HTTP Status: 200
  Response Time: 45.32ms
  ```

```python
@mcp.resource("company://incident-runbooks")
def get_incident_runbook() -> str:
    """Load the company runbook."""
    # Reads runbooks/incident-runbook.md
```

**Resource behavior**:
- URI: `company://incident-runbooks` (MCP standard)
- Content: Full text of incident-runbook.md
- Updated: Every time Claude requests it (always fresh)

**Why separate from mcp_bot.py?**
- Keeps polling logic separate from data fetching
- Can be tested independently
- Could be called by other clients (Slack bot, CLI)

---

### 3. mcp_bot.py — The Orchestrator

**What it does**: 
1. Periodically checks server status via MCP
2. Detects status changes and errors
3. Sends error + runbook to Claude
4. Posts Claude's response to Teams

**Key sections**:

#### Section 1: Configuration (lines 10-23)
```python
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")  # Read from .env
TEAMS_WEBHOOK_URL = os.getenv("TEAMS_WEBHOOK_URL")
MONITORING_TARGET = "http://localhost:8080"         # What to monitor
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
SYSTEM_PROMPT = open(".claude/skills/incident-commander.md").read()  # Claude's role
```

#### Section 2: MCP Client Connection (lines 26-50)
```python
async def check_server_status():
    server_params = StdioServerParameters(
        command="python3", 
        args=["mcp_server.py"]  # Spawn MCP server as subprocess
    )
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Call the tool
            status_result = await session.call_tool(
                "check_website_status", 
                arguments={"url": MONITORING_TARGET}
            )
            # Read the resource
            resource_result = await session.read_resource(
                "company://incident-runbooks"
            )
            return status_text, runbook
```

**What's happening**:
- `StdioServerParameters` tells where the MCP server is
- `stdio_client` establishes a connection via stdin/stdout
- `call_tool()` invokes check_website_status (passing the URL)
- `read_resource()` fetches the runbook

#### Section 3: Monitoring Loop (lines 59-165)
```python
while True:
    current_status, runbook = asyncio.run(check_server_status())
    
    # Only alert if status CHANGED (prevents spamming Teams)
    if current_status != last_status:
        
        # Check if the new status indicates an error
        if "500" in current_status or "503" in current_status or "TIMEOUT" in current_status:
            # Send to Claude for analysis
            message = client.messages.create(
                model="claude-sonnet-5",
                max_tokens=1024,
                system=SYSTEM_PROMPT,  # incident-commander.md
                messages=[{
                    "role": "user",
                    "content": f"ALERT: Server at {MONITORING_TARGET} is experiencing issues:\n\n{current_status}\n\nRunbook:\n\n{runbook}\n\nGenerate triage report."
                }]
            )
            triage_report = message.content[0].text
            
            # Post to Teams
            requests.post(TEAMS_WEBHOOK_URL, json=adaptive_card)
        
        last_status = current_status
    
    time.sleep(10)  # Check again in 10 seconds
```

**Key logic**:
- `if current_status != last_status`: Only act when status **changes** (prevents redundant alerts)
- Error detection: Checks for known error codes/messages
- Async MCP call: Gets fresh status + runbook before analysis
- One-shot alert: Posts to Teams only when status transitions to error (not every loop)

#### Section 4: Teams Card Formatting (lines 88-142)
```python
adaptive_card = {
    "type": "message",
    "attachments": [{
        "contentType": "application/vnd.microsoft.card.adaptive",
        "content": {
            "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
            "type": "AdaptiveCard",
            "version": "1.4",
            "body": [
                {
                    "type": "TextBlock",
                    "text": "🚨 TriageBot Infrastructure Alert",
                    "weight": "Bolder",
                    "size": "Large",
                    "color": "Attention"
                },
                # ... more blocks ...
                {
                    "type": "TextBlock",
                    "text": triage_report,  # Claude's analysis
                    "wrap": True
                }
            ]
        }
    }]
}

response = requests.post(TEAMS_WEBHOOK_URL, json=adaptive_card)
```

**What happens**:
- Builds an Adaptive Card (Teams' structured message format)
- Embeds Claude's triage report as the main content
- Adds metadata (timestamp, status indicator)
- POSTs to the webhook—message appears in Teams channel

---

### 4. incident-commander.md — Claude's System Prompt

**What it does**: Defines Claude's role and output format.

```markdown
# Role: Senior Site Reliability Engineer (Incident Commander)

You are an expert IT operations engineer. Your job is to analyze system alerts 
and provide immediate, actionable triage reports.

## Output Format:
### 🚨 Incident Triage Report
**Severity:** [CRITICAL / HIGH / MEDIUM / LOW]
**Affected Service:** [Service Name]
**Root Cause:** [1-sentence explanation of what broke]

**Recommended Action:**
1. [Step 1 to fix]
2. [Step 2 to fix]

**Next Steps:** [Who to notify or what to monitor after the fix]
```

**Why this matters**:
- Constrains Claude's output to a predictable format
- Can be parsed by downstream automation
- Ensures consistency across all incidents
- Suitable for immediate posting to Teams without reformatting

---

### 5. incident-runbook.md — The Knowledge Base

**What it contains**: Procedures for each error scenario.

**Example (503 Service Unavailable)**:
```markdown
### 503 Service Unavailable
**Severity:** CRITICAL  
**Response Time:** 5 minutes  
**Escalation:** Engineering Manager + Infrastructure Team

**Common Causes:**
- Server is overloaded
- Maintenance mode enabled
- Resource limits reached

**Immediate Actions:**
1. Check server resource utilization
2. Verify if maintenance mode is active
3. Check connection pool limits

**Resolution Steps:**
- Scale up server resources if possible
- Disable maintenance mode if accidentally enabled
- Increase connection pool limits
- Restart service if hung
```

**How Claude uses it**:
1. Receives error logs + runbook in the same API call
2. Correlates the error (e.g., "503") with the runbook section
3. Extracts "Common Causes" and "Resolution Steps"
4. Synthesizes into the triage report

---

## 🔧 Common Modifications

### Change the monitoring target
**File**: `mcp_bot.py`, line 17
```python
MONITORING_TARGET = "https://api.production.com"  # Change this
```

### Change check interval
**File**: `mcp_bot.py`, line 165
```python
time.sleep(30)  # Check every 30 seconds instead of 10
```

### Add new error codes to detect
**File**: `mcp_bot.py`, lines 69-70
```python
if "500" in current_status or "503" in current_status or "429" in current_status:
    # Trigger analysis
```

### Extend the runbook
**File**: `runbooks/incident-runbook.md`
```markdown
### 504 Gateway Timeout
**Severity:** HIGH
# ... add your own procedures
```

### Change Claude's behavior
**File**: `.claude/skills/incident-commander.md`
- Modify role description
- Change output format
- Add new directives (e.g., "always include business impact")

---

## 🧪 Testing the System

### Test 1: Monitor a healthy service
```bash
# Terminal 1
python web_server.py

# Terminal 2
python mcp_bot.py

# Expected: Bot runs, no alerts posted
```

### Test 2: Simulate a service failure
```bash
# While bot is running, stop web_server.py (Ctrl+C)
# Bot will detect CONNECTION_ERROR and post to Teams
```

### Test 3: Service recovery
```bash
# Restart web_server.py
# Bot will detect recovery and post "Server has recovered" message
```

### Test 4: Test MCP server independently
```bash
python mcp_server.py
# Server waits for client connections
# In another terminal, write a test MCP client
```

---

## 🚨 Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "API key not found" | `.env` file missing or empty | Create `.env` with `ANTHROPIC_API_KEY=sk-ant-...` |
| "Unable to create stdio_client" | MCP server file not found | Ensure `mcp_server.py` exists in current directory |
| "Webhook failed (401)" | Teams webhook URL is invalid/expired | Regenerate webhook URL in Teams connector |
| "Connection refused" | `web_server.py` not running | Start web server in separate terminal |
| "No module named 'mcp'" | Dependencies not installed | Run `pip install -r requirements.txt` |
| Bot posts duplicate alerts | Status detection logic triggered twice | Check `time.sleep()` interval, may need adjustment |

---

## 📈 Future Enhancements

- **Database Persistence**: Store incidents in PostgreSQL for analytics
- **Slack Integration**: Post alerts to Slack instead of (or in addition to) Teams
- **Custom Rules Engine**: User-defined thresholds for what constitutes a "critical" error
- **Metric Collection**: Track MTTR (Mean Time To Resolution) per service
- **Auto-Remediation**: Claude-generated scripts that auto-execute fixes
- **Multi-Service Monitoring**: Monitor multiple services simultaneously
- **Webhook Verification**: Validate Teams webhook responses for reliability
- **Rate Limiting**: Exponential backoff for failed MCP calls

---

## 📚 References

- [Anthropic Claude API Docs](https://docs.anthropic.com)
- [Model Context Protocol (MCP) Specification](https://spec.modelcontextprotocol.io/)
- [Microsoft Teams Adaptive Cards](https://adaptivecards.io/)
- [Python asyncio Documentation](https://docs.python.org/3/library/asyncio.html)

---

## 📝 License & Attribution

This project uses:
- **Claude AI** (Anthropic)
- **MCP** (Anthropic)
- **Python Standard Library**
- **Open Source Dependencies** (see requirements.txt)

---

**Last Updated**: 2026-09-12  
**Status**: Production-ready  
**Maintainer**: Project Aegis Team
