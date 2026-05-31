FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=3000

# Libs système requises par opencv-python-headless
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
