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

mkdir -p $BASEDIR/dist/samples/thumbnail
mkdir -p $BASEDIR/dist/samples/large
mkdir -p $BASEDIR/samples-hashed

echo '{'
echo '"samples": ['

first=1

for f in $BASEDIR/samples/*
do
    THUMBNAIL=$BASEDIR/dist/samples/thumbnail/$(basename "$f")
    LARGESIZE=$BASEDIR/dist/samples/large/$(basename "$f")

    convert "$f" -thumbnail 300x128 -quality 85% -strip -sampling-factor 4:2:0 "$THUMBNAIL"
    convert "$f" -thumbnail 1024x768 -quality 100% -strip "$LARGESIZE"

    HASH=$(md5sum "$f" | awk '{print $1}')
    cp "$f" $BASEDIR/samples-hashed/$HASH
    if [ $first -eq "1" ]
    then
        first=0
    else
        echo ','
    fi
    echo '{'
    echo "\"thumbnail\": \"/samples/thumbnail/$(basename $f)\","
    echo "\"large\": \"/samples/large/$(basename $f)\","
    echo "\"hash\": \"$HASH\""
    echo '}'
done
echo ']'
echo '}'
