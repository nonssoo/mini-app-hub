import os
import time
import asyncio
import requests
import anthropic
from mcp.client.stdio import stdio_client, StdioServerParameters
from mcp.client.session import ClientSession
from dotenv import load_dotenv

# --- 1. CONFIGURATION ---
load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
TEAMS_WEBHOOK_URL = os.getenv("TEAMS_WEBHOOK_URL")

# The real working web server we are monitoring
MONITORING_TARGET = "http://localhost:8080"

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# Load the Agent Skill (The Rulebook)
with open(".claude/skills/incident-commander.md", "r") as f:
    SYSTEM_PROMPT = f.read()

# --- 2. THE MCP CLIENT LOGIC ---
async def check_server_status():
    """Connects to MCP Server to check the live website status and fetch the runbook."""
    server_params = StdioServerParameters(
        command="python3", 
        args=["mcp_server.py"] # Make sure this matches your MCP server filename
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # A. Check the live server status (Using an MCP Tool)
            print("🔍 Checking server status via MCP Tool...")
            status_result = await session.call_tool(
                "check_website_status", 
                arguments={"url": MONITORING_TARGET}
            )
            status_text = status_result.content[0].text
            
            # B. Fetch the Company Runbook (Using an MCP Resource)
            print("📖 Fetching company runbook via MCP Resource...")
            resource_result = await session.read_resource("company://incident-runbooks")
            runbook = resource_result.contents[0].text
            
            return status_text, runbook

# --- 3. THE AI & TEAMS INTEGRATION ---
def run_triagebot():
    print(f"🛡️ TriageBot started. Monitoring {MONITORING_TARGET}")
    print("Waiting for issues... (Press Ctrl+C to stop the bot)\n")
    
    last_status = None
    
    while True:
        try:
            # 1. Gather data from MCP
            current_status, runbook = asyncio.run(check_server_status())
            
            # 2. Only trigger an alert if the status has CHANGED to an error
            # This prevents spamming Teams while the server is consistently down or consistently up
            if current_status != last_status:
                
                # Check for common error indicators in the status text
                if "500" in current_status or "503" in current_status or "CONNECTION_ERROR" in current_status or "TIMEOUT" in current_status:
                    print("🚨 ALERT: Server issue detected!")
                    
                    # Send to Claude API
                    print("🤖 Analyzing incident with Claude...")
                    message = client.messages.create(
                        model="claude-sonnet-5",
                        max_tokens=1024,
                        temperature=0,
                        system=SYSTEM_PROMPT,
                        messages=[{
                            "role": "user",
                            "content": f"ALERT: The server at {MONITORING_TARGET} is experiencing issues:\n\n{current_status}\n\nHere is the company runbook:\n\n{runbook}\n\nPlease generate the triage report."
                        }]
                    )
                    
                    triage_report = message.content[0].text
                    
                    # Post to Microsoft Teams
                    print("📩 Sending report to Microsoft Teams...")
                    adaptive_card = {
                        "type": "message",
                        "attachments": [
                            {
                                "contentType": "application/vnd.microsoft.card.adaptive",
                                "contentUrl": None,
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
                                        {
                                            "type": "TextBlock",
                                            "text": "Automated Incident Triage",
                                            "isSubtle": True,
                                            "spacing": "None"
                                        },
                                        {
                                            "type": "FactSet",
                                            "facts": [
                                                {
                                                    "title": "Status:",
                                                    "value": "Issue Detected"
                                                },
                                                {
                                                    "title": "Generated:",
                                                    "value": time.strftime('%Y-%m-%d %H:%M:%S')
                                                }
                                            ]
                                        },
                                        {
                                            "type": "TextBlock",
                                            "text": triage_report,
                                            "wrap": True,
                                            "spacing": "Medium"
                                        }
                                    ],
                                    "actions": [
                                        {
                                            "type": "Action.OpenUrl",
                                            "title": "View Company Runbook",
                                            "url": "https://your-company-runbook-link.com"
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                    
                    response = requests.post(TEAMS_WEBHOOK_URL, json=adaptive_card)
                    if response.status_code in (200, 202):
                        print(" SUCCESS! Alert posted to Teams.")
                    else:
                        print(f" FAILED to post to Teams. Status: {response.status_code}")
                        print(f"Response body: {response.text}")
                
                else:
                    # If it was down and is now back up, or just starting healthy
                    if last_status is not None and ("ERROR" in last_status or "500" in last_status):
                        print("✅ Server has recovered and is now healthy.")
                    else:
                        print("✅ Server is healthy.")
                
                # Update the last known status
                last_status = current_status
            
        except Exception as e:
            print(f" Error during check: {e}")
        
        # Wait 10 seconds before checking again
        time.sleep(10)

if __name__ == '__main__':
    run_triagebot()