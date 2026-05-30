import os
# pyrefly: ignore [missing-import]
import google.generativeai as genai
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
print(f"API Key loaded (starts with): {api_key[:8] if api_key else 'None'}")

if not api_key:
    print("Error: No GEMINI_API_KEY found in .env!")
    exit(1)

# Configure the SDK
genai.configure(api_key=api_key)

print("\n--- Listing available models for your API key ---")
try:
    models = genai.list_models()
    for m in models:
        if "embedContent" in m.supported_generation_methods:
            print(f"Supported Embedding Model: {m.name} ({m.display_name})")
        else:
            print(f"Other Model: {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")
