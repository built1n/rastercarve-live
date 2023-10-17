FROM node:15-buster

RUN apt update && apt install -y \
    python3.7 \
    python3-pip \
    python3-opencv \
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

RUN pip3 install setuptools scikit-build numpy tqdm argparse
RUN git clone https://github.com/built1n/rastercarve && cd rastercarve && SETUP_IGNORE_OPENCV=1 python3 setup.py install

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

# substitute first
RUN /app/util/subst-backend.sh /app && npm run build && mkdir -p /app/dist/samples && /app/util/index-samples.sh /app > /app/dist/samples/index.json

CMD cd /app && npm start
