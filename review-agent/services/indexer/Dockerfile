FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for tree-sitter
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY services/indexer/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared module
COPY shared /app/review_agent/shared

# Copy indexer service
COPY services/indexer /app/review_agent/services/indexer

# Set Python path
ENV PYTHONPATH=/app

CMD ["python", "-m", "review_agent.services.indexer.main"]
