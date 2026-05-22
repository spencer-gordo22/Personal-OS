FROM python:3.12-slim

WORKDIR /app

# Copy all project files
COPY . .

# Expose the server port (overridden by PORT env var at runtime)
EXPOSE 8765

# serve.py reads PORT from env and changes to its own directory on startup
CMD ["python3", "serve.py"]
