#!/bin/sh
# lancer.sh nom [depuis.json] [générations] : calibration en arrière-plan, pid dans res/nom.pid
cd "$(dirname "$0")"; n=$1   # à lancer depuis mesure/ : cfg/$n.json → res/; d=$2; g=${3:-150}
DEPUIS=$d nohup node calibrer.js cfg/$n.json res/${n}_${4:-c}.json $g > res/${n}_${4:-c}.log 2>&1 &
echo $! > res/$n.pid
