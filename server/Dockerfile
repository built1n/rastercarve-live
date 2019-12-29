FROM node:current-buster

RUN apt-get update && apt-get install -y \
    python3.7 \
    python3-pip \
    git \
    cmake

RUN pip3 install rastercarve
RUN git clone https://github.com/built1n/rastercarve-preview --recursive && \
    cd rastercarve-preview && \
    mkdir build && \
    cd build && \
    cmake .. && \
    make && \
    make install

WORKDIR /app

RUN mkdir -p /app/output

COPY package.json package-lock.json /app/

RUN npm config set registry http://registry.npmjs.org/ --global
RUN npm install --verbose --loglevel=silly

COPY index.js index.html /app/

CMD cd /app && npm start
