ARG DSA_VERSION=unconfigured
FROM python:3.12-slim
LABEL org.opencontainers.image.title="investment-os-dsa" \
      org.opencontainers.image.version="${DSA_VERSION}" \
      org.opencontainers.image.revision="${DSA_VERSION}"
WORKDIR /app
RUN pip install --no-cache-dir fastapi==0.116.1 uvicorn==0.35.0
COPY infra/docker/dsa_stub.py /app/main.py
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
