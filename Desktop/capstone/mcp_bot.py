import json
import os
import time
import asyncio
import requests
import anthropic
from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.session import ClientSession
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO_OWNER = os.environ.get("REPO_OWNER")
REPO_NAME = os.environ.get("REPO_NAME")

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Load the Agent Skill
with open(".claude/skills/security-auditor.md", "r") as f:
    SYSTEM_PROMPT = f.read()

# State management (prevents spamming the same PR)
STATE_FILE = "reviewed_prs.json"
if os.path.exists(STATE_FILE):
    with open(STATE_FILE, "r") as f:
        reviewed_prs = json.load(f)
else:
    reviewed_prs = []

def save_state():
    with open(STATE_FILE, "w") as f:
        json.dump(reviewed_prs, f)

# --- THE MCP CLIENT LOGIC ---
async def fetch_diff_via_mcp(owner, repo, pr_number):
    """Connects to our local MCP server and uses the Tool to get the diff."""
    server_params = StdioServerParameters(
        command="python",
        args=["mcp_server.py"] # Points to our MCP server file
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # Call the tool we defined in mcp_server.py
            result = await session.call_tool(
                "get_pr_diff", 
                arguments={"owner": owner, "repo": repo, "pr_number": pr_number}
            )
            return result.content[0].text

# --- THE POLLING LOOP ---
def check_and_review_prs():
    print("\n🔍 Checking GitHub for new Pull Requests...")
    
    # 1. Get list of open PRs (lightweight API call)
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/pulls?state=open"
    headers = {"Authorization": f"token {GITHUB_TOKEN}"}
    response = requests.get(url, headers=headers)
    prs = response.json()

    for pr in prs:
        pr_number = pr['number']
        
        # Skip if we already reviewed this PR
        if pr_number in reviewed_prs:
            continue
            
        print(f" New/Updated PR detected: #{pr_number}")
        
        # 2. USE MCP TO GET THE DIFF! (The Enterprise Flex)
        print("🔌 Connecting to MCP Server to fetch code...")
        code_diff = asyncio.run(fetch_diff_via_mcp(REPO_OWNER, REPO_NAME, pr_number))

        # 3. Send to Claude API with the Agent Skill
        print("🤖 Analyzing with Claude API...")
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            system=SYSTEM_PROMPT, # Injecting the Agent Skill!
            messages=[{"role": "user", "content": f"Review this diff:\n\n{code_diff}"}]
        )
        
        review_text = message.content[0].text

        # 4. Post comment back to GitHub
        comment_url = pr['comments_url']
        requests.post(
            comment_url, 
            headers=headers, 
            json={"body": f"##  Automated Review\n\n{review_text}"}
        )
        
        print(f"✅ Review posted to PR #{pr_number}!")
        reviewed_prs.append(pr_number)
        save_state()

def run_poller():
    print(f" MCP Poller started for {REPO_OWNER}/{REPO_NAME}")
    print("Checking for new PRs every 60 seconds...\n")
    
    while True:
        try:
            check_and_review_prs()
        except Exception as e:
            print(f" Error during check: {e}")
            
        # Wait 60 seconds before checking again
        time.sleep(60)

if __name__ == '__main__':
    run_poller()