#!/bin/bash
if [ "$#" -ne 1 ]
then
    exit 1
fi
BASEDIR="$1"

if [ $BASEDIR != "/app" ]
then
    echo "To be run only in container!"
    exit 1
fi

sed -i 's/__BACKENDVER__/'$(rastercarve --version)'/g' $BASEDIR/static/index.html
