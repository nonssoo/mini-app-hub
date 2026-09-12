# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**TriageBot** is an incident response automation system that monitors infrastructure services, analyzes error logs, and generates triage reports via Microsoft Teams. The system uses Claude AI combined with Model Context Protocol (MCP) to correlate infrastructure logs with company runbooks and provide actionable incident remediation steps.

### Core Architecture

The project implements a **client-server MCP pattern**:

- **mcp_server.py** – The MCP server exposing two capabilities:
  - **Tools**: `get_server_logs()` – Retrieves error logs for a given service
  - **Resources**: `company://incident-runbooks` – Provides official company troubleshooting procedures

- **mcp_bot.py** – The main orchestration client that:
  1. Connects to the MCP server via stdio
  2. Fetches logs and runbooks via MCP
  3. Sends logs + runbook + incident-commander skill to Claude API
  4. Posts Claude's triage report to Microsoft Teams via webhook

- **.claude/skills/incident-commander.md** – System prompt defining Claude's role as a Site Reliability Engineer; includes the rigid output format for triage reports (Severity, Root Cause, Recommended Actions, Next Steps)

### Data Flow

```
mcp_server.py (MCP Server)
    ↓ (stdio connection)
mcp_bot.py (MCP Client) → Claude API → Microsoft Teams Webhook
    ↓ (reads skill)
.claude/skills/incident-commander.md (System Prompt)
```

## Development & Running

### Installation

```bash
pip install -r requirements.txt
```

### Environment Setup

Create a `.env` file with:
```
ANTHROPIC_API_KEY=sk-ant-...
TEAMS_WEBHOOK_URL=https://...
```

The `.env` file is loaded by mcp_bot.py via `python-dotenv`.

### Running the Incident Response Bot

```bash
python mcp_bot.py
```

This runs a single incident analysis cycle:
1. Starts the MCP server as a subprocess
2. Fetches logs and runbook
3. Sends to Claude for analysis
4. Posts result to Teams

### Running Just the MCP Server

```bash
python mcp_server.py
```

The server listens on stdio and can be invoked by MCP-compatible clients. Useful for testing the server in isolation.

## Key Architecture Decisions

### Why MCP?

MCP (Model Context Protocol) provides a standardized way to expose tools and resources to Claude. This allows the incident-commander skill to access infrastructure logs and runbooks without embedding them directly in the prompt.

### Why Two Separate Files?

- **Separation of concerns**: mcp_server.py is stateless and can be mocked/tested independently
- **Reusability**: The MCP server could be called by other clients (future Slack bot, CLI tool, etc.)

### System Prompt Pattern

The incident-commander skill enforces a strict output format (structured triage report). This ensures consistent, actionable reports suitable for posting directly to Teams and for downstream automation.

### Temperature = 0.0

Deterministic output is critical for incident response. Randomness in triage recommendations could lead to inconsistent or unsafe remediation steps.

## Common Issues & Fixes

### Subprocess Connection Error

**Issue**: `mcp_bot.py` references the wrong filename in the `StdioServerParameters`.

**Fix**: Ensure `args=["mcp_server.py"]` matches your actual MCP server filename.

### Missing TEAMS_WEBHOOK_URL

If the Teams webhook fails silently, ensure the URL is valid and the Teams connector hasn't expired.

## Type Annotations

Per project standards, all function parameters and return values must have explicit type annotations. Example:

```python
def run_triagebot() -> None:
    """..."""
    logs: str
    runbook: str
    logs, runbook = asyncio.run(gather_context())
```

## Debugging Tips

- To test the MCP server alone: `python mcp_server.py` then use any MCP-compatible client
- To debug Claude's analysis: temporarily change `temperature` or modify the test prompt in mcp_bot.py
- To verify Teams connectivity: test the webhook URL in Postman or curl before running the bot
