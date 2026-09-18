FROM python:3.13
RUN pip install --no-cache-dir platformio
WORKDIR /fw
