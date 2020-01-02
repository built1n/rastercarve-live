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

COPY package.json package-lock.json /app/

RUN npm config set registry http://registry.npmjs.org/ --global
RUN npm install --verbose --loglevel=silly

COPY util /app/util

COPY res/* /app/public/
COPY samples /app/samples

COPY index.js /app/
COPY public /app/public

RUN /app/util/index-samples.sh /app > /app/public/samples.json && /app/util/subst-version.sh /app

CMD cd /app && npm start
