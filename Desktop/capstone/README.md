# GitHub PR Automation Bot

An intelligent GitHub pull request automation bot powered by Claude AI and Model Context Protocol (MCP). Automatically reviews code changes, flags security issues, and suggests test coverage improvements.

## Features

- **Automated Code Reviews** — Fetches PR diffs and analyzes them with Claude AI
- **Security Auditing** — Detects OWASP vulnerabilities, hardcoded secrets, and weak cryptography
- **Code Quality Enforcement** — Checks SOLID principles, complexity, and maintainability
- **Test Coverage Analysis** — Suggests unit tests and edge cases
- **MCP Integration** — Uses Model Context Protocol for extensible tool access
- **Custom Skills** — Swappable agent skills for different review focuses
- **GitHub Integration** — Posts reviews as PR comments automatically

## Quick Start

### Prerequisites

- Python 3.8+
- GitHub Personal Access Token (with `repo` scope)
- Anthropic API key (Claude access)

### Installation

1. Clone the repository:
```bash
cd /Users/admin/Desktop/capstone
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Set up environment variables:
```bash
# Copy the template or create .env
cat > .env << EOF
ANTHROPIC_API_KEY=your-api-key-here
GITHUB_TOKEN=your-github-token-here
REPO_OWNER=your-github-username
REPO_NAME=your-repo-name
EOF
```

4. Run the bot:
```bash
python mcp_bot.py
```

The bot will start polling for new PRs every 60 seconds and post reviews as comments.

## Project Structure

```
├── mcp_bot.py                    # Main polling loop and orchestration
├── mcp_server.py                 # MCP server with GitHub tools
├── .claude/
│   └── skills/
│       ├── code-quality-enforcer.md    # Code quality review skill
│       ├── security-auditor.md         # Security review skill
│       └── test-generator.md           # Test coverage skill
├── CLAUDE.md                     # Developer documentation
├── requirements.txt              # Python dependencies
└── .env                          # Configuration (not committed)
```

## How It Works

1. **Polling** — `mcp_bot.py` checks GitHub API every 60 seconds for open PRs
2. **Diff Fetching** — Spawns an MCP client to call the `get_pr_diff` tool
3. **Analysis** — Sends diff + skill prompt to Claude API
4. **Review Posting** — Posts Claude's response as a PR comment
5. **State Tracking** — Stores reviewed PR numbers in `reviewed_prs.json` to avoid duplicates

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `github_pat_...` |
| `REPO_OWNER` | GitHub username or organization | `nonssoo` |
| `REPO_NAME` | Repository name | `LagosTransit` |

### Changing Review Focus

Edit the skill loaded in `mcp_bot.py` (line 22):
```python
# Load different skills for different review focuses
with open(".claude/skills/security-auditor.md", "r") as f:  # Change this
    SYSTEM_PROMPT = f.read()
```

Options:
- `.claude/skills/security-auditor.md` — Security-focused reviews
- `.claude/skills/code-quality-enforcer.md` — Code quality reviews
- `.claude/skills/test-generator.md` — Test coverage reviews

## Development

### Running in Debug Mode

Add print statements to `mcp_bot.py` to debug:
```python
print(f"Diff content: {code_diff}")
print(f"Claude response: {review_text}")
```

### Testing the MCP Server

```bash
# In one terminal
python mcp_server.py

# In another, write a test client to verify tools work
```

### Resetting Reviewed PRs

Delete the state file to re-review all PRs:
```bash
rm reviewed_prs.json
```

## Troubleshooting

**Bot won't start**
- Check `.env` exists and has valid tokens
- Verify `pip install -r requirements.txt` completed successfully
- Check Python version is 3.8+

**Reviews not posting**
- Verify GITHUB_TOKEN has `repo` scope: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user`
- Check that target repo is accessible
- Look for error messages in console output

**MCP connection errors**
- Ensure `mcp_server.py` can be found (check Python path)
- Verify all MCP dependencies are installed

**Reviews are too short or truncated**
- Increase `max_tokens` in `mcp_bot.py` (line 82)
- Current default is 1024; try 2048 for longer reviews

## Extending the Bot

### Add a New Skill

1. Create `.claude/skills/my-skill.md` with the same format:
```markdown
---
name: my-skill
description: Custom review focus
---

# My Custom Skill

**Role:** Brief role description

## Core Directives:
1. First directive
2. Second directive
...
```

2. Update `mcp_bot.py` to load it:
```python
with open(".claude/skills/my-skill.md", "r") as f:
    SYSTEM_PROMPT = f.read()
```

### Add New MCP Tools

Edit `mcp_server.py` and add a tool:
```python
@mcp.tool()
def my_tool(param: str) -> str:
    """Tool description."""
    return "result"
```

## Architecture Reference

See [CLAUDE.md](CLAUDE.md) for detailed architecture, data flow, and technical context.

## License

This project is part of a capstone initiative for GitHub PR automation.
