FROM node:current-buster

RUN apt-get update && apt-get install -y \
    python3.7 \
    python3-pip \
    git \
    cmake

RUN pip3 install rastercarve

RUN git clone --recursive https://github.com/built1n/rastercarve-preview && \
    cd rastercarve-preview && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j10 && \
    make install

WORKDIR /app

RUN mkdir -p /app/output /app/cache

COPY package.json package-lock.json /app/

RUN npm config set registry http://registry.npmjs.org/ --global
RUN npm install --verbose --loglevel=silly

COPY index.js /app/
COPY public /app/public

CMD cd /app && npm start
