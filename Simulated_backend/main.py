import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mcp_adapters.client import MultiServerMCPClient, StreamableHttpConnection
from langgraph.prebuilt import create_react_agent
from dotenv import load_dotenv

# Load the Google Generative AI API key from the .env file
load_dotenv()

app = FastAPI(title="Alexa+ Simulation Backend")

# Allow the React frontend to communicate with this FastAPI server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
agent = None
mcp_client = None

async def init_agent():
    global agent, mcp_client
    print("Connecting to local MCP Server...")
    
    # Connect to the FastMCP server using the Streamable HTTP transport object
    mcp_client = MultiServerMCPClient(
        connections={
            "local_laptop": StreamableHttpConnection(
                transport="streamable_http", 
                url="http://127.0.0.1:8000/mcp"
            )
        }
    )
    
    # 2. Automatically fetch the tools from the connected server
    tools = await mcp_client.get_tools()
    
    # 3. Initialize the reasoning engine (Google Generative AI)
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
    
    # 4. Create the LangGraph agent equipped with your MCP tools
    agent = create_react_agent(llm, tools)
    print(f"Agent initialized successfully with {len(tools)} MCP tools!")

@app.on_event("startup")
async def startup_event():
    # Start the agent initialization in the background when the server boots
    asyncio.create_task(init_agent())

class ChatRequest(BaseModel):
    message: str

@app.post("/chat")
async def chat(request: ChatRequest):
    if not agent:
        return {"response": "Agent is still initializing, please wait a moment..."}
    
    # Run the user's prompt through the LangGraph agent
    result = await agent.ainvoke({"messages": [("user", request.message)]})
    
    # Extract and return the final AI response
    final_message = result["messages"][-1].content
    return {"response": final_message}