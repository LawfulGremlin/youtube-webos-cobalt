FROM cobalt-build-evergreen:latest

RUN apt-get -o Acquire::Check-Valid-Until=false update \
    && apt-get install -y --no-install-recommends make \
    && rm -rf /var/lib/apt/lists/*
