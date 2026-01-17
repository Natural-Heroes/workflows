FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY services/webhook-api/requirements.txt ./requirements.txt
COPY shared/ ./shared/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY services/webhook-api/ ./

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
