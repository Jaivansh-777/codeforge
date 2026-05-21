FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    gcc \
    g++ \
    nodejs \
    npm \
    php \
    default-jdk \
    nasm \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/bin/python

RUN useradd -m -u 1000 codeforge

WORKDIR /code

USER codeforge
