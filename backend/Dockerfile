FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Render sets $PORT automatically)
EXPOSE 10000

# Start with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:10000", "--workers", "4", "--threads", "2", "--timeout", "300", "server:app"]
