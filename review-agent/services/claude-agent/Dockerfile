FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY services/claude-agent/requirements.txt ./requirements.txt
COPY shared/ ./shared/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY services/claude-agent/ ./

CMD ["python", "-m", "cli"]
