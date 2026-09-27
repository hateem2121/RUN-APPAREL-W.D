#!/bin/bash
cd "$(dirname "$0")"
export SPKI=$(openssl x509 -in /root/.ccr/agent-proxy-ca.crt -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64)
export OUT=$PWD/all
run() { timeout 1500 node probe9.mjs "https://viewer.wear-run.help/$1" "$2" 1 2>&1 | tail -1 | cut -c1-700 >> all/results.txt; }
list=( "rxps/wine xps" "r-xmp/wine xmp" "r-afp/petrol afp" "r-atw/turquoise atw" "r-atj/ash atj" "r-wzu/blush wzu" "r-aj/indigo aj" "r-ajm/bottle-green ajm" "r-asb/petrol asb" "r-au/bone au" "r-cch/olive cch" "r-css/blush css" "r-ect/rust ect" "r-et/cream et" "r-gtd/ash gtd" "r-mm/sage mm" "r-mm/blush mmBlush" )
i=0; for p in "${list[@]}"; do set -- $p; run "$1" "$2" & i=$((i+1)); if (( i % 2 == 0 )); then wait; fi; done; wait
echo DONE >> all/results.txt
