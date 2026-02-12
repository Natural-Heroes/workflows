FROM python:3.12-slim

WORKDIR /app

# Install git for pip to clone from GitHub
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/

# Create entrypoint script to handle credentials
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["./entrypoint.sh"]
CMD ["python", "src/main.py"]
