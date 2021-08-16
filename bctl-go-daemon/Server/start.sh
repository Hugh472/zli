#!/bin/sh
if [ $DEV == "true" ]; then
    sleep infinity
else
    cd /bctl-server/bctl/agent && go mod download github.com/Azure/go-autorest/autorest
    cd /bctl-server/bctl/agent && go run /bctl-server/bctl/agent/agent.go -serviceUrl=$SERVICE_URL
fi