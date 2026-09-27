FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY garmin_sync.py .
ENV PYTHONUNBUFFERED=1
CMD ["python", "garmin_sync.py"]
