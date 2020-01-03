FROM node:current-buster

RUN apt-get update && apt-get install -y \
    python3.7 \
    python3-pip \
    git \
    cmake \
    imagemagick \
    jpegoptim

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

COPY src /app/src
COPY util /app/util
COPY samples /app/samples
COPY static /app/static

COPY *.config.js /app/

COPY index.js /app/

RUN npm run build

RUN /app/util/index-samples.sh /app > /app/dist/samples.json

CMD cd /app && npm start
