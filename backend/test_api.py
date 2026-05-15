import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)
print("Testing /simulate endpoint...")
response = client.post("/simulate")
print("Simulate response:", response.json())

incident_id = response.json().get("incident_id")

if incident_id:
    # Run a few times to allow background task to finish (TestClient doesn't run background tasks perfectly unless we handle it, wait TestClient handles background tasks synchronously by default!)
    import time
    time.sleep(1)
    
    print(f"Testing /report/{incident_id} endpoint...")
    res = client.get(f"/report/{incident_id}")
    print("Report response:", res.json())
