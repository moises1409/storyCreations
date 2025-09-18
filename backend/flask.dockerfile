# Start from a base image with Python and required dependencies
FROM python:3.11-slim

# Copy the application code to the container
WORKDIR /app

# Install system dependencies 
RUN apt-get update && apt-get install -y gcc


COPY . .

# Install Python dependencies for your project
RUN pip install --no-cache-dir -r requirements.txt

# Expose the port on which the Flask app runs (for example, port 5000)
EXPOSE 4000

# Run the application
CMD ["flask", "run", "--host=0.0.0.0", "--port=4000"]
#CMD ["gunicorn", "--bind", "0.0.0.0:4000", "app:app"]
