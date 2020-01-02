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

mkdir -p $BASEDIR/public/sample-thumbnails
mkdir -p $BASEDIR/samples-hashed

echo '{'
echo '"samples": ['

first=1

for f in $BASEDIR/samples/*
do
    convert $f -thumbnail 256x128 -quality 85% -strip -sampling-factor 4:2:0 $BASEDIR/public/sample-thumbnails/$(basename $f)
    HASH=$(md5sum $f | awk '{print $1}')
    cp $f $BASEDIR/samples-hashed/$HASH
    if [ $first -eq "1" ]
    then
        first=0
    else
        echo ','
    fi
    echo '{'
    echo "\"filename\": \"/sample-thumbnails/$(basename $f)\","
    echo "\"hash\": \"$HASH\""
    echo '}'
done
echo ']'
echo '}'
