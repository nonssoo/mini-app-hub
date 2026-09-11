# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **GitHub PR Automation Bot** powered by Claude and Model Context Protocol (MCP). It:
- Polls a GitHub repository for new/updated pull requests
- Fetches PR diffs via a custom MCP server
- Analyzes code changes using Claude API
- Posts automated code reviews back to GitHub as PR comments

The system consists of three main components:
1. **MCP Server** (`mcp_server.py`): Provides tools for fetching GitHub PR diffs and serves security/code policies
2. **Bot Client** (`mcp_bot.py`): Polls GitHub, orchestrates MCP calls, and sends reviews via Claude API
3. **Agent Skills** (`.md` files): Embedded system prompts that define review focus areas (code quality, security, testing)

## Architecture & Data Flow

**How it works:**
1. `mcp_bot.py` polls GitHub API every 60 seconds for open PRs in `REPO_OWNER/REPO_NAME`
2. For each new PR (not previously reviewed):
   - Spawns an MCP client that connects to the local `mcp_server.py` via stdio
   - Calls the `get_pr_diff` tool to fetch the raw code diff
   - Sends the diff to Claude API along with an Agent Skill prompt (from markdown files)
   - Posts Claude's response as a PR comment
3. Tracks reviewed PRs in `reviewed_prs.json` to avoid duplicate reviews

**Key design patterns:**
- **Async MCP calls**: Uses `asyncio` with `stdio_client` to call MCP server functions
- **State persistence**: JSON file stores PR numbers already reviewed
- **Tool-based architecture**: MCP exposes tools (get_pr_diff) and resources (security policy) that Claude can use
- **Skill-based prompts**: Review behavior is controlled by markdown "skills" that act as system prompts

## Environment Setup

**Required environment variables** (in `.env`):
```
ANTHROPIC_API_KEY=sk-ant-...          # Claude API key
GITHUB_TOKEN=github_pat_...           # GitHub PAT with repo access (pull requests read)
REPO_OWNER=nonssoo                    # GitHub username/org
REPO_NAME=LagosTransit                # Repository name to monitor
```

**Dependencies**:
```bash
pip install -r requirements.txt
```

Current dependencies: `anthropic`, `requests`, `mcp`, `python-dotenv`

## Common Development Tasks

### Run the bot locally
```bash
python mcp_bot.py
```
Starts the polling loop, checking for new PRs every 60 seconds. Keep running in a terminal to monitor activity.

### Test the MCP server in isolation
```bash
# Start the server (it will wait for client connections)
python mcp_server.py
```
In another terminal, write a small MCP client test to verify tools work.

### Test a single PR review manually
Debug by modifying `mcp_bot.py` to call `check_and_review_prs()` directly with specific PR numbers, or add `reviewed_prs = []` at startup to reset the tracking state.

### Check what PRs have been reviewed
```bash
cat reviewed_prs.json
```
Lists PR numbers that have been reviewed. Delete this file to reset tracking.

### Debug a review failure
1. Check `.env` is populated correctly with valid tokens
2. Verify the target repo is accessible: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$REPO_OWNER/$REPO_NAME`
3. Add print statements in `mcp_bot.py` to log the diff and Claude's response before posting
4. Check that the MCP server starts without errors when client connects

## Key Files & Responsibilities

| File | Purpose |
|------|---------|
| `mcp_server.py` | MCP server exposing GitHub tools and company security policy |
| `mcp_bot.py` | Main polling loop; orchestrates MCP calls and Claude reviews |
| `code-quality-enforcer.md` | Agent skill: focuses review on code structure, SOLID principles, complexity |
| `security-auditor.md` | Agent skill: flags OWASP vulnerabilities, hardcoded secrets, weak crypto |
| `test-generator.md` | Agent skill: suggests unit test coverage and edge cases |
| `requirements.txt` | Python dependencies |
| `.env` | API keys and repo configuration (NOT committed) |
| `reviewed_prs.json` | State file tracking which PRs have been reviewed (auto-created) |

## Technical Context

### MCP Integration
- The bot is an **MCP client** that communicates with `mcp_server.py` via stdio
- MCP provides **tools** (functions Claude can call) and **resources** (read-only context Claude can reference)
- The server provides:
  - **Tool**: `get_pr_diff(owner, repo, pr_number)` → returns raw GitHub diff
  - **Resource**: `company://security-policy` → serves OWASP/compliance policies

### Claude API Integration
- Model: `claude-3-5-sonnet-20241022` (adjust if needed)
- System prompt is loaded from the skill files (code-quality-enforcer, security-auditor, test-generator)
- Max tokens set to 1024 (sufficient for review summaries; increase if reviews are truncated)

### GitHub API Usage
- Endpoint: `https://api.github.com/repos/{owner}/{repo}/pulls?state=open`
- Diff fetch: Uses custom Accept header `application/vnd.github.v3.diff` to get raw diff format
- Posts reviews as PR comments to the `comments_url` field

## Development Notes

**Type hints**: All function parameters should have explicit type annotations (memory note: apply to all functions).

**Extending the bot**:
1. **Add new skills**: Create a `.md` file with the skill format (name, description, system prompt). Load in `mcp_bot.py` alongside the existing ones.
2. **Add new MCP tools**: Define them in `mcp_server.py` with `@mcp.tool()` decorator. Make sure to call `.run()` at the end.
3. **Change review cadence**: Modify `time.sleep(60)` in the polling loop.

**Limitations**:
- PR review is stateless: Claude sees only the diff, not the full context of the repo
- No rate limiting built in; may hit GitHub/Claude API limits with many PRs
- Async/await pattern requires understanding of Python `asyncio` for debugging
