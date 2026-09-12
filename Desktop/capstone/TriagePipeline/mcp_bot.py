import os
import time
import asyncio
import requests
import anthropic
from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.session import ClientSession
from dotenv import load_dotenv

# --- 1. CONFIGURATION ---
load_dotenv() # Looks for .env in the current folder

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
TEAMS_WEBHOOK_URL = os.getenv("TEAMS_WEBHOOK_URL")
SERVICE_NAME = "auth-service" # The fake server we are monitoring

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Load the Agent Skill (The Rulebook)
with open(".claude/skills/incident-commander.md", "r") as f:
    SYSTEM_PROMPT = f.read()

# --- 2. THE MCP CLIENT LOGIC ---
async def gather_context():
    """Connects to MCP Server to fetch logs and the company runbook."""
    server_params = StdioServerParameters(
        command="python3", # Use "python" if python3 doesn't work on your machine
        args=["mcp_server.py"]
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # A. Fetch the Error Logs (Using an MCP Tool)
            print(" Fetching server logs via MCP Tool...")
            logs_result = await session.call_tool(
                "get_server_logs", 
                arguments={"service_name": SERVICE_NAME}
            )
            logs = logs_result.content[0].text
            
            # B. Fetch the Company Runbook (Using an MCP Resource)
            print("📖 Fetching company runbook via MCP Resource...")
            resource_result = await session.read_resource("company://incident-runbooks")
            runbook = resource_result.contents[0].text
            
            return logs, runbook

# --- 3. THE AI & TEAMS INTEGRATION ---
def run_aegis():
    print(f" Project Aegis started. Monitoring {SERVICE_NAME}...")
    
    # 1. Gather data from MCP
    logs, runbook = asyncio.run(gather_context())
    
    # 2. Send to Claude API
    print(" Analyzing incident with Claude...")
    message = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=1024,
        temperature=0.0, # Deterministic output for incident response
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user", 
            "content": f"Here are the error logs for {SERVICE_NAME}:\n\n{logs}\n\nHere is the company runbook:\n\n{runbook}\n\nPlease generate the triage report."
        }]
    )
    
    triage_report = message.content[0].text
    
    # 3. Post to Microsoft Teams
    print("Sending report to Microsoft Teams...")
    teams_payload = {
        "text": f"##  Project Aegis Incident Report\n\n{triage_report}"
    }
    
    response = requests.post(TEAMS_WEBHOOK_URL, json=teams_payload)
    
    if response.status_code == 200:
        print(" SUCCESS! Report posted to Teams.")
    else:
        print(f" FAILED to post to Teams. Status: {response.status_code}")

if __name__ == '__main__':
    run_aegis()