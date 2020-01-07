FROM node:current-buster

RUN apt-get update && apt-get install -y \
    python3.7 \
    python3-pip \
    git \
    cmake \
    imagemagick

RUN git clone --recursive https://github.com/built1n/rastercarve-preview && \
    cd rastercarve-preview && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make -j10 && \
    make install

RUN pip3 install rastercarve

WORKDIR /app

RUN mkdir -p /app/output

RUN npm install yarn --verbose

COPY package.json package-lock.json /app/

RUN yarn install --verbose

COPY util /app/util
COPY samples /app/samples
COPY static /app/static
COPY src /app/src

COPY *.config.js index.js /app/

RUN npm run build && mkdir -p /app/dist/samples && /app/util/index-samples.sh /app > /app/dist/samples/index.json

CMD cd /app && npm start
